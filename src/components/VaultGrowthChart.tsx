import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

type Snapshot = { snapshot_date: string; total_value: number; total_cost: number; card_count: number };

type RangeKey = "30D" | "90D" | "1Y" | "ALL";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "30D", label: "30D", days: 30 },
  { key: "90D", label: "90D", days: 90 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "ALL", label: "All", days: null },
];

/**
 * Portfolio growth — the owner's total vault value over time, read from the
 * daily `vault_value_snapshots` table. Only ever shown to the vault owner.
 */
export function VaultGrowthChart({ userId, liveValue }: { userId: string; liveValue?: number }) {
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("90D");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("vault_value_snapshots")
        .select("snapshot_date, total_value, total_cost, card_count")
        .eq("user_id", userId)
        .order("snapshot_date", { ascending: true })
        .limit(400);
      if (active) {
        setRows((data || []) as Snapshot[]);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  const days = RANGES.find((r) => r.key === range)!.days;

  const points = useMemo(() => {
    let pts = rows.map((r) => ({ ...r, total_value: Number(r.total_value || 0) }));
    if (days != null) {
      const cutoff = Date.now() - 1000 * 60 * 60 * 24 * days;
      pts = pts.filter((p) => new Date(p.snapshot_date).getTime() >= cutoff);
    }
    // Append today's live value so the graph always ends at the current total.
    if (typeof liveValue === "number") {
      const today = new Date().toISOString().slice(0, 10);
      if (pts.length === 0 || pts[pts.length - 1].snapshot_date !== today) {
        pts = [...pts, { snapshot_date: today, total_value: liveValue, total_cost: 0, card_count: 0 }];
      }
    }
    return pts;
  }, [rows, days, liveValue]);

  const RangeTabs = (
    <div className="flex items-center gap-1 rounded-full bg-muted/60 p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => setRange(r.key)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${range === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return <div className="mb-3 h-44 animate-pulse rounded-2xl border border-border/60 bg-card" />;
  }

  if (points.length < 2) {
    return (
      <div className="mb-3 rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vault growth</p>
          {RangeTabs}
        </div>
        <p className="text-sm text-muted-foreground">We start charting your collection's value as soon as we have a couple of days of history. Check back tomorrow.</p>
      </div>
    );
  }

  const first = points[0].total_value;
  const last = points[points.length - 1].total_value;
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const up = delta >= 0;

  return (
    <div className="mb-3 rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vault growth</p>
          <p className={`flex items-center gap-1 text-lg font-bold ${up ? "text-emerald-500" : "text-destructive"}`}>
            {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {up ? "+" : "-"}${Math.abs(delta).toFixed(2)} ({pct.toFixed(1)}%)
          </p>
        </div>
        {RangeTabs}
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="vaultGrowthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="snapshot_date"
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              width={44}
            />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(v) => new Date(v).toLocaleDateString()}
              formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Vault value"]}
            />
            <Area type="monotone" dataKey="total_value" stroke="var(--primary)" strokeWidth={2} fill="url(#vaultGrowthFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
