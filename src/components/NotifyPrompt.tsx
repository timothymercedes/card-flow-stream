import { useEffect, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ensurePushSubscribed, getPushStatus, type PushStatus } from "@/lib/push";
import { isNative, nativePlatform } from "@/lib/capacitor";
import { toast } from "sonner";

const DISMISS_KEY = "notify_prompt_dismissed_v1";
// Show the "you're all set" status confirmation at most once per session.
const STATUS_SHOWN_KEY = "notify_status_shown_v1";

export function NotifyPrompt() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [mode, setMode] = useState<"enable" | "status" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setMode(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await getPushStatus();
      if (cancelled) return;
      setStatus(s);

      // Unsupported device — nothing to do.
      if (s === "unsupported") return;

      // Permission still up for grabs → ask the user to turn it on.
      if (s === "default") {
        if (localStorage.getItem(DISMISS_KEY) === "1") return;
        const t = setTimeout(() => setMode("enable"), 2500);
        return () => clearTimeout(t);
      }

      // Already decided (granted/denied) → surface current status once per session.
      if (sessionStorage.getItem(STATUS_SHOWN_KEY) === "1") return;
      sessionStorage.setItem(STATUS_SHOWN_KEY, "1");
      const t = setTimeout(() => setMode("status"), 2500);
      return () => clearTimeout(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!mode || !user) return null;

  async function enable() {
    setBusy(true);
    const r = await ensurePushSubscribed(user!.id);
    setBusy(false);
    if (r.ok) {
      toast.success("Notifications on 🔔");
      localStorage.setItem(DISMISS_KEY, "1");
      setStatus("granted");
      setMode(null);
    } else {
      toast.error(r.reason || "Couldn't enable notifications");
      if (r.reason === "Permission denied") {
        localStorage.setItem(DISMISS_KEY, "1");
        setStatus("denied");
        setMode(null);
      }
    }
  }

  function dismiss() {
    if (mode === "enable") localStorage.setItem(DISMISS_KEY, "1");
    setMode(null);
  }

  // ── Status confirmation (shown after login when permission already decided) ──
  if (mode === "status") {
    const granted = status === "granted";
    return (
      <div className="fixed bottom-20 left-1/2 z-40 w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-lg">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
              granted ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {granted ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold">
              {granted ? "Notifications are on" : "Notifications are off"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {granted
                ? "You'll get outbid alerts, order updates, and live stream pings."
                : isNative()
                  ? `Turn them on in iOS Settings → PullBid Live → Notifications.`
                  : "Re-enable them anytime from Settings → Notifications."}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Permission prompt (web + native iOS/Android) ──
  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold">Get pinged when shows go live</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isNative() && nativePlatform() === "ios"
              ? "Allow notifications for outbid alerts, order updates, and follower live streams."
              : "Outbid alerts, order updates, and follower live streams."}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={enable}
              disabled={busy}
              className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Enabling…" : "Turn on"}
            </button>
            <button onClick={dismiss} className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold">
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="flex-shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
