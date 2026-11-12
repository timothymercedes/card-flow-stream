import type { SupabaseClient } from '@supabase/supabase-js'

type Outcome = 'bounce' | 'complaint' | 'unsubscribe'
const outcomes = {
  bounce: { status: 'bounced', message: 'Permanent bounce — email address is invalid or rejected' },
  complaint: { status: 'complained', message: 'Spam complaint — recipient marked email as spam' },
  unsubscribe: { status: 'suppressed', message: 'Recipient unsubscribed' },
} as const

/** Kept tables are history only; managed delivery decides whether to send. */
export async function recordEmailOutcome(
  client: SupabaseClient<any>,
  event: { event_id: string; data: { recipient: string; message_id?: string | null } },
  reason: Outcome,
) {
  const email = event.data.recipient.toLowerCase()
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(event.event_id)))
  const hex = Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('')
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  const { data: recorded, error: lookupError } = await client.from('email_send_log').select('id').eq('id', id).maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  if (recorded) return
  const { error: suppressionError } = await client.from('suppressed_emails').upsert(
    { email, reason, metadata: null }, { onConflict: 'email' },
  )
  if (suppressionError) throw new Error(suppressionError.message)
  const outcome = outcomes[reason]
  const { error: logError } = await client.from('email_send_log').insert({
    id, message_id: event.data.message_id ?? null, template_name: 'system',
    recipient_email: email, status: outcome.status, error_message: outcome.message, metadata: null,
  })
  if (logError && logError.code !== '23505') throw new Error(logError.message)
}