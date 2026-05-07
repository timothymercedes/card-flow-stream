import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ensurePushSubscribed, pushSupported } from "@/lib/push";
import { toast } from "sonner";

const DISMISS_KEY = "notify_prompt_dismissed_v1";

export function NotifyPrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!pushSupported()) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [user]);

  if (!show || !user) return null;

  async function enable() {
    setBusy(true);
    const r = await ensurePushSubscribed(user!.id);
    setBusy(false);
    if (r.ok) {
      toast.success("Notifications on 🔔");
      localStorage.setItem(DISMISS_KEY, "1");
      setShow(false);
    } else {
      toast.error(r.reason || "Couldn't enable notifications");
      if (r.reason === "Permission denied") {
        localStorage.setItem(DISMISS_KEY, "1");
        setShow(false);
      }
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold">Get pinged when shows go live</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Outbid alerts, order updates, and follower live streams.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={enable} disabled={busy} className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-60">
              {busy ? "Enabling…" : "Turn on"}
            </button>
            <button onClick={dismiss} className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold">Not now</button>
          </div>
        </div>
        <button onClick={dismiss} className="flex-shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
