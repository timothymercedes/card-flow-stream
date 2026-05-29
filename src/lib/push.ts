// Push subscribe/unsubscribe helpers — web (VAPID) + native (Capacitor APNs/FCM).
import { supabase } from "@/integrations/supabase/client";
import { isNative, nativePlatform } from "@/lib/capacitor";

// Public VAPID key — safe to ship in client bundle.
export const VAPID_PUBLIC_KEY =
  "BJrBMuWoXPM_bzORN44SxBZCzXzc4COjvNRd-GF4UvS927h2v-yVgKlg9jGSQCMyf-y4NSf-Xk0PvaNnzYbgXjI";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export type PushStatus = "granted" | "denied" | "default" | "unsupported";

/**
 * Current push permission status — native-aware. On the iOS/Android shell this
 * reads the OS permission via Capacitor; on web it reads the Notification API.
 */
export async function getPushStatus(): Promise<PushStatus> {
  if (isNative()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === "granted") return "granted";
      if (perm.receive === "denied") return "denied";
      return "default"; // 'prompt' | 'prompt-with-rationale'
    } catch {
      return "unsupported";
    }
  }
  if (!pushSupported()) return "unsupported";
  const perm = Notification.permission;
  if (perm === "granted") return "granted";
  if (perm === "denied") return "denied";
  return "default";
}

export async function ensurePushSubscribed(userId: string): Promise<{ ok: boolean; reason?: string }> {
  // Native shell: use APNs / FCM via Capacitor.
  if (isNative()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return { ok: false, reason: "Permission denied" };
      await new Promise<void>((resolve, reject) => {
        const okSub = PushNotifications.addListener("registration", async (token) => {
          const endpoint = `${nativePlatform()}://${token.value}`;
          await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
          const { error } = await supabase.from("push_subscriptions").insert({
            user_id: userId, endpoint, p256dh: token.value, auth_key: nativePlatform(),
          });
          okSub.then((s) => s.remove());
          errSub.then((s) => s.remove());
          if (error) reject(new Error(error.message));
          else resolve();
        });
        const errSub = PushNotifications.addListener("registrationError", (err) => {
          okSub.then((s) => s.remove());
          errSub.then((s) => s.remove());
          reject(new Error(err.error || "Registration error"));
        });
        void PushNotifications.register();
      });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? "Native push failed" };
    }
  }

  // Web/PWA: VAPID + Service Worker.
  if (!pushSupported()) return { ok: false, reason: "Notifications not supported on this device" };
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permission denied" };

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }

  const json: any = sub.toJSON();
  const endpoint = json.endpoint as string;
  const p256dh = json.keys?.p256dh as string;
  const auth_key = json.keys?.auth as string;
  if (!endpoint || !p256dh || !auth_key) return { ok: false, reason: "Bad subscription payload" };

  // Upsert: delete any existing row for this endpoint, then insert fresh.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: userId, endpoint, p256dh, auth_key,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}
