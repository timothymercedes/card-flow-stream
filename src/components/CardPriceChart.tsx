import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Point = { captured_at: string; market_price: number };
type Props = { name: string; tcgSet?: string | null; tcgNumber?: string | null; currentValue?: number | null; cardIdentityId?: string | null };

type RangeKey = "7D" | "30D" | "90D" | "6M" | "1Y" | "ALL";
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7D", label: "7D", days: 7 },
  { key: "30D", label: "30D", days: 30 },
  { key: "90D", label: "90D", days: 90 },
  { key: "6M", label: "6M", days: 183 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "ALL", label: "All", days: 3650 },
];

function keyOf(name: string, set?: string | null, number?: string | null) {
  return `${(name || "").toLowerCase()}|${(set || "").toLowerCase()}|${(number || "").toLowerCase()}`;
}

function flatLine(value: number, days: number): Point[] {
  return [
    { captured_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * days).toISOString(), market_price: value },
    { captured_at: new Date().toISOString(), market_price: value },
  ];
}

function normalizePoint(p: { captured_at: string; market_price: number | null }): Point {
  return { captured_at: p.captured_at, market_price: Number(p.market_price) || 0 };
}

export function CardPriceChart({ name, tcgSet, tcgNumber, currentValue, cardIdentityId }: Props) {
  const [allPoints, setAllPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefreshed, setAutoRefreshed] = useState(false);
  const [range, setRange] = useState<RangeKey>("90D");

  const load = async () => {
    setLoading(true);
    const keys = Array.from(new Set([keyOf(name, tcgSet, tcgNumber), cardIdentityId].filter(Boolean) as string[]));
    // Pull all stored history so "All" and corrected-card history do not look blank.
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3650).toISOString();
    const { data } = await supabase
      .from("card_price_history")
      .select("captured_at, market_price")
      .in("card_key", keys)
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .limit(2500);
    const directPoints = (data || []).filter((p: any) => p.market_price != null).map(normalizePoint) as Point[];
    if (directPoints.length >= 2 || !name) {
      setAllPoints(directPoints);
      setLoading(false);
      return;
    }

    // Older snapshots were keyed inconsistently by provider/card id. If the
    // exact key has fewer than two points, fall back to the card's metadata so
    // corrected matches still show previous values instead of a blank chart.
    let q = supabase
      .from("card_price_history")
      .select("captured_at, market_price")
      .ilike("name", name)
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .limit(2500);
    if (tcgSet) q = q.ilike("tcg_set", `%${tcgSet}%`);
    if (tcgNumber) q = q.eq("tcg_number", tcgNumber);
    const { data: fallback } = await q;
    const fallbackPoints = (fallback || []).filter((p: any) => p.market_price != null).map(normalizePoint) as Point[];
    setAllPoints(fallbackPoints.length > directPoints.length ? fallbackPoints : directPoints);
    setLoading(false);
  };

  useEffect(() => { setAutoRefreshed(false); load(); /* eslint-disable-next-line */ }, [name, tcgSet, tcgNumber, cardIdentityId]);

  const refresh = async (opts?: { silent?: boolean }) => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ name });
      if (tcgSet) params.set("set", tcgSet);
      if (tcgNumber) params.set("number", tcgNumber);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-prices?${params}`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      const j = await res.json();
      if (!opts?.silent) {
        if (j.ok) toast.success("Price refreshed");
        else toast.error("Could not refresh");
      }
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-pull a fresh snapshot the first time a card is opened with no history.
  useEffect(() => {
    if (loading) return;
    if (autoRefreshed) return;
    if (allPoints.length >= 2) return;
    setAutoRefreshed(true);
    refresh({ silent: true });
    // eslint-disable-next-line
  }, [loading, allPoints.length, autoRefreshed]);

  const days = RANGES.find((r) => r.key === range)!.days;

  // Points within the selected range.
  const rangePoints = useMemo(() => {
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * days;
    return allPoints.filter((p) => new Date(p.captured_at).getTime() >= cutoff);
  }, [allPoints, days]);

  if (loading) return <div className="h-24 rounded-lg bg-muted/40" />;

  const fallbackValue = Number(currentValue || allPoints[allPoints.length - 1]?.market_price || 0);
  const chartPoints = rangePoints.length >= 2 ? rangePoints : fallbackValue > 0 ? flatLine(fallbackValue, days) : rangePoints;

  const RangeTabs = (
    <div className="flex items-center gap-1 rounded-full bg-muted/60 p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => setRange(r.key)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${range === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  if (chartPoints.length < 2) {
    return (
      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <div className="mb-2 flex items-center justify-between">
          {RangeTabs}
          <button onClick={() => refresh()} disabled={refreshing} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <span>Not enough price history for this range yet. Updates daily.</span>
      </div>
    );
  }

  const first = chartPoints[0].market_price;
  const last = chartPoints[chartPoints.length - 1].market_price;
  const values = chartPoints.map((p) => Number(p.market_price || 0));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const avgValue = values.reduce((s, v) => s + v, 0) / values.length;
  const pad = Math.max(1, (maxValue - minValue) * 0.2);
  const yDomain: [number, number] = [minValue - pad, maxValue + pad];
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const up = delta >= 0;

  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Price history · {range}</p>
          <p className={`text-sm font-bold ${up ? "text-emerald-500" : "text-red-500"} flex items-center gap-1`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}${delta.toFixed(2)} ({pct.toFixed(1)}%)
          </p>
        </div>
        {RangeTabs}
      </div>

      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis dataKey="captured_at" hide />
            <YAxis hide domain={yDomain} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(v) => new Date(v).toLocaleDateString()}
              formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Market"]}
            />
            <ReferenceLine y={avgValue} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="market_price" stroke={up ? "var(--primary)" : "var(--destructive)"} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* High / Low / Average for the selected range */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[
          { l: "Low", v: minValue, cls: "text-red-500" },
          { l: "Avg", v: avgValue, cls: "text-foreground" },
          { l: "High", v: maxValue, cls: "text-emerald-500" },
        ].map((m) => (
          <div key={m.l} className="rounded-lg bg-card/60 p-1.5 text-center">
            <p className={`text-xs font-bold ${m.cls}`}>${m.v.toFixed(2)}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{m.l}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <button onClick={() => refresh()} disabled={refreshing} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
    </div>
  );
}
