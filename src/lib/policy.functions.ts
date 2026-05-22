import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader } from "@tanstack/react-start/server";
import { FINAL_SALE_POLICY_VERSION } from "./policy";

const Input = z.object({
  context: z.enum(["checkout", "bid", "instant_win", "offer_accept", "payment", "marketplace_buy"]),
  orderId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const recordPolicyAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const ua = getRequestHeader("user-agent") ?? null;

    const rows = [
      {
        user_id: userId,
        policy_version: FINAL_SALE_POLICY_VERSION,
        policy_type: "final_sale" as const,
        acceptance_context: data.context,
        order_id: data.orderId ?? null,
        stream_id: data.streamId ?? null,
        listing_id: data.listingId ?? null,
        ip_address: ip,
        user_agent: ua,
        metadata: data.metadata ?? {},
      },
      {
        user_id: userId,
        policy_version: FINAL_SALE_POLICY_VERSION,
        policy_type: "buyer_protection" as const,
        acceptance_context: data.context,
        order_id: data.orderId ?? null,
        stream_id: data.streamId ?? null,
        listing_id: data.listingId ?? null,
        ip_address: ip,
        user_agent: ua,
        metadata: data.metadata ?? {},
      },
    ];

    const { error } = await supabase.from("policy_acceptances").insert(rows);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
