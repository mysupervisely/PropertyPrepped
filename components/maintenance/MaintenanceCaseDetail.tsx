'use client'

// PropRoster — Tenant Connect + Maintenance Coordination, M3: Landlord
// Maintenance Command Center V1.
//
// The shared "open a case, see everything, act on it" detail/actions
// modal — mounted from BOTH the new portfolio-wide Command Center
// (app/maintenance/page.tsx) and the existing property-level
// Maintenance requests list (app/page.tsx's Rent > Tenant tab), so
// there is exactly one detail/actions experience, not two competing
// ones. Deliberately a "dumb" component: every write goes through a
// caller-supplied callback (onAssign/onStatusChange) — this file never
// touches Supabase directly, so both call sites keep using their own
// already-established loadPortfolio()/reload pattern afterward.
//
// SCOPE (M3 only — see this milestone's own brief):
// - Overview: property, source, category (tenant-sourced only),
//   tenant name/email, the case's own `description` (for a
//   tenant-sourced case this IS the full structured Guided Intake
//   summary — GuidedIntake.tsx builds it via buildSummary() and it is
//   copied verbatim onto this row by the M1.1 trigger; nothing here
//   re-fetches or re-renders raw maintenance_intake_answers rows).
// - Safety/urgency: a prominent, non-dismissible banner when `urgent`
//   is true — never a control the landlord can toggle here. Urgency
//   itself is decided entirely upstream (Guided Intake's deterministic
//   safety logic, or the case's own landlord-set Urgent priority) and
//   is read-only in this component, by design — this UI cannot
//   override or downgrade a safety classification.
// - PropCrew assignment: assign/change/remove ONLY — records the
//   landlord's decision on assigned_contact_id. Never sends a message,
//   never exposes tenant info to the provider, never implies
//   acceptance/scheduling (see this milestone's own explicit "do NOT"
//   list).
// - Status: the pre-existing four-value canonical status model only
//   (Submitted/Scheduled/In Progress/Completed) — no new status value.
//   "Mark Completed" is a one-tap fast path to the same status change
//   the select below can also make.
//
// KNOWN GAP (documented, not implemented — see this milestone's own
// completion report and docs/tenant-connect-m3-landlord-command-
// center.md): "Mark Needs More Information" and a landlord-only
// internal note both have no home in the current schema. Neither
// button/field exists here. Do not add either without the smallest-
// compatible migration documented there being reviewed and applied
// first.

import { useState } from 'react'
import type { EnrichedMaintenanceCase, MaintenanceCaseStatus, PropCrewContactRef } from '../../lib/maintenance/command-center'
import { maintenanceCategoryLabel } from '../../lib/maintenance/categories'
import { NEXT_ACTION_LABEL } from '../../lib/maintenance/command-center'
import { PROVIDER_OUTREACH_STATUS_LABEL, type ProviderOutreachRow } from '../../lib/maintenance/provider-outreach'
import { groupWindowsByDate, WINDOW_LABEL_RANGE, ENTRY_PREFERENCE_LABEL, type AvailabilityWindow, type EntryPreference } from '../../lib/maintenance/availability'
import type { AppointmentRow } from '../../lib/maintenance/appointments'

const STATUSES: MaintenanceCaseStatus[] = ['Submitted', 'Scheduled', 'In Progress', 'Completed']

export function MaintenanceCaseDetail({
  caseRow, propertyLabel, contacts, busy, statusUpdateMessage, onAssign, onStatusChange, onClose,
  outreach, outreachBusy, outreachError, onSendOutreach,
  availabilityWindows, entryPreference, appointment, appointmentBusy, appointmentError, onConfirmAppointment, onDeclineAppointment,
}: {
  caseRow: EnrichedMaintenanceCase
  propertyLabel: string
  contacts: PropCrewContactRef[]
  busy: boolean
  // Bug fix (real-device iPhone testing, M3.1 follow-up): a brief,
  // caller-owned confirmation string ("Status updated.") shown right
  // after a status change, so the landlord sees feedback without
  // needing to close this modal or reload. Purely a display prop —
  // still a "dumb" component: the caller (app/page.tsx or
  // app/maintenance/page.tsx) owns setting and clearing it.
  statusUpdateMessage?: string
  onAssign: (contactId: string | null) => void
  onStatusChange: (status: MaintenanceCaseStatus) => void
  onClose: () => void
  // Tenant Connect: Provider Outreach V1 — the most recent outreach row
  // for the CURRENTLY assigned contact (null when never contacted), so
  // this component just renders it (Section 6); the actual send still
  // goes through onSendOutreach() — the caller's own page-level
  // handler does the real POST to /api/maintenance/provider-outreach/send,
  // matching the same "dumb component, write via callback" contract
  // onAssign/onStatusChange already use. This component owns only the
  // LOCAL confirm-dialog UI state below, never the write itself.
  outreach?: ProviderOutreachRow | null
  outreachBusy?: boolean
  outreachError?: string
  onSendOutreach?: () => void
  // Scheduling Coordination V1 — availability/entry preference are
  // read-only here (Section 4: the tenant supplied them; nothing in
  // this component ever edits or invents them). `appointment` is the
  // latest proposal for the CURRENTLY relevant outreach (null until a
  // provider proposes one) — confirm/decline still go through
  // caller-supplied callbacks, same "dumb component" contract as
  // onAssign/onSendOutreach.
  availabilityWindows?: AvailabilityWindow[]
  entryPreference?: EntryPreference | null
  appointment?: AppointmentRow | null
  appointmentBusy?: boolean
  appointmentError?: string
  onConfirmAppointment?: () => void
  onDeclineAppointment?: () => void
}) {
  const assignedContact = contacts.find((c) => c.id === caseRow.assigned_contact_id) || null
  const [showContactConfirm, setShowContactConfirm] = useState(false)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal maintenanceCaseDetailModal">
        <div className="modalTop">
          <div>
            <p className="eyebrow">{propertyLabel}</p>
            <h2>{caseRow.title}</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="Close">×</button>
        </div>

        {caseRow.urgent && (
          <div className="maintenanceUrgentBanner" role="alert">
            <strong>Urgent — safety concern reported.</strong>
            <span>This classification is set automatically by deterministic Guided Intake safety rules and cannot be changed here.</span>
          </div>
        )}

        <div className="maintenanceCaseMeta">
          <span className={`statusPill priority${caseRow.priority}`}>{caseRow.priority}</span>
          <span className={`statusPill ${caseRow.source === 'tenant' ? 'tenantSourceBadge' : 'landlordSourceBadge'}`}>{caseRow.source === 'tenant' ? 'Tenant' : 'Landlord'}</span>
          {caseRow.category && <span className="statusPill maintenanceCategoryBadge">{maintenanceCategoryLabel(caseRow.category)}</span>}
          <span className="muted">{new Date(caseRow.created_at).toLocaleString()}</span>
        </div>

        <div className="maintenanceCaseOverview">
          <p><strong>{caseRow.tenant_name}</strong>{caseRow.tenant_email ? ` · ${caseRow.tenant_email}` : ''}</p>
          {caseRow.description && <pre className="maintenanceCaseDescription">{caseRow.description}</pre>}
        </div>

        {/* Scheduling Coordination V1 (Section 4) — shown before the
            PropCrew section below, so the landlord sees this BEFORE
            deciding to contact a provider, per this milestone's own
            ordering. A landlord-created case (no linked tenant_requests
            row) or a tenant who skipped this shows the same neutral
            "not provided" state — outreach is never blocked on it
            either way (Section 4: "do not block provider outreach
            solely because availability is missing"). */}
        <div className="maintenanceAvailabilitySection">
          <span className="maintenanceAssignFieldLabel">Tenant Availability</span>
          {availabilityWindows && availabilityWindows.length > 0 ? (
            <ul className="maintenanceAvailabilityList">
              {groupWindowsByDate(availabilityWindows).map((g) => (
                <li key={g.date}>
                  <strong>{new Date(`${g.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                  <span className="muted">{g.labels.map((l) => WINDOW_LABEL_RANGE[l].display).join(', ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Tenant availability not provided.</p>
          )}
          {entryPreference && <p className="muted maintenanceEntryPreference">Entry preference: {ENTRY_PREFERENCE_LABEL[entryPreference]}</p>}
        </div>

        <div className="maintenanceCaseActionArea">
          <label className="maintenanceAssignField">
            <span>Assigned PropCrew contact</span>
            <select
              aria-label="Assigned PropCrew contact"
              value={caseRow.assigned_contact_id || ''}
              disabled={busy}
              onChange={(e) => onAssign(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.business_name ? ` (${c.business_name})` : ''} · {c.role}</option>)}
            </select>
          </label>
          {assignedContact && !outreach && <p className="muted maintenanceAssignedNote">Recorded as your decision only — {assignedContact.name} has not been notified or contacted.</p>}
          {!contacts.length && <p className="muted maintenanceAssignedNote">No PropCrew contacts for this property yet. Add one from PropCrew.</p>}

          {/* Tenant Connect: Provider Outreach V1 (Section 1/6) — only
              ever offered when the assigned contact actually has an
              email on file; never automatic just because a contact was
              assigned (Section 1's own explicit instruction). */}
          {assignedContact && (
            <div className="providerOutreachSection">
              <span className="maintenanceAssignFieldLabel">PropCrew</span>
              {outreach ? (
                <p className="muted maintenanceOutreachStatus">
                  <strong>{assignedContact.name}{assignedContact.business_name ? ` – ${assignedContact.business_name}` : ''}</strong>
                  <br />
                  {outreach.status === 'sent' ? (
                    <>Request sent<br />{new Date(outreach.sent_at).toLocaleString()}</>
                  ) : (
                    <strong>{PROVIDER_OUTREACH_STATUS_LABEL[outreach.status]}</strong>
                  )}
                  {outreach.status === 'needs_information' && outreach.provider_message && (
                    <><br /><em>&quot;{outreach.provider_message}&quot;</em></>
                  )}
                </p>
              ) : null}
              {outreachError && <p className="errorMessage">{outreachError}</p>}

              {/* Scheduling Coordination V1 (Section 7) — a proposal is
                  never auto-confirmed; landlord must explicitly confirm
                  or decline. Once confirmed, this becomes the read-only
                  "Scheduled" display and the Confirm/Decline buttons
                  disappear (there is nothing left to decide). */}
              {appointment && appointment.status === 'proposed' && (
                <div className="maintenanceAppointmentProposal">
                  <p className="muted maintenanceOutreachStatus">
                    <strong>Proposed appointment</strong><br />
                    {new Date(appointment.proposed_start_at).toLocaleString()}
                    {!appointment.matched_availability && (
                      <><br /><span className="statusPill pillBad">Outside the tenant&apos;s provided availability</span></>
                    )}
                  </p>
                  {appointmentError && <p className="errorMessage">{appointmentError}</p>}
                  <div className="modalActions">
                    <button type="button" className="secondary" disabled={appointmentBusy} onClick={onDeclineAppointment}>Decline / Request Another Time</button>
                    <button type="button" className="primary" disabled={appointmentBusy} onClick={onConfirmAppointment}>{appointmentBusy ? 'Confirming…' : 'Confirm Appointment'}</button>
                  </div>
                </div>
              )}
              {appointment && appointment.status === 'confirmed' && (
                <p className="muted maintenanceOutreachStatus maintenanceAppointmentConfirmed">
                  <strong>Scheduled</strong><br />
                  {new Date(appointment.proposed_start_at).toLocaleString()}
                  <br />{assignedContact.name}{assignedContact.business_name ? ` – ${assignedContact.business_name}` : ''}
                </p>
              )}
              {assignedContact.email ? (
                (!outreach || outreach.status !== 'sent') && (
                  <button type="button" className="secondary" disabled={busy || outreachBusy} onClick={() => setShowContactConfirm(true)}>Contact PropCrew</button>
                )
              ) : (
                <p className="muted maintenanceOutreachStatus">Add an email address for {assignedContact.name} in PropCrew to contact them through PropRoster.</p>
              )}
            </div>
          )}

          <label className="maintenanceStatusField">
            <span>Status</span>
            <select aria-label="Case status" value={caseRow.status} disabled={busy} onChange={(e) => onStatusChange(e.target.value as MaintenanceCaseStatus)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          {statusUpdateMessage && <p className="maintenanceStatusUpdateNotice" role="status">{statusUpdateMessage}</p>}
          <p className="muted maintenanceNextAction">Next: {NEXT_ACTION_LABEL[caseRow.nextAction]}</p>

          {caseRow.status !== 'Completed' && (
            <button className="primary maintenanceMarkCompleted" disabled={busy} onClick={() => onStatusChange('Completed')}>Mark Completed</button>
          )}
        </div>
      </div>

      {/* Section 1's own example confirmation, verbatim structure —
          landlord authorization is required before any email goes out;
          this is the one and only place onSendOutreach() is ever
          called. Stacks on top of the modal above it (later in DOM
          order, same .overlay/.modal pattern already used elsewhere in
          this app for a nested confirm). */}
      {showContactConfirm && assignedContact && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowContactConfirm(false)}>
          <div className="modal">
            <div className="modalTop"><h2>Contact {assignedContact.name}{assignedContact.business_name ? ` at ${assignedContact.business_name}` : ''}?</h2><button className="iconButton" onClick={() => setShowContactConfirm(false)}>×</button></div>
            <p>PropRoster will send the maintenance request to {assignedContact.name} so they can review and respond.</p>
            <div className="maintenanceCaseMeta">
              <span className="muted">{propertyLabel}</span>
              <span className="muted">{caseRow.title}</span>
              <span className="muted">{assignedContact.email}</span>
            </div>
            <div className="modalActions">
              <button className="secondary" onClick={() => setShowContactConfirm(false)}>Cancel</button>
              <button className="primary" disabled={outreachBusy} onClick={() => { setShowContactConfirm(false); onSendOutreach?.() }}>{outreachBusy ? 'Sending…' : 'Send Request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
