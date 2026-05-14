/**
 * Cron-driven reminder dispatcher for bookmarked scheduled shows.
 *
 * Runs every ~5–10 minutes via pg_cron. For each bookmarked show, fires:
 *   - 24h reminder if scheduled_for is between 23h–25h from now
 *   - 1h  reminder if scheduled_for is between 50min–70min from now
 * Honors per-bookmark notify_push / notify_inapp / notify_email flags AND
 * per-user quiet hours (skips push + email; in-app bell still drops a row).
 * Idempotent — uses reminder_24h_sent_at / reminder_1h_sent_at to dedupe.
 *
 * Auth: shared CRON_SECRET header `x-cron-secret`, matching this project's
 * existing cron route convention (see refresh-vault-values.ts).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUsers } from "@/server/push.server";
import { sendEmail } from "@/server/email.server";

type Bookmark = {
  id: string;
  user_id: string;
  show_id: string;
  notify_push: boolean;
  notify_inapp: boolean;
  notify_email: boolean;
  reminder_24h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
};

type Show = {
  id: string;
  seller_id: string;
  seller_username: string;
  title: string;
  scheduled_for: string;
};

async function dispatchReminders(window: "24h" | "1h") {
  const now = Date.now();
  const lo = window === "24h" ? now + 23 * 3600_000 : now + 50 * 60_000;
  const hi = window === "24h" ? now + 25 * 3600_000 : now + 70 * 60_000;

  const { data: shows } = await supabaseAdmin
    .from("scheduled_shows")
    .select("id, seller_id, seller_username, title, scheduled_for")
    .gte("scheduled_for", new Date(lo).toISOString())
    .lte("scheduled_for", new Date(hi).toISOString());

  const showList = (shows || []) as Show[];
  if (showList.length === 0) return { processed: 0, push: 0, inapp: 0, email: 0 };

  const sentField = window === "24h" ? "reminder_24h_sent_at" : "reminder_1h_sent_at";
  const { data: bms } = await supabaseAdmin
    .from("show_bookmarks" as any)
    .select(`id, user_id, show_id, notify_push, notify_inapp, notify_email, ${sentField}`)
    .in("show_id", showList.map((s) => s.id))
    .is(sentField as any, null);

  const bookmarks = (bms || []) as unknown as Bookmark[];
  if (bookmarks.length === 0) return { processed: 0, push: 0, inapp: 0, email: 0 };

  // Quiet-hours lookup, batched
  const userIds = Array.from(new Set(bookmarks.map((b) => b.user_id)));
  const quiet = new Map<string, boolean>();
  await Promise.all(userIds.map(async (uid) => {
    const { data } = await (supabaseAdmin as any).rpc("is_in_quiet_hours", { _user_id: uid });
    quiet.set(uid, !!data);
  }));

  const showById = new Map(showList.map((s) => [s.id, s]));
  let pushCount = 0, inappCount = 0, emailCount = 0;
  const settled: string[] = [];

  // Group by show for nicer payloads
  for (const show of showList) {
    const targets = bookmarks.filter((b) => b.show_id === show.id);
    if (targets.length === 0) continue;

    const minsAway = Math.max(1, Math.round((new Date(show.scheduled_for).getTime() - now) / 60000));
    const niceWhen = window === "24h" ? "tomorrow" : `in ${minsAway} min`;
    const title = `⏰ ${show.seller_username}'s show is ${niceWhen}`;
    const body = show.title;
    const url = `/seller/${show.seller_username}`;

    // Push (skip in quiet hours)
    const pushIds = targets.filter((t) => t.notify_push && !quiet.get(t.user_id)).map((t) => t.user_id);
    if (pushIds.length) {
      const r = await sendPushToUsers(pushIds, { title, body, url, tag: `show-${window}-${show.id}` });
      pushCount += r.sent || 0;
    }

    // In-app bell (always — bell is non-disruptive)
    const inappIds = targets.filter((t) => t.notify_inapp).map((t) => t.user_id);
    if (inappIds.length) {
      await supabaseAdmin.from("notifications").insert(inappIds.map((uid) => ({
        user_id: uid,
        type: window === "24h" ? "show_reminder_24h" : "show_reminder_1h",
        body: `${show.seller_username} goes live ${niceWhen}: ${body}`,
        link: url,
      })));
      inappCount += inappIds.length;
    }

    // Email (skip in quiet hours)
    const emailIds = targets.filter((t) => t.notify_email && !quiet.get(t.user_id)).map((t) => t.user_id);
    if (emailIds.length) {
      const { data: users } = await supabaseAdmin
        .from("profiles").select("id, email").in("id", emailIds);
      const origin = process.env.PUBLIC_APP_URL || "https://pullbidlive.com";
      const link = `${origin}${url}`;
      await Promise.all((users || []).map(async (u: any) => {
        if (!u.email) return;
        const r = await sendEmail({
          to: u.email,
          subject: `⏰ ${show.seller_username}'s show starts ${niceWhen}`,
          html: `<p><strong>${show.seller_username}</strong> goes live ${niceWhen}.</p>
                 <p style="font-size:16px"><em>${body}</em></p>
                 <p><a href="${link}">View seller profile →</a></p>
                 <p style="color:#888;font-size:12px">You bookmarked this show. Manage reminders in the PullBidLive app.</p>`,
        });
        if ((r as any)?.ok) emailCount++;
      }));
    }

    settled.push(...targets.map((t) => t.id));
  }

  if (settled.length) {
    await supabaseAdmin
      .from("show_bookmarks" as any)
      .update({ [sentField]: new Date().toISOString() } as any)
      .in("id", settled);
  }

  return { processed: settled.length, push: pushCount, inapp: inappCount, email: emailCount };
}

export const Route = createFileRoute("/api/public/hooks/show-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!cronSecret || !provided || provided !== cronSecret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const r24 = await dispatchReminders("24h");
          const r1 = await dispatchReminders("1h");
          return new Response(JSON.stringify({ ok: true, "24h": r24, "1h": r1 }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("show-reminders failed:", err);
          return new Response(JSON.stringify({ ok: false, error: err?.message || "failed" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
