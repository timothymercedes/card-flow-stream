import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUsers } from "./push.server";

// Notify all followers of the seller that they just went live.
export const notifyGoingLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    streamId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const sellerId = context.userId;

    // Confirm the stream belongs to this seller.
    const { data: stream } = await supabaseAdmin
      .from("live_streams")
      .select("id, seller_id, title")
      .eq("id", data.streamId)
      .maybeSingle();
    if (!stream || stream.seller_id !== sellerId) {
      return { sent: 0, cleaned: 0, skipped: "not-owner" };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("username").eq("id", sellerId).maybeSingle();

    const { data: followers } = await supabaseAdmin
      .from("follows").select("follower_id").eq("followee_id", sellerId);
    const userIds = (followers || []).map((f) => f.follower_id).filter(Boolean);
    if (userIds.length === 0) return { sent: 0, cleaned: 0 };

    const result = await sendPushToUsers(userIds, {
      title: `${profile?.username || "A seller you follow"} is LIVE 🔴`,
      body: stream.title || "Tap to jump into the auction",
      url: `/live/${stream.id}`,
      tag: `live-${stream.id}`,
    });
    return result;
  });
