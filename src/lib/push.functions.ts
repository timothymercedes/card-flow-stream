import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUsers } from "@/server/push.server";
import { sendEmail } from "@/server/email.server";

// Notify all followers of the seller, AND any users who bookmarked one of the
// seller's upcoming scheduled shows, that the seller just went live.
export const notifyGoingLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    streamId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    try {
      const sellerId = context.userId;

      const { data: stream } = await supabaseAdmin
        .from("live_streams")
        .select("id, seller_id, title")
        .eq("id", data.streamId)
        .maybeSingle();
      if (!stream || stream.seller_id !== sellerId) {
        return { sent: 0, cleaned: 0, skipped: "not-owner" as const };
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles").select("username").eq("id", sellerId).maybeSingle();

      // 1) Followers who opted into "notify on live"
      const { data: followers } = await supabaseAdmin
        .from("follows").select("follower_id").eq("followee_id", sellerId).eq("notify_on_live", true);
      const followerIds = new Set((followers || []).map((f) => f.follower_id).filter(Boolean));

      // 2) Bookmarkers of any of seller's nearby scheduled shows
      const since = new Date(Date.now() - 12 * 3600_000).toISOString();
      const until = new Date(Date.now() + 24 * 3600_000).toISOString();
      const { data: shows } = await supabaseAdmin
        .from("scheduled_shows").select("id")
        .eq("seller_id", sellerId)
        .gte("scheduled_for", since)
        .lte("scheduled_for", until);
      const showIds = (shows || []).map((s: any) => s.id);

      const bookmarkers: Array<{ user_id: string; notify_push: boolean; notify_inapp: boolean; notify_email: boolean }> = [];
      if (showIds.length > 0) {
        const { data: bms } = await supabaseAdmin
          .from("show_bookmarks" as any)
          .select("user_id, notify_push, notify_inapp, notify_email")
          .in("show_id", showIds);
        (bms || []).forEach((b: any) => bookmarkers.push(b));
      }

      const sellerName = profile?.username || "A seller you follow";
      const title = `${sellerName} is LIVE 🔴`;
      const body = stream.title || "Tap to jump into the auction";
      const url = `/live/${stream.id}`;

      // ---- Push: union of followers + bookmarkers (push pref true) ----
      const pushUserIds = new Set<string>(followerIds);
      bookmarkers.filter((b) => b.notify_push).forEach((b) => pushUserIds.add(b.user_id));
      let pushResult: { sent: number; cleaned: number; skipped?: number } = { sent: 0, cleaned: 0 };
      if (pushUserIds.size > 0) {
        pushResult = await sendPushToUsers(Array.from(pushUserIds), {
          title, body, url, tag: `live-${stream.id}`,
        }, "live");
      }

      // ---- In-app notification rows for bookmarkers who opted in ----
      const inappUserIds = bookmarkers.filter((b) => b.notify_inapp).map((b) => b.user_id);
      if (inappUserIds.length > 0) {
        const rows = inappUserIds.map((uid) => ({
          user_id: uid,
          type: "live_started",
          body: `${sellerName} is LIVE: ${body}`,
          link: url,
        }));
        await supabaseAdmin.from("notifications").insert(rows);
      }

      // ---- Email for bookmarkers who opted in (best-effort, capped) ----
      const emailUserIds = bookmarkers.filter((b) => b.notify_email).map((b) => b.user_id).slice(0, 200);
      let emailsSent = 0;
      if (emailUserIds.length > 0) {
        const { data: users } = await supabaseAdmin
          .from("profiles").select("id, email").in("id", emailUserIds);
        const origin = process.env.PUBLIC_APP_URL || "https://pullbidlive.com";
        const link = `${origin}${url}`;
        await Promise.all((users || []).map(async (u: any) => {
          if (!u.email) return;
          const r = await sendEmail({
            to: u.email,
            subject: `🔴 ${sellerName} is live now on PullBidLive`,
            html: `<p>${sellerName} just started: <strong>${body}</strong></p><p><a href="${link}">Tap to join the live show →</a></p><p style="color:#888;font-size:12px">You're receiving this because you bookmarked one of their shows. Manage your bookmarks in the app to stop these emails.</p>`,
          });
          if ((r as any)?.ok) emailsSent++;
        }));
      }

      return {
        sent: pushResult.sent,
        cleaned: pushResult.cleaned,
        inapp: inappUserIds.length,
        emails: emailsSent,
      };
    } catch (err) {
      console.error("notifyGoingLive failed:", err);
      return { sent: 0, cleaned: 0, error: "PUSH_UNAVAILABLE" as const };
    }
  });

// Admin-only: send a test push notification to the calling admin's own devices.
// Lets admins verify the end-to-end push pipeline (web + native FCM) without
// needing a real DM, order, or live event to trigger one.
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    title: z.string().min(1).max(120).optional(),
    body: z.string().min(1).max(300).optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role" as any, { _user_id: userId, _role: "admin" });
    const { data: isOwner } = await supabaseAdmin.rpc("has_role" as any, { _user_id: userId, _role: "owner" });
    if (!isAdmin && !isOwner) {
      return { ok: false as const, error: "FORBIDDEN" as const, sent: 0 };
    }
    try {
      const result = await sendPushToUsers([userId], {
        title: data.title || "PullBidLive test 🔔",
        body: data.body || "If you can read this, push notifications are working.",
        url: "/",
        tag: "admin-test",
      });
      return { ok: true as const, ...result };
    } catch (err) {
      console.error("sendTestPush failed:", err);
      return { ok: false as const, error: "PUSH_UNAVAILABLE" as const, sent: 0 };
    }
  });

// Admin-only: list all push subscriptions with platform detection.
export const listPushSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role" as any, { _user_id: userId, _role: "admin" });
    const { data: isOwner } = await supabaseAdmin.rpc("has_role" as any, { _user_id: userId, _role: "owner" });
    if (!isAdmin && !isOwner) {
      return { ok: false as const, error: "FORBIDDEN" as const, rows: [] as any[] };
    }
    try {
      const { data: rows, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth_key, created_at, last_attempt_at, last_success_at, last_status, last_error, failure_count")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return { ok: true as const, rows: (rows || []) as any[], error: null };
    } catch (err: any) {
      console.error("listPushSubscriptions failed:", err);
      return { ok: false as const, error: err?.message ?? "DB_ERROR", rows: [] as any[] };
    }
  });
