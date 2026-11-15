/**
 * PB Bazaar retail checkout — server only, Stripe TEST MODE only.
 * One engine serves Buy Now and cart. Browser prices are never trusted: price, live CJ stock/cost/shipping,
 * the $ profit floor and destination tax are all recomputed here. Payment is settled only by the signed webhook.
 * No CJ orders, CJ balance spending or refunds happen anywhere in this file.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { cheapestQuote, landedPrice } from "@/lib/suppliers/cjImport";
import type { PricingRule } from "@/lib/bazaarPricing";
import { BAZAAR_TAX_CODE, checkoutExpiry, createSessionWithRetry, normalizeCheckoutLines, sessionTimingProblem, validateShippingAddress, verifiedTaxFromCalculation, type CheckoutLine, type CheckoutSource, type ShippingAddress } from "@/lib/bazaarCheckout";

type StartInput = { userId: string; email: string | null; source: CheckoutSource; items: CheckoutLine[]; address: ShippingAddress; returnOrigin: string };
export type StartResult = { error: string } | { clientSecret: string; orderId: string };

const db = () => supabaseAdmin;

async function cjAdapter() {
  const { createCJAdapterFromEnv } = await import("@/lib/suppliers/cjAdapter.server");
  return createCJAdapterFromEnv();
}

async function resolveCustomer(stripe: ReturnType<typeof createStripeClient>, userId: string, email: string | null) {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) throw new Error("Invalid user");
  const found = await stripe.customers.search({ query: `metadata['userId']:'${userId}'`, limit: 1 });
  if (found.data.length) return found.data[0].id;
  if (email) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length) {
      const c = existing.data[0];
      if (c.metadata?.userId !== userId) await stripe.customers.update(c.id, { metadata: { ...c.metadata, userId } });
      return c.id;
    }
  }
  return (await stripe.customers.create({ ...(email && { email }), metadata: { userId } })).id;
}

export async function startBazaarCheckout(input: StartInput): Promise<StartResult> {
  let lines: CheckoutLine[]; let address: ShippingAddress;
  try { lines = normalizeCheckoutLines(input.source, input.items); address = validateShippingAddress(input.address); }
  catch (e) { return { error: (e as Error).message }; }
  const ids = lines.map((l) => l.variantId);

  // 1. Catalog: published PB Bazaar Direct products in an open store only.
  const { data: variants, error: vErr } = await db().from("bazaar_product_variants")
    .select("id, product_id, price_cents, quantity, is_active, options, bazaar_products!inner(id, title, images, status, store_id, bazaar_stores!inner(id, slug, status))")
    .in("id", ids);
  if (vErr) return { error: "Couldn't check these products. Please try again." };
  const byId = new Map((variants ?? []).map((v) => [v.id, v]));
  let storeId: string | null = null;
  for (const l of lines) {
    const v = byId.get(l.variantId);
    const p = v?.bazaar_products as unknown as { id: string; title: string; status: string; store_id: string; bazaar_stores: { slug: string; status: string } } | undefined;
    if (!v || !p || !v.is_active || p.status !== "published" || p.bazaar_stores.slug !== "pb-bazaar-direct" || p.bazaar_stores.status !== "active")
      return { error: "One of these items is no longer available. Review your selection." };
    storeId = p.store_id;
  }

  // 2. Supplier links: approved, verified, real (non-demo) CJ options only.
  const { data: links, error: lErr } = await db().from("bazaar_supplier_product_links")
    .select("variant_id, supplier_id, supplier_item_ref, supplier_sku, review_status, sync_status, bazaar_suppliers!inner(kind, is_demo)")
    .in("variant_id", ids);
  if (lErr) return { error: "Couldn't check supplier availability. Please try again." };
  const linkBy = new Map((links ?? []).map((l) => [l.variant_id, l]));
  for (const l of lines) {
    const k = linkBy.get(l.variantId); const s = k?.bazaar_suppliers as unknown as { kind: string; is_demo: boolean } | undefined;
    if (!k || !s || s.kind !== "cj" || s.is_demo || k.review_status !== "approved" || k.sync_status !== "ok" || !k.supplier_sku || !k.supplier_item_ref)
      return { error: "One of these items is waiting for review and can't be bought right now." };
  }

  // 3. Live CJ revalidation: cost, stock and shipping to this ZIP, then the same pricing engine + profit floor.
  const { data: rule } = await db().from("bazaar_pricing_rules").select("*").eq("scope", "default").limit(1).maybeSingle();
  if (!rule) return { error: "Checkout is temporarily unavailable." };
  const priced: { line: CheckoutLine; title: string; image: string | null; label: string; unit: number; itemCost: number; ship: number; profit: number; supplierId: string; ref: string; vid: string }[] = [];
  try {
    const cj = await cjAdapter();
    const details = new Map<string, Awaited<ReturnType<typeof cj.getProductDetail>>>();
    for (const l of lines) {
      const v = byId.get(l.variantId)!; const k = linkBy.get(l.variantId)!;
      const p = v.bazaar_products as unknown as { title: string; images: string[] | null };
      if (!details.has(k.supplier_item_ref!)) details.set(k.supplier_item_ref!, await cj.getProductDetail(k.supplier_item_ref!));
      const live = details.get(k.supplier_item_ref!)!.variants.find((x) => x.vid === k.supplier_sku);
      if (!live) return { error: `"${p.title}" is no longer offered by the supplier.` };
      const stock = (await cj.getStock(live.vid)).reduce((n, s) => n + s.quantity, 0);
      if (stock < l.quantity) return { error: `Only ${Math.max(0, stock)} of "${p.title}" can be supplied right now.` };
      const quote = cheapestQuote(await cj.calculateShipping({ startCountryCode: "CN", endCountryCode: "US", zip: address.postalCode, products: [{ vid: live.vid, quantity: 1 }] }));
      if (!quote) return { error: `Shipping to your ZIP couldn't be confirmed for "${p.title}".` };
      const lp = landedPrice(live.costCents, quote.costCents, rule as unknown as PricingRule);
      if (lp.belowFloor || lp.priceCents !== v.price_cents) return { error: `The price of "${p.title}" needs to be updated before it can be sold. Please try again later.` };
      const opts = v.options && typeof v.options === "object" && !Array.isArray(v.options) ? Object.entries(v.options as Record<string, unknown>).filter(([, x]) => typeof x === "string").map(([a, b]) => `${a}: ${b}`).join(" · ") : "";
      priced.push({ line: l, title: p.title, image: p.images?.[0] ?? null, label: opts || "Standard", unit: v.price_cents, itemCost: live.costCents, ship: quote.costCents, profit: lp.profitCents, supplierId: k.supplier_id, ref: k.supplier_item_ref!, vid: live.vid });
    }
  } catch (e) {
    console.error("bazaar checkout CJ check failed", (e as Error).message);
    return { error: "We couldn't confirm live stock and shipping with our supplier. Please try again shortly." };
  }

  const subtotal = priced.reduce((n, x) => n + x.unit * x.line.quantity, 0);
  const shipping = 0; // CJ shipping is already included in the retail price

  // 4. Destination tax from a verified provider; unresolved tax blocks checkout.
  const stripe = createStripeClient("sandbox");
  let tax;
  try {
    const calc = await stripe.tax.calculations.create({
      currency: "usd",
      line_items: priced.map((x) => ({ amount: x.unit * x.line.quantity, quantity: x.line.quantity, reference: x.line.variantId, tax_code: BAZAAR_TAX_CODE, tax_behavior: "exclusive" as const })),
      customer_details: { address: { line1: address.line1, line2: address.line2, city: address.city, state: address.state, postal_code: address.postalCode, country: "US" }, address_source: "shipping" },
    });
    tax = verifiedTaxFromCalculation(calc as unknown as { id: string; tax_amount_exclusive: number; tax_breakdown: unknown[] }, subtotal + shipping, address);
  } catch (e) {
    console.error("bazaar tax verification failed", getStripeErrorMessage(e));
    return { error: "Sales tax couldn't be verified for this address, so checkout is paused. No payment was taken." };
  }
  const total = subtotal + shipping + tax.taxCents;

  // 5. Create the order (server-only writes).
  const { data: order, error: oErr } = await db().from("bazaar_orders").insert({
    buyer_id: input.userId, store_id: storeId!, source: input.source, environment: "sandbox", currency: "usd",
    subtotal_cents: subtotal, shipping_cents: shipping, tax_cents: tax.taxCents, total_cents: total,
    tax_calculation_status: "quoted_verified", tax_provider: tax.provider, tax_jurisdiction: tax.jurisdiction, tax_ruleset_version: tax.reference,
    tax_rate_bps: tax.rateBps, taxable_subtotal_cents: tax.taxableCents, tax_country: tax.country, tax_state: tax.state,
    shipping_name: address.name, shipping_line1: address.line1, shipping_line2: address.line2 ?? null, shipping_city: address.city,
    shipping_region: address.state, shipping_postal_code: address.postalCode, shipping_country: "US", shipping_phone: address.phone ?? null,
  }).select("id, order_number").single();
  if (oErr || !order) return { error: "Couldn't start your order. Please try again." };
  const discard = async () => { await db().from("bazaar_orders").delete().eq("id", order.id).eq("status", "pending_payment"); };

  const { data: items, error: iErr } = await db().from("bazaar_order_items").insert(priced.map((x) => ({
    order_id: order.id, product_id: byId.get(x.line.variantId)!.product_id, variant_id: x.line.variantId, title: x.title, variant_label: x.label, image_url: x.image,
    quantity: x.line.quantity, unit_price_cents: x.unit, line_total_cents: x.unit * x.line.quantity,
  }))).select("id, variant_id");
  const { error: pErr } = await db().from("bazaar_order_private_details").insert({
    order_id: order.id, idempotency_key: crypto.randomUUID(),
    landed_cost_cents: priced.reduce((n, x) => n + (x.itemCost + x.ship) * x.line.quantity, 0),
    profit_cents: priced.reduce((n, x) => n + x.profit * x.line.quantity, 0),
    validation_snapshot: { checked_at: new Date().toISOString(), tax_reference: tax.reference, lines: priced.map((x) => ({ variant_id: x.line.variantId, qty: x.line.quantity, unit: x.unit, item_cost: x.itemCost, ship: x.ship, profit: x.profit })) },
  });
  if (iErr || pErr || !items) { await discard(); return { error: "Couldn't start your order. Please try again." }; }
  const { error: fErr } = await db().from("bazaar_order_item_fulfillments").insert(items.map((it) => {
    const x = priced.find((p) => p.line.variantId === it.variant_id)!;
    return { order_item_id: it.id, supplier_id: x.supplierId, supplier_product_ref: x.ref, supplier_variant_ref: x.vid, supplier_unit_cost_cents: x.itemCost, supplier_shipping_cents: x.ship };
  }));
  if (fErr) { await discard(); return { error: "Couldn't start your order. Please try again." }; }

  // 6. One whole-second expiry, generated right before the hold + Stripe request.
  const expiry = checkoutExpiry(Date.now());
  const { error: rErr } = await db().rpc("bazaar_reserve_order_inventory", { _order_id: order.id, _expires_at: expiry.iso });
  if (rErr) {
    await db().rpc("bazaar_release_order_inventory", { _order_id: order.id, _target_status: "canceled" });
    return { error: /INSUFFICIENT_INVENTORY/.test(rErr.message) ? "Someone just bought the last one. Please review your quantities." : "Couldn't hold these items. Please try again." };
  }

  // 7. Stripe Checkout Session (embedded, cards only). Same idempotency key on every retry.
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    const customer = await resolveCustomer(stripe, input.userId, input.email);
    const params = {
      mode: "payment" as const, ui_mode: "embedded_page" as const, customer, payment_method_types: ["card" as const],
      expires_at: expiry.epoch, client_reference_id: order.id,
      return_url: `${input.returnOrigin}/bazaar/orders/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      line_items: [
        ...priced.map((x) => ({ quantity: x.line.quantity, price_data: { currency: "usd", unit_amount: x.unit, product_data: { name: x.title.slice(0, 250), description: x.label.slice(0, 250) } } })),
        ...(tax.taxCents > 0 ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: tax.taxCents, product_data: { name: `Sales tax (${tax.jurisdiction})` } } }] : []),
      ],
      metadata: { bazaar_order_id: order.id, environment: "sandbox" },
      payment_intent_data: { description: `PB Bazaar order ${order.order_number}`, metadata: { bazaar_order_id: order.id } },
    };
    const r = await createSessionWithRetry(() => stripe.checkout.sessions.create(params, { idempotencyKey: `bazaar_cs_${order.id}` }));
    if (r.outcome !== "created") {
      if (r.outcome === "rejected") {
        await db().rpc("bazaar_release_order_inventory", { _order_id: order.id, _target_status: "canceled" });
        return { error: `Payment couldn't be started: ${getStripeErrorMessage(r.error)}` };
      }
      // Unknown outcome: keep the hold. It expires together with any session Stripe may have created (same timestamp).
      return { error: "The payment page couldn't be confirmed. Your items are held briefly — please try again in a few minutes." };
    }
    session = r.session;
  } catch (e) {
    // Customer lookup failed before any session request was sent: no session can exist.
    await db().rpc("bazaar_release_order_inventory", { _order_id: order.id, _target_status: "canceled" });
    return { error: `Payment couldn't be started: ${getStripeErrorMessage(e)}` };
  }

  const problem = session.livemode ? "live_session" : session.amount_total !== total ? "amount_mismatch" : session.currency !== "usd" ? "currency_mismatch" : sessionTimingProblem(session, expiry.epoch);
  if (problem) {
    try { await stripe.checkout.sessions.expire(session.id); } catch { /* expiry still ends it */ }
    await db().rpc("bazaar_release_order_inventory", { _order_id: order.id, _target_status: "canceled" });
    console.error("bazaar session rejected", problem);
    return { error: "Payment couldn't be started safely. No payment was taken. Please try again." };
  }
  await db().from("bazaar_order_private_details").update({ stripe_checkout_session_id: session.id }).eq("order_id", order.id);
  if (!session.client_secret) return { error: "Stripe did not return a payment form." };
  return { clientSecret: session.client_secret, orderId: order.id };
}

/** Signed sandbox webhook handling for Bazaar sessions. Returns null when the event isn't a Bazaar event. */
export async function handleBazaarStripeEvent(event: { id: string; type: string; livemode: boolean; data: { object: any } }, env: "sandbox" | "live"): Promise<Response | null> {
  const obj = event.data.object;
  const orderId: unknown = obj?.metadata?.bazaar_order_id;
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  if (env !== "sandbox" || event.livemode) return Response.json({ received: true, ignored: "bazaar_test_only" });
  const ledger = { provider: "stripe-bazaar", event_id: event.id, event_type: event.type };
  const { data: seen } = await db().from("processed_webhook_events").select("event_id").eq("provider", ledger.provider).eq("event_id", event.id).maybeSingle();
  if (seen) return Response.json({ received: true, duplicate: true });

  if (event.type === "checkout.session.completed") {
    if (obj.payment_status !== "paid") return Response.json({ received: true, pending: true });
    const piId = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
    if (!piId) return new Response("Missing payment", { status: 500 });
    const pi = await createStripeClient("sandbox").paymentIntents.retrieve(piId);
    if (pi.livemode || pi.status !== "succeeded") return Response.json({ received: true, pending: true });
    const { data: result, error } = await db().rpc("bazaar_settle_order", { _order_id: orderId, _amount: pi.amount_received, _currency: pi.currency, _stripe_checkout_session_id: obj.id, _stripe_payment_intent_id: pi.id });
    if (error) {
      if (/MISMATCH|MISSING|REQUIRED|INVALID_SETTLEMENT/.test(error.message)) {
        await notifyAdmins(`PB Bazaar payment for order ${orderId} failed verification and needs review.`, orderId);
        await db().from("processed_webhook_events").insert(ledger);
        return Response.json({ received: true, rejected: true });
      }
      return new Response("Settlement failed", { status: 500 });
    }
    if (result === "paid_inventory_exception") await notifyAdmins("A paid PB Bazaar order needs inventory review. No refund or supplier order was made.", orderId);
    else if (result === "awaiting_fulfillment_approval") await notifyAdmins("A PB Bazaar order is paid and waiting for fulfillment approval.", orderId);
  } else if (event.type === "checkout.session.expired") {
    const { error } = await db().rpc("bazaar_release_order_inventory", { _order_id: orderId, _target_status: "expired" });
    if (error) return new Response("Release failed", { status: 500 });
  } else {
    return Response.json({ received: true, ignored: event.type });
  }
  await db().from("processed_webhook_events").insert(ledger);
  return Response.json({ received: true });
}

async function notifyAdmins(body: string, orderId: string) {
  const { data } = await db().from("user_roles").select("user_id").in("role", ["admin", "owner"]);
  for (const uid of new Set((data ?? []).map((r) => r.user_id))) {
    await db().rpc("notify_user", { _user_id: uid, _type: "bazaar_order", _category: "orders", _body: body, _link: `/admin/bazaar-orders?order=${orderId}` });
  }
}

/** Admin approval only records the decision. It never contacts CJ, spends balance or refunds. */
export async function authorizeBazaarFulfillment(orderId: string, adminId: string): Promise<{ error: string | null }> {
  const { data: order } = await db().from("bazaar_orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Order not found." };
  if (order.status !== "awaiting_fulfillment_approval") return { error: "Only paid orders awaiting approval can be approved." };
  const { data: items } = await db().from("bazaar_order_items").select("id").eq("order_id", orderId);
  const now = new Date().toISOString();
  const { error: fErr } = await db().from("bazaar_order_item_fulfillments").update({ status: "authorized", authorized_by: adminId, authorized_at: now }).in("order_item_id", (items ?? []).map((i) => i.id)).eq("status", "awaiting_admin_authorization");
  if (fErr) return { error: "Couldn't save the approval." };
  const { error } = await db().from("bazaar_orders").update({ status: "fulfillment_authorized" }).eq("id", orderId).eq("status", "awaiting_fulfillment_approval");
  return { error: error ? "Couldn't save the approval." : null };
}
