import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requestPayoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amountCents: z.number().int().positive().max(10_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("request_payout" as any, {
      _amount_cents: data.amountCents,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const recordShippingAdjustmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid().optional(),
      type: z.enum(["reissue_label", "weight_change", "service_upgrade", "correction"]),
      costCents: z.number().int().min(0).max(10_000),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("record_shipping_adjustment" as any, {
      _order_id: data.orderId ?? null,
      _type: data.type,
      _cost_cents: data.costCents,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const getSellerPayableFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("compute_seller_payable" as any, { _user_id: userId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return row as {
      available_cents: number;
      pending_cents: number;
      locked_cents: number;
      in_flight_cents: number;
      owed_cents: number;
      payable_cents: number;
      instant_pct: number;
      tier: "new" | "bronze" | "silver" | "gold" | "platinum";
      frozen: boolean;
    };
  });

export const getSellerTrustFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.rpc("recalc_seller_trust" as any, { _user_id: userId });
    const { data, error } = await supabase
      .from("seller_trust" as any)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as any;
  });

export const adminOverrideTrustFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      instantPct: z.number().int().min(0).max(100).nullable(),
      frozen: z.boolean().optional(),
      reason: z.string().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("admin_override_trust" as any, {
      _user_id: data.userId,
      _instant_pct: data.instantPct,
      _frozen: data.frozen ?? null,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return row;
  });
