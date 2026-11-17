/** Signed payment notifications for listing boosts. Returns null for non-boost events. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient } from "@/lib/stripe.server";

export async function handleBoostStripeEvent(event: { id: string; type: string; livemode: boolean; data: { object: any } }, env: "sandbox" | "live"): Promise<Response | null> {
  const obj = event.data.object;
  const boostId: unknown = obj?.metadata?.listing_boost_id;
  if (typeof boostId !== "string" || !/^[0-9a-f-]{36}$/i.test(boostId)) return null;
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    if (event.type === "checkout.session.expired") await supabaseAdmin.from("listing_boosts").update({ status: "cancelled" }).eq("id", boostId).eq("status", "pending");
    return Response.json({ received: true });
  }
  const { data: b } = await supabaseAdmin.from("listing_boosts").select("environment").eq("id", boostId).maybeSingle();
  if (!b || b.environment !== env || event.livemode !== (env === "live")) return Response.json({ received: true, ignored: "environment" });
  if (obj.payment_status !== "paid") return Response.json({ received: true, pending: true });
  const piId = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
  if (!piId) return new Response("Missing payment", { status: 500 });
  const pi = await createStripeClient(env).paymentIntents.retrieve(piId);
  if (pi.status !== "succeeded" || pi.currency !== "usd") return Response.json({ received: true, pending: true });
  const { data, error } = await (supabaseAdmin as any).rpc("activate_listing_boost", { _boost_id: boostId, _amount: pi.amount_received, _session: obj.id, _intent: pi.id });
  if (error) {
    if (/MISMATCH|MISSING/.test(error.message)) return Response.json({ received: true, rejected: true });
    return new Response("Boost activation failed", { status: 500 });
  }
  return Response.json({ received: true, boost: data });
}
