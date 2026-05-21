/**
 * buyerFeePreview — returns the platform fee a buyer would pay for their
 * NEXT order in a given live stream, so the live UI can show the bundle
 * discount in real time before they tap "I want this".
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BUYER_PLATFORM_FEE_CENTS } from "@/lib/stripe.server";

export const previewBuyerFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { streamId?: string | null }) => data || {})
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const streamId = data.streamId || null;
    const threshold = 3;
    if (!streamId) {
      return {
        platformFeeCents: BUYER_PLATFORM_FEE_CENTS,
        nextItemIndex: 1,
        threshold,
        bundleDiscountActive: false,
      };
    }
    const { count } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .eq("stream_id", streamId)
      .eq("payment_status", "paid");
    const nextItemIndex = (count || 0) + 1;
    const bundleDiscountActive = nextItemIndex > threshold;
    return {
      platformFeeCents: bundleDiscountActive ? 0 : BUYER_PLATFORM_FEE_CENTS,
      nextItemIndex,
      threshold,
      bundleDiscountActive,
    };
  });
