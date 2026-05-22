/**
 * MyOffers — buyer-side list of active/recent offers with countdown + cancel.
 * Drop into any page (e.g. /orders) to show outstanding binding offers.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ShieldCheck, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cancelOffer } from "@/lib/offers.functions";

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return <span className="text-destructive">expired</span>;
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  return <span>{h}h {m}m left</span>;
}

export function MyOffers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const doCancel = useServerFn(cancelOffer);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("queue_offers" as any)
      .select("id, amount, status, payment_status, expires_at, created_at, queue_item_id, auction_queue:queue_item_id(title, image_url)")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-offers-${user.id}`)
      .on("postgres_changes" as any,
        { event: "*", schema: "public", table: "queue_offers", filter: `buyer_id=eq.${user.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await doCancel({ data: { offerId: id } });
      toast.success("Offer cancelled — authorization released");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel");
    } finally {
      setBusy(null);
    }
  };

  if (!user) return null;
  if (loading) return <div className="text-sm text-muted-foreground p-4">Loading offers…</div>;
  if (!rows.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">My Offers</h3>
      {rows.map((r) => {
        const canCancel = r.status === "pending" && r.payment_status === "authorized" && new Date(r.expires_at) > new Date();
        const aq = r.auction_queue;
        return (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border p-2.5 bg-card">
            {aq?.image_url ? (
              <img src={aq.image_url} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 rounded bg-muted" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{aq?.title || "Item"}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground">${Number(r.amount).toFixed(2)}</span>
                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                {r.payment_status === "authorized" && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" /> card authorized
                  </span>
                )}
                {r.payment_status === "captured" && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">paid</span>
                )}
                {r.status === "pending" && (
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /><Countdown to={r.expires_at} /></span>
                )}
              </div>
            </div>
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancel(r.id)}
                disabled={busy === r.id}
              >
                {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><X className="h-3 w-3 mr-1" /> Cancel</>}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
