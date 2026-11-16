import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { dueWindow } from "@/lib/auctionEnding";

async function run() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendPushToUsers } = await import("@/server/push.server");
  const now = Date.now();
  const { data: listings } = await supabaseAdmin.from("listings")
    .select("id,title,auction_ends_at,seller_id")
    .eq("is_auction", true).eq("is_demo", false)
    .gt("auction_ends_at", new Date(now).toISOString())
    .lte("auction_ends_at", new Date(now + 65 * 60000).toISOString())
    .limit(500);
  let sent = 0;
  for (const l of listings ?? []) {
    const w = dueWindow(l.auction_ends_at as string, now);
    if (!w) continue;
    const { data: bids } = await supabaseAdmin.from("listing_bids").select("user_id").eq("listing_id", l.id).limit(1000);
    const users = [...new Set((bids ?? []).map(b => b.user_id))].filter(u => u !== l.seller_id);
    if (!users.length) continue;
    // Claim first: only users whose row is new get alerted, so retries never double-send.
    const { data: claimed } = await supabaseAdmin.from("auction_ending_alerts")
      .upsert(users.map(u => ({ listing_id: l.id, user_id: u, alert_window: w })), { onConflict: "listing_id,user_id,alert_window", ignoreDuplicates: true })
      .select("user_id");
    const ids = (claimed ?? []).map(c => c.user_id);
    if (!ids.length) continue;
    const label = w === "1h" ? "1 hour" : "10 minutes";
    const body = `⏳ "${l.title}" ends in about ${label}. Check your bid!`;
    const link = `/market/${l.id}`;
    await supabaseAdmin.from("notifications").insert(ids.map(uid => ({ user_id: uid, type: "auction_ending", body, link })));
    const awake: string[] = [];
    await Promise.all(ids.map(async uid => {
      const { data } = await (supabaseAdmin as any).rpc("is_in_quiet_hours", { _user_id: uid });
      if (!data) awake.push(uid);
    }));
    if (awake.length) await sendPushToUsers(awake, { title: "Auction ending soon", body, url: link, tag: `ending-${w}-${l.id}` }, "auctions" as any);
    sent += ids.length;
  }
  return { sent };
}

export const Route = createFileRoute("/api/public/hooks/auction-ending")({
  server: { handlers: { POST: async ({ request }) => {
    const fail = await authenticateCronRequest(request);
    if (fail) return fail;
    return Response.json(await run());
  } } },
});
