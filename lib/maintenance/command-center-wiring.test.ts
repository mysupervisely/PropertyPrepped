import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tenant Connect + Maintenance Coordination M3 — Landlord Maintenance
// Command Center V1. Source-read regression guards, matching this
// repo's established no-jsdom convention (see lib/uploads/
// upload-reliability-wiring.test.ts, lib/property-photos/
// upload-wiring.test.ts for the direct precedent this file follows).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const commandCenterPageSource = readFile('app/maintenance/page.tsx')
const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')
const pageSource = readFile('app/page.tsx')
const navSource = readFile('components/AuthNavMenu.tsx')

describe('Portfolio-level Command Center — reachable, real, and reads the canonical table', () => {
  it('is reachable from the existing app navigation, not a dead/unlisted route', () => {
    expect(navSource).toContain("{ href: '/maintenance', label: 'Maintenance' }")
  })

  it('reads public.maintenance_requests directly — no second/parallel maintenance data model', () => {
    expect(commandCenterPageSource).toContain("supabase.from('maintenance_requests').select('*')")
  })

  it('enriches cases with category (tenant_requests) and urgency (maintenance_intake_sessions) via the shared, tested pure module — never re-implements that logic inline', () => {
    expect(commandCenterPageSource).toContain("import {\n  enrichMaintenanceCases, sortCasesForCommandCenter, summarizeCommandCenter, relevantContactsForProperty,")
    // Phase C: also threads providerOutreach/appointments through (both
    // already fetched portfolio-wide for this page's own display needs)
    // so nextAction reflects the full outreach/appointment lifecycle,
    // not just "assigned or not."
    expect(commandCenterPageSource).toContain('enrichMaintenanceCases(cases, tenantRequests, intakeSessions, providerOutreach, appointments)')
  })

  it('separates Active/Needs Attention from Completed/History, and never deletes a case to do so', () => {
    expect(commandCenterPageSource).toContain('sorted.filter((c) => c.active)')
    expect(commandCenterPageSource).toContain("sorted.filter((c) => !c.active)")
    expect(commandCenterPageSource).not.toMatch(/\.delete\(\)/)
  })

  it('shows current maintenance status and a next-action hint on every card, without overloading the card with every field', () => {
    expect(commandCenterPageSource).toContain('NEXT_ACTION_LABEL[caseRow.nextAction]')
  })
})

describe('Property-level view — enhanced, not replaced', () => {
  it('the existing per-request row now shows a deterministic urgency badge (from the enriched case, not a client-side guess) — see the Bug 2 dedup guard below for why the render condition also checks priority', () => {
    expect(pageSource).toContain('{showsDedicatedUrgentBadge(req, req.urgent) && <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>}')
  })

  it('the existing tenant-source badge and category lookup remain byte-for-byte intact (V1 regression guard)', () => {
    expect(pageSource).toContain("req.source === 'tenant' && <span className=\"statusPill tenantSourceBadge\">Tenant</span>")
    expect(pageSource).toContain('categoryByMaintenanceRequestId')
  })

  it('a "Manage" action opens the SAME shared MaintenanceCaseDetail component the portfolio Command Center uses — one detail/actions implementation, not two', () => {
    expect(pageSource).toContain("import { MaintenanceCaseDetail } from '../components/maintenance/MaintenanceCaseDetail'")
    expect(pageSource).toContain('<button className="secondary" onClick={() => setOpenMaintenanceCaseId(req.id)}>Manage</button>')
    expect(pageSource).toContain('<MaintenanceCaseDetail')
  })

  it('the existing status <select> and Remove button are untouched (both still present, unmodified)', () => {
    expect(pageSource).toContain('{requestStatuses.map((s) => <option key={s}>{s}</option>)}')
    expect(pageSource).toContain('<button className="dangerLink" onClick={() => void removeRequest(req.id)}>Remove</button>')
  })
})

describe('PropCrew assignment — records the landlord\'s decision only', () => {
  it('assignment writes ONLY assigned_contact_id — never a message, token, or any provider-facing write', () => {
    for (const source of [commandCenterPageSource, pageSource]) {
      const assignMatches = source.match(/\.update\(\{ assigned_contact_id: contactId \}\)/g) || []
      expect(assignMatches.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('the assignment <select> itself never sends a message, creates a provider token, or schedules an appointment — it is a plain decision write, nothing else. Scoped tightly to the assignField element\'s own definition (Phase C: this is now a single shared JSX value rendered in more than one place, so the boundary is its own declaration, not "until the next providerOutreachSection mention" — a file-wide/loosely-scoped match would now collide with this same component\'s unrelated, intentional next-step/appointment copy).', () => {
    const assignFieldSource = caseDetailSource.slice(caseDetailSource.indexOf('const assignField = ('), caseDetailSource.indexOf('const noContactsNote ='))
    expect(assignFieldSource).not.toMatch(/property_messages|access_token|provider_token|notifyTenantConnect|schedule_appointment|appointment/i)
    expect(caseDetailSource).toContain('has not been notified or contacted')
  })

  it('reassignment and removal use the exact same single write path as initial assignment (one function, one column, no special-case branch for "change" vs "remove")', () => {
    expect(caseDetailSource).toContain('onChange={(e) => onAssign(e.target.value || null)}')
    expect(caseDetailSource).toContain('<option value="">Unassigned</option>')
  })

  it('the PropCrew contact list shown is scoped to the case\'s own property (primary + linked), via the shared, tested relevantContactsForProperty() — never every contact on the account', () => {
    expect(commandCenterPageSource).toContain('relevantContactsForProperty(contacts, contactLinks, openCase.property_id)')
    expect(pageSource).toContain('relevantContactsForProperty(contacts, contactLinks, selectedId)')
  })
})

describe('Status model — reuses the existing four canonical values, no conflicting one-off system', () => {
  it('MaintenanceCaseDetail offers exactly the pre-existing Submitted/Scheduled/In Progress/Completed values, never a new one', () => {
    expect(caseDetailSource).toContain("const STATUSES: MaintenanceCaseStatus[] = ['Submitted', 'Scheduled', 'In Progress', 'Completed']")
    // Scoped to the case-status <select> itself, not the whole file:
    // Tenant Connect Provider Outreach V1 legitimately introduces its
    // own, entirely separate 'needs_information' vocabulary (a provider
    // OUTREACH state, never a maintenance_requests.status value — see
    // lib/maintenance/provider-outreach.ts's own header) rendered
    // elsewhere in this same component, so a file-wide text match is no
    // longer the right guard. What must still never happen is a "needs
    // info"-flavored option inside THIS select. Phase C moved this
    // <select> into the "Advanced" details section — its own </label>
    // close tag is now the tight, unambiguous boundary (maintenanceStatusUpdateNotice
    // renders earlier in the file now, right under the Next Step card,
    // so it's no longer a usable end marker here).
    const statusFieldStart = caseDetailSource.indexOf('<label className="maintenanceStatusField">')
    const statusFieldSource = caseDetailSource.slice(statusFieldStart, caseDetailSource.indexOf('</label>', statusFieldStart))
    expect(statusFieldSource.length).toBeGreaterThan(0)
    expect(statusFieldSource).not.toMatch(/needs.?info/i)
  })

  it('"Mark Completed" is a fast path to the SAME status write as the select — not a second, parallel completion mechanism', () => {
    const fnBody = caseDetailSource.slice(caseDetailSource.indexOf('maintenanceMarkCompleted'))
    expect(fnBody).toContain("onStatusChange('Completed')")
  })
})

describe('Safety/urgency — read-only in the UI, never overridable here', () => {
  it('the urgent banner has no control that could change/dismiss the classification — it is a static alert, not a toggle', () => {
    const bannerStart = caseDetailSource.indexOf('maintenanceUrgentBanner')
    const bannerBlock = caseDetailSource.slice(bannerStart, bannerStart + 400)
    expect(bannerBlock).not.toMatch(/<button|<input|<select|onClick|onChange/)
    expect(bannerBlock).toContain('cannot be changed here')
  })

  it('urgency is computed exclusively by the shared, deterministic command-center module — this component never classifies anything itself', () => {
    expect(caseDetailSource).not.toMatch(/isUrgent|escalated_urgent|safety_class/)
  })
})

describe('Security: no RLS was weakened, no elevated client, to build any of this', () => {
  it('every new file relies on the caller\'s own RLS-scoped client — no service-role key, no admin client, anywhere in M3', () => {
    for (const source of [commandCenterPageSource, caseDetailSource]) {
      expect(source).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|supabaseAdmin/)
    }
  })

  it('the portfolio Command Center never filters by an explicit, client-suppliable owner_id — every query trusts RLS alone for ownership scoping, matching every other portfolio page (rent-ledger, tax-center)', () => {
    expect(commandCenterPageSource).not.toMatch(/\.eq\('owner_id'/)
  })

  it('the shared detail component takes only already-resolved data as props — it never queries Supabase itself, so it cannot leak data outside whatever the caller already fetched under RLS', () => {
    expect(caseDetailSource).not.toMatch(/supabase\.from\(|createClient\(/)
  })
})

describe('Mobile UX — cards, not a desktop table', () => {
  it('the Command Center renders a card grid (a <button> per case), never a <table>', () => {
    expect(commandCenterPageSource).not.toContain('<table')
    expect(commandCenterPageSource).toContain('function MaintenanceCaseCard(')
  })

  it('the shared detail modal reuses the existing .overlay/.modal pattern every other in-app modal already uses — no new, one-off dialog implementation', () => {
    expect(caseDetailSource).toContain('className="overlay"')
    expect(caseDetailSource).toContain('className="modal maintenanceCaseDetailModal"')
  })
})
