import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Price belongs to the CARD, not the user. When one owner refreshes a card's
 * market value, propagate the new value to every other owner of the same
 * master card identity so nobody has to re-trigger the same lookup.
 *
 * Only non-locked cards are touched (a user who set a custom/locked price
 * keeps it). RLS is bypassed intentionally via the admin client because we
 * are updating rows across all owners after a verified card-level refresh.
 */
export const propagateIdentityPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        identityId: z.string().min(1).max(128),
        marketPrice: z.number().min(0).max(10_000_000),
        source: z.string().max(120).optional().nullable(),
        verified: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { identityId, marketPrice, source, verified } = data;
    if (marketPrice <= 0) return { updated: 0 };

    const patch: Record<string, unknown> = {
      market_price: marketPrice,
      estimated_value: marketPrice,
      price_source: source ?? "daily_sync",
      price_tier: verified ? "verified" : "estimated",
      price_confidence: verified ? "high" : "medium",
      price_is_ai: false,
      price_updated_at: new Date().toISOString(),
      last_valued_at: new Date().toISOString(),
    };

    const { data: rows, error } = await supabaseAdmin
      .from("vault_cards")
      .update(patch as never)
      .eq("card_identity_id", identityId)
      .eq("price_locked", false)
      .select("id");

    if (error) {
      console.error("propagateIdentityPrice failed:", error.message);
      return { updated: 0, error: error.message };
    }
    return { updated: rows?.length ?? 0 };
  });
