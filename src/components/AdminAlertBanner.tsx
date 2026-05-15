import { Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/lib/realtime";

type Counts = {
  reports: number;
  disputes: number;
  verifications: number;
  shipping: number;
};

const STORAGE_KEY = "admin-alert-banner-dismissed-total";

/**
 * Sticky top banner shown to staff users (admin/owner/moderator/support)
 * whenever there are open reports, disputes, pending verifications, or
 * shipping issues. Dismissible, but reappears whenever the total count
 * grows beyond the last-dismissed snapshot.
 */
export function AdminAlertBanner() {
  const { user } = useAuth();
  const [isStaff, setIsStaff] = useState(false);
  const [counts, setCounts] = useState<Counts>({ reports: 0, disputes: 0, verifications: 0, shipping: 0 });
  const [dismissedAt, setDismissedAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(sessionStorage.getItem(STORAGE_KEY) || 0);
  });

  const refresh = useCallback(async () => {
    const [reports, disputes, verifications, shipping, payments] = await Promise.all([
      supabase.from("user_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
      supabase.from("profiles").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "reverify_required"]),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("is_late_shipment", true),
      supabase.from("orders").select("id", { count: "exact", head: true }).gt("payment_failure_count", 0),
    ]);
    setCounts({
      reports: reports.count || 0,
      disputes: disputes.count || 0,
      verifications: verifications.count || 0,
      shipping: (shipping.count || 0) + (payments.count || 0),
    });
  }, []);

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
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "orders" } as any, () => refresh()),
  );

  const total = counts.reports + counts.disputes + counts.verifications + counts.shipping;
  if (!isStaff || total === 0 || total <= dismissedAt) return null;

  const parts: string[] = [];
  if (counts.reports) parts.push(`${counts.reports} report${counts.reports === 1 ? "" : "s"}`);
  if (counts.disputes) parts.push(`${counts.disputes} dispute${counts.disputes === 1 ? "" : "s"}`);
  if (counts.verifications) parts.push(`${counts.verifications} verification${counts.verifications === 1 ? "" : "s"}`);
  if (counts.shipping) parts.push(`${counts.shipping} shipping issue${counts.shipping === 1 ? "" : "s"}`);

  function dismiss() {
    setDismissedAt(total);
    try { sessionStorage.setItem(STORAGE_KEY, String(total)); } catch {}
  }

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-100 backdrop-blur">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 truncate">
        <strong>Admin alerts:</strong> {parts.join(" • ")}
      </span>
      <Link to="/admin" className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-400">
        Review →
      </Link>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-full p-1 text-amber-200 hover:bg-amber-500/20">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
