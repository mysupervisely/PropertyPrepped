'use client'

// PropRoster — Simplification + Maintenance Workspace V2, Phase C.
//
// The shared "open a case, see everything, act on it" workspace —
// mounted from BOTH the portfolio-wide Command Center
// (app/maintenance/page.tsx) and the property-level Maintenance hub
// (app/page.tsx's Details > Maintenance), so there is exactly one
// detail/actions experience, not two competing ones. Still a "dumb"
// component: every write goes through a caller-supplied callback
// (onAssign/onStatusChange/onSendOutreach/onConfirmAppointment/
// onDeclineAppointment) — this file never touches Supabase directly.
//
// PRODUCT PRINCIPLE (this phase's own brief): ONE REQUEST. ONE
// WORKSPACE. ONE OBVIOUS NEXT ACTION. Rather than showing every field
// at once (M3's original flat layout), this now leads with a single
// "next step" card driven entirely by caseRow.nextAction — a derived
// value (lib/maintenance/command-center.ts's nextActionFor(), extended
// this phase to understand the full outreach/appointment lifecycle,
// not just "assigned or not"). No new schema, no new persisted state:
// every state below is read from columns that already existed before
// this phase (maintenance_requests.status/assigned_contact_id,
// maintenance_provider_outreach.status,
// maintenance_appointments.status).
//
// Lower-priority information (the full request description/tenant
// intake, provider outreach history, manual status override) moves
// behind native <details>/<summary> progressive disclosure — plain
// HTML, keyboard-accessible and discoverable by default, no new
// interaction pattern to build or test. Safety information (the urgent
// banner) and essential coordination info (tenant availability, entry
// preference) are NEVER collapsed — they render exactly where M3/
// Scheduling Coordination V1 already placed them, still before the
// provider section, unchanged in content.
//
// SCOPE UNCHANGED FROM EARLIER MILESTONES (see their own history for
// the full reasoning, none of it revisited here):
// - Assigning a provider never contacts them — Contact PropCrew stays
//   an explicit, confirmed landlord action (Tenant Connect: Provider
//   Outreach V1, Section 1).
// - A provider's proposed time never auto-confirms — Confirm/Decline
//   stay explicit landlord actions (Scheduling Coordination V1,
//   Section 7).
// - Urgency is decided entirely upstream (deterministic Guided Intake
//   safety rules, or the case's own landlord-set Urgent priority) and
//   is read-only here — this UI cannot override or downgrade it.
// - The four-value canonical status model (Submitted/Scheduled/In
//   Progress/Completed) is unchanged — no new status value.
//
// KNOWN LIMITATION (documented, not solved here — see this phase's own
// completion report): when a provider marks "I Need More Information,"
// there is no landlord-reply/chat mechanism in the current
// architecture — Section 5 of Provider Outreach V1 deliberately built
// exactly three provider actions and no message thread. The safest
// EXISTING action is offered instead: "Contact again," which re-sends
// the same outreach email (a fresh, explicit, confirmed send, logged
// as its own row) — not a targeted reply to the provider's specific
// question. A real two-way reply thread is out of scope for this
// phase (the brief's own "do not build Service Thread").

import { useState } from 'react'
import type { EnrichedMaintenanceCase, MaintenanceCaseStatus, PropCrewContactRef } from '../../lib/maintenance/command-center'
import { maintenanceCategoryLabel } from '../../lib/maintenance/categories'
import { PROVIDER_OUTREACH_STATUS_LABEL, type ProviderOutreachRow } from '../../lib/maintenance/provider-outreach'
import { groupWindowsByDate, WINDOW_LABEL_RANGE, ENTRY_PREFERENCE_LABEL, formatAppointmentDateTime, type AvailabilityWindow, type EntryPreference } from '../../lib/maintenance/availability'
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
  statusUpdateMessage?: string
  onAssign: (contactId: string | null) => void
  onStatusChange: (status: MaintenanceCaseStatus) => void
  onClose: () => void
  outreach?: ProviderOutreachRow | null
  outreachBusy?: boolean
  outreachError?: string
  onSendOutreach?: () => void
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
  const hasAvailability = Boolean(availabilityWindows && availabilityWindows.length > 0)
  const providerName = assignedContact ? `${assignedContact.name}${assignedContact.business_name ? ` – ${assignedContact.business_name}` : ''}` : ''

  // The one assignment control, rendered in exactly one place per
  // render: prominently in the Next Step card when picking/re-picking
  // a provider IS the next step (assign_provider/provider_declined),
  // otherwise as the quieter "Change provider" control inside the
  // collapsed Provider section. Same element, same handler, either
  // way — reassignment and initial assignment have always been one
  // write path, not a special case.
  const assignField = (
    <label className="maintenanceAssignField">
      <span>{caseRow.assigned_contact_id ? 'Change provider' : 'Assigned PropCrew contact'}</span>
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
  )
  const noContactsNote = !contacts.length && <p className="muted maintenanceAssignedNote">No PropCrew contacts for this property yet. Add one from PropCrew.</p>

  // The one "Contact PropCrew" trigger + its guard (no email on file /
  // duplicate-send protection) — reused for both a first contact and a
  // needs_information "contact again," since both are the exact same
  // explicit, confirmed send.
  const contactAction = assignedContact && (
    assignedContact.email ? (
      (!outreach || outreach.status !== 'sent') && (
        <button type="button" className="primary" disabled={busy || outreachBusy} onClick={() => setShowContactConfirm(true)}>
          {outreach ? `Contact ${assignedContact.name} again` : `Contact ${assignedContact.name}`}
        </button>
      )
    ) : (
      <p className="muted maintenanceOutreachStatus">Add an email address for {assignedContact.name} in PropCrew to contact them through PropRoster.</p>
    )
  )

  function renderNextStep() {
    switch (caseRow.nextAction) {
      case 'assign_provider':
        return (
          <>
            <p className="maintenanceNextStepHeading">Assign someone from PropCrew</p>
            {assignField}
            {noContactsNote}
          </>
        )
      case 'contact_provider':
        if (!assignedContact) return <p className="maintenanceNextStepHeading">Assign someone from PropCrew</p>
        return (
          <>
            <p className="maintenanceNextStepHeading">{providerName}</p>
            <p className="muted maintenanceAssignedNote">Recorded as your decision only — {assignedContact.name} has not been notified or contacted.</p>
            {contactAction}
          </>
        )
      case 'awaiting_provider':
        return (
          <>
            <p className="maintenanceNextStepHeading">Waiting on {assignedContact?.name || 'the provider'}</p>
            <p className="muted">{providerName} was contacted{outreach ? ` — sent ${new Date(outreach.sent_at).toLocaleString()}` : ''}.</p>
          </>
        )
      case 'provider_declined':
        return (
          <>
            <p className="maintenanceNextStepHeading">Choose another provider</p>
            <p className="muted">{providerName} said they&rsquo;re unable to help.</p>
            {assignField}
          </>
        )
      case 'needs_information':
        return (
          <>
            <p className="maintenanceNextStepHeading">{providerName} needs more information</p>
            {outreach?.provider_message && <p className="maintenanceProviderQuestion">&quot;{outreach.provider_message}&quot;</p>}
            {/* Known limitation — see this file's own header. No reply
                thread exists; the safest existing action is a fresh,
                explicit re-send, not a targeted answer. */}
            <p className="muted">PropRoster doesn&rsquo;t support replying directly yet — contacting them again sends a fresh request.</p>
            {contactAction}
          </>
        )
      case 'awaiting_proposal':
        return (
          <>
            <p className="maintenanceNextStepHeading">{assignedContact?.name || 'The provider'} accepted</p>
            <p className="muted">Waiting for a proposed time.</p>
          </>
        )
      case 'confirm_or_decline':
        if (!appointment) return null
        return (
          <>
            <p className="maintenanceNextStepHeading">Appointment proposed</p>
            <p className="maintenanceNextStepAppointment">
              {formatAppointmentDateTime(appointment.proposed_local_start_at)}
              <br />{providerName}
            </p>
            {hasAvailability && (
              appointment.matched_availability
                ? <span className="statusPill pillGood">Matches tenant availability</span>
                : <span className="statusPill pillBad">Outside the tenant&apos;s provided availability</span>
            )}
            {appointmentError && <p className="errorMessage">{appointmentError}</p>}
            <div className="modalActions">
              <button type="button" className="secondary" disabled={appointmentBusy} onClick={onDeclineAppointment}>Decline / Request Another Time</button>
              <button type="button" className="primary" disabled={appointmentBusy} onClick={onConfirmAppointment}>{appointmentBusy ? 'Confirming…' : 'Confirm Appointment'}</button>
            </div>
          </>
        )
      case 'scheduled':
        return (
          <>
            <p className="maintenanceNextStepHeading">Scheduled</p>
            {appointment && (
              <p className="maintenanceNextStepAppointment maintenanceAppointmentConfirmed">
                {formatAppointmentDateTime(appointment.proposed_local_start_at)}
                <br />{providerName}
              </p>
            )}
          </>
        )
      case 'in_progress':
        return (
          <>
            <p className="maintenanceNextStepHeading">In progress</p>
            <button type="button" className="primary maintenanceMarkCompleted" disabled={busy} onClick={() => onStatusChange('Completed')}>Mark Completed</button>
          </>
        )
      case 'completed':
        return <p className="maintenanceNextStepHeading">Completed</p>
      default:
        return null
    }
  }

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

        {/* B. NEXT STEP — the single strongest visual area, driven
            entirely by caseRow.nextAction. Never more than one
            primary/dominant action at a time. */}
        <div className="maintenanceNextStepCard">
          <p className="maintenanceNextStepLabel">Next step</p>
          {renderNextStep()}
        </div>
        {statusUpdateMessage && <p className="maintenanceStatusUpdateNotice" role="status">{statusUpdateMessage}</p>}

        {/* C. Essential coordination info — tenant availability/entry
            preference. Never collapsed: Scheduling Coordination V1's
            own requirement is that this is visible BEFORE deciding to
            contact a provider, and it never authorizes entry by
            itself. Same position/content as before this phase. */}
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

        {/* D. Progressive disclosure — lower-priority information the
            landlord can open when needed, never competing with the
            Next Step card above. Native <details>: keyboard-accessible
            and discoverable by default, no new interaction pattern. */}
        <details className="maintenanceDetailsSection">
          <summary>Request details</summary>
          <div className="maintenanceCaseOverview">
            <p><strong>{caseRow.tenant_name}</strong>{caseRow.tenant_email ? ` · ${caseRow.tenant_email}` : ''}</p>
            {caseRow.description && <pre className="maintenanceCaseDescription">{caseRow.description}</pre>}
          </div>
        </details>

        <details className="maintenanceDetailsSection">
          <summary>Provider</summary>
          <div className="providerOutreachSection">
            {assignedContact ? (
              <>
                <p className="maintenanceOutreachStatus"><strong>{providerName}</strong></p>
                {outreach && (
                  <p className="muted maintenanceOutreachStatus">
                    {outreach.status === 'sent' ? <>Request sent<br />{new Date(outreach.sent_at).toLocaleString()}</> : <strong>{PROVIDER_OUTREACH_STATUS_LABEL[outreach.status]}</strong>}
                    {outreach.status === 'needs_information' && outreach.provider_message && <><br /><em>&quot;{outreach.provider_message}&quot;</em></>}
                  </p>
                )}
                {outreachError && <p className="errorMessage">{outreachError}</p>}
                {/* The action itself already renders prominently in the
                    Next Step card for contact_provider/needs_information —
                    only offer it again here (quietly) for the states
                    where it isn't already the headline action (e.g. the
                    landlord wants to reach out again after acceptance). */}
                {caseRow.nextAction !== 'contact_provider' && caseRow.nextAction !== 'needs_information' && contactAction}
              </>
            ) : (
              <p className="muted maintenanceAssignedNote">No provider assigned yet.</p>
            )}
            {caseRow.nextAction !== 'assign_provider' && caseRow.nextAction !== 'provider_declined' && (
              <>
                {assignField}
                {noContactsNote}
              </>
            )}
          </div>
        </details>

        <details className="maintenanceDetailsSection">
          <summary>Advanced</summary>
          <div className="maintenanceCaseActionArea">
            <label className="maintenanceStatusField">
              <span>Status</span>
              <select aria-label="Case status" value={caseRow.status} disabled={busy} onChange={(e) => onStatusChange(e.target.value as MaintenanceCaseStatus)}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            {caseRow.status !== 'Completed' && (
              <button className="secondary maintenanceMarkCompleted" disabled={busy} onClick={() => onStatusChange('Completed')}>Mark Completed</button>
            )}
          </div>
        </details>
      </div>

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
