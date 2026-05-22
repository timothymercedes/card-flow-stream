/**
 * PreBidPanel — viewer-facing "Pre-B" experience.
 *
 * Shows upcoming queued items (with images, prices) and lets viewers
 * interact based on each item's sale_type:
 *   - prebid:  place a pre-bid (must beat current top)
 *   - buynow:  Buy Now button — creates an order (lands in cart/orders)
 *   - offer:   submit an offer to the host
 *
 * Realtime: re-renders on auction_queue or prebids changes for this stream.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { buyNowQueueItem } from "@/lib/queueActions.functions";
import { toast } from "sonner";
import { X, Bookmark, Gavel, ListOrdered, Trophy, ShoppingCart, HandCoins } from "lucide-react";
import { OfferDialog } from "@/components/OfferDialog";

type SaleType = "prebid" | "buynow" | "either" | "offer";

type QueueItem = {
  id: string;
  stream_id: string;
  position: number;
  title: string;
  image_url: string | null;
  description: string | null;
  starting_bid: number;
  duration_seconds: number;
  snipe_price: number | null;
  status: string;
  quantity: number | null;
  prebid_enabled: boolean;
  sale_type: SaleType | null;
  buy_now_price: number | null;
  min_offer: number | null;
  sold_to: string | null;
};

type PreBid = {
  id: string;
  queue_item_id: string;
  bidder_id: string;
  bidder_username: string | null;
  amount: number;
  created_at: string;
};

export function PreBidPanel({
  streamId,
  onClose,
}: {
  streamId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const nav = useNavigate();
  const buyNowFn = useServerFn(buyNowQueueItem);
  const [offerItem, setOfferItem] = useState<QueueItem | null>(null);

  const [items, setItems] = useState<QueueItem[]>([]);
  const [prebids, setPrebids] = useState<PreBid[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!streamId) return;
    let alive = true;
    async function refresh() {
      const [q, p] = await Promise.all([
        supabase.from("auction_queue" as any).select("*").eq("stream_id", streamId)
          .in("status", ["queued"]).is("sold_to", null).order("position", { ascending: true }),
        supabase.from("prebids" as any).select("*, auction_queue!inner(stream_id)")
          .eq("auction_queue.stream_id", streamId).order("amount", { ascending: false }),
      ]);
      if (!alive) return;
      setItems(((q.data as any[]) || []) as QueueItem[]);
      setPrebids(((p.data as any[]) || []) as PreBid[]);
    }
    refresh();
    const ch = supabase
      .channel(`prebid-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_queue", filter: `stream_id=eq.${streamId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "prebids" }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [streamId]);

  const topByItem = useMemo(() => {
    const map = new Map<string, PreBid>();
    for (const b of prebids) {
      const cur = map.get(b.queue_item_id);
      if (!cur || b.amount > cur.amount) map.set(b.queue_item_id, b);
    }
    return map;
  }, [prebids]);

  async function placeBid(item: QueueItem) {
    if (!requireAuth("place a pre-bid")) return;
    const raw = drafts[item.id];
    const amount = Number(raw);
    if (!amount || amount <= 0) return toast.error("Enter a bid amount");
    const top = topByItem.get(item.id);
    const min = Math.max(Number(item.starting_bid) || 1, top ? top.amount + 1 : 0);
    if (amount < min) return toast.error(`Pre-bid must be at least $${min}`);
    setBusy(item.id);
    const { data: profile } = await supabase.from("profiles").select("username").eq("id", user!.id).maybeSingle();
    const { error } = await supabase.from("prebids" as any).insert({
      queue_item_id: item.id,
      bidder_id: user!.id,
      bidder_username: (profile as any)?.username || null,
      amount,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    setDrafts((d) => ({ ...d, [item.id]: "" }));
    toast.success(`Pre-bid placed: $${amount}`);
  }

  async function buyNow(item: QueueItem) {
    if (!requireAuth("buy this item")) return;
    setBusy(item.id);
    try {
      await buyNowFn({ data: { queueItemId: item.id } });
      toast.success("Added to cart — finish checkout to confirm");
      nav({ to: "/cart" });
    } catch (e: any) {
      toast.error(e?.message || "Buy Now failed");
    } finally {
      setBusy(null);
    }
  }

  function submitOffer(item: QueueItem) {
    if (!requireAuth("make an offer")) return;
    setOfferItem(item);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-border md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-fuchsia-500" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider">Pre-B · Pre-Bid</h2>
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold text-fuchsia-600">{items.length} upcoming</span>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 p-3">
          {items.length === 0 && (
            <div className="rounded-xl bg-muted/40 p-6 text-center text-xs text-muted-foreground">
              <ListOrdered className="mx-auto mb-2 h-6 w-6 opacity-50" />
              No upcoming items yet. The host will add items soon.
            </div>
          )}

          {items.map((it, i) => {
            const st = (it.sale_type || "prebid") as SaleType;
            const top = topByItem.get(it.id);
            const min = Math.max(Number(it.starting_bid) || 1, top ? top.amount + 1 : Number(it.starting_bid) || 1);
            const bnPrice = Number(it.buy_now_price ?? it.snipe_price ?? 0);
            return (
              <div key={it.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex gap-3">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.title} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-extrabold text-muted-foreground">
                      #{i + 1}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-bold">
                        <span className="mr-1 text-amber-500">#{i + 1}</span>
                        {it.title}
                        {Number(it.quantity || 1) > 1 && (
                          <span className="ml-1 rounded bg-fuchsia-500/20 px-1 text-[10px] font-extrabold text-fuchsia-600">×{it.quantity}</span>
                        )}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {st === "prebid" && (<>Start ${Number(it.starting_bid).toFixed(0)} · {it.duration_seconds}s{it.snipe_price ? ` · BIN $${Number(it.snipe_price).toFixed(0)}` : ""}</>)}
                      {st === "buynow" && (<>Buy Now ${bnPrice.toFixed(0)}</>)}
                      {st === "either" && (<>Pre-Bid from ${Number(it.starting_bid).toFixed(0)} · or Buy Now ${bnPrice.toFixed(0)}</>)}
                      
                    </p>
                    {(st === "prebid" || st === "either") && top && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        <Trophy className="h-3 w-3" />
                        Top pre-bid ${top.amount} · {top.bidder_username || "anon"}
                      </p>
                    )}
                    {it.description && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{it.description}</p>}
                  </div>
                </div>

                {/* Action by sale type */}
                {(st === "prebid" || st === "either") && (it.prebid_enabled ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="number" inputMode="decimal" min={min}
                      placeholder={`Pre-bid · min $${min}`}
                      value={drafts[it.id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                    />
                    <button
                      onClick={() => placeBid(it)} disabled={busy === it.id}
                      className="rounded-md bg-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow active:scale-95 disabled:opacity-50"
                    >
                      Pre-Bid
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 rounded-md bg-muted/50 px-2 py-1 text-center text-[10px] text-muted-foreground">
                    Pre-bidding disabled by host
                  </p>
                ))}

                {(st === "buynow" || st === "either") && bnPrice > 0 && (
                  <button
                    onClick={() => buyNow(it)} disabled={busy === it.id}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-extrabold text-white shadow active:scale-[0.98] disabled:opacity-50"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {busy === it.id ? "Adding…" : `Buy Now · $${bnPrice.toFixed(0)}`}
                  </button>
                )}

              </div>
            );
          })}
        </div>

        <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-[10px] text-muted-foreground">
          <Bookmark className="mr-1 inline h-3 w-3" />
          Buy Now items get added to your cart. Pre-bids and offers are saved for the host to see.
        </div>
      </div>
    </div>
  );
}
