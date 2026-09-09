// PropRoster — Tenant Connect: Scheduling Coordination V1.
//
// Pure logic only — no Supabase, no React, no clock reads except where
// explicitly passed in — matching this repo's no-jsdom, source-testable
// convention (see lib/maintenance/provider-outreach.ts for the direct
// precedent this file follows).
//
// PRODUCT PRINCIPLE (do not erode this anywhere that reuses this
// module): availability is NOT permission to enter the property. This
// file only ever models "when can someone come" — entry preference is a
// separate, deliberately distinct fact (see EntryPreference below), and
// nothing here ever combines the two into an "authorized to enter"
// concept. No code path in this app may treat a tenant having supplied
// availability as consent for anyone to enter unaccompanied.
//
// Coarse day-parts only (Section 2's own "do not force exact minute-
// level times") — a tenant picks whole Morning/Afternoon/Evening blocks
// per day, never a specific time. A provider's PROPOSED appointment is
// the first place an exact time appears at all, and even then it's
// matched back against these coarse blocks deterministically (Section
// 6: "do not use AI to determine whether times overlap") — see
// isTimeWithinWindow()/matchProposedTime() below.

export const WINDOW_LABELS = ['morning', 'afternoon', 'evening'] as const
export type WindowLabel = (typeof WINDOW_LABELS)[number]

/** Canonical hour ranges (property-local wall-clock, end exclusive) backing both the tenant-facing display copy and the deterministic match check below — one source of truth for both. */
export const WINDOW_LABEL_RANGE: Record<WindowLabel, { startHour: number; endHour: number; display: string }> = {
  morning: { startHour: 8, endHour: 12, display: '8 AM–12 PM' },
  afternoon: { startHour: 12, endHour: 17, display: '12 PM–5 PM' },
  evening: { startHour: 17, endHour: 20, display: '5 PM–8 PM' },
}

export const ENTRY_PREFERENCES = ['someone_home', 'contact_before_entering', 'other'] as const
export type EntryPreference = (typeof ENTRY_PREFERENCES)[number]

export const ENTRY_PREFERENCE_LABEL: Record<EntryPreference, string> = {
  someone_home: 'Someone will be home',
  contact_before_entering: 'Contact me before entering',
  other: 'Other / discuss with landlord',
}

/** Mirrors public.maintenance_availability_windows exactly. */
export type AvailabilityWindow = {
  id: string
  request_id: string
  window_date: string
  window_label: WindowLabel
}

/** A single day+block selection as collected by the tenant-facing UI, before it's flattened into individual AvailabilityWindow inserts. */
export type AvailabilityDayInput = { date: string; morning: boolean; afternoon: boolean; evening: boolean }

/** Flattens the UI's per-day checkbox state into one row per selected block — drops any day with no date or no block selected. Deduplicates by (date, label) so a re-submitted form never produces duplicate rows. */
export function flattenAvailabilityInput(days: AvailabilityDayInput[]): { window_date: string; window_label: WindowLabel }[] {
  const seen = new Set<string>()
  const out: { window_date: string; window_label: WindowLabel }[] = []
  for (const day of days) {
    if (!day.date) continue
    for (const label of WINDOW_LABELS) {
      if (!day[label]) continue
      const key = `${day.date}|${label}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ window_date: day.date, window_label: label })
    }
  }
  return out
}

/** Chronological, then Morning→Afternoon→Evening within a day — the order every display of availability uses. */
export function sortWindows<T extends { window_date: string; window_label: WindowLabel }>(windows: T[]): T[] {
  return windows.slice().sort((a, b) => {
    if (a.window_date !== b.window_date) return a.window_date.localeCompare(b.window_date)
    return WINDOW_LABELS.indexOf(a.window_label) - WINDOW_LABELS.indexOf(b.window_label)
  })
}

/** Groups sorted windows by date for display — e.g. "Tue, Sep 15" -> ['morning', 'afternoon']. */
export function groupWindowsByDate<T extends { window_date: string; window_label: WindowLabel }>(windows: T[]): { date: string; labels: WindowLabel[] }[] {
  const ordered = sortWindows(windows)
  const groups: { date: string; labels: WindowLabel[] }[] = []
  for (const w of ordered) {
    const last = groups[groups.length - 1]
    if (last && last.date === w.window_date) last.labels.push(w.window_label)
    else groups.push({ date: w.window_date, labels: [w.window_label] })
  }
  return groups
}

/** Windows belong to a tenant_requests row, joined to the canonical maintenance case the same way category already is (see lib/maintenance/command-center.ts's own TenantRequestLink join) — never a direct maintenance_requests foreign key, so this file never needs to know about that table at all. */
export function windowsForRequestId<T extends { request_id: string }>(windows: T[], requestId: string): T[] {
  return windows.filter((w) => w.request_id === requestId)
}

/** Only the tenant_requests columns this join needs. */
export type TenantRequestAvailabilityLink = { id: string; maintenance_request_id: string | null; entry_preference?: EntryPreference | null }

/** The exact same one-hop join app/page.tsx's categoryByMaintenanceRequestId already uses for category — generalized here so both landlord pages share one implementation instead of re-deriving the tenant_requests->maintenance_requests link twice. */
export function windowsForMaintenanceRequest<T extends { request_id: string }>(
  windows: T[], tenantRequests: TenantRequestAvailabilityLink[], maintenanceRequestId: string,
): T[] {
  const tr = tenantRequests.find((r) => r.maintenance_request_id === maintenanceRequestId)
  return tr ? windowsForRequestId(windows, tr.id) : []
}

export function entryPreferenceForMaintenanceRequest(
  tenantRequests: TenantRequestAvailabilityLink[], maintenanceRequestId: string,
): EntryPreference | null {
  return tenantRequests.find((r) => r.maintenance_request_id === maintenanceRequestId)?.entry_preference || null
}

/** The ONLY fields a provider's secure link may ever see for availability — an explicit allowlist, same defensive construction as provider-outreach.ts's buildProviderSafeView. Never the request_id, never any tenant identity. */
export type ProviderSafeAvailabilityWindow = { window_date: string; window_label: WindowLabel }
export function buildProviderSafeAvailability(windows: { window_date: string; window_label: WindowLabel }[]): ProviderSafeAvailabilityWindow[] {
  return sortWindows(windows.map((w) => ({ window_date: w.window_date, window_label: w.window_label })))
}

/** Parses a native `datetime-local` input value ("YYYY-MM-DDTHH:mm") into its raw date/hour parts, WITHOUT constructing a Date object — deliberately avoids any timezone reinterpretation so the match check below operates on exactly the wall-clock values the provider typed (same "property-local, no timezone math" assumption this whole feature makes — see this file's header). Returns null for anything not in that exact shape. */
export function parseLocalDateTime(value: string): { date: string; hour: number; minute: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const hour = Number(m[2])
  const minute = Number(m[3])
  if (hour > 23 || minute > 59) return null
  return { date: m[1], hour, minute }
}

/** Deterministic containment check — a proposed wall-clock hour falls inside a window's label range on the SAME date. No AI, no fuzzy matching (Section 6's own explicit instruction). */
export function isTimeWithinWindow(window: { window_date: string; window_label: WindowLabel }, at: { date: string; hour: number }): boolean {
  if (window.window_date !== at.date) return false
  const range = WINDOW_LABEL_RANGE[window.window_label]
  return at.hour >= range.startHour && at.hour < range.endHour
}

/**
 * True ("MATCHED") when the proposed local date-time falls inside ANY
 * of the tenant's supplied availability windows; false ("ALTERNATIVE")
 * otherwise — including when the tenant supplied no availability at
 * all, since there is nothing to match against.
 */
export function matchProposedTime(windows: { window_date: string; window_label: WindowLabel }[], at: { date: string; hour: number }): boolean {
  return windows.some((w) => isTimeWithinWindow(w, at))
}
