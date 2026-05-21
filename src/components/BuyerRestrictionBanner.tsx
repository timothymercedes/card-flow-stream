import { useEffect, useState } from "react";
import { ShieldAlert, Snowflake, Ban, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Restriction = {
  id: string;
  kind: "purchase_block" | "bid_limit" | "require_verification" | "frozen";
  cents_limit: number | null;
  reason: string;
  expires_at: string | null;
};

const KIND_META: Record<Restriction["kind"], { icon: any; title: string; tone: string }> = {
  frozen: { icon: Snowflake, title: "Account temporarily frozen", tone: "bg-destructive/15 border-destructive/40 text-destructive" },
  purchase_block: { icon: Ban, title: "Purchases temporarily blocked", tone: "bg-destructive/15 border-destructive/40 text-destructive" },
  bid_limit: { icon: ShieldAlert, title: "Bidding limit applied", tone: "bg-amber-500/15 border-amber-500/40 text-amber-600" },
  require_verification: { icon: BadgeCheck, title: "Additional verification required", tone: "bg-amber-500/15 border-amber-500/40 text-amber-600" },
};

/**
 * Banner shown to buyers when an admin has applied a restriction to their
 * account. Reads directly from buyer_restrictions (the user's own row is
 * readable by RLS).
 */
export function BuyerRestrictionBanner() {
  const { user } = useAuth();
  const [rs, setRs] = useState<Restriction[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("buyer_restrictions" as any)
        .select("id, kind, cents_limit, reason, expires_at")
        .eq("user_id", user.id)
        .eq("active", true);
      if (cancelled) return;
      const now = Date.now();
      setRs(
        ((data as any[]) ?? []).filter(
          (r) => !r.expires_at || new Date(r.expires_at).getTime() > now,
        ),
      );
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user || rs.length === 0) return null;

  return (
    <div className="space-y-2">
      {rs.map((r) => {
        const meta = KIND_META[r.kind];
        const Icon = meta.icon;
        return (
          <div key={r.id} className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${meta.tone}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold">{meta.title}</div>
              <div className="opacity-90">{r.reason}</div>
              {r.kind === "bid_limit" && r.cents_limit != null && (
                <div className="mt-1 opacity-80">
                  Max bid / purchase: <strong>${(r.cents_limit / 100).toFixed(2)}</strong>
                </div>
              )}
              {r.expires_at && (
                <div className="mt-1 opacity-70">Expires {new Date(r.expires_at).toLocaleString()}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
