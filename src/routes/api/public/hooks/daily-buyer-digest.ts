import { createFileRoute } from '@tanstack/react-router'
import { sendTemplateEmail } from '@/lib/email-templates/send-email'
import { EmailAPIError } from '@lovable.dev/email-js'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { requireCronSecret } from '@/lib/cron-auth.server'

// Existing daily per-buyer order recap; managed delivery handles transport.
// Idempotent per (buyer, day).

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
          hint: 'POST to run. ?dry=1 = preview without sending. ?hours=24 sets window.',
        }),

      POST: async ({ request }) => {
        const unauthorized = requireCronSecret(request)
        if (unauthorized) return unauthorized
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
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

          if (dryRun) {
            sent++
            continue
          }

          const messageId = crypto.randomUUID()
          const idempotencyKey = `daily-digest-${buyerId}-${dayKey}`
          let status: 'sent' | 'suppressed' | 'failed' = 'failed'
          let errorMessage: string | null = null
          try {
            let result
            try {
              result = await sendTemplateEmail('daily-orders-digest', email, { templateData, idempotencyKey })
            } catch (error) {
              if (!(error instanceof EmailAPIError) || error.status !== 429) throw error
              await new Promise(resolve => setTimeout(resolve, (error.retryAfterSeconds ?? 60) * 1000))
              result = await sendTemplateEmail('daily-orders-digest', email, { templateData, idempotencyKey })
            }
            status = result.sent ? 'sent' : 'suppressed'
            if (result.sent) sent++
            else skipped.push(`${buyerId}:suppressed`)
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'send_failed'
            skipped.push(`${buyerId}:send_error`)
          }
          const { error: logError } = await supabaseAdmin.from('email_send_log').insert({
            message_id: messageId, template_name: 'daily-orders-digest', recipient_email: email,
            status, error_message: errorMessage,
          })
          if (logError) console.error('[daily-digest] history write failed', { code: logError.code, message: logError.message })

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
