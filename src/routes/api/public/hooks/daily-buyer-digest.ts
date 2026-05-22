import * as React from 'react'
import { render } from '@react-email/components'
import { createFileRoute } from '@tanstack/react-router'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'

// Daily buyer order digest cron route.
// POSTed by pg_cron once per day; for each buyer who placed orders in the last 24h,
// renders the daily-orders-digest template and enqueues it via pgmq (transactional_emails).
// Idempotent per (buyer, day) via idempotency_key.

const SITE_NAME = 'Pull Bid Live'
const SENDER_DOMAIN = 'notify.pullbidlive.com'
const FROM_DOMAIN = 'pullbidlive.com'

function redactEmail(email: string): string {
  const [l, d] = email.split('@')
  if (!l || !d) return '***'
  return `${l[0]}***@${d}`
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtAmount(amount: number | null | undefined, cents?: number | null): string {
  if (typeof cents === 'number' && cents > 0) return fmtCents(cents)
  return `$${Number(amount ?? 0).toFixed(2)}`
}

function statusLabel(o: any): string {
  if (o.refunded_at) return 'Refunded'
  if (o.status === 'cancelled') return 'Cancelled'
  if (o.delivered_at) return 'Delivered'
  if (o.shipped_at) return `Shipped${o.carrier ? ` · ${o.carrier}` : ''}`
  if (o.payment_status === 'paid' || o.paid_at) return 'Paid · Awaiting shipment'
  if (o.payment_status === 'awaiting') return 'Payment processing'
  if (o.payment_status === 'failed') return 'Payment failed'
  return o.status ?? 'Processing'
}

export const Route = createFileRoute('/api/public/hooks/daily-buyer-digest')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          hint: 'POST to run. ?dry=1 = preview without enqueueing. ?hours=24 sets window.',
        }),

      POST: async ({ request }) => {
        const url = new URL(request.url)
        const dryRun = url.searchParams.get('dry') === '1'
        const sinceHours = Math.max(
          1,
          Math.min(168, Number(url.searchParams.get('hours')) || 24),
        )
        const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString()

        const { data: orders, error: ordersErr } = await supabaseAdmin
          .from('orders')
          .select(
            'id, order_number, title, amount, final_charged_total_cents, status, payment_status, paid_at, shipped_at, delivered_at, refunded_at, carrier, tracking_url, buyer_id, created_at',
          )
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: true })

        if (ordersErr) {
          console.error('[daily-digest] orders query failed', ordersErr)
          return Response.json({ error: 'orders_query_failed' }, { status: 500 })
        }
        if (!orders?.length) {
          return Response.json({ buyers: 0, orders: 0, sent: 0, dryRun })
        }

        const byBuyer = new Map<string, any[]>()
        for (const o of orders) {
          if (!o.buyer_id) continue
          const list = byBuyer.get(o.buyer_id) ?? []
          list.push(o)
          byBuyer.set(o.buyer_id, list)
        }

        const entry = TEMPLATES['daily-orders-digest']
        if (!entry) {
          return Response.json({ error: 'template_missing' }, { status: 500 })
        }

        const dateLabel = new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
        const dayKey = new Date().toISOString().slice(0, 10)

        let sent = 0
        const skipped: string[] = []

        for (const [buyerId, buyerOrders] of byBuyer.entries()) {
          let email: string | undefined
          let displayName: string | undefined
          try {
            const { data: ures } = await supabaseAdmin.auth.admin.getUserById(buyerId)
            email = ures?.user?.email ?? undefined
            const meta = (ures?.user?.user_metadata ?? {}) as Record<string, any>
            displayName = meta.display_name || meta.full_name || undefined
          } catch (e) {
            console.warn('[daily-digest] getUserById failed', buyerId, e)
          }
          if (!email) {
            skipped.push(`${buyerId}:no_email`)
            continue
          }

          // Suppression check
          const { data: suppressed } = await supabaseAdmin
            .from('suppressed_emails')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle()
          if (suppressed) {
            skipped.push(`${buyerId}:suppressed`)
            continue
          }

          const lines = buyerOrders.map((o) => ({
            orderNumber: o.order_number ?? o.id.slice(0, 8),
            title: o.title ?? 'Order',
            amount: fmtAmount(o.amount, o.final_charged_total_cents),
            status: statusLabel(o),
            trackingUrl: o.tracking_url ?? null,
          }))
          const totalCents = buyerOrders.reduce((s, o) => {
            const c = typeof o.final_charged_total_cents === 'number' && o.final_charged_total_cents > 0
              ? o.final_charged_total_cents
              : Math.round(Number(o.amount ?? 0) * 100)
            return s + c
          }, 0)

          const templateData = {
            buyerName: displayName,
            dateLabel,
            totalLabel: fmtCents(totalCents),
            orders: lines,
          }

          const resolvedSubject =
            typeof entry.subject === 'function' ? entry.subject(templateData) : entry.subject

          if (dryRun) {
            sent++
            continue
          }

          // Render template
          let html: string
          let plainText: string
          try {
            const el = React.createElement(entry.component as any, templateData)
            html = await render(el)
            plainText = await render(el, { plainText: true })
          } catch (e) {
            console.error('[daily-digest] render failed', buyerId, e)
            skipped.push(`${buyerId}:render_failed`)
            continue
          }

          const messageId = crypto.randomUUID()
          const idempotencyKey = `daily-digest-${buyerId}-${dayKey}`

          // Create / reuse unsubscribe token (one per email address)
          const lowerEmail = email.toLowerCase()
          let unsubscribeToken: string | null = null
          const { data: existingTok } = await supabaseAdmin
            .from('email_unsubscribe_tokens')
            .select('token')
            .eq('email', lowerEmail)
            .is('used_at', null)
            .maybeSingle()
          if (existingTok?.token) {
            unsubscribeToken = existingTok.token
          } else {
            const newTok = generateToken()
            const { error: tokErr } = await supabaseAdmin
              .from('email_unsubscribe_tokens')
              .insert({ email: lowerEmail, token: newTok })
            if (!tokErr) unsubscribeToken = newTok
          }

          // Log pending
          await supabaseAdmin.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'daily-orders-digest',
            recipient_email: email,
            status: 'pending',
          })

          // Enqueue
          const { error: enqErr } = await supabaseAdmin.rpc('enqueue_email' as any, {
            queue_name: 'transactional_emails',
            payload: {
              message_id: messageId,
              to: email,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject: resolvedSubject,
              html,
              text: plainText,
              purpose: 'transactional',
              label: 'daily-orders-digest',
              idempotency_key: idempotencyKey,
              unsubscribe_token: unsubscribeToken,
              queued_at: new Date().toISOString(),
            },
          } as any)

          if (enqErr) {
            console.error('[daily-digest] enqueue failed', buyerId, enqErr)
            await supabaseAdmin.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'daily-orders-digest',
              recipient_email: email,
              status: 'failed',
              error_message: 'enqueue_failed',
            })
            skipped.push(`${buyerId}:enqueue_error`)
            continue
          }
          sent++
          console.log('[daily-digest] enqueued', redactEmail(email), 'orders=', buyerOrders.length)
        }

        return Response.json({
          buyers: byBuyer.size,
          orders: orders.length,
          sent,
          skipped,
          dryRun,
          windowHours: sinceHours,
        })
      },
    },
  },
})
