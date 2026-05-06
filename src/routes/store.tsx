import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Package, Truck, CheckCircle2, Star, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { getShippoRates, buyShippoLabel } from "@/server/shippo.functions";

export const Route = createFileRoute("/store")({ component: MyStore });

const COMMISSION = 0.05;

function StatusIcon({ s }: { s: string }) {
  if (s === "delivered") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (s === "shipped") return <Truck className="h-4 w-4 text-primary" />;
  return <Package className="h-4 w-4 text-muted-foreground" />;
}

function MyStore() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"listings" | "to_ship" | "in_transit" | "delivered" | "reviews">("listings");
  const [payoutStatus, setPayoutStatus] = useState<string>("not_started");
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);

  async function load() {
    if (!user) return;
    const [ord, list, revs, prof, fr, fg] = await Promise.all([
      supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("listings").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("seller_reviews").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("stripe_onboarding_status").eq("id", user.id).maybeSingle(),
      supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id),
      supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);
    setOrders(ord.data || []);
    setListings(list.data || []);
    setReviews(revs.data || []);
    setPayoutStatus((prof.data as any)?.stripe_onboarding_status || "not_started");
    setFollowers(fr.count || 0);
    setFollowing(fg.count || 0);
  }
  useEffect(() => { load(); }, [user]);

  async function ship(o: any) {
    const tn = tracking[o.id];
    if (!tn) return toast.error("Add tracking number");
    const c = carrier[o.id] || null;
    const { error } = await supabase.from("orders").update({
      status: "shipped",
      tracking_number: tn,
      carrier: c,
      shipped_at: new Date().toISOString(),
    }).eq("id", o.id);
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({ user_id: o.buyer_id, type: "order", body: `Your "${o.title}" shipped — ${tn}`, link: "/orders" });
    toast.success("Marked shipped");
    load();
  }

  async function markDelivered(o: any) {
    const { error } = await supabase.from("orders").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", o.id);
    if (error) return toast.error(error.message);
    load();
  }

  const totals = useMemo(() => {
    const gross = orders.reduce((s, o) => s + Number(o.amount || 0), 0);
    const rate = COMMISSION;
    const commission = gross * rate;
    return { gross, commission, net: gross - commission };
  }, [orders]);

  const filtered = orders.filter((o) =>
    tab === "to_ship" ? o.status === "pending" :
    tab === "in_transit" ? o.status === "shipped" :
    tab === "delivered" ? o.status === "delivered" :
    false
  );

  const reviewStats = useMemo(() => {
    if (!reviews.length) return { count: 0, avg: 0, ship: 0 };
    const avg = reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length;
    const ship = reviews.reduce((s, r) => s + Number(r.shipping_rating || 0), 0) / reviews.length;
    return { count: reviews.length, avg, ship };
  }, [reviews]);

  function Stars({ n, size = 12 }: { n: number; size?: number }) {
    return (
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"} />
        ))}
      </span>
    );
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">My Store</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view items you've sold.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-1 text-2xl font-bold">My Store</h1>
        <p className="mb-2 text-xs text-muted-foreground">Items you've sold via live or marketplace</p>
        <div className="mb-4 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span><span className="font-bold text-foreground">{followers}</span> followers</span>
          <span><span className="font-bold text-foreground">{following}</span> following</span>
        </div>

        {payoutStatus !== "complete" && (
          <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-card p-3">
            <p className="text-sm font-bold">💳 Connect your payout account</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Currently in safe mode — no real money moves yet. When live payments are turned on,
              you'll connect a Stripe account here so buyers' funds (minus 5% commission) land in your bank.
            </p>
            <button
              disabled
              className="mt-2 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              title="Available once live payments are enabled"
            >
              Set up payouts (coming soon)
            </button>
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-card p-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Gross</p>
            <p className="text-sm font-bold">${totals.gross.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Commission (5%)</p>
            <p className="text-sm font-bold text-destructive">-${totals.commission.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Net Pay</p>
            <p className="text-sm font-bold text-primary">${totals.net.toFixed(2)}</p>
          </div>
        </div>

        {/* Reputation summary */}
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-card p-3">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Seller rating</p>
            <div className="mt-1 flex items-center gap-1">
              <Stars n={reviewStats.avg} />
              <span className="text-sm font-bold">{reviewStats.avg ? reviewStats.avg.toFixed(1) : "—"}</span>
              <span className="text-[10px] text-muted-foreground">({reviewStats.count})</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Shipping</p>
            <div className="mt-1 flex items-center gap-1">
              <Stars n={reviewStats.ship} />
              <span className="text-sm font-bold">{reviewStats.ship ? reviewStats.ship.toFixed(1) : "—"}</span>
            </div>
          </div>
        </div>

        <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {([
            { k: "listings", l: "Listings" },
            { k: "to_ship", l: "To Ship" },
            { k: "in_transit", l: "In Transit" },
            { k: "delivered", l: "Sold" },
            { k: "reviews", l: "Reviews" },
          ] as const).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold ${tab === t.k ? "bg-background shadow" : "text-muted-foreground"}`}>{t.l}</button>
          ))}
        </div>

        {/* LISTINGS TAB */}
        {tab === "listings" && (
          <div className="space-y-3">
            {listings.length === 0 && (
              <div className="rounded-xl bg-card p-6 text-center">
                <StoreIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">No listings yet</p>
                <Link to="/sell" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Create a listing</Link>
              </div>
            )}
            {listings.map((l) => (
              <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="flex items-start gap-3 rounded-xl bg-card p-3">
                {l.image_url && <img src={l.image_url} alt={l.title} className="h-16 w-16 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{l.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.is_auction ? `Auction · current bid $${Number(l.current_bid || 0).toFixed(2)}` : `Buy Now · $${Number(l.price || 0).toFixed(2)}`}
                    {l.shipping_price ? ` · +$${Number(l.shipping_price).toFixed(2)} ship` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize">{l.auction_status || "active"}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* REVIEWS TAB */}
        {tab === "reviews" && (
          <div className="space-y-3">
            {reviews.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No reviews yet — buyers can leave one once an order is delivered.</p>}
            {reviews.map((r) => (
              <div key={r.id} className="rounded-xl bg-card p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">@{r.buyer_username}</p>
                  <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1"><Stars n={r.rating} /> overall</span>
                  <span className="flex items-center gap-1"><Stars n={r.shipping_rating} /> shipping</span>
                </div>
                {r.comment && <p className="mt-1 text-xs text-muted-foreground">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ORDER TABS (to_ship / in_transit / delivered) */}
        {(tab === "to_ship" || tab === "in_transit" || tab === "delivered") && (
          <>
        {filtered.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nothing here</p>}
        <div className="space-y-3">
          {filtered.map((o) => {
            const amount = Number(o.amount || 0);
            const rate = Number(o.commission_rate ?? COMMISSION);
            const fee = amount * rate;
            const net = amount - fee;
            return (
              <div key={o.id} className="rounded-xl bg-card p-3">
                <div className="flex items-start gap-3">
                  {o.item_image_url && <img src={o.item_image_url} alt={o.title} className="h-16 w-16 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{o.title}</p>
                    {o.description && <p className="line-clamp-2 text-[11px] text-muted-foreground">{o.description}</p>}
                    <p className="text-xs font-semibold text-primary">${amount.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">Fee ${fee.toFixed(2)} · Net <span className="font-bold text-primary">${net.toFixed(2)}</span></p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold capitalize">
                      <StatusIcon s={o.status} /> {o.status}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.payment_status === "paid" ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-400"}`}>
                      {o.payment_status === "paid" ? "Paid" : "Awaiting Payment"}
                    </span>
                    {o.stream_id && (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">🔴 Live</span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Ship to: {o.ship_name}, {o.ship_address}, {o.ship_city} {o.ship_state} {o.ship_zip}</p>
                {o.tracking_number && <p className="text-[11px] text-primary">Tracking: {o.tracking_number}{o.carrier && ` · ${o.carrier}`}</p>}
                {o.status === "pending" && o.payment_status !== "paid" && (
                  <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">Waiting for buyer to pay before you can ship.</p>
                )}
                {o.status === "pending" && o.payment_status === "paid" && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <input value={tracking[o.id] || ""} onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })} placeholder="Tracking #" className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                      <input value={carrier[o.id] || ""} onChange={(e) => setCarrier({ ...carrier, [o.id]: e.target.value })} placeholder="Carrier" className="w-24 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                    </div>
                    <button onClick={() => ship(o)} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Mark as Shipped</button>
                    <p className="text-[10px] text-muted-foreground">📦 Real label generation will be enabled later.</p>
                  </div>
                )}
                {o.status === "shipped" && (
                  <button onClick={() => markDelivered(o)} className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Mark Delivered</button>
                )}
              </div>
            );
          })}
        </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
