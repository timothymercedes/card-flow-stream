// Server-only helper: send a Web Push notification to a list of subscriptions.
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  try {
    const pub = "BJrBMuWoXPM_bzORN44SxBZCzXzc4COjvNRd-GF4UvS927h2v-yVgKlg9jGSQCMyf-y4NSf-Xk0PvaNnzYbgXjI";
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:hello@pullbidlive.app";
    if (!priv) {
      console.warn("VAPID_PRIVATE_KEY not set — push disabled");
      return false;
    }
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    return true;
  } catch (e) {
    console.error("web-push configure failed:", e);
    return false;
  }
}

type Payload = { title: string; body: string; url?: string; tag?: string };

export async function sendPushToUsers(userIds: string[], payload: Payload): Promise<{ sent: number; cleaned: number }> {
  if (userIds.length === 0) return { sent: 0, cleaned: 0 };
  if (!configure()) return { sent: 0, cleaned: 0 };
  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("*").in("user_id", userIds);
  if (!subs?.length) return { sent: 0, cleaned: 0 };

  let sent = 0, cleaned = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e: any) {
      // 404/410 = subscription gone; clean it up.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        cleaned++;
      }
    }
  }));
  return { sent, cleaned };
}
