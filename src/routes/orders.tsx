import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Package, Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/orders")({ component: Orders });

function StatusIcon({ s }: { s: string }) {
  if (s === "delivered") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (s === "shipped") return <Truck className="h-4 w-4 text-primary" />;
  return <Package className="h-4 w-4 text-muted-foreground" />;
}

function Orders() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"buying" | "selling">("buying");
  const [orders, setOrders] = useState<any[]>([]);
  const [tracking, setTracking] = useState<Record<string, string>>({});

  async function load() {
    if (!user) return;
    const col = tab === "buying" ? "buyer_id" : "seller_id";
    const { data } = await supabase.from("orders").select("*").eq(col, user.id).order("created_at", { ascending: false });
    setOrders(data || []);
  }
  useEffect(() => { load(); }, [user, tab]);

  async function ship(o: any) {
    const tn = tracking[o.id];
    if (!tn) return toast.error("Add tracking number");
    const { error } = await supabase.from("orders").update({ status: "shipped", tracking_number: tn, shipped_at: new Date().toISOString() }).eq("id", o.id);
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({ user_id: o.buyer_id, type: "order", body: `Your "${o.title}" shipped — ${tn}`, link: "/orders" });
    toast.success("Marked shipped");
    load();
  }
  async function deliver(o: any) {
    const { error } = await supabase.from("orders").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Marked delivered");
    load();
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Orders</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your orders.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-4 text-2xl font-bold">Orders</h1>
        <div className="mb-4 flex rounded-xl bg-card p-1">
          <button onClick={() => setTab("buying")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === "buying" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Buying</button>
          <button onClick={() => setTab("selling")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === "selling" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Selling</button>
        </div>
        {orders.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No orders</p>}
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-xl bg-card p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold">{o.title}</p>
                  <p className="text-xs text-muted-foreground">${Number(o.amount).toFixed(2)}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold capitalize">
                  <StatusIcon s={o.status} /> {o.status}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Ship to: {o.ship_name}, {o.ship_address}, {o.ship_city} {o.ship_state} {o.ship_zip}</p>
              {o.tracking_number && <p className="text-[11px] text-primary">Tracking: {o.tracking_number}</p>}
              {tab === "selling" && o.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <input value={tracking[o.id] || ""} onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })} placeholder="Tracking #" className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                  <button onClick={() => ship(o)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Ship</button>
                </div>
              )}
              {tab === "buying" && o.status === "shipped" && (
                <button onClick={() => deliver(o)} className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Mark Delivered</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
