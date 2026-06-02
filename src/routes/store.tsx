import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { refundOrderAction } from "@/lib/order-actions.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import {
  Package, Truck, CheckCircle2, Star, Store as StoreIcon,
  ListChecks, Radio, DollarSign, MessageSquare, Box, XCircle,
  AlertTriangle, RotateCcw, ScanLine, ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRealtimeChannel } from "@/lib/realtime";
import { toast } from "sonner";
import { getShippoRates, buyShippoLabel } from "@/lib/shippo.functions";
import { SHIPPING_PRESETS, suggestPreset, type ShippingPresetKey } from "@/lib/shippingPresets";
import { OrderCancellation } from "@/components/OrderCancellation";
import { getListingPriceDisplay } from "@/lib/listingDisplay";
import { useTutorialMode } from "@/lib/tutorialMode";
import { demoListings, demoOrders, demoSellerAnalytics } from "@/lib/tutorialDemoData";
import { LiveNowPill } from "@/components/ReturnToLiveBadge";
import { SellerEarningsHub } from "@/components/SellerEarningsHub";

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

function PaymentStatusBadge({ s }: { s: string }) {
  const map: Record<string, { l: string; cls: string }> = {
    awaiting_payment: { l: "Awaiting", cls: "bg-amber-500/15 text-amber-400" },
    processing: { l: "Processing", cls: "bg-sky-500/15 text-sky-400" },
    paid: { l: "Paid", cls: "bg-primary/15 text-primary" },
    failed: { l: "Failed", cls: "bg-destructive/15 text-destructive" },
    chargeback: { l: "Chargeback", cls: "bg-destructive/20 text-destructive" },
    refunded: { l: "Refunded", cls: "bg-muted text-muted-foreground" },
    resolved: { l: "Resolved", cls: "bg-emerald-500/15 text-emerald-400" },
  };
  const v = map[s] || map.awaiting_payment;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${v.cls}`}>{v.l}</span>;
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

function KpiCard({ label, value, tone, onClick }: { label: string; value: string; tone?: "primary" | "destructive" | "amber"; onClick: () => void }) {
  const valueCls = tone === "destructive" ? "text-destructive" : tone === "amber" ? "text-amber-400" : tone === "primary" ? "text-primary" : "";
  const wrapCls = tone === "primary" ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40";
  const labelCls = tone === "primary" ? "text-primary/80" : "text-muted-foreground";
  return (
    <button onClick={onClick} className={`rounded-lg p-2 text-center transition hover:brightness-110 active:scale-[0.98] ${wrapCls}`}>
      <p className={`text-[10px] uppercase tracking-wider ${labelCls}`}>{label}</p>
      <p className={`text-base font-black tabular-nums ${valueCls}`}>{value}</p>
    </button>
  );
}

type KpiKey = "gross" | "fees" | "net" | "pending" | "refund" | "cancelled";

const KPI_TITLES: Record<KpiKey, string> = {
  gross: "Gross Sales", fees: "Platform Fees", net: "Net Earnings",
  pending: "Pending (paid, not delivered)", refund: "Refunds", cancelled: "Cancelled Orders",
};

function KpiDrillModal({
  open, onClose, orders, buyerMap,
}: {
  open: KpiKey | null;
  onClose: () => void;
  orders: any[];
  buyerMap: Record<string, { u: string; n: string }>;
}) {
  const COMM = 0.05;
  const [q, setQ] = useState("");
  const [month, setMonth] = useState<string>("all"); // "all" or "YYYY-MM"

  useEffect(() => { if (open) { setQ(""); setMonth("all"); } }, [open]);

  const base = open == null ? [] : orders.filter((o) => {
    if (open === "refund") return o.payment_status === "refunded";
    if (open === "cancelled") return o.status === "cancelled";
    if (open === "pending") return o.payment_status === "paid" && o.status !== "delivered" && o.status !== "cancelled";
    // gross/fees/net: all non-cancelled, non-refunded charged orders
    return o.status !== "cancelled" && o.payment_status !== "refunded";
  });

  // Month options derived from this category's full history.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const o of base) {
      if (!o.created_at) continue;
      const d = new Date(o.created_at);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(set).sort().reverse();
  }, [base]);

  const list = base.filter((o) => {
    if (month !== "all") {
      const d = o.created_at ? new Date(o.created_at) : null;
      const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
      if (key !== month) return false;
    }
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const buyer = buyerMap[o.buyer_id];
      const hay = [
        o.title, o.order_number, o.id, o.tracking_number, o.ship_name,
        buyer?.u, buyer?.n,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const isCompleted = (o: any) => o.status === "delivered";

  const fmtMonth = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  };

  return (
    <Dialog open={open != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{open ? KPI_TITLES[open] : ""}</DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Tile totals reset every 7 days · full history below
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, order #, buyer…"
            className="flex-1 rounded-md bg-muted/40 px-3 py-2 text-xs outline-none ring-1 ring-border focus:ring-primary"
          />
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md bg-muted/40 px-3 py-2 text-xs outline-none ring-1 ring-border focus:ring-primary"
          >
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>{fmtMonth(m)}</option>
            ))}
          </select>
        </div>

        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No orders match.</p>
        ) : (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {list.map((o) => {
              const amt = Number(o.amount || 0);
              const fee = amt * COMM;
              const buyer = buyerMap[o.buyer_id];
              const completed = isCompleted(o);
              return (
                <li key={o.id} className="rounded-lg bg-muted/40 p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{o.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        @{buyer?.u ?? "buyer"}{buyer?.n ? ` · ${buyer.n}` : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleString()}
                        {o.order_number ? ` · #${o.order_number}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums">${amt.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {open === "fees" ? `Fee -$${fee.toFixed(2)}` :
                         open === "net" ? `Net $${(amt - fee).toFixed(2)}` :
                         o.status}
                      </p>
                    </div>
                  </div>
                  {completed && (
                    <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                      <p className="font-semibold text-foreground">Completed · delivered</p>
                      {o.ship_name && <p>Ship to: {o.ship_name}</p>}
                      {o.tracking_number && <p>Tracking: {o.tracking_number}</p>}
                      {o.delivered_at && <p>Delivered {new Date(o.delivered_at).toLocaleDateString()}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SellerHub() {
  const { user } = useAuth();
  const tutorial = useTutorialMode();

  // Data
  const [orders, setOrders] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [payoutStatus, setPayoutStatus] = useState<string>("not_started");
  const [sellerStanding, setSellerStanding] = useState<{ payout_hold?: boolean; late_shipment_count?: number; visibility_penalty_until?: string | null; selling_restricted_until?: string | null }>({});
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [pweSettings, setPweSettings] = useState({ enabled: true, max: 20, price: 0.99, stamp: 0.78 });
  const [savingPwe, setSavingPwe] = useState(false);

  // UI
  const [section, setSection] = useState<Section>("orders");
  const [listingsTab, setListingsTab] = useState<"active" | "draft" | "scheduled" | "sold">("active");
  const [ordersTab, setOrdersTab] = useState<"to_ship" | "shipped" | "delivered" | "failed">("to_ship");
  const [kpiOpen, setKpiOpen] = useState<null | "gross" | "fees" | "net" | "pending" | "refund" | "cancelled">(null);
  const [buyerMap, setBuyerMap] = useState<Record<string, { u: string; n: string }>>({});
  const [liveTab, setLiveTab] = useState<"upcoming" | "history" | "tools">("upcoming");
  const [shippingTab, setShippingTab] = useState<"presets" | "auto" | "combined" | "caps" | "carriers">("presets");
  

  // Per-order shipping label state
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState<Record<string, string>>({});
  const [rates, setRates] = useState<Record<string, any[]>>({});
  const [ratesLoading, setRatesLoading] = useState<Record<string, boolean>>({});
  const [labelUrls, setLabelUrls] = useState<Record<string, string>>({});
  const [preset, setPreset] = useState<Record<string, ShippingPresetKey>>({});
  const [cancelOrder, setCancelOrder] = useState<any | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const refundOrderServer = useServerFn(refundOrderAction);

  async function refundBuyer(o: any) {
    if (!window.confirm(`Refund $${Number((o.amount || 0) + (o.shipping_amount || 0)).toFixed(2)} to ${o.ship_name || "the buyer"}? This pulls funds back from your payout and cannot be undone.`)) return;
    setRefunding(o.id);
    try {
      const res = await refundOrderServer({ data: { orderId: o.id, reason: "Seller-issued refund" } });
      if (res?.refunded) {
        toast.success("Refund issued — buyer notified");
        load();
      } else {
        toast.error(res?.reason ?? "Refund failed");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Refund failed");
    } finally {
      setRefunding(null);
    }
  }
  const [recommended, setRecommended] = useState<Record<string, string | null>>({});
  const [scanCode, setScanCode] = useState<Record<string, string>>({});

  async function load() {
    if (!user) return;
    if (tutorial) {
      setOrders(demoOrders.map((o) => ({ ...o, title: demoListings.find((l) => l.id === o.listing_id)?.title ?? "Demo order", amount: o.total_cents / 100, status: o.status === "paid" ? "pending" : o.status, payment_status: "paid", buyer_id: o.buyer, category: "pokemon", quantity: 1 })));
      setListings(demoListings.map((l) => ({ ...l, price: l.price_cents / 100, auction_status: "active", status: "active", image_url: null })));
      setReviews([{ id: "r1", rating: 5, body: "Fast shipping and clean packaging.", buyer_username: "card_hunter22", created_at: new Date().toISOString() }]);
      setPayoutStatus("complete");
      setFollowers(demoSellerAnalytics.followers);
      setFollowing(84);
      setStreams([{ id: "demo-stream", title: "Friday Night Vintage Pulls 🔥", status: "live", mode: "auction", current_bid: 2850, viewers: 247, created_at: new Date().toISOString() }]);
      return;
    }
    const [ord, list, revs, prof, fr, fg, str] = await Promise.all([
      supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("listings").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("seller_reviews").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("stripe_onboarding_status, pwe_enabled, pwe_max_order_value, pwe_price_usd, pwe_stamp_price_usd, payout_hold, late_shipment_count, visibility_penalty_until, selling_restricted_until").eq("id", user.id).maybeSingle(),
      supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id),
      supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", user.id),
      supabase.from("live_streams").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    const ordersData = ord.data || [];
    // Resolve buyer usernames in one batch so we can show them on each order card
    const buyerIds = Array.from(new Set(ordersData.map((o: any) => o.buyer_id).filter(Boolean)));
    let buyerMap: Record<string, string> = {};
    if (buyerIds.length) {
      const { data: bp } = await supabase.from("profiles").select("id, username").in("id", buyerIds);
      buyerMap = Object.fromEntries((bp || []).map((p: any) => [p.id, p.username || ""]));
    }
    setOrders(ordersData.map((o: any) => ({ ...o, buyer_username: buyerMap[o.buyer_id] || o.buyer_username || "" })));
    setListings(list.data || []);
    setReviews(revs.data || []);
    const pp = prof.data as any;
    setPayoutStatus(pp?.stripe_onboarding_status || "not_started");
    setSellerStanding({
      payout_hold: pp?.payout_hold ?? false,
      late_shipment_count: pp?.late_shipment_count ?? 0,
      visibility_penalty_until: pp?.visibility_penalty_until ?? null,
      selling_restricted_until: pp?.selling_restricted_until ?? null,
    });
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
  useEffect(() => { load(); }, [user, tutorial]);

  // Realtime: refresh seller hub on any of this seller's order changes
  useRealtimeChannel(
    { name: `seller-orders-${user?.id ?? "anon"}`, enabled: !!user && !tutorial },
    (ch) => ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders", filter: `seller_id=eq.${user?.id}` },
      () => load(),
    ),
  );

  async function verifyShipment(o: any) {
    const code = (scanCode[o.id] || "").trim();
    if (!code) return toast.error("Scan or enter the item barcode/QR");
    const { error } = await supabase.from("orders").update({
      shipment_verification_code: code,
      shipment_verified_at: new Date().toISOString(),
    }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Item verified — ready to ship");
    load();
  }

  async function markResolved(o: any) {
    const { error } = await supabase.from("orders").update({
      payment_status: "resolved",
    }).eq("id", o.id);
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: o.buyer_id, type: "order",
      body: `Payment for "${o.title}" was marked resolved by the seller.`,
      link: "/orders",
    });
    toast.success("Marked resolved");
    load();
  }

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
      to_ship: o.filter((x) => x.status === "pending" && !["failed", "chargeback"].includes(x.payment_status)).length,
      shipped: o.filter((x) => x.status === "shipped").length,
      delivered: o.filter((x) => x.status === "delivered").length,
      failed: o.filter((x) => ["failed", "chargeback"].includes(x.payment_status)).length,
      refunds: o.filter((x) => x.payment_status === "refunded").length,
      cancelled: o.filter((x) => x.status === "cancelled").length,
      active: listings.filter((l) => (l.auction_status || "active") === "active").length,
      draft: listings.filter((l) => l.auction_status === "draft").length,
      scheduled: listings.filter((l) => l.auction_status === "scheduled").length,
      sold: listings.filter((l) => l.auction_status === "sold" || l.auction_status === "ended").length,
      upcoming: streams.filter((s) => s.status === "scheduled").length,
      history: streams.filter((s) => s.status === "ended").length,
    };
  }, [orders, listings, streams]);

  // Rolling 7-day window for KPI tiles. Tiles "reset" weekly but full
  // history is still available inside the drill-down modal.
  const totals = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    const recent = orders.filter((o) => {
      const t = o.created_at ? new Date(o.created_at).getTime() : 0;
      return t >= cutoff;
    });
    // Gross excludes refunded + cancelled orders entirely.
    const grossOrders = recent.filter(
      (o) => o.status !== "cancelled" && o.payment_status !== "refunded",
    );
    const gross = grossOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
    const commission = gross * COMMISSION;
    const pending = recent.filter(
      (o) => o.payment_status === "paid" && o.status !== "delivered" && o.status !== "cancelled",
    ).reduce((s, o) => s + (Number(o.amount || 0) - Number(o.amount || 0) * COMMISSION), 0);
    const refund = recent.filter((o) => o.payment_status === "refunded")
      .reduce((s, o) => s + Number(o.refunded_amount || o.amount || 0), 0);
    const cancelled = recent.filter((o) => o.status === "cancelled")
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    return { gross, commission, net: gross - commission, pending, refund, cancelled };
  }, [orders]);

  // Load buyer usernames/names for the KPI drill-down modal
  useEffect(() => {
    const ids = Array.from(new Set(orders.map((o) => o.buyer_id).filter(Boolean)));
    if (ids.length === 0) return;
    supabase.from("profiles").select("id,username,full_name").in("id", ids).then(({ data }) => {
      const m: Record<string, { u: string; n: string }> = {};
      (data ?? []).forEach((p: any) => { m[p.id] = { u: p.username || "buyer", n: p.full_name || "" }; });
      setBuyerMap(m);
    });
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
    ordersTab === "to_ship" ? (o.status === "pending" && !["failed", "chargeback"].includes(o.payment_status)) :
    ordersTab === "shipped" ? o.status === "shipped" :
    ordersTab === "delivered" ? o.status === "delivered" :
    ["failed", "chargeback"].includes(o.payment_status)
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
        <LiveNowPill />
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
          <div className="flex flex-col items-end gap-1.5">
            <Link to="/sell" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">+ New Listing</Link>
            <Link to="/seller/shipping" className="rounded-lg bg-muted px-3 py-1.5 text-[11px] font-bold">📦 Shipping prep</Link>
          </div>
        </div>

        {/* Top KPIs — rolling 7-day totals; click any tile for full history */}
        <div className="mb-1 flex items-center justify-between px-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last 7 days</p>
          <p className="text-[10px] text-muted-foreground">Tap any tile for full history</p>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-card p-3 sm:grid-cols-6">
          <KpiCard label="Gross" value={`$${totals.gross.toFixed(0)}`} onClick={() => setKpiOpen("gross")} />
          <KpiCard label="Fees" value={`-$${totals.commission.toFixed(0)}`} tone="destructive" onClick={() => setKpiOpen("fees")} />
          <KpiCard label="Net" value={`$${totals.net.toFixed(0)}`} tone="primary" onClick={() => setKpiOpen("net")} />
          <KpiCard label="Pending" value={`$${totals.pending.toFixed(0)}`} onClick={() => setKpiOpen("pending")} />
          <KpiCard label="Refund" value={`$${totals.refund.toFixed(0)}`} tone="amber" onClick={() => setKpiOpen("refund")} />
          <KpiCard label="Cancelled" value={`$${totals.cancelled.toFixed(0)}`} tone="destructive" onClick={() => setKpiOpen("cancelled")} />
        </div>

        {!tutorial && payoutStatus !== "complete" && (
          <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-card p-3">
            <p className="text-sm font-bold">💳 Connect your payout account</p>
            <p className="mt-1 text-xs text-muted-foreground">Required to receive funds when live payments turn on. 5% platform commission.</p>
            <Link to="/payouts" className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Set up payouts</Link>
          </div>
        )}

        {(sellerStanding.payout_hold || (sellerStanding.visibility_penalty_until && new Date(sellerStanding.visibility_penalty_until) > new Date()) || (sellerStanding.selling_restricted_until && new Date(sellerStanding.selling_restricted_until) > new Date())) && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
            <p className="text-sm font-bold text-red-400">⚠️ Seller standing alert</p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-red-200/90">
              {sellerStanding.payout_hold && <li>• Payouts are temporarily on hold for unshipped orders. Ship or refund pending items to restore.</li>}
              {sellerStanding.visibility_penalty_until && new Date(sellerStanding.visibility_penalty_until) > new Date() && (
                <li>• PB Store visibility reduced until {new Date(sellerStanding.visibility_penalty_until).toLocaleDateString()} due to repeated late shipments.</li>
              )}
              {sellerStanding.selling_restricted_until && new Date(sellerStanding.selling_restricted_until) > new Date() && (
                <li>• Selling temporarily restricted until {new Date(sellerStanding.selling_restricted_until).toLocaleDateString()}.</li>
              )}
              {(sellerStanding.late_shipment_count ?? 0) > 0 && <li>• Late shipments on record: {sellerStanding.late_shipment_count}</li>}
            </ul>
          </div>
        )}

        {/* Section nav — horizontal scroll pills, easier to read on phones */}
        <div className="mb-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.k;
            return (
              <button
                key={s.k}
                onClick={() => setSection(s.k)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${active ? "bg-primary text-primary-foreground shadow" : "bg-card text-muted-foreground ring-1 ring-border"}`}
              >
                <Icon className="h-3.5 w-3.5" />
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
              {filteredListings.map((l) => {
                const display = getListingPriceDisplay(l);
                const saleLabel = display.kind === "offer" ? "Make Offer" : l.is_auction ? `Auction · ${display.label}` : `Buy Now · ${display.label}`;
                return (
                  <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="flex items-start gap-3 rounded-xl bg-card p-3">
                    {l.image_url && <img src={l.image_url} alt={l.title} className="h-16 w-16 rounded-lg object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{l.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {saleLabel}
                        {l.shipping_price ? ` · +$${Number(l.shipping_price).toFixed(2)} ship` : ""}
                      </p>
                      <p className="text-[10px] capitalize text-muted-foreground">{l.auction_status || "active"}</p>
                    </div>
                  </Link>
                );
              })}
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
                { k: "failed", l: "Failed", n: counts.failed },
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
                        {o.order_number && (
                          <span className="mb-1 inline-block rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary" title="Order number">
                            {o.order_number}
                          </span>
                        )}
                        <p className="truncate text-sm font-bold">
                          {o.auction_number && o.stream_id && (
                            <span className="mr-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">#{o.auction_number}</span>
                          )}
                          {o.title}
                        </p>
                        <p className="text-xs font-semibold text-primary">${amount.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">Fee ${fee.toFixed(2)} · Net <span className="font-bold text-primary">${net.toFixed(2)}</span></p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold capitalize">
                          <StatusIcon s={o.status} /> {o.status}
                        </span>
                        <PaymentStatusBadge s={o.payment_status} />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Buyer: <span className="font-semibold text-foreground">@{o.buyer_username || "unknown"}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">Ship to: {o.ship_name}, {o.ship_address}, {o.ship_city} {o.ship_state} {o.ship_zip}</p>
                    {o.is_giveaway && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold text-fuchsia-300">
                        🎁 Giveaway shipment · host pays shipping
                      </p>
                    )}
                    {o.tracking_number && <p className="text-[11px] text-primary">Tracking: {o.tracking_number}{o.carrier && ` · ${o.carrier}`}</p>}
                    {o.label_url && (
                      <button
                        onClick={() => {
                          const w = window.open(o.label_url, "_blank", "noopener,noreferrer");
                          // best-effort auto-print once the PDF loads
                          try { w?.addEventListener?.("load", () => w?.print?.()); } catch {}
                        }}
                        className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground"
                      >
                        🖨️ Print Label
                      </button>
                    )}

                    {ordersTab === "to_ship" && o.payment_status === "paid" && o.shipping_due_at && (() => {
                      const dueMs = new Date(o.shipping_due_at).getTime() - Date.now();
                      const hrs = Math.round(dueMs / 3_600_000);
                      if (o.is_late_shipment || dueMs < 0) {
                        return (
                          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
                            ⚠️ Late · was due {new Date(o.shipping_due_at).toLocaleDateString()}
                            {o.payout_held && " · payout on hold"}
                          </p>
                        );
                      }
                      return (
                        <p className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${hrs <= 24 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/10 text-emerald-400"}`}>
                          📦 Ship by {new Date(o.shipping_due_at).toLocaleDateString()}
                          {hrs > 0 ? ` · ${hrs}h left` : ""}
                        </p>
                      );
                    })()}

                    {ordersTab === "to_ship" && o.payment_status !== "paid" && (
                      <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">Waiting for buyer to pay before you can ship.</p>
                    )}
                    {ordersTab === "to_ship" && o.payment_status === "paid" && !o.shipment_verified_at && (
                      <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
                        <p className="text-[11px] font-bold text-amber-300">🔍 Scan to verify item</p>
                        <p className="mb-2 text-[10px] text-amber-200/80">Scan or type the item barcode/QR to confirm you're shipping the correct item. Required before printing labels.</p>
                        <div className="flex gap-2">
                          <input
                            value={scanCode[o.id] || ""}
                            onChange={(e) => setScanCode({ ...scanCode, [o.id]: e.target.value })}
                            placeholder="Item code / barcode"
                            className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none"
                          />
                          <button onClick={() => verifyShipment(o)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Verify</button>
                        </div>
                      </div>
                    )}
                    {ordersTab === "to_ship" && o.payment_status === "paid" && o.shipment_verified_at && (
                      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        ✅ Item verified · code {String(o.shipment_verification_code || "").slice(0, 12)}
                      </p>
                    )}
                    {ordersTab === "to_ship" && o.payment_status === "paid" && o.shipment_verified_at && (
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
                    {ordersTab === "failed" && o.payment_status !== "resolved" && (
                      <button
                        onClick={() => markResolved(o)}
                        className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground"
                      >
                        Mark resolved
                      </button>
                    )}
                    {(ordersTab === "to_ship" || ordersTab === "shipped") && (
                      <button
                        onClick={() => setCancelOrder(o)}
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-muted py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel order
                      </button>
                    )}
                    {o.payment_status === "paid" && o.status !== "cancelled" && (
                      <button
                        onClick={() => refundBuyer(o)}
                        disabled={refunding === o.id}
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-destructive/15 py-2 text-[11px] font-bold text-destructive hover:bg-destructive/25 disabled:opacity-60"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {refunding === o.id ? "Refunding…" : `Refund buyer ($${Number((o.amount || 0) + (o.shipping_amount || 0)).toFixed(2)})`}
                      </button>
                    )}
                    {o.payment_status === "refunded" && (
                      <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-center text-[11px] font-semibold text-muted-foreground">
                        ✓ Refunded to buyer
                      </div>
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
                <Link to="/obs-hub" className="block rounded-xl bg-gradient-to-br from-live/15 to-primary/15 border border-live/40 p-3 text-sm font-bold">
                  📡 Go Live in Browser <span className="ml-1 rounded-full bg-live px-2 py-0.5 text-[10px] text-live-foreground">NEW</span>
                  <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">Stream straight from this device — no OBS needed.</p>
                </Link>
                <Link to="/sell" className="block rounded-xl bg-card p-3 text-sm font-semibold">🎬 Go Live (Quick Start)</Link>
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
                <div className="rounded-xl border border-primary/30 bg-card p-3 space-y-2">
                  <p className="text-sm font-bold">Economy / PWE settings</p>
                  <p className="text-[11px] text-muted-foreground">Control untracked stamp & PWE shipping for low-value cards. Orders above the cap automatically upgrade to a tracked option.</p>
                  <label className="flex items-center justify-between text-xs">
                    <span>Offer untracked stamp / PWE</span>
                    <input
                      type="checkbox"
                      checked={pweSettings.enabled}
                      onChange={(e) => setPweSettings({ ...pweSettings, enabled: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-muted-foreground">Max order value for untracked ($)</span>
                    <input
                      type="number" min={0} step="1"
                      value={pweSettings.max}
                      onChange={(e) => setPweSettings({ ...pweSettings, max: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg bg-input px-3 py-2 outline-none"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs">
                      <span className="text-muted-foreground">Stamp price ($)</span>
                      <input
                        type="number" min={0} step="0.01"
                        value={pweSettings.stamp}
                        onChange={(e) => setPweSettings({ ...pweSettings, stamp: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg bg-input px-3 py-2 outline-none"
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="text-muted-foreground">PWE price ($)</span>
                      <input
                        type="number" min={0} step="0.01"
                        value={pweSettings.price}
                        onChange={(e) => setPweSettings({ ...pweSettings, price: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg bg-input px-3 py-2 outline-none"
                      />
                    </label>
                  </div>
                  <button
                    onClick={savePweSettings}
                    disabled={savingPwe}
                    className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {savingPwe ? "Saving..." : "Save shipping settings"}
                  </button>
                </div>
                <p className="px-1 text-[11px] text-muted-foreground">Stamp / PWE are untracked letter mail and aren't sold via Shippo — drop in any USPS mailbox with the appropriate postage.</p>
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

        {/* PAYOUTS / EARNINGS */}
        {section === "payouts" && (
          <SellerEarningsHub orders={orders as any} />
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
      {cancelOrder && (
        <OrderCancellation
          order={cancelOrder}
          role="seller"
          onClose={() => setCancelOrder(null)}
          onChanged={load}
        />
      )}
      <KpiDrillModal open={kpiOpen} onClose={() => setKpiOpen(null)} orders={orders} buyerMap={buyerMap} />
    </AppShell>
  );
}
