import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Point = { captured_at: string; market_price: number };
type Props = { name: string; tcgSet?: string | null; tcgNumber?: string | null; currentValue?: number | null };

function keyOf(name: string, set?: string | null, number?: string | null) {
  return `${(name || "").toLowerCase()}|${(set || "").toLowerCase()}|${(number || "").toLowerCase()}`;
}

function sixMonthFlatLine(value: number): Point[] {
  return [
    { captured_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 183).toISOString(), market_price: value },
    { captured_at: new Date().toISOString(), market_price: value },
  ];
}

export function CardPriceChart({ name, tcgSet, tcgNumber, currentValue }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefreshed, setAutoRefreshed] = useState(false);

  const load = async () => {
    setLoading(true);
    const key = keyOf(name, tcgSet, tcgNumber);
    // Last 6 months
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 183).toISOString();
    const { data } = await supabase
      .from("card_price_history")
      .select("captured_at, market_price")
      .eq("card_key", key)
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .limit(200);
    setPoints((data || []).filter((p: any) => p.market_price != null) as Point[]);
    setLoading(false);
  };

  useEffect(() => { setAutoRefreshed(false); load(); /* eslint-disable-next-line */ }, [name, tcgSet, tcgNumber]);

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
    if (points.length >= 2) return;
    setAutoRefreshed(true);
    refresh({ silent: true });
    // eslint-disable-next-line
  }, [loading, points.length, autoRefreshed]);

  if (loading) return <div className="h-24 rounded-lg bg-muted/40" />;

  const fallbackValue = Number(currentValue || points[0]?.market_price || 0);
  const chartPoints = points.length >= 2 ? points : fallbackValue > 0 ? sixMonthFlatLine(fallbackValue) : points;

  if (chartPoints.length < 2) {
    return (
      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Not enough price history yet. Updates daily.</span>
          <button onClick={() => refresh()} disabled={refreshing} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>
    );
  }

  const first = chartPoints[0].market_price;
  const last = chartPoints[chartPoints.length - 1].market_price;
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const up = delta >= 0;

  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Price history</p>
          <p className={`text-sm font-bold ${up ? "text-emerald-500" : "text-red-500"} flex items-center gap-1`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}${delta.toFixed(2)} ({pct.toFixed(1)}%)
          </p>
        </div>
        <button onClick={() => refresh()} disabled={refreshing} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis dataKey="captured_at" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(v) => new Date(v).toLocaleDateString()}
              formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Market"]}
            />
            <ReferenceLine y={first} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="market_price" stroke={up ? "var(--primary)" : "var(--destructive)"} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
