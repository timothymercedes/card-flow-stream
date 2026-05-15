import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Receipt, ArrowDownCircle, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Recovery = {
  id: string;
  source: string;
  reference_id: string | null;
  gross_cents: number;
  deducted_cents: number;
  net_released_cents: number;
  remaining_owed_cents: number;
  created_at: string;
};

type Hold = { id: string; balance_owed_cents: number; reason: string | null };

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * Shows the seller's auto-recovery history: every payout/sale that had
 * a portion deducted toward an owed balance, with a clear breakdown of
 * earned / deducted / released / remaining.
 */
export function PayoutBreakdown() {
  const { user } = useAuth();
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: recs }, { data: h }] = await Promise.all([
      supabase
        .from("hold_recoveries" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("account_holds" as any)
        .select("id,balance_owed_cents,reason")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    setRecoveries((recs as any) ?? []);
    setHold((h as any) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Receipt className="h-4 w-4" /> Payout & recovery history
        </h2>
        {hold ? (
          <Link
            to="/payouts"
            className="rounded-full bg-destructive px-3 py-1 text-[11px] font-bold text-destructive-foreground"
          >
            Pay {fmt(hold.balance_owed_cents)} now
          </Link>
        ) : null}
      </div>

      {hold && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <strong>{fmt(hold.balance_owed_cents)} still owed.</strong> Future earnings will be
            automatically deducted until your balance is cleared.
            {hold.reason ? <span className="block opacity-80">{hold.reason}</span> : null}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : recoveries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No automatic deductions yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {recoveries.map((r) => (
            <li key={r.id} className="py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold capitalize">{r.source}</span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">Earned</span>
                  <div className="font-bold">{fmt(r.gross_cents)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Deducted</span>
                  <div className="font-bold text-destructive">−{fmt(r.deducted_cents)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Released</span>
                  <div className="inline-flex items-center gap-1 font-bold text-emerald-500">
                    <ArrowDownCircle className="h-3 w-3" /> {fmt(r.net_released_cents)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Still owed</span>
                  <div className="font-bold">{fmt(r.remaining_owed_cents)}</div>
                </div>
              </div>
              {r.reference_id ? (
                <code className="mt-1 block truncate text-[10px] text-muted-foreground">
                  ref: {r.reference_id}
                </code>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
