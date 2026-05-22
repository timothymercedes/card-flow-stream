import { createFileRoute } from '@tanstack/react-router'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

// Sends each buyer ONE email summarizing every order they placed in the last 24 hours.
// Triggered by pg_cron. Public route — no caller secret needed; idempotent on
// (buyer, day) via the email queue's idempotencyKey.

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtAmount(amount: number | null | undefined, fallbackCents?: number | null): string {
  if (typeof fallbackCents === 'number' && fallbackCents > 0) return fmtMoney(fallbackCents)
  const n = Number(amount ?? 0)
  return `$${n.toFixed(2)}`
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
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const dryRun = url.searchParams.get('dry') === '1'
        const sinceHoursParam = url.searchParams.get('hours')
        const sinceHours = sinceHoursParam ? Math.max(1, Math.min(168, Number(sinceHoursParam) || 24)) : 24
        const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

        // 1. Pull every order created in the window.
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

        if (!orders || orders.length === 0) {
          return Response.json({ buyers: 0, orders: 0, sent: 0, dryRun })
        }

        // 2. Group by buyer.
        const byBuyer = new Map<string, any[]>()
        for (const o of orders) {
          if (!o.buyer_id) continue
          const list = byBuyer.get(o.buyer_id) ?? []
          list.push(o)
          byBuyer.set(o.buyer_id, list)
        }

        // 3. Resolve emails + display names.
        const buyerIds = Array.from(byBuyer.keys())
        const emailById = new Map<string, { email: string; name?: string }>()
        for (const id of buyerIds) {
          try {
            const { data: ures } = await supabaseAdmin.auth.admin.getUserById(id)
            const u = ures?.user
            if (u?.email) {
              emailById.set(id, {
                email: u.email,
                name:
                  (u.user_metadata as any)?.display_name ||
                  (u.user_metadata as any)?.full_name ||
                  undefined,
              })
            }
          } catch (e) {
            console.warn('[daily-digest] getUserById failed', id, e)
          }
        }

        // 4. Build payload + enqueue per buyer.
        const dateLabel = new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
        const dayKey = new Date().toISOString().slice(0, 10)

        let sent = 0
        const skipped: string[] = []

        for (const [buyerId, buyerOrders] of byBuyer.entries()) {
          const u = emailById.get(buyerId)
          if (!u?.email) {
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
            if (typeof o.final_charged_total_cents === 'number' && o.final_charged_total_cents > 0) {
              return s + o.final_charged_total_cents
            }
            return s + Math.round(Number(o.amount ?? 0) * 100)
          }, 0)

          const templateData = {
            buyerName: u.name,
            dateLabel,
            totalLabel: fmtMoney(totalCents),
            orders: lines,
          }

          if (dryRun) {
            sent++
            continue
          }

          // Enqueue via pgmq through the SECURITY DEFINER RPC.
          // template_name and recipient stored in the queue payload; the
          // dispatcher (process-email-queue) renders the React template and sends.
          const idempotencyKey = `daily-digest-${buyerId}-${dayKey}`
          try {
            const { error: enqErr } = await supabaseAdmin.rpc('enqueue_email', {
              queue_name: 'transactional_emails',
              payload: {
                template_name: 'daily-orders-digest',
                recipient_email: u.email,
                template_data: templateData,
                idempotency_key: idempotencyKey,
              } as any,
            } as any)
            if (enqErr) {
              console.error('[daily-digest] enqueue failed', buyerId, enqErr)
              skipped.push(`${buyerId}:enqueue_error`)
              continue
            }
            sent++
          } catch (e) {
            console.error('[daily-digest] enqueue threw', buyerId, e)
            skipped.push(`${buyerId}:exception`)
          }
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

      GET: async () => {
        return Response.json({
          ok: true,
          hint: 'POST to send. Add ?dry=1 to preview, ?hours=24 to set window.',
        })
      },
    },
  },
})
