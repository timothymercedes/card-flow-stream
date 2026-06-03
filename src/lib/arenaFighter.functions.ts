// PullBid Arena — Companion battle-figure server function.
// Client-callable wrapper around the server-only generation helper. Real cards
// are never affected; this only produces/caches a digital fighter figure.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Client-callable: ensure the figure for one of MY companions before a battle.
export const ensureCompanionFighter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureFighterForCompanion } = await import("@/lib/arenaFighter.server");
    const { data: c } = await supabaseAdmin
      .from("arena_companions")
      .select("id, user_id, name, category, image_url, fighter_image_url")
      .eq("id", data.companionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!c) return { fighterImage: null as string | null };
    const fighterImage = await ensureFighterForCompanion(c as any);
    return { fighterImage };
  });
