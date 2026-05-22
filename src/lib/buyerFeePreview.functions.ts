/**
 * buyerFeePreview — returns the exact live-auction buyer fee preview for the
 * NEXT order in a stream, including grouped shipping and fee-threshold rules.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LIVE_BUYER_FEE_THRESHOLD, calculateFees } from "@/lib/stripe.server";
import { quoteTax } from "@/lib/tax/taxProvider.server";


export const previewBuyerFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { streamId?: string | null; currentBidCents?: number; shippingCents?: number }) => data || {})
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const streamId = data.streamId || null;
    const threshold = LIVE_BUYER_FEE_THRESHOLD;
    if (!streamId) {
      const fees = calculateFees(0, { feeSplitMode: "split", platformFeeCentsOverride: 0, sellerAbsorbedFeeCentsOverride: 0 });
      return {
        ...fees,
        itemCents: 0,
        shippingCents: 0,
        taxCents: 0,
        taxableSubtotalCents: 0,
        taxRateBps: 0,
        taxJurisdiction: null as string | null,
        taxProvider: "state_table" as const,
        nextItemIndex: 1,
        threshold,
        bundleDiscountActive: false,
      };
    }
    const { data: stream } = await supabaseAdmin
      .from("live_streams")
      .select("seller_id,current_bid,shipping_price")
      .eq("id", streamId)
      .maybeSingle();
    const sellerId = (stream as any)?.seller_id;
    const itemCents = Math.max(0, Math.round(Number(data.currentBidCents ?? Math.round(Number((stream as any)?.current_bid || 0) * 100))));
    const requestedShippingCents = Math.max(0, Math.round(Number(data.shippingCents ?? Math.round(Number((stream as any)?.shipping_price || 0) * 100))));
    const { count } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .eq("stream_id", streamId)
      .eq("payment_status", "paid");
    const nextItemIndex = (count || 0) + 1;
    const bundleDiscountActive = nextItemIndex > threshold;
    let shippingCents = requestedShippingCents;
    let buyerCountry: string | null = null;
    let buyerState: string | null = null;
    if (sellerId) {
      const { data: buyerProfile } = await supabaseAdmin
        .from("profiles")
        .select("address_country,address_state")
        .eq("id", userId)
        .maybeSingle();
      const { data: sellerProfile } = await supabaseAdmin
        .from("profiles")
        .select("shipping_cap")
        .eq("id", sellerId)
        .maybeSingle();
      buyerCountry = ((buyerProfile as any)?.address_country ?? null) as string | null;
      buyerState = ((buyerProfile as any)?.address_state ?? null) as string | null;
      const country = String(buyerCountry || "US").toUpperCase();
      const systemCapCents = country === "US" || country === "USA" ? 700 : 2000;
      const sellerCapRaw = (sellerProfile as any)?.shipping_cap;
      const capCents = sellerCapRaw != null ? Math.min(systemCapCents, Math.round(Number(sellerCapRaw) * 100)) : systemCapCents;
      const { data: prior } = await supabaseAdmin
        .from("orders")
        .select("shipping_amount")
        .eq("buyer_id", userId)
        .eq("seller_id", sellerId)
        .eq("stream_id", streamId);
      const priorShippingCents = ((prior ?? []) as any[]).reduce((sum, o) => sum + Math.round(Number(o.shipping_amount || 0) * 100), 0);
      shippingCents = Math.min(requestedShippingCents, Math.max(0, capCents - priorShippingCents));
    }
    const feeSplitMode = bundleDiscountActive ? "seller_absorbed" : "split";
    const fees = calculateFees(itemCents + shippingCents, {
      feeSplitMode,
      platformFeeCentsOverride: 0,
      sellerAbsorbedFeeCentsOverride: 0,
    });
    // Sales tax — US state-based flat rate. Taxable base = item + shipping
    // (most states tax shipping when it's part of a taxable sale).
    const taxCents = calculateTaxCents(itemCents + shippingCents, buyerCountry, buyerState);
    return {
      ...fees,
      itemCents,
      shippingCents,
      taxCents,
      nextItemIndex,
      threshold,
      bundleDiscountActive,
    };
  });

