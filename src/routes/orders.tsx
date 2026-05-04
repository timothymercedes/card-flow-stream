import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Package, Truck, CheckCircle2, CreditCard, Clock, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/orders")({ component: Orders });

// SAFE MODE: when true, "Pay Now" simulates payment without contacting Stripe.
// Flip to false (and wire the Stripe Checkout call) to enable real charges.
const PAYMENTS_SAFE_MODE = true;

function ShipIcon({ s }: { s: string }) {
  if (s === "delivered") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === "shipped") return <Truck className="h-3.5 w-3.5" />;
  return <Package className="h-3.5 w-3.5" />;
}

function PayBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    awaiting_payment: { label: "Awaiting Payment", cls: "bg-amber-500/15 text-amber-400", icon: Clock },
    paid: { label: "Paid", cls: "bg-primary/15 text-primary", icon: CheckCircle2 },
    refunded: { label: "Refunded", cls: "bg-muted text-muted-foreground", icon: Clock },
  };
  const v = map[s] || map.awaiting_payment;
  const Icon = v.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${v.cls}`}>
      <Icon className="h-3 w-3" /> {v.label}
    </span>
  );
}

function Orders() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, any>>({});
  const [reviewForm, setReviewForm] = useState<Record<string, { rating: number; shipping_rating: number; comment: string }>>({});

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("orders").select("*").eq("buyer_id", user.id).order("created_at", { ascending: false });
    setOrders(data || []);
    const ids = (data || []).map((o: any) => o.id);
    if (ids.length) {
      const { data: revs } = await supabase.from("seller_reviews").select("*").in("order_id", ids).eq("buyer_id", user.id);
      const map: Record<string, any> = {};
      (revs || []).forEach((r) => { map[r.order_id] = r; });
      setReviews(map);
    }
  }
  useEffect(() => { load(); }, [user]);

  async function submitReview(o: any) {
    const f = reviewForm[o.id] || { rating: 5, shipping_rating: 5, comment: "" };
    const { error } = await supabase.from("seller_reviews").insert({
      order_id: o.id,
      seller_id: o.seller_id,
      buyer_id: user!.id,
      buyer_username: profile?.username || "buyer",
      rating: f.rating,
      shipping_rating: f.shipping_rating,
      comment: f.comment || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Review submitted");
    load();
  }

  async function payNow(o: any) {
    if (PAYMENTS_SAFE_MODE) {
      // Safe-mode: mark as paid locally without calling Stripe.
      setPaying(o.id);
      const { error } = await supabase.from("orders").update({
        payment_status: "paid", paid_at: new Date().toISOString(),
      }).eq("id", o.id);
      setPaying(null);
      if (error) return toast.error(error.message);
      toast.success("Payment recorded (safe mode — no charge)");
      load();
      return;
    }
    // TODO: when going live — call a server function that creates a Stripe
    // Checkout Session for this order and redirect the user to it.
    toast.info("Live payments not yet enabled");
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
        <h1 className="text-xl font-bold">My Orders</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your orders.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-1 text-2xl font-bold">My Orders</h1>
        <p className="mb-4 text-xs text-muted-foreground">Items you've purchased</p>
        {PAYMENTS_SAFE_MODE && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            🔒 Safe mode: payments are simulated. No real charges occur.
          </div>
        )}
        {orders.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No orders yet</p>}
        <div className="space-y-3">
          {orders.map((o) => {
            const pay = o.payment_status || "awaiting_payment";
            return (
              <div key={o.id} className="rounded-xl bg-card p-3">
                <div className="flex items-start gap-3">
                  {o.item_image_url && <img src={o.item_image_url} alt={o.title} className="h-16 w-16 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{o.title}</p>
                    {o.description && <p className="line-clamp-2 text-[11px] text-muted-foreground">{o.description}</p>}
                    <p className="text-xs font-semibold text-primary">${Number(o.amount).toFixed(2)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <PayBadge s={pay} />
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold capitalize">
                        <ShipIcon s={o.status} /> {o.status}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Ship to: {o.ship_name}, {o.ship_address}, {o.ship_city} {o.ship_state} {o.ship_zip}</p>
                {o.tracking_number && (
                  <p className="text-[11px] text-primary">
                    Tracking: {o.tracking_url
                      ? <a href={o.tracking_url} target="_blank" rel="noreferrer" className="underline">{o.tracking_number}</a>
                      : o.tracking_number}
                    {o.carrier && <span className="ml-1 text-muted-foreground">({o.carrier})</span>}
                  </p>
                )}
                {pay === "awaiting_payment" && (
                  <button
                    onClick={() => payNow(o)}
                    disabled={paying === o.id}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
                  >
                    <CreditCard className="h-4 w-4" />
                    {paying === o.id ? "Processing…" : PAYMENTS_SAFE_MODE ? "Pay Now (Safe Mode)" : "Pay Now"}
                  </button>
                )}
                {pay === "paid" && o.status === "shipped" && (
                  <button onClick={() => deliver(o)} className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Mark Delivered</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
