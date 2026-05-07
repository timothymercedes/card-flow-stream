import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function AdminAlertBadge() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setShow(false); return; }
    let cancelled = false;
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const set = new Set((roles || []).map((r: any) => r.role));
      const isStaff = set.has("admin") || set.has("owner") || set.has("moderator") || set.has("support");
      if (!isStaff || cancelled) return;
      setShow(true);
      const refresh = async () => {
        const [{ count: r }, { count: d }, { count: v }] = await Promise.all([
          supabase.from("user_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
          supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
          supabase.from("profiles").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "reverify_required"]),
        ]);
        if (!cancelled) setCount((r || 0) + (d || 0) + (v || 0));
      };
      refresh();
      const ch = supabase.channel("admin-alerts")
        .on("postgres_changes", { event: "*", schema: "public", table: "user_reports" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "disputes" }, refresh)
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!show) return null;
  return (
    <Link to="/admin" title="Admin alerts" className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted">
      <ShieldAlert className="h-4 w-4 text-amber-500" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[9px] font-bold text-live-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
