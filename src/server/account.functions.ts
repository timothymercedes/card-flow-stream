import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * In-app account deletion (App Store Guideline 5.1.1(v) compliance).
 *
 * Permanently deletes the signed-in user's account and personal data.
 * Strategy:
 *   1. Clear the only NO-ACTION foreign key that can block deletion
 *      (live_streams.current_bidder_id references profiles).
 *   2. Best-effort purge of user-scoped rows that have a `user_id` column
 *      but no ON DELETE CASCADE to auth.users (PII hygiene / GDPR).
 *   3. Delete the auth user — this cascades profiles + all CASCADE tables
 *      and makes the account permanently inaccessible.
 */

// Tables that carry a `user_id` column but do NOT cascade from auth.users.
// Purged before the auth user is removed so no orphaned PII remains.
const USER_SCOPED_TABLES = [
  "account_holds",
  "balance_audit_log",
  "beta_feedback",
  "buyer_restrictions",
  "buyer_risk_signals",
  "cart_items",
  "fraud_flags",
  "giveaway_entries",
  "hold_recoveries",
  "legal_acceptances",
  "live_bid_blocks",
  "live_stream_presence",
  "notifications",
  "obs_profiles",
  "offer_abuse_events",
  "payout_locks",
  "payout_requests",
  "perf_metrics",
  "policy_acceptances",
  "post_comments",
  "post_edits",
  "post_reactions",
  "push_subscriptions",
  "scan_history",
  "seller_offer_risk",
  "seller_trust",
  "shipping_adjustments",
  "shop_name_history",
  "show_bookmarks",
  "stories",
  "story_reactions",
  "stream_cohost_tracks",
  "stream_collab_participants",
  "stream_mod_messages",
  "support_tickets",
  "tutorial_progress",
  "user_combo_streaks",
  "user_roles",
  "user_suspensions",
  "user_ui_prefs",
  "username_history",
  "vault_settings",
  "webauthn_credentials",
] as const;

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        // The user must type DELETE to confirm.
        confirm: z.literal("DELETE"),
      })
      .parse(input),
  )
  .handler(async ({ context }) => {
    const userId = context.userId;
    if (!userId) {
      return { success: false as const, error: "Not authenticated." };
    }

    // 1) Clear the blocking NO-ACTION FK (current high bidder on any live show).
    try {
      await supabaseAdmin
        .from("live_streams")
        .update({ current_bidder_id: null })
        .eq("current_bidder_id", userId);
    } catch (e) {
      console.error("[deleteMyAccount] clear current_bidder_id failed", e);
    }

    // 2) Best-effort purge of user-scoped, non-cascading tables.
    const purgeErrors: string[] = [];
    for (const table of USER_SCOPED_TABLES) {
      try {
        const { error } = await supabaseAdmin
          .from(table as any)
          .delete()
          .eq("user_id", userId);
        if (error) purgeErrors.push(`${table}: ${error.message}`);
      } catch (e: any) {
        purgeErrors.push(`${table}: ${e?.message ?? "unknown"}`);
      }
    }
    if (purgeErrors.length) {
      // Non-fatal — log and continue to the auth deletion.
      console.warn("[deleteMyAccount] purge warnings", purgeErrors);
    }

    // 3) Delete the auth user (cascades profiles + all CASCADE tables).
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("[deleteMyAccount] auth deleteUser failed", delErr);
      return {
        success: false as const,
        error:
          "We couldn't fully delete your account automatically. Please contact support and we'll remove it for you.",
      };
    }

    return { success: true as const };
  });
