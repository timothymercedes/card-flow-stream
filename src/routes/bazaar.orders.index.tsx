import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/bazaar";
import { ORDER_STATUS_LABEL } from "@/lib/bazaarCheckout";

export const Route = createFileRoute("/bazaar/orders/")({
  head: () => ({ meta: [{ title: "My Retail Orders — PB Bazaar" }, { name: "description", content: "Your PB Bazaar retail order history." }, { property: "og:title", content: "My PB Bazaar Orders" }, { property: "og:description", content: "Track your PB Bazaar retail orders." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user, loading } = useAuth();
  const orders = useQuery({ queryKey: ["bazaar-orders", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from("bazaar_orders").select("id, order_number, status, total_cents, created_at, bazaar_order_items(title, quantity)").eq("buyer_id", user!.id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error; return data;
  } });
  return <AppShell><div className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-5"><h1 className="flex items-center gap-2 text-2xl font-bold"><Package />My retail orders</h1>
    {loading ? <p>Loading…</p> : !user ? <div className="space-y-3"><p>Sign in to see your orders.</p><Button asChild><Link to="/auth">Sign in</Link></Button></div>
      : orders.isLoading ? <p>Loading orders…</p> : orders.error ? <p role="alert">Couldn't load your orders.</p>
      : !orders.data?.length ? <div className="space-y-3"><p className="text-muted-foreground">No PB Bazaar orders yet.</p><Button asChild><Link to="/bazaar">Shop PB Bazaar</Link></Button></div>
      : <ul className="divide-y divide-border border-t border-border">{orders.data.map((o) => <li key={o.id}><Link to="/bazaar/orders/$id" params={{ id: o.id }} className="flex justify-between gap-3 py-4 hover:text-primary"><div className="min-w-0"><p className="font-semibold">{o.order_number}</p><p className="truncate text-sm text-muted-foreground">{o.bazaar_order_items.map((i) => `${i.title} ×${i.quantity}`).join(", ")}</p><p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()} · {ORDER_STATUS_LABEL[o.status] ?? o.status}</p></div><strong className="shrink-0">{formatCents(o.total_cents)}</strong></Link></li>)}</ul>}
  </div></AppShell>;
}
