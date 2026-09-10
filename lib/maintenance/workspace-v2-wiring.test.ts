import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Simplification + Maintenance Workspace V2, Phase C.
//
// Source-read regression guards for the NEW structure specifically
// (the redesigned MaintenanceCaseDetail + the extended nextActionFor()
// state machine). See lib/maintenance/command-center.test.ts for the
// pure-logic coverage of nextActionFor()/enrichMaintenanceCases()
// itself, and the pre-existing wiring test files (command-center-
// wiring, command-center-m3-1-wiring, scheduling-wiring, provider-
// outreach-wiring, status-update-ux-wiring) — updated alongside this
// phase, not superseded by it — for everything this phase deliberately
// preserved byte-for-byte (the assign <select>'s write contract, the
// status model, the urgent banner, security boundaries).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')

describe('One Next Step card, driven entirely by caseRow.nextAction — never more than one dominant action', () => {
  it('renders exactly one maintenanceNextStepCard, immediately after the meta row and before every progressive-disclosure section', () => {
    const matches = caseDetailSource.match(/maintenanceNextStepCard/g) || []
    expect(matches.length).toBe(1) // one className usage — the card itself
    const cardIdx = caseDetailSource.indexOf('maintenanceNextStepCard')
    const metaIdx = caseDetailSource.indexOf('maintenanceCaseMeta')
    // '<details className=' (not the bare '<details') — the file's own
    // header comment describes the design in prose ("...<details>/
    // <summary> progressive disclosure...") earlier in the file, which a
    // bare substring search would wrongly match instead of the real JSX.
    const firstDetailsIdx = caseDetailSource.indexOf('<details className=')
    expect(metaIdx).toBeLessThan(cardIdx)
    expect(cardIdx).toBeLessThan(firstDetailsIdx)
  })

  it('renderNextStep() switches on caseRow.nextAction and covers every state the extended model defines', () => {
    const start = caseDetailSource.indexOf('function renderNextStep()')
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf('\n  return (', start))
    for (const state of [
      'assign_provider', 'contact_provider', 'awaiting_provider', 'provider_declined',
      'needs_information', 'awaiting_proposal', 'confirm_or_decline', 'scheduled', 'in_progress', 'completed',
    ]) {
      expect(body).toContain(`case '${state}':`)
    }
  })

  it('each state renders at most one primary button — "one obvious next action," never two competing calls to action', () => {
    const start = caseDetailSource.indexOf('function renderNextStep()')
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf('\n  return (', start))
    const cases = body.split(/case '/).slice(1) // drop the preamble before the first case
    for (const c of cases) {
      const primaryButtons = (c.match(/className="primary[\s"]/g) || []).length
      expect(primaryButtons).toBeLessThanOrEqual(1)
    }
  })

  it('copy is human language throughout — never internal terms like canonical/outreach object/token/maintenance_request', () => {
    const start = caseDetailSource.indexOf('function renderNextStep()')
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf('\n  return (', start))
    expect(stripComments(body)).not.toMatch(/canonical|outreach object|maintenance_request\b/i)
  })
})

describe('assign_provider / contact_provider — assigning a provider never implies contacting them (unchanged product/security principle, now also true of the Next Step copy)', () => {
  it('the contact_provider state explicitly says the provider has not been notified/contacted', () => {
    const start = caseDetailSource.indexOf("case 'contact_provider':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf("case 'awaiting_provider':"))
    expect(body).toContain('has not been notified or contacted')
  })

  it('Contact PropCrew is still the one explicit, confirmed action that ever triggers a send — same confirm dialog, same onSendOutreach callback, reused for both a first contact and needs_information\'s "contact again"', () => {
    expect(caseDetailSource).toContain('setShowContactConfirm(true)')
    expect(caseDetailSource).toContain('onSendOutreach?.()')
    // contactAction is defined once and referenced by both states —
    // never a second, duplicate send trigger.
    const contactActionDefs = (caseDetailSource.match(/const contactAction = /g) || []).length
    expect(contactActionDefs).toBe(1)
  })
})

describe('provider_declined — a real, actionable landlord decision, not a dead end', () => {
  it('surfaces "Choose another provider" and re-offers the assignment control as the primary next step', () => {
    const start = caseDetailSource.indexOf("case 'provider_declined':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf("case 'needs_information':"))
    expect(body).toContain('Choose another provider')
    expect(body).toContain('{assignField}')
  })
})

describe('needs_information — the provider\'s question is surfaced; the safest EXISTING action is offered; the limitation is documented, not hidden', () => {
  it('shows the provider_message when present, and the safe "contact again" action — never invents a reply/chat mechanism', () => {
    const start = caseDetailSource.indexOf("case 'needs_information':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf("case 'awaiting_proposal':"))
    expect(body).toContain('outreach?.provider_message')
    expect(body).toContain('{contactAction}')
    // Guards against an actually-built reply/chat mechanism (a textarea,
    // a reply-send handler, a message thread) — not the bare word
    // "reply", which legitimately appears in this state's own
    // disclaimer copy ("doesn't support replying directly yet").
    expect(stripComments(body)).not.toMatch(/<textarea|replyText|sendReply|chat|thread|message.*input/i)
  })

  it('the file\'s own header documents this as a known, deliberate limitation — not silently ignored', () => {
    expect(caseDetailSource).toMatch(/KNOWN LIMITATION[\s\S]{0,600}no landlord-reply\/chat mechanism/)
  })

  it('never builds a general multi-message thread UI (Service Thread is explicitly out of scope for this phase)', () => {
    expect(stripComments(caseDetailSource)).not.toMatch(/messages\.map|<textarea|conversation/i)
  })
})

describe('confirm_or_decline — the proposed appointment becomes the Next Step, not a second competing panel', () => {
  it('Confirm/Decline render inside the Next Step card\'s own confirm_or_decline case, not a separate always-visible block', () => {
    const start = caseDetailSource.indexOf("case 'confirm_or_decline':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf("case 'scheduled':"))
    expect(body).toContain('onConfirmAppointment')
    expect(body).toContain('onDeclineAppointment')
    expect(body).toContain('Confirm Appointment')
    expect(body).toContain("Decline / Request Another Time")
  })

  it('a null appointment for this state renders nothing rather than crashing — defensive against a stale/inconsistent nextAction', () => {
    const start = caseDetailSource.indexOf("case 'confirm_or_decline':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf("case 'scheduled':"))
    expect(body).toContain('if (!appointment) return null')
  })
})

describe('scheduled / in_progress / completed — no unnecessary primary action', () => {
  it('scheduled shows the confirmed date/provider and offers no button', () => {
    const start = caseDetailSource.indexOf("case 'scheduled':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf("case 'in_progress':"))
    expect(body).not.toMatch(/<button/)
    expect(body).toContain('formatAppointmentDateTime')
  })

  it('in_progress offers Mark Completed as the one primary action — reuses the exact same onStatusChange write the Advanced section\'s own button uses', () => {
    const start = caseDetailSource.indexOf("case 'in_progress':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf("case 'completed':"))
    expect(body).toContain("onStatusChange('Completed')")
  })

  it('completed offers no action at all', () => {
    const start = caseDetailSource.indexOf("case 'completed':")
    const body = caseDetailSource.slice(start, caseDetailSource.indexOf('default:'))
    expect(body).not.toMatch(/<button/)
  })
})

describe('Progressive disclosure — lower-priority information behind native <details>, safety/coordination info never collapsed', () => {
  it('exactly three collapsible sections: Request details, Provider, Advanced', () => {
    const detailsBlocks = caseDetailSource.match(/<details className="maintenanceDetailsSection">/g) || []
    expect(detailsBlocks.length).toBe(3)
    expect(caseDetailSource).toContain('<summary>Request details</summary>')
    expect(caseDetailSource).toContain('<summary>Provider</summary>')
    expect(caseDetailSource).toContain('<summary>Advanced</summary>')
  })

  it('the urgent safety banner is NOT inside any <details> — it renders before the Next Step card, unconditionally visible', () => {
    const bannerIdx = caseDetailSource.indexOf('maintenanceUrgentBanner')
    const firstDetailsIdx = caseDetailSource.indexOf('<details className=')
    expect(bannerIdx).toBeGreaterThan(-1)
    expect(bannerIdx).toBeLessThan(firstDetailsIdx)
  })

  it('tenant availability/entry preference are NOT inside any <details> — still essential, always-visible coordination info, in the same relative position as before this phase (after the Next Step card, before Request details)', () => {
    const availabilityIdx = caseDetailSource.indexOf('maintenanceAvailabilitySection')
    const firstDetailsIdx = caseDetailSource.indexOf('<details className=')
    const cardIdx = caseDetailSource.indexOf('maintenanceNextStepCard')
    expect(availabilityIdx).toBeGreaterThan(cardIdx)
    expect(availabilityIdx).toBeLessThan(firstDetailsIdx)
  })

  it('the request description/tenant intake summary is the FIRST collapsed section — never removed, just no longer competing with the Next Step card', () => {
    const idx = caseDetailSource.indexOf('<summary>Request details</summary>')
    const body = caseDetailSource.slice(idx, caseDetailSource.indexOf('<summary>Provider</summary>'))
    expect(body).toContain('maintenanceCaseDescription')
    expect(body).toContain('caseRow.tenant_name')
  })

  it('manual status controls (the full Submitted/Scheduled/In Progress/Completed select) are de-emphasized into the Advanced section — a secondary-styled quick-complete button remains there too, so completion is never blocked, just quieter than the Next Step card\'s own primary action', () => {
    const idx = caseDetailSource.indexOf('<summary>Advanced</summary>')
    const body = caseDetailSource.slice(idx, caseDetailSource.length)
    expect(body).toContain('maintenanceStatusField')
    expect(body).toContain('className="secondary maintenanceMarkCompleted"')
  })
})

describe('Shared component requirement — still exactly one workspace, reused by both callers, still a "dumb" component', () => {
  it('still takes only already-resolved data as props — never queries Supabase itself', () => {
    expect(caseDetailSource).not.toMatch(/supabase\.from\(|createClient\(/)
  })

  it('both landlord pages still mount the same shared component (unchanged import/usage) — no fork into two experiences', () => {
    const pageSource = readFile('app/page.tsx')
    const commandCenterPageSource = readFile('app/maintenance/page.tsx')
    expect(pageSource).toContain("import { MaintenanceCaseDetail } from '../components/maintenance/MaintenanceCaseDetail'")
    expect(commandCenterPageSource).toContain('<MaintenanceCaseDetail')
    expect(pageSource).toContain('<MaintenanceCaseDetail')
  })
})

describe('Phase C.1 — visual simplification', () => {
  it('the Next Step card renders a quieter, plain-bordered variant for the states that ask nothing of the landlord (awaiting_provider/awaiting_proposal/scheduled/completed); every other state keeps the brand-tinted "this needs you" treatment — two quiet states, not a color-coded spectrum', () => {
    expect(caseDetailSource).toContain("const CALM_NEXT_ACTIONS = ['awaiting_provider', 'awaiting_proposal', 'scheduled', 'completed']")
    expect(caseDetailSource).toContain('maintenanceNextStepQuiet')
  })

  it('the header no longer renders a priority/source/category pill row — property, category, reporter and date collapse into one quiet text block instead ("status/urgent pill only when useful")', () => {
    expect(caseDetailSource).not.toMatch(/statusPill priority\$\{caseRow\.priority\}/)
    expect(caseDetailSource).not.toContain('tenantSourceBadge')
  })

  it('no user-facing em dash was introduced — the new site-wide copy rule, enforced here for the file this phase touched (code comments, stripped below, may still narrate history with one)', () => {
    expect(stripComments(caseDetailSource)).not.toMatch(/—/)
  })
})
