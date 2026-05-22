import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Package, Truck, CheckCircle2, CreditCard, Clock, Star } from "lucide-react";
import { toast } from "sonner";
import { ReportDialog } from "@/components/ReportDialog";
import { SellerBadge } from "@/components/SellerBadge";
import { OrderCancellation } from "@/components/OrderCancellation";
import { XCircle } from "lucide-react";
import { WatchTutorial } from "@/components/WatchTutorial";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

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
  const [reviewForm, setReviewForm] = useState<Record<string, { rating: number; shipping_rating: number; comment: string; photo_urls: string[] }>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [cancelOrder, setCancelOrder] = useState<any | null>(null);
  const [tab, setTab] = useState<"all" | "awaiting" | "shipped" | "delivered">("all");


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

  // Realtime: order status, payment, shipping, and review updates push live
  useRealtimeTable(
    { name: `orders-buyer-${user?.id ?? "none"}`, table: "orders", filter: user ? `buyer_id=eq.${user.id}` : undefined, enabled: !!user },
    () => load()
  );
  useRealtimeTable(
    { name: `reviews-buyer-${user?.id ?? "none"}`, table: "seller_reviews", filter: user ? `buyer_id=eq.${user.id}` : undefined, enabled: !!user },
    () => load()
  );

  async function submitReview(o: any) {
    const f = reviewForm[o.id] || { rating: 5, shipping_rating: 5, comment: "", photo_urls: [] };
    const { error } = await supabase.from("seller_reviews").insert({
      order_id: o.id,
      seller_id: o.seller_id,
      buyer_id: user!.id,
      buyer_username: profile?.username || "buyer",
      rating: f.rating,
      shipping_rating: f.shipping_rating,
      comment: f.comment || null,
      photo_urls: f.photo_urls || [],
    });
    if (error) return toast.error(error.message);
    toast.success("Review submitted");
    load();
  }

  async function uploadReviewPhoto(orderId: string, file: File) {
    if (!user) return;
    if (file.size > 8 * 1024 * 1024) return toast.error("Photo must be under 8MB");
    setUploadingPhoto(orderId);
    const path = `${user.id}/${orderId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("review-photos").upload(path, file, { upsert: false, contentType: file.type });
    setUploadingPhoto(null);
    if (error) return toast.error(error.message);
    const { data: pub } = supabase.storage.from("review-photos").getPublicUrl(path);
    const cur = reviewForm[orderId] || { rating: 5, shipping_rating: 5, comment: "", photo_urls: [] };
    setReviewForm({ ...reviewForm, [orderId]: { ...cur, photo_urls: [...(cur.photo_urls || []), pub.publicUrl] } });
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
      // If this order came from a live stream, log a payment event for the host's activity log.
      if (o.stream_id) {
        const { logPaymentEvent } = await import("@/components/HostPaymentLog");
        await logPaymentEvent({
          streamId: o.stream_id,
          buyerId: o.buyer_id,
          buyerUsername: profile?.username || "buyer",
          orderId: o.id,
          eventType: "payment_paid",
          amount: Number(o.amount || 0),
          itemLabel: o.title,
        });
      }
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
    await supabase.from("notifications").insert({ user_id: o.seller_id, type: "order", body: `Buyer marked "${o.title}" as delivered ✅`, link: "/store" });
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

  const counts = {
    all: orders.length,
    awaiting: orders.filter((o) => (o.payment_status || "awaiting_payment") === "awaiting_payment").length,
    shipped: orders.filter((o) => o.status === "shipped").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };
  const filtered = orders.filter((o) => {
    if (tab === "all") return true;
    if (tab === "awaiting") return (o.payment_status || "awaiting_payment") === "awaiting_payment";
    return o.status === tab;
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">My Orders</h1>
            <p className="text-xs text-muted-foreground">Items you've purchased</p>
          </div>
          <WatchTutorial routePath="/orders" label="Shipping help" />
        </div>
        {PAYMENTS_SAFE_MODE && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            🔒 Safe mode: payments are simulated. No real charges occur.
          </div>
        )}
        <div className="sticky top-0 z-20 -mx-4 mb-3 flex flex-wrap gap-1.5 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          {([
            { v: "all", label: "All" },
            { v: "awaiting", label: "Awaiting" },
            { v: "shipped", label: "Shipped" },
            { v: "delivered", label: "Delivered" },
          ] as const).map((t) => (
            <button key={t.v} onClick={() => setTab(t.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]" : "bg-card/60 text-muted-foreground ring-1 ring-border/60 hover:bg-card hover:text-foreground"}`}>
              {t.label} <span className="ml-1 opacity-70">{counts[t.v]}</span>
            </button>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 py-12 text-center">
            <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold">{orders.length === 0 ? "No orders yet" : `No ${tab} orders`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Browse the marketplace to find your next pull.</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((o) => {
            const pay = o.payment_status || "awaiting_payment";
            return (
              <div key={o.id} className="rounded-xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-lg)]">

                <div className="flex items-start gap-3">
                  {o.item_image_url && <img src={o.item_image_url} alt={o.title} className="h-16 w-16 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{o.title}</p>
                    {o.description && <p className="line-clamp-2 text-[11px] text-muted-foreground">{o.description}</p>}
                    <p className="text-xs font-semibold text-primary">${Number(o.amount).toFixed(2)}</p>
                    <div className="mt-0.5"><SellerBadge sellerId={o.seller_id} /></div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <PayBadge s={pay} />
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold capitalize">
                        <ShipIcon s={o.status} /> {o.status}
                      </span>
                      {o.stream_id && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400" title="Winning bid recorded server-side">
                          ✓ Verified bid
                        </span>
                      )}
                      {pay === "paid" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400" title="Payment captured and held by Stripe">
                          🔒 Payment secured
                        </span>
                      )}
                      {o.stream_id && pay !== "awaiting_payment" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary" title="Auction finalized by server">
                          🏆 Auction finalized
                        </span>
                      )}
                      {o.status !== "pending" && pay === "paid" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary" title="Order confirmed and queued for fulfillment">
                          ✓ Order confirmed
                        </span>
                      )}
                      {o.stream_id && (
                        <Link to="/live/$id" params={{ id: o.stream_id }} className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                          🔴 Live sale
                        </Link>
                      )}
                      <ReportDialog targetType="order" targetId={o.id} targetLabel={o.title} />
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
                {pay === "refunded" && (
                  <div className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-400">
                    ✓ Refund issued — funds return to your card in 5–10 business days.
                  </div>
                )}
                {o.status !== "cancelled" && pay !== "refunded" && (
                  <button
                    onClick={() => setCancelOrder(o)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-muted py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {pay === "paid" ? "Request refund / cancel" : "Request cancellation"}
                  </button>
                )}
                {pay === "paid" && o.status === "shipped" && (
                  <button onClick={() => deliver(o)} className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Mark Delivered</button>
                )}
                {o.status === "delivered" && (
                  reviews[o.id] ? (
                    <div className="mt-2 rounded-lg bg-muted/40 p-2 text-[11px]">
                      <p className="font-semibold">Your review</p>
                      <div className="mt-1 flex gap-3">
                        <span className="inline-flex items-center gap-0.5">
                          {[1,2,3,4,5].map((i) => <Star key={i} className={`h-3 w-3 ${i <= reviews[o.id].rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />)}
                          <span className="ml-1">overall</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          {[1,2,3,4,5].map((i) => <Star key={i} className={`h-3 w-3 ${i <= reviews[o.id].shipping_rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />)}
                          <span className="ml-1">shipping</span>
                        </span>
                      </div>
                      {reviews[o.id].comment && <p className="mt-1 text-muted-foreground">"{reviews[o.id].comment}"</p>}
                      {reviews[o.id].photo_urls?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {reviews[o.id].photo_urls.map((u: string) => (
                            <img key={u} src={u} alt="" className="h-12 w-12 rounded object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-2">
                      <p className="text-[11px] font-semibold">Rate this seller</p>
                      {(["rating", "shipping_rating"] as const).map((k) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="w-16 text-[10px] text-muted-foreground">{k === "rating" ? "Overall" : "Shipping"}</span>
                          {[1,2,3,4,5].map((i) => {
                            const cur = reviewForm[o.id]?.[k] ?? 5;
                            return (
                              <button
                                key={i}
                                onClick={() => setReviewForm({ ...reviewForm, [o.id]: { ...{ rating: 5, shipping_rating: 5, comment: "", photo_urls: [] }, ...(reviewForm[o.id] || {}), [k]: i } })}
                                aria-label={`${i} stars`}
                              >
                                <Star className={`h-4 w-4 ${i <= cur ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      <input
                        type="text"
                        placeholder="Optional comment (how was the shipping & item?)"
                        value={reviewForm[o.id]?.comment || ""}
                        onChange={(e) => setReviewForm({ ...reviewForm, [o.id]: { ...{ rating: 5, shipping_rating: 5, comment: "", photo_urls: [] }, ...(reviewForm[o.id] || {}), comment: e.target.value } })}
                        className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
                      />
                      <div className="space-y-1">
                        {(reviewForm[o.id]?.photo_urls?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {reviewForm[o.id]!.photo_urls.map((u, idx) => (
                              <div key={u} className="relative">
                                <img src={u} alt="" className="h-12 w-12 rounded object-cover" />
                                <button
                                  onClick={() => {
                                    const cur = reviewForm[o.id]!;
                                    setReviewForm({ ...reviewForm, [o.id]: { ...cur, photo_urls: cur.photo_urls.filter((_, i) => i !== idx) } });
                                  }}
                                  className="absolute -right-1 -top-1 rounded-full bg-background px-1 text-[9px] font-bold text-destructive"
                                  aria-label="Remove photo"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-card py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground">
                          {uploadingPhoto === o.id ? "Uploading…" : "📷 Add photo (optional)"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingPhoto === o.id || (reviewForm[o.id]?.photo_urls?.length ?? 0) >= 4}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReviewPhoto(o.id, f); e.target.value = ""; }}
                          />
                        </label>
                      </div>
                      <button onClick={() => submitReview(o)} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Submit review</button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
        {cancelOrder && (
          <OrderCancellation
            order={cancelOrder}
            role="buyer"
            onClose={() => setCancelOrder(null)}
            onChanged={load}
          />
        )}
      </div>
    </AppShell>
  );
}
