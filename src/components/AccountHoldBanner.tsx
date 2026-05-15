import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/lib/realtime";

type Hold = {
  id: string;
  balance_owed_cents: number;
  reason: string | null;
  source: string;
  opened_at: string;
};

/**
 * Persistent red banner shown to any user with an active account hold.
 * Blocks selling / payouts / live shows but allows browse, buy, login, support.
 * Cannot be permanently dismissed — only collapsed for the session.
 */
export function AccountHoldBanner() {
  const { user } = useAuth();
  const [hold, setHold] = useState<Hold | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setHold(null); return; }
    const { data } = await supabase
      .from("account_holds" as any)
      .select("id,balance_owed_cents,reason,source,opened_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    setHold((data as any) || null);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useRealtimeChannel(
    { name: `account-hold-${user?.id ?? "none"}`, enabled: !!user },
    (ch) => ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "account_holds", filter: `user_id=eq.${user?.id ?? ""}` } as any,
      () => refresh(),
    ),
  );

  if (!hold) return null;

  const owed = (hold.balance_owed_cents / 100).toFixed(2);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="sticky top-0 z-40 flex w-full items-center gap-2 border-b border-destructive/40 bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Account on hold — ${owed} owed (tap to expand)
      </button>
    );
  }

  return (
    <div className="sticky top-0 z-40 border-b border-destructive/50 bg-destructive/15 px-3 py-2.5 text-xs text-destructive backdrop-blur">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">Account on hold</strong>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse"
              className="shrink-0 rounded-full p-1 hover:bg-destructive/20"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="mt-0.5 leading-snug">
            You owe <strong>${owed}</strong>. While on hold, you can't start live shows, list new items, or withdraw payouts.
            {hold.reason ? <span className="opacity-80"> — {hold.reason}</span> : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              to="/payouts"
              className="rounded-full bg-destructive px-3 py-1 text-[11px] font-bold text-destructive-foreground hover:opacity-90"
            >
              Pay balance →
            </Link>
            <Link
              to="/support"
              className="rounded-full border border-destructive/40 bg-background/40 px-3 py-1 text-[11px] font-bold hover:bg-background/60"
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
