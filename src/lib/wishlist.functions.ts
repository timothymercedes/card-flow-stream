// PullBid Live — Wishlist (Priority 3).
// Users track cards they want. DB triggers (see migration) auto-notify them
// when a matching listing is created or a card becomes available for trade.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listWishlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("wishlist_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const addSchema = z.object({
  name: z.string().min(1).max(200),
  set_name: z.string().max(200).nullish(),
  tcg_number: z.string().max(60).nullish(),
  category: z.string().max(80).nullish(),
  card_identity_id: z.string().uuid().nullish(),
  image_url: z.string().max(2000).nullish(),
  max_price: z.number().min(0).max(10_000_000).nullish(),
  notes: z.string().max(1000).nullish(),
  notify_sale: z.boolean().default(true),
  notify_trade: z.boolean().default(true),
  notify_live: z.boolean().default(false),
});

export const addWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => addSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("wishlist_items")
      .insert({ ...data, user_id: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      max_price: z.number().min(0).max(10_000_000).nullish(),
      notes: z.string().max(1000).nullish(),
      notify_sale: z.boolean().optional(),
      notify_trade: z.boolean().optional(),
      notify_live: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("wishlist_items")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeWishlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("wishlist_items")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
