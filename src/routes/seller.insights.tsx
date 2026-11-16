import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { summarizeSales, type InsightOrder } from "@/lib/sellerInsights";
import { BarChart3, DollarSign, Package, Radio, Tag, TrendingUp, Users } from "lucide-react";

export const Route = createFileRoute("/seller/insights")({
  head: () => ({ meta: [
    { title: "Seller insights — PullBid Live" },
    { name: "description", content: "See your sales, top items, live show results and followers in one place." },
    { property: "og:title", content: "Seller insights — PullBid Live" },
    { property: "og:description", content: "Your sales, top items and followers at a glance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Page() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["seller-insights", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const uid = user!.id;
      const [orders, listings, followers, streams] = await Promise.all([
        supabase.from("orders").select("amount,payment_status,status,description,listing_id,created_at,stream_id").eq("seller_id", uid).limit(2000),
        supabase.from("listings").select("id,visibility,quantity", { count: "exact" }).eq("seller_id", uid).eq("is_demo", false).limit(1000),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", uid),
        supabase.from("streams").select("id", { count: "exact", head: true }).eq("seller_id", uid),
      ]);
      return { s: summarizeSales((orders.data ?? []) as InsightOrder[]), listings: listings.count ?? 0, followers: followers.count ?? 0, shows: streams.count ?? 0 };
    },
  });
  if (!user) return <AppShell><div className="mx-auto max-w-md p-8 text-center"><p className="mb-4">Sign in to see your seller insights.</p><Link to="/auth" className="rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground">Sign in</Link></div></AppShell>;
  const s = data?.s;
  const tiles = [
    { icon: DollarSign, label: "Sales (30 days)", value: s ? money(s.revenue30) : "—" },
    { icon: TrendingUp, label: "All-time sales", value: s ? money(s.revenue) : "—" },
    { icon: Package, label: "Items sold", value: s?.sold ?? "—" },
    { icon: Tag, label: "Average sale", value: s ? money(s.avg) : "—" },
    { icon: Radio, label: "Sold on live", value: s ? `${s.liveSales} · ${data!.shows} shows` : "—" },
    { icon: Users, label: "Followers", value: data?.followers ?? "—" },
  ];
  return <AppShell>
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><BarChart3 className="h-6 w-6" /></div>
        <div className="min-w-0"><h1 className="truncate text-2xl font-black">Seller insights</h1><p className="text-sm text-muted-foreground">Only paid orders count. Refunds are left out.</p></div>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map(t => <div key={t.label} className="rounded-2xl border border-border bg-card p-4">
          <t.icon className="mb-2 h-5 w-5 text-primary" />
          <div className="text-xl font-black">{isLoading ? "…" : t.value}</div>
          <div className="text-xs text-muted-foreground">{t.label}</div>
        </div>)}
      </div>
      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-black">Top items</h2>
        {s && s.top.length ? <ol className="space-y-2">{s.top.map((t, i) => <li key={i} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate"><b className="mr-2 text-primary">#{i + 1}</b>{t.name}</span><span className="shrink-0 font-bold">{money(t.total)} · {t.count} sold</span></li>)}</ol>
          : <p className="text-sm text-muted-foreground">No sales yet. List an item or go live to get started. You have {data?.listings ?? 0} listings.</p>}
        <div className="mt-4 flex flex-wrap gap-2"><Link to="/sell" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Go live / list</Link><Link to="/store" className="rounded-full border border-border px-4 py-2 text-sm font-bold">Seller Hub</Link></div>
      </section>
    </div>
  </AppShell>;
}
