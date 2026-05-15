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
