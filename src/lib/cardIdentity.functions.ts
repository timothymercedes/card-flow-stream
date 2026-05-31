import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveOrCreateMasterIdentity } from "@/lib/masterIdentity.server";

/**
 * Resolve or create the master card identity for a manually-entered or
 * corrected vault card, then link the vault card to the master UUID.
 *
 * Master identity = card INFORMATION (source of truth). The working pricing
 * engine (provider keys) is untouched: this only fills master_identity_id.
 */
export const resolveMasterIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        vaultCardId: z.string().uuid().optional().nullable(),
        category: z.string().min(1).max(64),
        name: z.string().min(1).max(256),
        set_name: z.string().max(256).optional().nullable(),
        set_code: z.string().max(64).optional().nullable(),
        number: z.string().max(64).optional().nullable(),
        year: z.number().int().min(1800).max(3000).optional().nullable(),
        variant: z.string().max(128).optional().nullable(),
        language: z.string().max(32).optional().nullable(),
        rarity: z.string().max(128).optional().nullable(),
        // Sports/graded identity fields — included in the fingerprint so manual
        // entries resolve to the SAME master row as a live scan of the card.
        manufacturer: z.string().max(128).optional().nullable(),
        player: z.string().max(128).optional().nullable(),
        team: z.string().max(128).optional().nullable(),
        grade: z.string().max(64).optional().nullable(),
        grading_company: z.string().max(64).optional().nullable(),
        is_rookie: z.boolean().optional(),
        image_url: z.string().max(2048).optional().nullable(),
        image_source: z.string().max(64).optional().nullable(),
        confidence_score: z.number().min(0).max(1).optional().nullable(),
        provider_keys: z.array(z.string().max(256)).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { vaultCardId, ...identity } = data;
    const res = await resolveOrCreateMasterIdentity(identity);
    if (!res.identityId) {
      return { identityId: null, created: false, linked: false };
    }
    let linked = false;
    if (vaultCardId) {
      // Scope the update to the authenticated owner so a user can only relink
      // their own vault cards.
      const { error } = await supabaseAdmin
        .from("vault_cards")
        .update({ master_identity_id: res.identityId } as never)
        .eq("id", vaultCardId)
        .eq("user_id", context.userId);
      if (error) console.error("[resolveMasterIdentity] link failed", error.message);
      else linked = true;
    }
    return { identityId: res.identityId, created: res.created, linked };
  });


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
