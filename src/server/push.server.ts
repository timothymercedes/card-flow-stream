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

  const nowIso = new Date().toISOString();
  const failureCountByEndpoint = new Map<string, number>(
    all.map((s: any) => [String(s.endpoint), Number(s.failure_count) || 0]),
  );
  const successEndpoints: string[] = [];
  // endpoint -> { reason, detail } for non-fatal failures we want to record.
  const failedDiag = new Map<string, { reason: string; detail: string }>();

  await Promise.all(webSubs.map(async (s) => {
    try {
      await webpushMod.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify(payload),
      );
      sent++;
      successEndpoints.push(s.endpoint);
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        cleaned++;
      } else {
        failedDiag.set(s.endpoint, {
          reason: e?.statusCode ? `HTTP_${e.statusCode}` : "WEBPUSH_ERROR",
          detail: String(e?.body || e?.message || "Web push failed").slice(0, 500),
        });
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
    const { sent: nativeSent, invalidTokens, results } = await sendNativePush(
      Array.from(tokenToEndpoint.keys()),
      payload,
    );
    sent += nativeSent;

    for (const r of results) {
      const ep = tokenToEndpoint.get(r.token);
      if (!ep) continue;
      if (r.ok) {
        successEndpoints.push(ep);
      } else if (!r.invalid) {
        failedDiag.set(ep, {
          reason: r.reason || (r.status ? `HTTP_${r.status}` : "FCM_ERROR"),
          detail: r.detail || "Native push failed",
        });
      }
    }

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

  // ---- Persist delivery diagnostics (best-effort) ----
  try {
    if (successEndpoints.length) {
      await supabaseAdmin
        .from("push_subscriptions")
        .update({
          last_attempt_at: nowIso,
          last_success_at: nowIso,
          last_status: "success",
          last_error: null,
          failure_count: 0,
        })
        .in("endpoint", successEndpoints);
    }
    if (failedDiag.size) {
      await Promise.all(
        Array.from(failedDiag.entries()).map(([endpoint, diag]) =>
          supabaseAdmin
            .from("push_subscriptions")
            .update({
              last_attempt_at: nowIso,
              last_status: "failed",
              last_error: `${diag.reason}: ${diag.detail}`.slice(0, 600),
              failure_count: (failureCountByEndpoint.get(endpoint) || 0) + 1,
            })
            .eq("endpoint", endpoint),
        ),
      );
    }
  } catch (e) {
    console.warn("Failed to persist push diagnostics:", (e as Error)?.message);
  }

  return { sent, cleaned, skipped };
}

