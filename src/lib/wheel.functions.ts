// PullBid Live — Collection Reward Wheel server functions.
// Every completed official set earns exactly one spin. The spin itself is
// server-authoritative: completion is re-verified here, the set is marked
// ready_to_claim, and the SECURITY DEFINER `spin_collection_wheel` RPC performs
// the weighted-random pick + grant + history log atomically. There are no empty
// slots — the user always wins something.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeCollectionBooks } from "@/lib/collection.functions";

export type WheelRarity = "common" | "rare" | "epic" | "legendary";

export type WheelSlotDTO = {
  id: string;
  label: string;
  rarity: WheelRarity;
  rewardKind: string;
  rewardSlug: string | null;
  credits: number;
  xp: number;
  icon: string;
  color: string;
  weight: number;
};

// ---------- Wheel config + this user's spin state ----------
export const getCollectionWheel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: slots }, { data: spins }] = await Promise.all([
      supabaseAdmin
        .from("collection_wheel_slots")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabaseAdmin
        .from("collection_wheel_spins")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    const mapped: WheelSlotDTO[] = (slots ?? []).map((s: any) => ({
      id: s.id,
      label: s.label,
      rarity: s.rarity,
      rewardKind: s.reward_kind,
      rewardSlug: s.reward_slug,
      credits: s.credits,
      xp: s.xp,
      icon: s.icon,
      color: s.color,
      weight: s.weight,
    }));

    return {
      slots: mapped,
      spins: (spins ?? []).map((s: any) => ({
        contextKey: s.context_key,
        contextLabel: s.context_label,
        slotId: s.slot_id,
        label: s.label,
        rarity: s.rarity as WheelRarity,
        rewardKind: s.reward_kind,
        rewardSlug: s.reward_slug,
        credits: s.credits,
        xp: s.xp,
        icon: s.icon,
        createdAt: s.created_at,
      })),
      spunKeys: (spins ?? []).map((s: any) => s.context_key),
    };
  });

// ---------- Spin the wheel for a completed set ----------
export const spinCollectionWheel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        contextKey: z.string().min(1).max(200),
        contextLabel: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Re-verify the set is genuinely 100% complete from the vault.
    const books = await computeCollectionBooks(supabaseAdmin, userId);
    const book = books.find((b) => b.key === data.contextKey);
    if (!book) throw new Error("Set not found");
    if (!book.official || book.knownTotal <= 0 || !book.complete) {
      throw new Error("This set isn't 100% complete yet");
    }

    // 2. Mark the set completion claim as ready (defense-in-depth guard the RPC checks).
    await (supabase.rpc as any)("record_reward_progress", {
      _def_slug: "set_completion",
      _progress: book.ownedDistinct,
      _target: book.knownTotal,
      _context_key: book.key,
      _context_label: book.setName,
    });

    // 3. Perform the server-authoritative spin (weighted pick + grant + log).
    const { data: result, error } = await (supabase.rpc as any)("spin_collection_wheel", {
      _context_key: data.contextKey,
      _context_label: data.contextLabel ?? book.setName,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row) throw new Error("Spin failed");

    return {
      slotId: row.slot_id as string,
      label: row.label as string,
      rarity: row.rarity as WheelRarity,
      rewardKind: row.reward_kind as string,
      rewardSlug: (row.reward_slug ?? null) as string | null,
      credits: Number(row.credits ?? 0),
      xp: Number(row.xp ?? 0),
      icon: row.icon as string,
      color: row.color as string,
      alreadySpun: !!row.already_spun,
      newBalance: Number(row.new_balance ?? 0),
    };
  });
