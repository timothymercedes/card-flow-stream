// Server-only helper: send a Web Push notification to a list of subscriptions.
// NOTE: `web-push` relies on Node-only crypto bindings that are not available
// in the Cloudflare Workers SSR runtime. We lazy-load it inside try/catch so
// that environments without it simply no-op instead of crashing the server fn.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendNativePush } from "./fcm.server";


let configured = false;
let webpushMod: any = null;

async function configure(): Promise<boolean> {
  if (configured) return true;
  try {
    if (!webpushMod) {
      webpushMod = await import("web-push").then((m) => m.default ?? m);
    }
    const pub = "BJrBMuWoXPM_bzORN44SxBZCzXzc4COjvNRd-GF4UvS927h2v-yVgKlg9jGSQCMyf-y4NSf-Xk0PvaNnzYbgXjI";
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:hello@pullbidlive.app";
    if (!priv) {
      console.warn("VAPID_PRIVATE_KEY not set — push disabled");
      return false;
    }
    webpushMod.setVapidDetails(subject, pub, priv);
    configured = true;
    return true;
  } catch (e) {
    console.warn("web-push unavailable in this runtime — push disabled:", (e as Error)?.message);
    return false;
  }
}

type Payload = { title: string; body: string; url?: string; tag?: string };
export type NotifyCategory = "live" | "bids" | "orders" | "social" | "seller" | "system";

/**
 * Sends a Web Push to the given users, optionally filtered by their
 * notification_preferences (category opt-out + quiet hours).
 * Pass a category to enforce per-user preferences; omit only for legacy callers.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: Payload,
  category?: NotifyCategory,
): Promise<{ sent: number; cleaned: number; skipped: number }> {
  if (userIds.length === 0) return { sent: 0, cleaned: 0, skipped: 0 };
  const webPushReady = await configure();


  let allowedIds = userIds;
  let skipped = 0;
  if (category) {
    const { data: targets } = await (supabaseAdmin as any)
      .rpc("get_notify_targets", { _user_ids: userIds, _category: category });
    const allowed = new Set<string>(
      (targets || []).filter((t: any) => t.allow_push).map((t: any) => String(t.user_id)),
    );
    skipped = userIds.length - allowed.size;
    allowedIds = Array.from(allowed);
    if (allowedIds.length === 0) return { sent: 0, cleaned: 0, skipped };
  }
  const { data: allSubs } = await supabaseAdmin.from("push_subscriptions").select("*").in("user_id", allowedIds);
  const all = allSubs || [];

  // Web Push endpoints are real https URLs; native endpoints are stored as
  // "ios://<token>" / "android://<token>" and go through FCM instead.
  const webSubs = webPushReady
    ? all.filter((s: any) => typeof s.endpoint === "string" && /^https?:\/\//.test(s.endpoint))
    : [];
  const nativeSubs = all.filter(
    (s: any) => typeof s.endpoint === "string" && /^(ios|android):\/\//.test(s.endpoint),
  );

  let sent = 0, cleaned = 0;

  await Promise.all(webSubs.map(async (s) => {
    try {
      await webpushMod.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        cleaned++;
      }
    }
  }));

  // Native (FCM) delivery for iOS/Android tokens.
  if (nativeSubs.length) {
    const tokenToEndpoint = new Map<string, string>();
    for (const s of nativeSubs) {
      const token = String(s.endpoint).replace(/^(ios|android):\/\//, "");
      if (token) tokenToEndpoint.set(token, s.endpoint);
    }
    const { sent: nativeSent, invalidTokens } = await sendNativePush(
      Array.from(tokenToEndpoint.keys()),
      payload,
    );
    sent += nativeSent;
    if (invalidTokens.length) {
      const staleEndpoints = invalidTokens
        .map((t) => tokenToEndpoint.get(t))
        .filter((e): e is string => Boolean(e));
      if (staleEndpoints.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
        cleaned += staleEndpoints.length;
      }
    }
  }

  return { sent, cleaned, skipped };

  return { sent, cleaned, skipped };
}
