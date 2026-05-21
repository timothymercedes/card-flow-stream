import { Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { ShieldAlert, X, Bell, BellOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/lib/realtime";

type Counts = {
  reports: number;
  disputes: number;
  verifications: number;
  shipping: number;
  payments: number;
};

const STORAGE_KEY = "admin-alert-banner-dismissed-total";
const SOUND_KEY = "admin-alert-sound";

/**
 * Sticky top banner shown to staff users (admin/owner/moderator/support)
 * whenever there are open reports, disputes, pending verifications, or
 * shipping/payment issues. Priority colors:
 *  - red: payment failures or shipping issues
 *  - amber: disputes or open reports
 *  - blue: verifications only
 * Click-through chips link to the matching admin tab.
 * Optional sound on new alerts (per-staff localStorage toggle).
 */
export function AdminAlertBanner() {
  const { user } = useAuth();
  const [isStaff, setIsStaff] = useState(false);
  const [counts, setCounts] = useState<Counts>({ reports: 0, disputes: 0, verifications: 0, shipping: 0, payments: 0 });
  const [dismissedAt, setDismissedAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(sessionStorage.getItem(STORAGE_KEY) || 0);
  });
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SOUND_KEY) === "1";
  });
  const lastTotalRef = useRef(0);

  const refresh = useCallback(async () => {
    const [reports, disputes, verifications, shipping, payments] = await Promise.all([
      supabase.from("user_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
      supabase.from("profiles").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "reverify_required"]),
      // Only count shipping issues still unresolved (not yet delivered/cancelled/refunded)
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("is_late_shipment", true)
        .not("status", "in", "(delivered,cancelled,refunded)"),
      // Only count payment issues still failing (not paid/refunded/cancelled)
      supabase.from("orders").select("id", { count: "exact", head: true })
        .gt("payment_failure_count", 0)
        .not("payment_status", "in", "(paid,refunded,cancelled)"),
    ]);
    const next: Counts = {
      reports: reports.count || 0,
      disputes: disputes.count || 0,
      verifications: verifications.count || 0,
      shipping: shipping.count || 0,
      payments: payments.count || 0,
    };
    const total = next.reports + next.disputes + next.verifications + next.shipping + next.payments;
    if (soundOn && total > lastTotalRef.current && lastTotalRef.current > 0) {
      try { new Audio("/sounds/admin-alert.mp3").play().catch(() => {}); } catch {}
    }
    lastTotalRef.current = total;
    setCounts(next);
    // Auto-clear dismissal once all alerts are resolved, so banner reappears on the next one
    if (total === 0) {
      setDismissedAt(0);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [soundOn]);

  useEffect(() => {
    if (!user) { setIsStaff(false); return; }
    let cancelled = false;
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const set = new Set((roles || []).map((r: any) => r.role));
      const staff = set.has("admin") || set.has("owner") || set.has("moderator") || set.has("support");
      if (cancelled) return;
      setIsStaff(staff);
      if (staff) refresh();
    })();
    return () => { cancelled = true; };
  }, [user, refresh]);

  useRealtimeChannel({ name: "admin-alert-banner", enabled: isStaff }, (ch) =>
    ch
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "user_reports" } as any, () => refresh())
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "disputes" } as any, () => refresh())
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "profiles" } as any, () => refresh())
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "orders" } as any, () => refresh()),
  );

  // Refresh on focus + every 60s to catch resolutions even if realtime misses an event
  useEffect(() => {
    if (!isStaff) return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const t = setInterval(refresh, 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(t); };
  }, [isStaff, refresh]);

  const total = counts.reports + counts.disputes + counts.verifications + counts.shipping + counts.payments;
  if (!isStaff || total === 0 || total <= dismissedAt) return null;

  // Priority color
  const isRed = counts.payments > 0 || counts.shipping > 0;
  const isAmber = !isRed && (counts.disputes > 0 || counts.reports > 0);
  const tone = isRed
    ? "border-destructive/50 bg-destructive/15 text-destructive"
    : isAmber
    ? "border-amber-500/50 bg-amber-500/15 text-amber-100"
    : "border-blue-500/50 bg-blue-500/15 text-blue-100";
  const dotTone = isRed ? "text-destructive" : isAmber ? "text-amber-400" : "text-blue-400";
  const cta = isRed ? "bg-destructive text-destructive-foreground" : isAmber ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white";

  const chips: { label: string; n: number; search: Record<string, string> }[] = [];
  if (counts.reports) chips.push({ label: `${counts.reports} report${counts.reports === 1 ? "" : "s"}`, n: counts.reports, search: { tab: "reports" } });
  if (counts.disputes) chips.push({ label: `${counts.disputes} dispute${counts.disputes === 1 ? "" : "s"}`, n: counts.disputes, search: { tab: "disputes" } });
  if (counts.verifications) chips.push({ label: `${counts.verifications} verification${counts.verifications === 1 ? "" : "s"}`, n: counts.verifications, search: { tab: "verifications" } });
  if (counts.shipping) chips.push({ label: `${counts.shipping} shipping`, n: counts.shipping, search: { tab: "orders", filter: "issues" } });
  if (counts.payments) chips.push({ label: `${counts.payments} payment`, n: counts.payments, search: { tab: "orders", filter: "issues" } });

  function dismiss() {
    setDismissedAt(total);
    try { sessionStorage.setItem(STORAGE_KEY, String(total)); } catch {}
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try { localStorage.setItem(SOUND_KEY, next ? "1" : "0"); } catch {}
  }

  return (
    <div className={`sticky top-0 z-40 border-b px-3 py-2 text-xs backdrop-blur ${tone}`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className={`h-4 w-4 shrink-0 ${dotTone}`} />
        <strong className="shrink-0">Admin alerts</strong>
        <span className="ml-1 hidden truncate sm:inline">· {total} open</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            onClick={toggleSound}
            aria-label={soundOn ? "Mute alerts" : "Unmute alerts"}
            className="rounded-full p-1 hover:bg-black/10"
          >
            {soundOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 opacity-60" />}
          </button>
          <button onClick={dismiss} aria-label="Dismiss" className="rounded-full p-1 hover:bg-black/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <Link
            key={c.label}
            to="/admin"
            search={c.search as any}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cta} hover:opacity-90`}
          >
            {c.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
