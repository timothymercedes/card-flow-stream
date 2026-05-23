import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OFFER_TTL_HOURS = 24;
const ALLOWED_TTL_HOURS = [1, 2, 6, 12, 24] as const;
const MAX_ACTIVE_OFFERS_PER_BUYER = 10;
const MAX_PENDING_OFFER_VALUE_USD = 10_000;
const PER_ITEM_COOLDOWN_SECONDS = 60;

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStripe } = await import("@/lib/stripe.server");

    async function logAbuse(
      event_type: "unpaid_offer" | "auth_failed" | "spam",
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
      } catch {
        /* non-fatal */
      }
    }

    const { data: restriction } = await supabaseAdmin
      .from("buyer_restrictions")
      .select("id, expires_at, active")
      .eq("user_id", userId)
      .eq("kind", "offers_suspended")
      .eq("active", true)
      .maybeSingle();
    if (restriction && (!restriction.expires_at || new Date(restriction.expires_at) >= new Date())) {
      throw new Error("Your offer privileges are currently suspended. Contact support.");
    }

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

    const { data: activeOffers } = await supabaseAdmin
      .from("queue_offers" as any)
      .select("id, amount, queue_item_id, created_at")
      .eq("buyer_id", userId)
      .eq("status", "pending")
      .eq("payment_status", "authorized");
    const active = (activeOffers || []) as any[];
    if (active.length >= MAX_ACTIVE_OFFERS_PER_BUYER) {
      throw new Error(`You have ${active.length} active offers. Cancel or wait for some to resolve before submitting more.`);
    }
    const totalPending = active.reduce((sum, offer) => sum + Number(offer.amount || 0), 0);
    if (totalPending + data.amount > MAX_PENDING_OFFER_VALUE_USD) {
      throw new Error(`Total pending offer value would exceed $${MAX_PENDING_OFFER_VALUE_USD.toLocaleString()}.`);
    }
    const recentForItem = active.find((offer) =>
      offer.queue_item_id === data.queueItemId &&
      Date.now() - new Date(offer.created_at).getTime() < PER_ITEM_COOLDOWN_SECONDS * 1000,
    );
    if (recentForItem) throw new Error("You already have a pending offer on this item. Cancel it first to submit a new one.");

    const { data: pm } = await supabase
      .from("buyer_payment_methods" as any)
      .select("stripe_customer_id, stripe_payment_method_id")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pm) {
      await logAbuse("unpaid_offer", data.queueItemId);
      throw new Error("Add a payment method before submitting an offer.");
    }

    const amountCents = Math.round(data.amount * 100);
    const { data: buyer } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    const stripe = getStripe();
    let piId: string;
    try {
      const pi = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: (pm as any).stripe_customer_id,
        payment_method: (pm as any).stripe_payment_method_id,
        capture_method: "manual",
        confirm: true,
        off_session: true,
        description: `Offer on "${(item as any).title}"`,
        metadata: { kind: "queue_offer", queue_item_id: data.queueItemId, buyer_id: userId, seller_id: item.host_id },
      }, { idempotencyKey: `offer:create:${userId}:${data.queueItemId}:${amountCents}` });
      if (pi.status !== "requires_capture") {
        await stripe.paymentIntents.cancel(pi.id).catch(() => null);
        await logAbuse("auth_failed", data.queueItemId, null, { pi_status: pi.status });
        throw new Error("Card could not be authorized. Try a different card.");
      }
      piId = pi.id;
    } catch (error: any) {
      await logAbuse("auth_failed", data.queueItemId, null, { error: error?.message });
      throw new Error(error?.message || "Payment authorization failed");
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
      await stripe.paymentIntents.cancel(piId).catch(() => null);
      throw new Error(error.message);
    }

    return { ok: true, offerId: (inserted as any).id, expiresAt: (inserted as any).expires_at };
  });