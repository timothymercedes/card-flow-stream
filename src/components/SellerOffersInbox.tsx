/**
 * SellerOffersInbox — seller-side list of incoming offers on their queue items.
 *
 * Visibility: RLS already restricts to the host (auth.uid() = q.host_id).
 * Live countdown to expires_at. Actions depend on `turn`:
 *   - turn=seller (your move): Accept / Counter / Decline
 *   - turn=buyer  (waiting on buyer counter response): read-only
 *
 * Realtime subscription on queue_offers (no buyer filter — RLS gates rows).
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, X, Loader2, ArrowRight, Check, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import {
  acceptOffer,
  declineOffer,
  sellerCounterOffer,
} from "@/lib/offers.functions";
import { OfferCountdown } from "@/components/OfferCountdown";
import { CounterOfferDialog } from "@/components/CounterOfferDialog";

export function SellerOffersInbox() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<any | null>(null);

  const doAccept = useServerFn(acceptOffer);
  const doDecline = useServerFn(declineOffer);
  const doCounter = useServerFn(sellerCounterOffer);

  const load = async () => {
    if (!user) return;
    // RLS handles "host_id = auth.uid()" — we just ask for active offers, ordered.
    const { data } = await supabase
      .from("queue_offers" as any)
      .select(
        "id, amount, counter_amount, status, payment_status, expires_at, turn, buyer_username, queue_item_id, created_at, auction_queue:queue_item_id(title, image_url, min_offer, host_id)",
      )
      .in("status", ["pending", "countered"])
      .order("created_at", { ascending: false })
      .limit(50);
    // double-filter client-side to only items hosted by me
    const mine = ((data as any[]) || []).filter((r) => r.auction_queue?.host_id === user.id);
    setRows(mine);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`seller-offers-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "queue_offers" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const wrap = async (id: string, fn: () => Promise<any>, okMsg: string) => {
    setBusy(id);
    try { await fn(); toast.success(okMsg); load(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(null); }
  };

  if (!user) return null;
  if (loading) return <div className="text-sm text-muted-foreground p-4">Loading incoming offers…</div>;
  if (!rows.length) {
    return (
      <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-card">
        No incoming offers yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">Incoming offers ({rows.length})</h3>
      {rows.map((r) => {
        const aq = r.auction_queue;
        const isActive = (r.status === "pending" || r.status === "countered") &&
          r.payment_status === "authorized" &&
          new Date(r.expires_at) > new Date();
        const myTurn = isActive && r.turn === "seller";
        const waitingOnBuyer = isActive && r.turn === "buyer";
        // The "current asking price" to capture/accept = o.amount (buyer's authorized commitment).
        const acceptAmount = Number(r.amount);

        return (
          <div key={r.id} className="rounded-lg border bg-card p-2.5 space-y-2">
            <div className="flex items-center gap-3">
              {aq?.image_url ? (
                <img src={aq.image_url} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{aq?.title || "Item"}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>from</span>
                  <span className="font-semibold text-foreground">@{r.buyer_username || "buyer"}</span>
                  <span className="font-bold text-foreground">${Number(r.amount).toFixed(2)}</span>
                  {r.counter_amount && (
                    <>
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-bold text-primary">${Number(r.counter_amount).toFixed(2)}</span>
                      <Badge variant="outline" className="text-[10px]">your counter</Badge>
                    </>
                  )}
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  {r.payment_status === "authorized" && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-3 w-3" /> card authorized
                    </span>
                  )}
                </div>
                {isActive && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {myTurn ? "You respond in" : "Buyer responds in"}
                    </span>
                    <OfferCountdown to={r.expires_at} onExpire={load} compact />
                  </div>
                )}
              </div>
            </div>

            {myTurn && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => wrap(r.id, () => doDecline({ data: { offerId: r.id } }), "Offer declined — authorization released")}
                  disabled={busy === r.id}
                >
                  <X className="h-3 w-3 mr-1" /> Decline
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCounterFor(r)}
                  disabled={busy === r.id}
                >
                  <RefreshCcw className="h-3 w-3 mr-1" /> Counter
                </Button>
                <Button
                  size="sm"
                  onClick={() => wrap(r.id, () => doAccept({ data: { offerId: r.id } }), "Offer accepted — payment captured")}
                  disabled={busy === r.id}
                >
                  {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" /> Accept ${acceptAmount.toFixed(2)}</>}
                </Button>
              </div>
            )}

            {waitingOnBuyer && (
              <div className="text-[11px] text-muted-foreground text-right">
                Waiting on buyer to accept, counter, or decline your ${Number(r.counter_amount).toFixed(2)} counter.
              </div>
            )}
          </div>
        );
      })}

      {counterFor && (
        <CounterOfferDialog
          open={!!counterFor}
          onClose={() => setCounterFor(null)}
          title={`Counter @${counterFor.buyer_username || "buyer"} on ${counterFor.auction_queue?.title || "item"}`}
          currentAmount={Number(counterFor.amount)}
          minAmount={counterFor.auction_queue?.min_offer ?? undefined}
          side="seller"
          busy={busy === counterFor.id}
          onSubmit={(amt, hours) => {
            const id = counterFor.id;
            wrap(id, () => doCounter({ data: { offerId: id, counterAmount: amt, expiresInHours: hours } }), "Counter sent");
            setCounterFor(null);
          }}
        />
      )}
    </div>
  );
}
