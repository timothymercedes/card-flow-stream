/**
 * Offer System v2 — binding purchase commitments backed by Stripe pre-auth.
 *
 *  createOffer  → buyer: validates saved card, creates manual-capture PI (pre-auth), inserts queue_offers row
 *  cancelOffer  → buyer: only while status='pending', auth still live, not expired
 *  acceptOffer  → seller: captures PI, creates order, marks queue item sold, declines siblings
 *  declineOffer → seller: cancels PI, marks declined
 *  expireOffers → cron: releases authorizations on expired offers
 *
 * Stripe access via getStripe() (project uses STRIPE_SECRET_KEY directly).
 * Anti-abuse events logged to offer_abuse_events for admin review.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getStripe } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OFFER_TTL_HOURS = 24;
const ALLOWED_TTL_HOURS = [1, 2, 6, 12, 24] as const;

// Anti-abuse limits — soft caps to deter inventory lockup / spam
const MAX_ACTIVE_OFFERS_PER_BUYER = 10;
const MAX_PENDING_OFFER_VALUE_USD = 10_000;
const PER_ITEM_COOLDOWN_SECONDS = 60;

async function logAbuse(
  userId: string,
  event_type: "unpaid_offer" | "cancel" | "auth_failed" | "spam" | "capture_failed" | "expired",
  queue_item_id?: string | null,
  offer_id?: string | null,
  metadata: Record<string, any> = {},
) {
  try {
    await supabaseAdmin.from("offer_abuse_events" as any).insert({
      user_id: userId,
      event_type,
      queue_item_id: queue_item_id ?? null,
      offer_id: offer_id ?? null,
      metadata,
    });
  } catch (e) {
    console.error("logAbuse failed", e);
  }
}

async function isOfferSuspended(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("buyer_restrictions")
    .select("id, expires_at, active")
    .eq("user_id", userId)
    .eq("kind", "offers_suspended")
    .eq("active", true)
    .maybeSingle();
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}

export const createOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      queueItemId: z.string().uuid(),
      amount: z.number().positive().max(1_000_000),
      expiresInHours: z.number().int().refine(
        (v) => (ALLOWED_TTL_HOURS as readonly number[]).includes(v),
        { message: "Expiration must be 1, 2, 6, 12, or 24 hours" },
      ).optional(),
      acceptedPolicyVersion: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (await isOfferSuspended(userId)) {
      throw new Error("Your offer privileges are currently suspended. Contact support.");
    }

    // Queue item check
    const { data: item } = await supabase
      .from("auction_queue")
      .select("id, host_id, sold_to, min_offer, title, image_url, stream_id")
      .eq("id", data.queueItemId)
      .maybeSingle();
    if (!item) throw new Error("Item not found");
    if ((item as any).sold_to) throw new Error("Item already sold");
    if (item.host_id === userId) throw new Error("You can't offer on your own item");

    const min = Number((item as any).min_offer || 0);
    if (min > 0 && data.amount < min) throw new Error(`Minimum offer is $${min}`);

    // Anti-abuse: check existing active offers from this buyer
    const { data: activeOffers } = await supabaseAdmin
      .from("queue_offers" as any)
      .select("id, amount, queue_item_id, created_at")
      .eq("buyer_id", userId)
      .eq("status", "pending")
      .eq("payment_status", "authorized");

    const active = (activeOffers || []) as any[];
    if (active.length >= MAX_ACTIVE_OFFERS_PER_BUYER) {
      throw new Error(`You have ${active.length} active offers. Cancel or wait for some to resolve before submitting more (max ${MAX_ACTIVE_OFFERS_PER_BUYER}).`);
    }
    const totalPending = active.reduce((s, o) => s + Number(o.amount || 0), 0);
    if (totalPending + data.amount > MAX_PENDING_OFFER_VALUE_USD) {
      throw new Error(`Total pending offer value would exceed $${MAX_PENDING_OFFER_VALUE_USD.toLocaleString()}. Cancel existing offers or wait.`);
    }
    // Per-item cooldown: prevent rapid-fire offers on the same item
    const recentForItem = active.find((o) =>
      o.queue_item_id === data.queueItemId &&
      (Date.now() - new Date(o.created_at).getTime()) < PER_ITEM_COOLDOWN_SECONDS * 1000,
    );
    if (recentForItem) {
      throw new Error(`You already have a pending offer on this item. Cancel it first to submit a new one.`);
    }

    // Saved payment method
    const { data: pm } = await supabase
      .from("buyer_payment_methods" as any)
      .select("stripe_customer_id, stripe_payment_method_id")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pm) {
      await logAbuse(userId, "unpaid_offer", data.queueItemId);
      throw new Error("Add a payment method before submitting an offer.");
    }

    const amountCents = Math.round(data.amount * 100);
    const { data: buyer } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    // Stripe pre-authorization (manual capture)
    const stripe = getStripe();
    let piId: string;
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          customer: (pm as any).stripe_customer_id,
          payment_method: (pm as any).stripe_payment_method_id,
          capture_method: "manual",
          confirm: true,
          off_session: true,
          description: `Offer on "${(item as any).title}"`,
          metadata: {
            kind: "queue_offer",
            queue_item_id: data.queueItemId,
            buyer_id: userId,
            seller_id: item.host_id,
          },
        },
        { idempotencyKey: `offer:create:${userId}:${data.queueItemId}:${amountCents}` },
      );
      if (pi.status !== "requires_capture") {
        // requires_action (3DS) etc — treat as failed for now
        await stripe.paymentIntents.cancel(pi.id).catch(() => {});
        await logAbuse(userId, "auth_failed", data.queueItemId, null, { pi_status: pi.status });
        throw new Error("Card could not be authorized. Try a different card.");
      }
      piId = pi.id;
    } catch (e: any) {
      await logAbuse(userId, "auth_failed", data.queueItemId, null, { error: e?.message });
      throw new Error(e?.message || "Payment authorization failed");
    }

    const { data: inserted, error } = await supabase
      .from("queue_offers" as any)
      .insert({
        queue_item_id: data.queueItemId,
        buyer_id: userId,
        buyer_username: (buyer as any)?.username || null,
        amount: data.amount,
        payment_intent_id: piId,
        payment_status: "authorized",
        auth_amount_cents: amountCents,
        stripe_customer_id: (pm as any).stripe_customer_id,
        stripe_payment_method_id: (pm as any).stripe_payment_method_id,
        expires_at: new Date(Date.now() + (data.expiresInHours ?? OFFER_TTL_HOURS) * 3600 * 1000).toISOString(),
      })
      .select("id, expires_at")
      .single();
    if (error) {
      await getStripe().paymentIntents.cancel(piId).catch(() => {});
      throw new Error(error.message);
    }

    return { ok: true, offerId: (inserted as any).id, expiresAt: (inserted as any).expires_at };
  });

export const cancelOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: offer } = await supabase
      .from("queue_offers" as any)
      .select("id, buyer_id, status, payment_status, payment_intent_id, expires_at, queue_item_id")
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer) throw new Error("Offer not found");
    const o = offer as any;
    if (o.buyer_id !== userId) throw new Error("Not your offer");
    if (o.status !== "pending") throw new Error("Offer is no longer cancellable");
    if (o.payment_status !== "authorized") throw new Error("Payment is no longer cancellable (already captured or released)");
    if (o.expires_at && new Date(o.expires_at) < new Date()) throw new Error("Offer already expired");

    if (o.payment_intent_id) {
      try {
        await getStripe().paymentIntents.cancel(o.payment_intent_id);
      } catch (e: any) {
        // If already cancelled, continue; otherwise surface
        if (!/already/i.test(e?.message || "")) throw new Error(e?.message || "Failed to release authorization");
      }
    }

    await supabase
      .from("queue_offers" as any)
      .update({
        status: "cancelled",
        payment_status: "released",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "buyer_cancelled",
      })
      .eq("id", data.offerId);

    await logAbuse(userId, "cancel", o.queue_item_id, o.id);
    return { ok: true };
  });

export const acceptOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: offer } = await supabase
      .from("queue_offers" as any)
      .select("*, auction_queue!inner(id, host_id, sold_to, title, image_url, stream_id)")
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer) throw new Error("Offer not found");
    const o = offer as any;
    const aq = o.auction_queue;
    if (aq.host_id !== userId) throw new Error("Only the host can accept offers");
    if (aq.sold_to) throw new Error("Item already sold");
    // Seller can accept either a fresh pending offer, OR a buyer counter-back
    // (status='countered' with turn='seller'). In both cases o.amount reflects
    // the buyer's currently-authorized commitment.
    const acceptable = (o.status === "pending") || (o.status === "countered" && o.turn === "seller");
    if (!acceptable) throw new Error("Offer is no longer pending");
    if (o.payment_status !== "authorized") throw new Error("Offer payment is not authorized");
    if (o.expires_at && new Date(o.expires_at) < new Date()) throw new Error("Offer has expired");

    // Capture payment
    const stripe = getStripe();
    try {
      await stripe.paymentIntents.capture(o.payment_intent_id, undefined, {
        idempotencyKey: `offer:capture:${o.id}`,
      });
    } catch (e: any) {
      await supabaseAdmin
        .from("queue_offers" as any)
        .update({
          status: "voided",
          payment_status: "failed",
          voided_at: new Date().toISOString(),
          cancel_reason: `capture_failed: ${e?.message || "unknown"}`,
        })
        .eq("id", o.id);
      await logAbuse(o.buyer_id, "capture_failed", aq.id, o.id, { error: e?.message });
      throw new Error(`Payment capture failed — offer voided. ${e?.message || ""}`);
    }

    // Buyer profile for ship_name fallback
    const { data: buyer } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", o.buyer_id)
      .maybeSingle();

    // Create paid order (buyer fills shipping post-acceptance)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        buyer_id: o.buyer_id,
        seller_id: aq.host_id,
        title: aq.title,
        amount: o.amount,
        quantity: 1,
        item_image_url: aq.image_url,
        stream_id: aq.stream_id,
        payment_status: "paid",
        status: "pending",
        ship_address: "",
        ship_city: "",
        ship_zip: "",
        ship_name: (buyer as any)?.username || "",
        ship_country: "US",
      } as any)
      .select("id")
      .single();
    if (orderErr) throw new Error(orderErr.message);

    // Mark offer accepted + queue item sold
    await supabaseAdmin
      .from("queue_offers" as any)
      .update({
        status: "accepted",
        payment_status: "captured",
        accepted_at: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        order_id: (order as any).id,
      })
      .eq("id", o.id);

    await supabaseAdmin
      .from("auction_queue")
      .update({
        sold_to: o.buyer_id,
        sold_at: new Date().toISOString(),
        order_id: (order as any).id,
        status: "sold",
      } as any)
      .eq("id", aq.id)
      .is("sold_to", null);

    // Decline sibling active offers (pending OR countered) — release their authorizations
    const { data: siblings } = await supabaseAdmin
      .from("queue_offers" as any)
      .select("id, payment_intent_id")
      .eq("queue_item_id", aq.id)
      .in("status", ["pending", "countered"])
      .neq("id", o.id);
    for (const s of (siblings || []) as any[]) {
      if (s.payment_intent_id) {
        await stripe.paymentIntents.cancel(s.payment_intent_id).catch(() => {});
      }
      await supabaseAdmin
        .from("queue_offers" as any)
        .update({
          status: "declined",
          payment_status: "released",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "outbid_sibling_accepted",
        })
        .eq("id", s.id);
    }

    return { ok: true, orderId: (order as any).id };
  });

export const declineOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: offer } = await supabase
      .from("queue_offers" as any)
      .select("*, auction_queue!inner(host_id)")
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer) throw new Error("Offer not found");
    const o = offer as any;
    if (o.auction_queue.host_id !== userId) throw new Error("Only the host can decline offers");
    if (o.status !== "pending" && o.status !== "countered") throw new Error("Offer is no longer pending");

    if (o.payment_intent_id && o.payment_status === "authorized") {
      await getStripe().paymentIntents.cancel(o.payment_intent_id).catch(() => {});
    }

    await supabaseAdmin
      .from("queue_offers" as any)
      .update({
        status: "declined",
        payment_status: "released",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "seller_declined",
      })
      .eq("id", o.id);
    return { ok: true };
  });

/** Cron-only: expire stale authorizations. No auth middleware — called from server route with shared check. */
export async function expireOffersInternal(): Promise<{ expired: number }> {
  const { data: stale } = await supabaseAdmin
    .from("queue_offers" as any)
    .select("id, payment_intent_id, buyer_id, queue_item_id")
    .in("status", ["pending", "countered"])
    .eq("payment_status", "authorized")
    .lt("expires_at", new Date().toISOString())
    .limit(200);
  const rows = (stale || []) as any[];
  const stripe = getStripe();
  let count = 0;
  for (const o of rows) {
    if (o.payment_intent_id) {
      await stripe.paymentIntents.cancel(o.payment_intent_id).catch(() => {});
    }
    await supabaseAdmin
      .from("queue_offers" as any)
      .update({
        status: "expired",
        payment_status: "released",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "auto_expired",
      })
      .eq("id", o.id);
    await logAbuse(o.buyer_id, "expired", o.queue_item_id, o.id);
    count++;
  }
  return { expired: count };
}
