import { Shield, ShieldCheck, ShieldAlert, TrendingUp, Lock } from "lucide-react";

export type TrustTier = "new" | "bronze" | "silver" | "gold" | "platinum";

const TIERS: { tier: TrustTier; min: number; pct: number; label: string; color: string }[] = [
  { tier: "new",      min: 0,   pct: 0,  label: "New seller", color: "text-muted-foreground" },
  { tier: "bronze",   min: 25,  pct: 10, label: "Bronze",     color: "text-amber-600" },
  { tier: "silver",   min: 50,  pct: 30, label: "Silver",     color: "text-zinc-400" },
  { tier: "gold",     min: 75,  pct: 70, label: "Gold",       color: "text-amber-400" },
  { tier: "platinum", min: 100, pct: 95, label: "Platinum",   color: "text-cyan-300" },
];

export function TrustTierCard({
  tier,
  deliveries,
  instantPct,
  frozen,
  manualOverride,
}: {
  tier: TrustTier;
  deliveries: number;
  instantPct: number;
  frozen?: boolean;
  manualOverride?: boolean;
}) {
  const cur = TIERS.find((t) => t.tier === tier)!;
  const next = TIERS.find((t) => t.min > deliveries);
  const progress = next ? Math.min(100, ((deliveries - cur.min) / (next.min - cur.min)) * 100) : 100;

  const Icon = frozen ? Lock : tier === "platinum" ? ShieldCheck : tier === "new" ? Shield : ShieldCheck;

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${frozen ? "text-destructive" : cur.color}`} />
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Trust level</p>
            <p className={`text-base font-bold ${frozen ? "text-destructive" : cur.color}`}>
              {frozen ? "Frozen" : cur.label}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-muted-foreground">Instant release</p>
          <p className="text-base font-bold text-primary">
            {frozen ? "0%" : `${instantPct}%`}
            {manualOverride && !frozen && <span className="ml-1 text-[10px] text-amber-500">(adjusted)</span>}
          </p>
        </div>
      </div>

      {!frozen && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{deliveries} delivered</span>
            {next ? (
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {next.min - deliveries} to {next.label} ({next.pct}%)
              </span>
            ) : (
              <span>Top tier reached</span>
            )}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {frozen && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Account is frozen by platform review. Payouts are paused. Contact support.</span>
        </div>
      )}
    </div>
  );
}
