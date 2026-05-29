/**
 * NotificationSettings — single panel for the entire notification system:
 * push enable/disable, per-channel + per-category toggles, and quiet hours.
 * Reuses the existing `notification_preferences` row created on signup.
 */
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensurePushSubscribed, disablePush, pushSupported, getPushStatus } from "@/lib/push";
import { isNative } from "@/lib/capacitor";
import { toast } from "sonner";

type Prefs = {
  push_enabled: boolean;
  inapp_enabled: boolean;
  email_enabled: boolean;
  cat_live: boolean;
  cat_bids: boolean;
  cat_orders: boolean;
  cat_social: boolean;
  cat_seller: boolean;
  cat_system: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  timezone: string;
};

const DEFAULTS: Prefs = {
  push_enabled: true, inapp_enabled: true, email_enabled: false,
  cat_live: true, cat_bids: true, cat_orders: true,
  cat_social: true, cat_seller: true, cat_system: true,
  quiet_start: null, quiet_end: null,
  timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
};

const CATEGORIES: { key: keyof Prefs; label: string; help: string }[] = [
  { key: "cat_live", label: "Live shows", help: "Sellers you follow going live + bookmarked show reminders" },
  { key: "cat_bids", label: "Bids & auctions", help: "Outbid alerts, ending soon, won items" },
  { key: "cat_orders", label: "Orders & shipping", help: "Order placed, shipped, delivered, refunded" },
  { key: "cat_social", label: "Social", help: "New followers, mentions, replies" },
  { key: "cat_seller", label: "Seller activity", help: "New sale, payout, reviews (sellers only)" },
  { key: "cat_system", label: "System & support", help: "Account, security, support replies" },
];

export function NotificationSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSubbed, setPushSubbed] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        setPrefs({
          ...DEFAULTS, ...data,
          quiet_start: data.quiet_start ? String(data.quiet_start).slice(0, 5) : null,
          quiet_end: data.quiet_end ? String(data.quiet_end).slice(0, 5) : null,
        });
      }
      setLoading(false);
    })();
    if (isNative()) {
      // Native shell: reflect the OS-level permission as the device push state.
      getPushStatus().then((s) => setPushSubbed(s === "granted"));
    } else if (pushSupported() && navigator.serviceWorker?.getRegistration) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setPushSubbed(!!sub);
      });
    }
  }, [user]);

  async function update(patch: Partial<Prefs>) {
    if (!user) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const payload: any = {
      user_id: user.id,
      push_enabled: next.push_enabled,
      inapp_enabled: next.inapp_enabled,
      email_enabled: next.email_enabled,
      cat_live: next.cat_live, cat_bids: next.cat_bids, cat_orders: next.cat_orders,
      cat_social: next.cat_social, cat_seller: next.cat_seller, cat_system: next.cat_system,
      quiet_start: next.quiet_start || null,
      quiet_end: next.quiet_end || null,
      timezone: next.timezone || "UTC",
    };
    const { error } = await (supabase as any)
      .from("notification_preferences").upsert(payload, { onConflict: "user_id" });
    if (error) toast.error(error.message);
  }

  async function togglePushDevice() {
    if (!user) return;
    setPushBusy(true);
    if (pushSubbed) {
      await disablePush();
      setPushSubbed(false);
      toast.success("Push disabled on this device");
    } else {
      const r = await ensurePushSubscribed(user.id);
      if (r.ok) { setPushSubbed(true); toast.success("Push enabled — we'll ping this device"); }
      else toast.error(r.reason || "Couldn't enable push");
    }
    setPushBusy(false);
  }

  if (!user) return null;
  if (loading) return <div className="rounded-xl bg-card p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      {/* Device push */}
      <div className="rounded-xl bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold flex items-center gap-1.5">
              {pushSubbed ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
              Push on this device
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pushSupported()
                ? "Get instant alerts even when the app isn't open."
                : "This browser doesn't support push notifications."}
            </p>
          </div>
          <button
            disabled={pushBusy || !pushSupported()}
            onClick={togglePushDevice}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              pushSubbed ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
            } disabled:opacity-40`}
          >
            {pushBusy ? "..." : pushSubbed ? "Disable" : "Enable"}
          </button>
        </div>
      </div>

      {/* Channel master switches */}
      <div className="rounded-xl bg-card p-2 divide-y divide-border">
        <Row label="In-app bell" checked={prefs.inapp_enabled} onChange={(v) => update({ inapp_enabled: v })} />
        <Row label="Push to all devices" checked={prefs.push_enabled} onChange={(v) => update({ push_enabled: v })} />
        <Row label="Email digests" checked={prefs.email_enabled} onChange={(v) => update({ email_enabled: v })} />
      </div>

      {/* Categories */}
      <div className="rounded-xl bg-card p-2 divide-y divide-border">
        <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          What to notify me about
        </p>
        {CATEGORIES.map((c) => (
          <Row
            key={c.key}
            label={c.label}
            help={c.help}
            checked={prefs[c.key] as boolean}
            onChange={(v) => update({ [c.key]: v } as Partial<Prefs>)}
          />
        ))}
      </div>

      {/* Quiet hours */}
      <div className="rounded-xl bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-bold">Quiet hours</p>
          <p className="text-xs text-muted-foreground">No push alerts during this window. The bell still updates silently.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">From</span>
            <input
              type="time"
              value={prefs.quiet_start || ""}
              onChange={(e) => update({ quiet_start: e.target.value || null })}
              className="w-full rounded-lg bg-input px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">To</span>
            <input
              type="time"
              value={prefs.quiet_end || ""}
              onChange={(e) => update({ quiet_end: e.target.value || null })}
              className="w-full rounded-lg bg-input px-3 py-2 text-sm"
            />
          </label>
        </div>
        {(prefs.quiet_start || prefs.quiet_end) && (
          <button
            onClick={() => update({ quiet_start: null, quiet_end: null })}
            className="text-[11px] font-bold text-primary"
          >Clear quiet hours</button>
        )}
        <p className="text-[10px] text-muted-foreground">Timezone: {prefs.timezone}</p>
      </div>
    </div>
  );
}

function Row({
  label, help, checked, onChange,
}: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-3 p-3 text-left">
      <span className="flex-1">
        <span className="block text-sm">{label}</span>
        {help && <span className="block text-[11px] text-muted-foreground mt-0.5">{help}</span>}
      </span>
      <span className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
