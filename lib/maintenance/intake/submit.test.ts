import { describe, expect, it } from 'vitest'
import { submitGuidedIntake } from './submit'
import type { AnsweredStep } from './engine'

// A small, purpose-built fake Supabase client — not a general mock
// library, just enough chain shape to exercise submitGuidedIntake()'s
// actual sequencing and let assertions inspect exactly what was
// inserted, where, and in what order. Every call is recorded in `calls`.

type Call = { table?: string; op: string; payload?: unknown; bucket?: string; path?: string }

function makeFakeSupabase(opts: { failOn?: string } = {}) {
  const calls: Call[] = []
  let idCounter = 0
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`

  function insertBuilder(table: string, payload: unknown) {
    const isFail = opts.failOn === table
    calls.push({ table, op: 'insert', payload })
    const row = Array.isArray(payload) ? undefined : { id: nextId(table), ...(payload as object) }
    const result = isFail ? { data: null, error: { message: `${table} insert failed` } } : { data: row, error: null }
    return {
      select: () => ({
        single: async () => result,
      }),
      // Bulk insert (answers) is awaited directly without .select().single().
      then: (resolve: (v: { error: unknown }) => void) => resolve(isFail ? { error: { message: `${table} insert failed` } } : { error: null }),
    }
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'tenant-user-1' } } }) },
    from: (table: string) => ({
      insert: (payload: unknown) => insertBuilder(table, payload),
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          calls.push({ bucket, path, op: 'upload' })
          return opts.failOn === 'storage' ? { error: { message: 'upload failed' } } : { error: null }
        },
      }),
    },
  }

  return { client, calls }
}

const baseAnsweredSteps: AnsweredStep[] = [
  { step: { id: 's1', question: { key: 'thermostat_mode', prompt: 'p', safetyClass: 'safe_observation', type: 'select', options: [{ value: 'cool', label: 'COOL' }] }, next: () => null }, value: 'cool' },
  { step: { id: 's2', question: { key: 'filter_condition', prompt: 'p', safetyClass: 'safe_simple_action', type: 'select', options: [{ value: 'clean', label: 'Clean' }] }, next: () => null }, value: 'clean' },
]

const baseParams = {
  propertyId: 'prop-1', ownerId: 'owner-1', tenantAccessId: 'access-1',
  category: 'heating_ac' as const, treeVersion: 'heating_ac-v1',
  title: 'AC not cooling', description: 'AC NOT COOLING\n\nTenant observations:\nThermostat: COOL',
  answeredSteps: baseAnsweredSteps, outcome: 'escalated_to_dispatch' as const,
}

describe('submitGuidedIntake', () => {
  it('creates exactly one conversation, one initial message, and one tenant_requests row, in that order', async () => {
    const { client, calls } = makeFakeSupabase()
    const result = await submitGuidedIntake({ supabase: client as never, ...baseParams })
    expect(result.ok).toBe(true)
    const tables = calls.filter((c) => c.op === 'insert').map((c) => c.table)
    expect(tables.slice(0, 3)).toEqual(['property_conversations', 'property_messages', 'tenant_requests'])
    expect(tables.filter((t) => t === 'property_conversations').length).toBe(1)
    expect(tables.filter((t) => t === 'tenant_requests').length).toBe(1)
  })

  it('never inserts into maintenance_requests directly — the canonical case is created exclusively by the M26 trigger, not client-side', async () => {
    const { client, calls } = makeFakeSupabase()
    await submitGuidedIntake({ supabase: client as never, ...baseParams })
    expect(calls.some((c) => c.table === 'maintenance_requests')).toBe(false)
  })

  it('creates exactly one maintenance_intake_sessions row, linked to the tenant_requests row it just created, with the correct tree_version and outcome', async () => {
    const { client, calls } = makeFakeSupabase()
    await submitGuidedIntake({ supabase: client as never, ...baseParams })
    const sessionCalls = calls.filter((c) => c.table === 'maintenance_intake_sessions')
    expect(sessionCalls.length).toBe(1)
    const payload = sessionCalls[0].payload as Record<string, unknown>
    expect(payload.tree_version).toBe('heating_ac-v1')
    expect(payload.outcome).toBe('escalated_to_dispatch')
    expect(payload.request_id).toMatch(/^tenant_requests-/)
  })

  it('persists every answered step as one maintenance_intake_answers row, preserving question_key and safety_class', async () => {
    const { client, calls } = makeFakeSupabase()
    await submitGuidedIntake({ supabase: client as never, ...baseParams })
    const answersCall = calls.find((c) => c.table === 'maintenance_intake_answers')
    expect(answersCall).toBeDefined()
    const rows = answersCall!.payload as { question_key: string; safety_class: string; answer_value: { value: string } }[]
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({ question_key: 'thermostat_mode', safety_class: 'safe_observation', answer_value: { value: 'cool' } })
    expect(rows[1]).toMatchObject({ question_key: 'filter_condition', safety_class: 'safe_simple_action', answer_value: { value: 'clean' } })
  })

  it('uploads a photo scoped under the conversation id and links it to the initial message, never to an unrelated conversation', async () => {
    const { client, calls } = makeFakeSupabase()
    const file = new File(['x'], 'leak.jpg', { type: 'image/jpeg' })
    const result = await submitGuidedIntake({ supabase: client as never, ...baseParams, photos: [{ file }] })
    expect(result.ok).toBe(true)
    const uploadCall = calls.find((c) => c.op === 'upload')
    expect(uploadCall?.bucket).toBe('tenant-connect-attachments')
    const conversationCallRow = calls.find((c) => c.table === 'property_conversations')
    const convId = (calls.find((c) => c.table === 'property_messages')?.payload as Record<string, unknown>).conversation_id
    expect(uploadCall?.path).toMatch(new RegExp(`^${convId}/`))
    const attachmentCall = calls.find((c) => c.table === 'property_message_attachments')
    expect(attachmentCall).toBeDefined()
    expect(conversationCallRow).toBeDefined()
  })

  it('stops and reports the error if the conversation insert fails, without ever creating a tenant_requests row', async () => {
    const { client, calls } = makeFakeSupabase({ failOn: 'property_conversations' })
    const result = await submitGuidedIntake({ supabase: client as never, ...baseParams })
    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.table === 'tenant_requests')).toBe(false)
  })

  it('stops and reports the error if the tenant_requests insert fails, without creating an intake session', async () => {
    const { client, calls } = makeFakeSupabase({ failOn: 'tenant_requests' })
    const result = await submitGuidedIntake({ supabase: client as never, ...baseParams })
    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.table === 'maintenance_intake_sessions')).toBe(false)
  })

  it('a failed intake-session write does not roll back or hide the already-submitted tenant request (same non-throwing-side-effect principle as email notifications)', async () => {
    const { client } = makeFakeSupabase({ failOn: 'maintenance_intake_sessions' })
    const result = await submitGuidedIntake({ supabase: client as never, ...baseParams })
    expect(result.ok).toBe(true)
  })
})
