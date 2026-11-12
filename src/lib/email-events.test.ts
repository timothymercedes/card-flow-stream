import { describe, expect, it } from 'vitest'
import { recordEmailOutcome } from './email-events.server'
import type { SupabaseClient } from '@supabase/supabase-js'

function store() {
  const rows = new Map<string, any>()
  const suppression: any[] = []
  const client = { from: (table: string) => ({
    select: () => ({ eq: (_: string, id: string) => ({ maybeSingle: async () => ({ data: rows.get(id), error: null }) }) }),
    upsert: async (row: any) => { suppression.push(row); return { error: null } },
    insert: async (row: any) => { rows.set(row.id, row); return { error: null } },
  }) } as unknown as SupabaseClient<any>
  return { client, rows, suppression }
}

describe('retained email outcome history', () => {
  for (const [reason, status] of [['bounce', 'bounced'], ['complaint', 'complained'], ['unsubscribe', 'suppressed']] as const) {
    it(`preserves ${reason} database values`, async () => {
      const s = store()
      await recordEmailOutcome(s.client, { event_id: 'event-1', data: { recipient: 'Collector@Example.org', message_id: 'mail-1' } }, reason)
      expect(s.suppression[0]).toEqual({ email: 'collector@example.org', reason, metadata: null })
      expect([...s.rows.values()][0].status).toBe(status)
    })
  }
  it('records repeated delivery only once', async () => {
    const s = store()
    const event = { event_id: 'retry-1', data: { recipient: 'collector@example.org' } }
    await recordEmailOutcome(s.client, event, 'bounce')
    await recordEmailOutcome(s.client, event, 'bounce')
    expect(s.rows.size).toBe(1)
    expect(s.suppression.length).toBe(1)
  })
})