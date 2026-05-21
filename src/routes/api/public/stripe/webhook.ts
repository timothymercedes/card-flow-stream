import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const body = await request.text();

        if (!sig || !secret) {
          console.error("Missing Stripe signature or webhook secret");
          return new Response("Misconfigured", { status: 400 });
        }

        const stripe = getStripe();
        let event;
        try {
          event = stripe.webhooks.constructEvent(body, sig, secret);
        } catch (err) {
          console.error("Webhook signature verification failed:", err);
          return new Response("Invalid signature", { status: 400 });
        }

        // Idempotency guard: if we've already handled this Stripe event, ack and skip.
        // PK conflict on (provider, event_id) means this is a Stripe retry.
        {
          const { error: dupErr } = await supabaseAdmin
            .from("processed_webhook_events")
            .insert({ provider: "stripe", event_id: event.id, event_type: event.type });
          if (dupErr) {
            // Code 23505 = unique_violation — already processed.
            if ((dupErr as any).code === "23505") {
              return new Response(JSON.stringify({ received: true, duplicate: true }), {
                status: 200, headers: { "Content-Type": "application/json" },
              });
            }
            console.error("processed_webhook_events insert failed:", dupErr);
            // Fall through — better to risk a duplicate than drop the event entirely.
          }
        }

        try {
          switch (event.type) {
            case "account.updated": {
              const account: any = event.data.object;
              await supabaseAdmin
                .from("stripe_accounts")
                .update({
                  charges_enabled: account.charges_enabled,
                  payouts_enabled: account.payouts_enabled,
                  details_submitted: account.details_submitted,
                  country: account.country,
                  default_currency: account.default_currency,
                })
                .eq("stripe_account_id", account.id);
              break;
            }
            case "payment_intent.succeeded": {
              const pi: any = event.data.object;
              const orderId = pi.metadata?.order_id;
              const orderIdsStr = pi.metadata?.order_ids as string | undefined;
              const tipId = pi.metadata?.tip_id;
              const promotionId = pi.metadata?.promotion_id;
              const chargeId = pi.latest_charge as string | undefined;
              if (tipId) {
                const { data: tipRow } = await supabaseAdmin
                  .from("stream_tips")
                  .update({ status: "paid", paid_at: new Date().toISOString() })
                  .eq("id", tipId)
                  .select("stream_id, seller_id, buyer_username, amount, message")
                  .maybeSingle();
                if (tipRow) {
                  const t: any = tipRow;
                  await supabaseAdmin.from("chat_messages").insert({
                    stream_id: t.stream_id,
                    username: "system",
                    content: `💸 ${t.buyer_username} sent a $${Number(t.amount).toFixed(2)} shoutout${t.message ? ` — "${t.message}"` : ""}`,
                    is_system: true,
                  });
                  await supabaseAdmin.from("notifications").insert({
                    user_id: t.seller_id,
                    type: "stream_tip",
                    body: `💸 ${t.buyer_username} sent you a $${Number(t.amount).toFixed(2)} shoutout`,
                    link: `/live/${t.stream_id}`,
                  });
                }
              }
              if (promotionId) {
                const nowIso = new Date().toISOString();
                const durationSeconds = Number(pi.metadata?.duration_seconds || 0);
                const promoEndsAt = durationSeconds > 0
                  ? new Date(Date.now() + durationSeconds * 1000).toISOString()
                  : null;
                const { data: promo } = await supabaseAdmin
                  .from("stream_promotions")
                  .update({ status: "paid", paid_at: nowIso, promotion_ends_at: promoEndsAt })
                  .eq("id", promotionId)
                  .select("stream_id, promoter_id, promoter_username, amount, message, duration_seconds")
                  .maybeSingle();
                if (promo) {
                  const p: any = promo;
                  // Increment stream score, total, extend active_until
                  const { data: streamRow } = await supabaseAdmin
                    .from("live_streams")
                    .select("promotion_score, total_promoted_amount, promotion_active_until, seller_id, title")
                    .eq("id", p.stream_id)
                    .maybeSingle();
                  if (streamRow) {
                    const sr: any = streamRow;
                    const dur = Number(p.duration_seconds || durationSeconds || 0);
                    const currentEnd = sr.promotion_active_until ? new Date(sr.promotion_active_until).getTime() : 0;
                    const base = Math.max(currentEnd, Date.now());
                    const newActiveUntil = dur > 0 ? new Date(base + dur * 1000).toISOString() : sr.promotion_active_until;
                    await supabaseAdmin
                      .from("live_streams")
                      .update({
                        promotion_score: Number(sr.promotion_score || 0) + Number(p.amount),
                        total_promoted_amount: Number(sr.total_promoted_amount || 0) + Number(p.amount),
                        last_promoted_at: nowIso,
                        promotion_active_until: newActiveUntil,
                      })
                      .eq("id", p.stream_id);
                    await supabaseAdmin.from("chat_messages").insert({
                      stream_id: p.stream_id,
                      username: "system",
                      content: `🔥 ${p.promoter_username} promoted this live for $${Number(p.amount).toFixed(2)}${p.message ? ` — "${p.message}"` : ""}`,
                      is_system: true,
                    });
                    await supabaseAdmin.from("notifications").insert({
                      user_id: sr.seller_id,
                      type: "stream_promotion",
                      body: `🔥 ${p.promoter_username} promoted "${sr.title}" for $${Number(p.amount).toFixed(2)}`,
                      link: `/live/${p.stream_id}`,
                    });
                  }
                }
              }
              const ids = (orderIdsStr ? orderIdsStr.split(",").filter(Boolean) : (orderId ? [orderId] : []));
              if (ids.length > 0) {
                await supabaseAdmin
                  .from("orders")
                  .update({
                    payment_status: "paid",
                    paid_at: new Date().toISOString(),
                    stripe_payment_intent_id: pi.id,
                    stripe_charge_id: chargeId ?? null,
                  })
                  .in("id", ids);
                // Clear any bid blocks once payment recovers
                const { data: paid } = await supabaseAdmin.from("orders").select("buyer_id, stream_id").in("id", ids);
                for (const o of (paid || []) as any[]) {
                  if (o.stream_id) {
                    await supabaseAdmin.from("live_bid_blocks")
                      .delete().eq("stream_id", o.stream_id).eq("user_id", o.buyer_id);
                  }
                }
              }
              // Platform revenue ledger (idempotent on event.id)
              try {
                const md = pi.metadata || {};
                const platformFeeCents = Number(md.platform_fee_cents || 0);
                const intlFeeCents = Number(md.intl_fee_cents || 0);
                const tipFeeCents = Number(md.platform_fee_cents && md.kind === "stream_tip" ? md.platform_fee_cents : 0);
                if (md.kind === "stream_tip" && tipFeeCents > 0) {
                  await (supabaseAdmin as any).rpc("log_platform_revenue", {
                    _kind: "tip_fee", _amount_cents: tipFeeCents,
                    _seller_id: md.seller_id || null, _buyer_id: md.buyer_id || null,
                    _stripe_pi: pi.id, _stripe_charge: chargeId || null,
                    _stripe_event: event.id, _meta: { tip_id: md.tip_id || null },
                  });
                } else if (promotionId) {
                  await (supabaseAdmin as any).rpc("log_platform_revenue", {
                    _kind: "promotion", _amount_cents: pi.amount,
                    _buyer_id: md.promoter_id || null,
                    _stripe_pi: pi.id, _stripe_charge: chargeId || null,
                    _stripe_event: event.id, _meta: { promotion_id: promotionId },
                  });
                } else if (ids.length > 0) {
                  if (platformFeeCents > 0) {
                    await (supabaseAdmin as any).rpc("log_platform_revenue", {
                      _kind: "marketplace_commission", _amount_cents: platformFeeCents,
                      _seller_id: md.seller_id || null, _buyer_id: md.buyer_id || null,
                      _order_id: ids[0] || null, _stripe_pi: pi.id, _stripe_charge: chargeId || null,
                      _stripe_event: `${event.id}:fee`, _meta: { order_ids: ids },
                    });
                  }
                  if (intlFeeCents > 0) {
                    await (supabaseAdmin as any).rpc("log_platform_revenue", {
                      _kind: "intl_processing_fee", _amount_cents: intlFeeCents,
                      _seller_id: md.seller_id || null, _buyer_id: md.buyer_id || null,
                      _order_id: ids[0] || null, _stripe_pi: pi.id, _stripe_charge: chargeId || null,
                      _stripe_event: `${event.id}:intl`,
                      _meta: { buyer_country: md.buyer_country, seller_country: md.seller_country },
                    });
                  }
                }
              } catch (e) {
                console.error("platform_revenue log failed", e);
              }
              break;
            }
            case "payment_intent.payment_failed": {
              const pi: any = event.data.object;
              const orderId = pi.metadata?.order_id as string | undefined;
              const orderIdsStr = pi.metadata?.order_ids as string | undefined;
              const ids = (orderIdsStr ? orderIdsStr.split(",").filter(Boolean) : (orderId ? [orderId] : []));
              if (ids.length === 0) break;
              // Phase 3.1: auto-charge failures own their own status (`failed`).
              // The legacy checkout flow uses `awaiting_payment` so the buyer
              // can resume from /orders. Pick the destination status based on
              // the PI kind so the webhook doesn't clobber in-stream state.
              const isAutoCharge = pi.metadata?.kind === "auction_auto_charge";
              const failedStatus = isAutoCharge ? "failed" : "awaiting_payment";
              const { data: orders } = await supabaseAdmin
                .from("orders")
                .select("id, buyer_id, seller_id, stream_id, title, payment_failure_count, payment_status")
                .in("id", ids);
              const nowIso = new Date().toISOString();
              const retryDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              for (const o of (orders || []) as any[]) {
                // Don't downgrade an already-failed/paid order.
                if (o.payment_status === "paid") continue;
                await supabaseAdmin.from("orders").update({
                  payment_status: failedStatus,
                  payment_failure_count: (o.payment_failure_count || 0) + 1,
                  payment_failed_at: nowIso,
                  payment_retry_deadline: retryDeadline,
                }).eq("id", o.id);
                await supabaseAdmin.from("notifications").insert([
                  { user_id: o.buyer_id, type: "payment_failed", body: `❌ Payment failed for "${o.title}". Please retry within 24h.`, link: o.stream_id ? `/live/${o.stream_id}` : "/orders" },
                  { user_id: o.seller_id, type: "payment_failed", body: `⚠️ Buyer payment failed for "${o.title}".`, link: "/store" },
                ]);
                if (o.stream_id) {
                  await supabaseAdmin.from("live_bid_blocks").upsert({
                    stream_id: o.stream_id, user_id: o.buyer_id,
                    reason: "payment_failed", expires_at: retryDeadline,
                  }, { onConflict: "stream_id,user_id" });
                }
                // Phase 11: log buyer risk signal (fire-and-forget).
                try {
                  await (supabaseAdmin.rpc as any)("record_buyer_risk_signal", {
                    _user_id: o.buyer_id,
                    _kind: "payment_failed",
                    _ref_table: "orders",
                    _ref_id: o.id,
                    _seller_id: o.seller_id,
                    _metadata: { stripe_pi: pi.id, title: o.title },
                  });
                } catch (e) { console.error("risk signal payment_failed", e); }
              }
              break;
            }
            case "charge.refunded": {
              const charge: any = event.data.object;
              const piId = charge.payment_intent as string | undefined;
              const refundedAmt = (charge.amount_refunded ?? 0) / 100;
              const fullyRefunded = !!charge.refunded || refundedAmt >= (charge.amount ?? 0) / 100;
              if (piId) {
                const { data: rows } = await supabaseAdmin
                  .from("orders")
                  .select("id, buyer_id, seller_id, title")
                  .eq("stripe_payment_intent_id", piId);
                if (rows && rows.length > 0) {
                  await supabaseAdmin.from("orders").update({
                    payment_status: fullyRefunded ? "refunded" : "partial_refund",
                    status: fullyRefunded ? "refunded" : "pending",
                    refunded_amount: refundedAmt,
                    refunded_at: new Date().toISOString(),
                  }).eq("stripe_payment_intent_id", piId);
                  for (const o of rows as any[]) {
                    await supabaseAdmin.from("notifications").insert([
                      { user_id: o.buyer_id, type: "refund", body: `💸 Refund issued for "${o.title}" ($${refundedAmt.toFixed(2)}).`, link: "/orders" },
                      { user_id: o.seller_id, type: "refund", body: `↩️ Refund issued on "${o.title}" ($${refundedAmt.toFixed(2)}).`, link: "/store" },
                    ]);
                    // Phase 11: refund risk signal.
                    try {
                      await (supabaseAdmin.rpc as any)("record_buyer_risk_signal", {
                        _user_id: o.buyer_id,
                        _kind: "refund_requested",
                        _ref_table: "orders",
                        _ref_id: o.id,
                        _seller_id: o.seller_id,
                        _metadata: { amount: refundedAmt, fully_refunded: fullyRefunded },
                      });
                    } catch (e) { console.error("risk signal refund", e); }
                  }
                }
              }
              // Log refund as negative revenue (loss to platform side of fee book)
              try {
                await (supabaseAdmin as any).rpc("log_platform_revenue", {
                  _kind: "refund_loss",
                  _amount_cents: -Math.round(refundedAmt * 100),
                  _stripe_pi: piId || null,
                  _stripe_charge: charge.id || null,
                  _stripe_event: event.id,
                  _meta: { fully_refunded: fullyRefunded },
                });
              } catch (e) { console.error("refund revenue log failed", e); }
              break;
            }
            case "charge.dispute.created":
            case "charge.dispute.updated":
            case "charge.dispute.closed": {
              const d: any = event.data.object;
              const chargeId = d.charge as string | undefined;
              const piId = (d.payment_intent as string | undefined) ?? null;
              const amountCents = Number(d.amount ?? 0);
              const stripeStatus = String(d.status ?? "");
              // Find the linked order (if any) via payment_intent
              let order: any = null;
              if (piId) {
                const { data: oRows } = await supabaseAdmin
                  .from("orders")
                  .select("id, buyer_id, buyer_username, seller_id, title")
                  .eq("stripe_payment_intent_id", piId)
                  .limit(1);
                order = oRows?.[0] ?? null;
              }
              // Map Stripe dispute status -> internal dispute status
              const internalStatus = ["won", "warning_closed", "charge_refunded"].includes(stripeStatus)
                ? "resolved"
                : stripeStatus === "lost"
                  ? "lost"
                  : "investigating";

              // Upsert a dispute row keyed by stripe_dispute_id
              const reporterId = order?.buyer_id ?? null;
              const reporterUsername = order?.buyer_username ?? "stripe";
              const row: any = {
                stripe_dispute_id: d.id,
                stripe_charge_id: chargeId ?? null,
                amount_cents: amountCents,
                order_id: order?.id ?? null,
                reporter_id: reporterId,
                reporter_username: reporterUsername,
                reported_user_id: order?.seller_id ?? null,
                reason: `stripe_chargeback:${d.reason ?? "unknown"}`,
                description: `Stripe chargeback (${stripeStatus}) for $${(amountCents / 100).toFixed(2)}. Reason: ${d.reason ?? "n/a"}.`,
                status: internalStatus,
              };
              if (reporterId) {
                await supabaseAdmin
                  .from("disputes")
                  .upsert(row, { onConflict: "stripe_dispute_id" });
              }

              // Sync order payment_status
              if (order) {
                await supabaseAdmin
                  .from("orders")
                  .update({
                    payment_status: stripeStatus === "lost" ? "chargeback_lost" : "disputed",
                  })
                  .eq("id", order.id);

                if (event.type === "charge.dispute.created") {
                  await supabaseAdmin.from("notifications").insert([
                    { user_id: order.seller_id, type: "dispute", body: `⚠️ Chargeback opened on "${order.title}" ($${(amountCents / 100).toFixed(2)}).`, link: "/disputes" },
                  ]);
                  // Phase 11: chargeback is the strongest buyer-risk signal.
                  try {
                    await (supabaseAdmin.rpc as any)("record_buyer_risk_signal", {
                      _user_id: order.buyer_id,
                      _kind: "chargeback",
                      _ref_table: "orders",
                      _ref_id: order.id,
                      _seller_id: order.seller_id,
                      _metadata: { amount_cents: amountCents, reason: d.reason ?? null },
                    });
                  } catch (e) { console.error("risk signal chargeback", e); }
                }
              }

              // Ledger entry on close
              if (event.type === "charge.dispute.closed" && stripeStatus === "lost") {
                try {
                  await (supabaseAdmin as any).rpc("log_platform_revenue", {
                    _kind: "dispute_loss",
                    _amount_cents: -amountCents,
                    _stripe_pi: piId,
                    _stripe_charge: chargeId ?? null,
                    _stripe_event: event.id,
                    _meta: { stripe_dispute_id: d.id, reason: d.reason },
                  });
                } catch (e) { console.error("dispute revenue log failed", e); }
              }
              break;
            }
            default:
              console.log("Unhandled Stripe event:", event.type);
          }
        } catch (err) {
          console.error("Webhook handler error:", err);
          return new Response("Handler error", { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
