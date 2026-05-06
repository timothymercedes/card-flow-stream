import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import {
  Package, Truck, CheckCircle2, Star, Store as StoreIcon,
  ListChecks, Radio, DollarSign, MessageSquare, Box,
} from "lucide-react";
import { toast } from "sonner";
import { getShippoRates, buyShippoLabel } from "@/server/shippo.functions";
import { SHIPPING_PRESETS, suggestPreset, type ShippingPresetKey } from "@/lib/shippingPresets";

export const Route = createFileRoute("/store")({ component: SellerHub });

const COMMISSION = 0.05;

type Section = "listings" | "orders" | "live" | "shipping" | "payouts" | "reviews";

const SECTIONS: { k: Section; label: string; icon: any }[] = [
  { k: "listings", label: "Listings", icon: ListChecks },
  { k: "orders", label: "Orders", icon: Package },
  { k: "live", label: "Live", icon: Radio },
  { k: "shipping", label: "Shipping", icon: Box },
  { k: "payouts", label: "Payouts", icon: DollarSign },
  { k: "reviews", label: "Reviews", icon: MessageSquare },
];

function StatusIcon({ s }: { s: string }) {
  if (s === "delivered") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (s === "shipped") return <Truck className="h-4 w-4 text-primary" />;
  return <Package className="h-4 w-4 text-muted-foreground" />;
}

function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: { k: T; l: string; n?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {tabs.map((t) => (
        <button
          key={t.k}
          onClick={() => onChange(t.k)}
          className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold ${value === t.k ? "bg-background shadow" : "text-muted-foreground"}`}
        >
          {t.l}{typeof t.n === "number" ? ` (${t.n})` : ""}
        </button>
      ))}
    </div>
  );
}

function SellerHub() {
  const { user } = useAuth();

  // Data
  const [orders, setOrders] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [payoutStatus, setPayoutStatus] = useState<string>("not_started");
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [pweSettings, setPweSettings] = useState({ enabled: true, max: 20, price: 0.99, stamp: 0.78 });
  const [savingPwe, setSavingPwe] = useState(false);

  // UI
  const [section, setSection] = useState<Section>("orders");
  const [listingsTab, setListingsTab] = useState<"active" | "draft" | "scheduled" | "sold">("active");
  const [ordersTab, setOrdersTab] = useState<"to_ship" | "shipped" | "delivered" | "cancelled">("to_ship");
  const [liveTab, setLiveTab] = useState<"upcoming" | "history" | "tools">("upcoming");
  const [shippingTab, setShippingTab] = useState<"presets" | "auto" | "combined" | "caps" | "carriers">("presets");
  const [payoutsTab, setPayoutsTab] = useState<"pending" | "completed" | "fees">("pending");

  // Per-order shipping label state
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState<Record<string, string>>({});
  const [rates, setRates] = useState<Record<string, any[]>>({});
  const [ratesLoading, setRatesLoading] = useState<Record<string, boolean>>({});
  const [labelUrls, setLabelUrls] = useState<Record<string, string>>({});
  const [preset, setPreset] = useState<Record<string, ShippingPresetKey>>({});
  const [recommended, setRecommended] = useState<Record<string, string | null>>({});

  async function load() {
    if (!user) return;
    const [ord, list, revs, prof, fr, fg, str] = await Promise.all([
      supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("listings").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("seller_reviews").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("stripe_onboarding_status, pwe_enabled, pwe_max_order_value, pwe_price_usd, pwe_stamp_price_usd").eq("id", user.id).maybeSingle(),
      supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id),
      supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", user.id),
      supabase.from("live_streams").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setOrders(ord.data || []);
    setListings(list.data || []);
    setReviews(revs.data || []);
    const pp = prof.data as any;
    setPayoutStatus(pp?.stripe_onboarding_status || "not_started");
    setPweSettings({
      enabled: pp?.pwe_enabled ?? true,
      max: Number(pp?.pwe_max_order_value ?? 20),
      price: Number(pp?.pwe_price_usd ?? 0.99),
      stamp: Number(pp?.pwe_stamp_price_usd ?? 0.78),
    });
    setFollowers(fr.count || 0);
    setFollowing(fg.count || 0);
    setStreams(str.data || []);
  }
  useEffect(() => { load(); }, [user]);

  async function ship(o: any) {
    const tn = tracking[o.id];
    if (!tn) return toast.error("Add tracking number");
    const c = carrier[o.id] || null;
    const { error } = await supabase.from("orders").update({
      status: "shipped", tracking_number: tn, carrier: c, shipped_at: new Date().toISOString(),
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

  async function fetchRates(o: any) {
    const presetKey = preset[o.id] ?? suggestPreset({
      category: o.category, quantity: o.quantity, title: o.title,
      orderValueUsd: Number(o.amount || 0),
      pweEnabled: pweSettings.enabled, pweMaxOrderValue: pweSettings.max,
    });
    const p = SHIPPING_PRESETS[presetKey];
    if (!preset[o.id]) setPreset((s) => ({ ...s, [o.id]: presetKey }));

    // Stamp/PWE: untracked letter mail — Shippo doesn't sell these labels.
    if (p.flatRate) {
      const price = presetKey === "stamp" ? pweSettings.stamp : pweSettings.price;
      setRates((s) => ({ ...s, [o.id]: [{
        objectId: `flat-${presetKey}`,
        provider: "USPS",
        service: `${p.label} · untracked`,
        amount: price.toFixed(2),
        currency: "USD",
        days: presetKey === "stamp" ? 5 : 4,
        flat: true,
        untracked: true,
      }] }));
      setRecommended((s) => ({ ...s, [o.id]: `flat-${presetKey}` }));
      return;
    }

    setRatesLoading((s) => ({ ...s, [o.id]: true }));
    try {
      const res = await getShippoRates({
        data: { orderId: o.id, weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn },
      });
      setRates((s) => ({ ...s, [o.id]: res.rates }));
      setRecommended((s) => ({ ...s, [o.id]: res.recommendedRateId ?? null }));
      if (!res.rates.length) toast.error("No rates available — check addresses");
    } catch (e: any) {
      const msg = e.message || "Failed to fetch rates";
      if (msg.includes("seller shipping address")) {
        toast.error("Add your shipping address in your profile first", {
          action: { label: "Open profile", onClick: () => { window.location.href = "/profile"; } },
        });
      } else { toast.error(msg); }
    } finally {
      setRatesLoading((s) => ({ ...s, [o.id]: false }));
    }
  }

  async function buyLabel(o: any, rateId: string) {
    if (rateId.startsWith("flat-")) {
      // Flag the order as shipped via untracked letter mail.
      await supabase.from("orders").update({
        status: "shipped", carrier: "USPS (untracked)",
        shipped_at: new Date().toISOString(),
      }).eq("id", o.id);
      await supabase.from("notifications").insert({
        user_id: o.buyer_id, type: "order",
        body: `Your "${o.title}" was sent untracked via USPS letter mail. Allow 3–7 business days.`,
        link: "/orders",
      });
      toast.message("Marked as shipped (untracked). Drop in any USPS mailbox.", { duration: 6000 });
      load();
      return;
    }
    try {
      const res = await buyShippoLabel({ data: { orderId: o.id, rateId } });
      if (res.labelUrl) setLabelUrls((s) => ({ ...s, [o.id]: res.labelUrl }));
      toast.success("Label purchased — order shipped");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to buy label");
    }
  }

  async function savePweSettings() {
    if (!user) return;
    setSavingPwe(true);
    const { error } = await supabase.from("profiles").update({
      pwe_enabled: pweSettings.enabled,
      pwe_max_order_value: pweSettings.max,
      pwe_price_usd: pweSettings.price,
      pwe_stamp_price_usd: pweSettings.stamp,
    }).eq("id", user.id);
    setSavingPwe(false);
    if (error) return toast.error(error.message);
    toast.success("Shipping settings saved");
  }

  // Derived counts
  const counts = useMemo(() => {
    const o = orders;
    return {
      to_ship: o.filter((x) => x.status === "pending").length,
      shipped: o.filter((x) => x.status === "shipped").length,
      delivered: o.filter((x) => x.status === "delivered").length,
      cancelled: o.filter((x) => x.status === "cancelled" || x.payment_status === "refunded").length,
      active: listings.filter((l) => (l.auction_status || "active") === "active").length,
      draft: listings.filter((l) => l.auction_status === "draft").length,
      scheduled: listings.filter((l) => l.auction_status === "scheduled").length,
      sold: listings.filter((l) => l.auction_status === "sold" || l.auction_status === "ended").length,
      upcoming: streams.filter((s) => s.status === "scheduled").length,
      history: streams.filter((s) => s.status === "ended").length,
    };
  }, [orders, listings, streams]);

  const totals = useMemo(() => {
    const gross = orders.reduce((s, o) => s + Number(o.amount || 0), 0);
    const commission = gross * COMMISSION;
    const pending = orders.filter((o) => o.payment_status === "paid" && o.status !== "delivered")
      .reduce((s, o) => s + (Number(o.amount || 0) - Number(o.amount || 0) * COMMISSION), 0);
    return { gross, commission, net: gross - commission, pending };
  }, [orders]);

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
        <h1 className="text-xl font-bold">Seller Hub</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to manage your seller account.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  // Filtered orders by sub-tab
  const filteredOrders = orders.filter((o) =>
    ordersTab === "to_ship" ? o.status === "pending" :
    ordersTab === "shipped" ? o.status === "shipped" :
    ordersTab === "delivered" ? o.status === "delivered" :
    (o.status === "cancelled" || o.payment_status === "refunded")
  );

  const filteredListings = listings.filter((l) => {
    const s = l.auction_status || "active";
    if (listingsTab === "active") return s === "active";
    if (listingsTab === "draft") return s === "draft";
    if (listingsTab === "scheduled") return s === "scheduled";
    return s === "sold" || s === "ended";
  });

  const filteredStreams = streams.filter((s) =>
    liveTab === "upcoming" ? s.status === "scheduled" :
    liveTab === "history" ? s.status === "ended" :
    true
  );

  return (
    <AppShell>
      <div className="px-4 py-4 pb-24">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Seller Hub</h1>
            <p className="text-xs text-muted-foreground">Manage listings, orders, live streams, shipping & payouts</p>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span><span className="font-bold text-foreground">{followers}</span> followers</span>
              <span><span className="font-bold text-foreground">{following}</span> following</span>
            </div>
          </div>
          <Link to="/sell" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">+ New Listing</Link>
        </div>

        {/* Top KPIs */}
        <div className="mb-4 grid grid-cols-4 gap-2 rounded-xl bg-card p-3 text-center">
          <div><p className="text-[10px] text-muted-foreground">Gross</p><p className="text-sm font-bold">${totals.gross.toFixed(0)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Fees</p><p className="text-sm font-bold text-destructive">-${totals.commission.toFixed(0)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Net</p><p className="text-sm font-bold text-primary">${totals.net.toFixed(0)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Pending</p><p className="text-sm font-bold">${totals.pending.toFixed(0)}</p></div>
        </div>

        {payoutStatus !== "complete" && (
          <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-card p-3">
            <p className="text-sm font-bold">💳 Connect your payout account</p>
            <p className="mt-1 text-xs text-muted-foreground">Required to receive funds when live payments turn on. 5% platform commission.</p>
            <Link to="/payouts" className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Set up payouts</Link>
          </div>
        )}

        {/* Section nav */}
        <div className="mb-4 grid grid-cols-6 gap-1 rounded-xl bg-muted p-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.k}
                onClick={() => setSection(s.k)}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-semibold ${section === s.k ? "bg-background shadow" : "text-muted-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* LISTINGS */}
        {section === "listings" && (
          <>
            <SubTabs
              value={listingsTab}
              onChange={setListingsTab}
              tabs={[
                { k: "active", l: "Active", n: counts.active },
                { k: "draft", l: "Drafts", n: counts.draft },
                { k: "scheduled", l: "Scheduled", n: counts.scheduled },
                { k: "sold", l: "Sold Out", n: counts.sold },
              ]}
            />
            {filteredListings.length === 0 && (
              <div className="rounded-xl bg-card p-6 text-center">
                <StoreIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">Nothing here</p>
                <Link to="/sell" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Create a listing</Link>
              </div>
            )}
            <div className="space-y-3">
              {filteredListings.map((l) => (
                <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="flex items-start gap-3 rounded-xl bg-card p-3">
                  {l.image_url && <img src={l.image_url} alt={l.title} className="h-16 w-16 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{l.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.is_auction ? `Auction · $${Number(l.current_bid || 0).toFixed(2)}` : `Buy Now · $${Number(l.price || 0).toFixed(2)}`}
                      {l.shipping_price ? ` · +$${Number(l.shipping_price).toFixed(2)} ship` : ""}
                    </p>
                    <p className="text-[10px] capitalize text-muted-foreground">{l.auction_status || "active"}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* ORDERS */}
        {section === "orders" && (
          <>
            <SubTabs
              value={ordersTab}
              onChange={setOrdersTab}
              tabs={[
                { k: "to_ship", l: "Needs Shipping", n: counts.to_ship },
                { k: "shipped", l: "Shipped", n: counts.shipped },
                { k: "delivered", l: "Delivered", n: counts.delivered },
                { k: "cancelled", l: "Cancelled", n: counts.cancelled },
              ]}
            />
            {filteredOrders.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nothing here</p>}
            <div className="space-y-3">
              {filteredOrders.map((o) => {
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
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Ship to: {o.ship_name}, {o.ship_address}, {o.ship_city} {o.ship_state} {o.ship_zip}</p>
                    {o.tracking_number && <p className="text-[11px] text-primary">Tracking: {o.tracking_number}{o.carrier && ` · ${o.carrier}`}</p>}

                    {ordersTab === "to_ship" && o.payment_status !== "paid" && (
                      <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">Waiting for buyer to pay before you can ship.</p>
                    )}
                    {ordersTab === "to_ship" && o.payment_status === "paid" && (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-2">
                          <input value={tracking[o.id] || ""} onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })} placeholder="Tracking #" className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                          <input value={carrier[o.id] || ""} onChange={(e) => setCarrier({ ...carrier, [o.id]: e.target.value })} placeholder="Carrier" className="w-24 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                        </div>
                        <button onClick={() => ship(o)} className="w-full rounded-lg bg-muted py-2 text-xs font-bold">Manual: Mark as Shipped</button>
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold">📦 Buy shipping label</p>
                            <button onClick={() => fetchRates(o)} disabled={ratesLoading[o.id]} className="rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50">
                              {ratesLoading[o.id] ? "Loading..." : (rates[o.id] ? "Refresh" : "Get Rates")}
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-1">
                            {(Object.keys(SHIPPING_PRESETS) as ShippingPresetKey[])
                              .filter((k) => {
                                const p = SHIPPING_PRESETS[k];
                                if (!p.untracked) return true;
                                if (!pweSettings.enabled) return false;
                                // Auto-upgrade: hide untracked if order value above cap
                                return Number(o.amount || 0) <= pweSettings.max;
                              })
                              .map((k) => {
                                const p = SHIPPING_PRESETS[k];
                                const active = (preset[o.id] ?? suggestPreset({
                                  category: o.category, quantity: o.quantity, title: o.title,
                                  orderValueUsd: Number(o.amount || 0),
                                  pweEnabled: pweSettings.enabled, pweMaxOrderValue: pweSettings.max,
                                })) === k;
                                const flatPrice = k === "stamp" ? pweSettings.stamp : pweSettings.price;
                                return (
                                  <button
                                    key={k}
                                    onClick={() => { setPreset((s) => ({ ...s, [o.id]: k })); setRates((s) => ({ ...s, [o.id]: [] })); }}
                                    className={`rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                                    title={p.description}
                                  >
                                    {p.label}
                                    <div className="text-[9px] opacity-75">
                                      {p.flatRate ? `~$${flatPrice.toFixed(2)} · untracked` : `${p.weightOz}oz · tracked`}
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                          {rates[o.id]?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {rates[o.id].slice(0, 6).map((r: any) => {
                                const isRec = recommended[o.id] === r.objectId;
                                return (
                                  <button
                                    key={r.objectId}
                                    onClick={() => buyLabel(o, r.objectId)}
                                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] ${isRec ? "border border-primary bg-primary/15" : "bg-card hover:bg-muted"}`}
                                  >
                                    <span className="font-semibold">
                                      {isRec && <span className="mr-1 rounded bg-primary px-1 py-0.5 text-[9px] font-bold text-primary-foreground">CHEAPEST</span>}
                                      <span className={`mr-1 rounded px-1 py-0.5 text-[9px] font-bold ${r.untracked ? "bg-amber-500/20 text-amber-600" : "bg-emerald-500/20 text-emerald-600"}`}>
                                        {r.untracked ? "UNTRACKED" : "TRACKED"}
                                      </span>
                                      {r.provider} · {r.service}
                                    </span>
                                    <span className="font-bold text-primary">${r.amount}{r.days ? ` · ${r.days}d` : ""}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {labelUrls[o.id] && (
                            <a href={labelUrls[o.id]} target="_blank" rel="noreferrer" className="mt-2 block rounded-md bg-primary py-1.5 text-center text-[11px] font-bold text-primary-foreground">Download Label PDF</a>
                          )}
                        </div>
                      </div>
                    )}
                    {ordersTab === "shipped" && (
                      <button onClick={() => markDelivered(o)} className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Mark Delivered</button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* LIVE */}
        {section === "live" && (
          <>
            <SubTabs
              value={liveTab}
              onChange={setLiveTab}
              tabs={[
                { k: "upcoming", l: "Upcoming", n: counts.upcoming },
                { k: "history", l: "History", n: counts.history },
                { k: "tools", l: "Tools" },
              ]}
            />
            {liveTab !== "tools" && (
              <div className="space-y-3">
                {filteredStreams.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No streams</p>}
                {filteredStreams.map((s) => (
                  <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="flex items-start gap-3 rounded-xl bg-card p-3">
                    {s.thumbnail_url && <img src={s.thumbnail_url} alt={s.title} className="h-16 w-20 rounded-lg object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{s.title}</p>
                      <p className="text-[11px] capitalize text-muted-foreground">{s.stream_type} · {s.status}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {liveTab === "tools" && (
              <div className="space-y-2">
                <Link to="/sell" className="block rounded-xl bg-card p-3 text-sm font-semibold">🎬 Go Live</Link>
                <Link to="/obs-hub" className="block rounded-xl bg-card p-3 text-sm font-semibold">🎛️ OBS / Flex Live Hub</Link>
                <div className="rounded-xl bg-card p-3 text-xs text-muted-foreground">
                  <p className="font-bold text-foreground">Live shipping controls</p>
                  Switch package presets (PWE / Bubble / Box) directly from the host bar in any live stream — buyer totals recalc when the stream ends.
                </div>
              </div>
            )}
          </>
        )}

        {/* SHIPPING */}
        {section === "shipping" && (
          <>
            <SubTabs
              value={shippingTab}
              onChange={setShippingTab}
              tabs={[
                { k: "presets", l: "Presets" },
                { k: "auto", l: "Auto" },
                { k: "combined", l: "Combined" },
                { k: "caps", l: "Caps" },
                { k: "carriers", l: "Carriers" },
              ]}
            />
            {shippingTab === "presets" && (
              <div className="space-y-2">
                {(Object.keys(SHIPPING_PRESETS) as ShippingPresetKey[]).map((k) => {
                  const p = SHIPPING_PRESETS[k];
                  return (
                    <div key={k} className="rounded-xl bg-card p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold">{p.label}</p>
                        {p.flatRate
                          ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">~${p.flatPriceUsd?.toFixed(2)} flat</span>
                          : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{p.weightOz} oz · {p.lengthIn}×{p.widthIn}×{p.heightIn}"</span>}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{p.description}</p>
                    </div>
                  );
                })}
                <p className="px-1 text-[11px] text-muted-foreground">Custom saved presets are coming soon — currently using these defaults.</p>
              </div>
            )}
            {shippingTab === "auto" && (
              <div className="rounded-xl bg-card p-4 text-sm">
                <p className="font-bold">Auto Shipping Mode</p>
                <p className="mt-1 text-xs text-muted-foreground">Automatically pick the cheapest USPS rate based on the package preset for each order. Currently always on for label purchases — manual override available per order.</p>
              </div>
            )}
            {shippingTab === "combined" && (
              <div className="rounded-xl bg-card p-4 text-sm">
                <p className="font-bold">Combined Shipping</p>
                <p className="mt-1 text-xs text-muted-foreground">When a buyer wins multiple items in one stream, orders are grouped by stream so you can ship them together. Combined-cap rules coming next.</p>
              </div>
            )}
            {shippingTab === "caps" && (
              <div className="rounded-xl bg-card p-4 text-sm">
                <p className="font-bold">Shipping Caps</p>
                <p className="mt-1 text-xs text-muted-foreground">Set max shipping per buyer / per stream so buyers aren't overcharged on multi-wins. UI for custom caps coming soon — defaults: PWE caps at $3, Bubble at $6, Box at $12.</p>
              </div>
            )}
            {shippingTab === "carriers" && (
              <div className="rounded-xl bg-card p-4 text-sm">
                <p className="font-bold">Default Carriers</p>
                <p className="mt-1 text-xs text-muted-foreground">USPS Ground Advantage is prioritized for lightweight TCG shipments. UPS / FedEx will be added for heavier boxes.</p>
              </div>
            )}
          </>
        )}

        {/* PAYOUTS */}
        {section === "payouts" && (
          <>
            <SubTabs
              value={payoutsTab}
              onChange={setPayoutsTab}
              tabs={[
                { k: "pending", l: "Pending" },
                { k: "completed", l: "Completed" },
                { k: "fees", l: "Fees & Tax" },
              ]}
            />
            {payoutsTab === "pending" && (
              <div className="rounded-xl bg-card p-4 text-sm">
                <p className="font-bold">Pending payout</p>
                <p className="mt-1 text-2xl font-bold text-primary">${totals.pending.toFixed(2)}</p>
                <p className="mt-1 text-xs text-muted-foreground">From paid orders not yet delivered. Funds release after delivery confirmation.</p>
                <Link to="/payouts" className="mt-3 inline-block rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Manage payouts</Link>
              </div>
            )}
            {payoutsTab === "completed" && (
              <div className="rounded-xl bg-card p-4 text-sm">
                <p className="font-bold">Lifetime net</p>
                <p className="mt-1 text-2xl font-bold text-primary">${totals.net.toFixed(2)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Across {orders.length} order{orders.length === 1 ? "" : "s"}.</p>
              </div>
            )}
            {payoutsTab === "fees" && (
              <div className="space-y-2">
                <div className="rounded-xl bg-card p-3 text-sm flex justify-between"><span>Gross sales</span><span className="font-bold">${totals.gross.toFixed(2)}</span></div>
                <div className="rounded-xl bg-card p-3 text-sm flex justify-between"><span>Platform commission (5%)</span><span className="font-bold text-destructive">-${totals.commission.toFixed(2)}</span></div>
                <div className="rounded-xl bg-card p-3 text-sm flex justify-between"><span>Net to seller</span><span className="font-bold text-primary">${totals.net.toFixed(2)}</span></div>
                <p className="px-1 text-[11px] text-muted-foreground">Tax forms (1099-K) issued at year end if you exceed reporting thresholds.</p>
              </div>
            )}
          </>
        )}

        {/* REVIEWS */}
        {section === "reviews" && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-card p-3">
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
          </>
        )}
      </div>
    </AppShell>
  );
}
