import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { CheckCircle2, AlertTriangle, Activity, Radio, ShoppingBag, DollarSign } from "lucide-react";

export const Route = createFileRoute("/status")({
  component: StatusPage,
  head: () => ({
    meta: [
      { title: "PullBid Live — Platform Status" },
      { name: "description", content: "Live platform health for PullBid Live: auctions, marketplace, payments, and realtime." },
    ],
  }),
});

type Health = "ok" | "degraded" | "down";

interface SystemStatus {
  key: string;
  label: string;
  icon: any;
  health: Health;
  detail: string;
}

function pill(h: Health) {
  if (h === "ok") return { cls: "bg-primary/15 text-primary ring-primary/30", text: "Operational", Icon: CheckCircle2 };
  if (h === "degraded") return { cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30", text: "Degraded", Icon: AlertTriangle };
  return { cls: "bg-destructive/15 text-destructive ring-destructive/40", text: "Down", Icon: AlertTriangle };
}

function StatusPage() {
  const [systems, setSystems] = useState<SystemStatus[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [liveQ, listingsQ, ordersQ, payoutsQ] = await Promise.all([
        supabase.from("live_streams").select("status", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("listings").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("payment_status", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("payouts").select("status", { count: "exact", head: true }).gte("created_at", since),
      ]);

      const next: SystemStatus[] = [
        {
          key: "live",
          label: "Live Auctions & Streams",
          icon: Radio,
          health: liveQ.error ? "down" : "ok",
          detail: liveQ.error ? "Unable to query streams" : `${liveQ.count ?? 0} streams in the last 24h`,
        },
        {
          key: "marketplace",
          label: "Marketplace",
          icon: ShoppingBag,
          health: listingsQ.error ? "down" : "ok",
          detail: listingsQ.error ? "Listings unavailable" : `${listingsQ.count ?? 0} active listings`,
        },
        {
          key: "checkout",
          label: "Checkout & Orders",
          icon: ShoppingBag,
          health: ordersQ.error ? "down" : "ok",
          detail: ordersQ.error ? "Orders unavailable" : `${ordersQ.count ?? 0} orders processed in the last 24h`,
        },
        {
          key: "payouts",
          label: "Seller Payouts",
          icon: DollarSign,
          health: payoutsQ.error ? "down" : "ok",
          detail: payoutsQ.error ? "Payout queue unavailable" : `${payoutsQ.count ?? 0} payout events in the last 24h`,
        },
        {
          key: "realtime",
          label: "Realtime Sync",
          icon: Activity,
          health: "ok",
          detail: "Bids, chat, and stories streaming live",
        },
      ];

      setSystems(next);
      setUpdatedAt(new Date());
      setLoading(false);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const overall: Health = systems.some((s) => s.health === "down")
    ? "down"
    : systems.some((s) => s.health === "degraded")
    ? "degraded"
    : "ok";
  const overallPill = pill(overall);

  return (
    <AppShell>
      <main className="px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-black">Platform Status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time health of PullBid Live core systems.
          </p>
        </header>

        <section
          className={`mb-6 flex items-center gap-3 rounded-2xl p-4 ring-1 ${overallPill.cls}`}
          aria-live="polite"
        >
          <overallPill.Icon className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {loading ? "Checking…" : overall === "ok" ? "All systems operational" : overall === "degraded" ? "Some systems degraded" : "Major outage"}
            </p>
            {updatedAt && (
              <p className="text-xs opacity-80">Updated {updatedAt.toLocaleTimeString()}</p>
            )}
          </div>
        </section>

        <ul className="space-y-2">
          {systems.map((s) => {
            const p = pill(s.health);
            const Icon = s.icon;
            return (
              <li key={s.key} className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-border">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{s.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{s.detail}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${p.cls}`}>
                  <p.Icon className="h-3 w-3" />
                  {p.text}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Status checks run every 60 seconds against the platform's live database.
          <br />
          For incident updates and history, contact <a href="mailto:support@pullbidlive.com" className="text-primary hover:underline">support@pullbidlive.com</a>.
        </p>
      </main>
    </AppShell>
  );
}
