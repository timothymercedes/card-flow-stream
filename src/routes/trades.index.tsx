import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  listMyTrades, createTrade, respondToTrade, advanceTrade, rateTrade, getTradeBuilderData,
} from "@/lib/trades.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeftRight, Plus, Truck, CheckCircle2, XCircle, Star, Repeat, Send, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/trades/")({
  validateSearch: (s: Record<string, unknown>) => ({
    to: typeof s.to === "string" ? s.to : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Trade Center — PullBid Live" },
      { name: "description", content: "Build trades from your vault, send offers, and track every swap from pending to completed." },
    ],
  }),
  component: TradesPage,
});

type Trade = Awaited<ReturnType<typeof listMyTrades>>[number];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-500/15 text-amber-600" },
  countered: { label: "Countered", cls: "bg-purple-500/15 text-purple-600" },
  accepted: { label: "Accepted", cls: "bg-blue-500/15 text-blue-600" },
  shipped: { label: "Shipped", cls: "bg-indigo-500/15 text-indigo-600" },
  delivered: { label: "Delivered", cls: "bg-teal-500/15 text-teal-600" },
  completed: { label: "Completed", cls: "bg-green-500/15 text-green-600" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-muted" };
  return <Badge className={`${m.cls} border-0`}>{m.label}</Badge>;
}

function money(n: number) {
  return n ? `$${Number(n).toLocaleString()}` : "";
}

function TradesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [builderUser, setBuilderUser] = useState<string | null>(search.to ?? null);
  const [rating, setRating] = useState<Trade | null>(null);

  const listFn = useServerFn(listMyTrades);
  const respondFn = useServerFn(respondToTrade);
  const advanceFn = useServerFn(advanceTrade);

  const tradesQ = useQuery({
    queryKey: ["trades", "mine"],
    queryFn: () => listFn(),
    enabled: !!user,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["trades", "mine"] });

  const respondMut = useMutation({
    mutationFn: (v: any) => respondFn({ data: v }),
    onSuccess: (_d, v: any) => { toast.success(`Trade ${v.action === "accept" ? "accepted" : v.action === "cancel" ? "cancelled" : "countered"}`); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Action failed"),
  });
  const advanceMut = useMutation({
    mutationFn: (id: string) => advanceFn({ data: { tradeId: id } }),
    onSuccess: () => { toast.success("Trade updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Action failed"),
  });

  const trades = tradesQ.data ?? [];
  const incoming = useMemo(() => trades.filter((t) => t.role === "incoming" && ["pending", "countered"].includes(t.status)), [trades]);
  const outgoing = useMemo(() => trades.filter((t) => t.role === "outgoing" && ["pending", "countered"].includes(t.status)), [trades]);
  const active = useMemo(() => trades.filter((t) => ["accepted", "shipped", "delivered"].includes(t.status)), [trades]);
  const history = useMemo(() => trades.filter((t) => ["completed", "cancelled"].includes(t.status)), [trades]);

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-8 text-center">
          <ArrowLeftRight className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="mb-2 text-xl font-bold">Trade Center</h1>
          <p className="mb-4 text-muted-foreground">Sign in to build trades and track your offers.</p>
          <Button onClick={() => navigate({ to: "/auth" })}>Sign in</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ArrowLeftRight className="h-6 w-6 text-primary" /> Trade Center
            </h1>
            <p className="text-sm text-muted-foreground">Swap cards from your vault with other collectors.</p>
          </div>
          <Button asChild size="sm" variant="secondary" className="h-8 shrink-0">
            <Link to="/trades/discover"><Sparkles className="mr-1 h-3.5 w-3.5" /> Discover</Link>
          </Button>
        </div>


        <Tabs defaultValue="incoming">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="incoming">Incoming{incoming.length ? ` (${incoming.length})` : ""}</TabsTrigger>
            <TabsTrigger value="outgoing">Outgoing{outgoing.length ? ` (${outgoing.length})` : ""}</TabsTrigger>
            <TabsTrigger value="active">Active{active.length ? ` (${active.length})` : ""}</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="space-y-3">
            {incoming.length === 0 && <Empty text="No incoming offers." />}
            {incoming.map((t) => (
              <TradeCard key={t.id} t={t}
                actions={
                  <>
                    <Button size="sm" onClick={() => respondMut.mutate({ tradeId: t.id, action: "accept" })}>
                      <CheckCircle2 className="mr-1 h-4 w-4" />Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setBuilderUser(t.counterpart.id)}>
                      <Repeat className="mr-1 h-4 w-4" />Counter
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => respondMut.mutate({ tradeId: t.id, action: "cancel" })}>
                      <XCircle className="mr-1 h-4 w-4" />Decline
                    </Button>
                  </>
                } />
            ))}
          </TabsContent>

          <TabsContent value="outgoing" className="space-y-3">
            {outgoing.length === 0 && <Empty text="No outgoing offers." />}
            {outgoing.map((t) => (
              <TradeCard key={t.id} t={t}
                actions={
                  <Button size="sm" variant="ghost" onClick={() => respondMut.mutate({ tradeId: t.id, action: "cancel" })}>
                    <XCircle className="mr-1 h-4 w-4" />Cancel
                  </Button>
                } />
            ))}
          </TabsContent>

          <TabsContent value="active" className="space-y-3">
            {active.length === 0 && <Empty text="No active trades in progress." />}
            {active.map((t) => (
              <TradeCard key={t.id} t={t}
                actions={
                  <Button size="sm" onClick={() => advanceMut.mutate(t.id)}>
                    {t.status === "accepted" && <><Truck className="mr-1 h-4 w-4" />Mark shipped</>}
                    {t.status === "shipped" && <><CheckCircle2 className="mr-1 h-4 w-4" />Mark delivered</>}
                    {t.status === "delivered" && <><CheckCircle2 className="mr-1 h-4 w-4" />Mark completed</>}
                  </Button>
                } />
            ))}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {history.length === 0 && <Empty text="No completed trades yet." />}
            {history.map((t) => (
              <TradeCard key={t.id} t={t}
                actions={
                  t.status === "completed" && !t.i_rated ? (
                    <Button size="sm" variant="outline" onClick={() => setRating(t)}>
                      <Star className="mr-1 h-4 w-4" />Rate trader
                    </Button>
                  ) : null
                } />
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {builderUser && (
        <TradeBuilder
          toUser={builderUser}
          onClose={() => { setBuilderUser(null); if (search.to) navigate({ to: "/trades" }); }}
          onDone={() => { setBuilderUser(null); refresh(); if (search.to) navigate({ to: "/trades" }); }}
        />
      )}

      {rating && <RatingDialog trade={rating} onClose={() => setRating(null)} onDone={() => { setRating(null); refresh(); }} />}
    </AppShell>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function ItemStack({ items }: { items: Trade["items"] }) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground">cash only</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i: any) => (
        <div key={i.id} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
          {i.card_image_url ? (
            <img src={i.card_image_url} alt={i.card_name} className="h-8 w-6 rounded object-cover" />
          ) : null}
          <span className="max-w-[90px] truncate text-xs">{i.card_name}</span>
        </div>
      ))}
    </div>
  );
}

function TradeCard({ t, actions }: { t: Trade; actions: React.ReactNode }) {
  const give = t.items.filter((i: any) => (t.role === "outgoing" ? i.owner_side === "from" : i.owner_side === "to"));
  const get = t.items.filter((i: any) => (t.role === "outgoing" ? i.owner_side === "to" : i.owner_side === "from"));
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={t.counterpart.avatar_url ?? undefined} />
            <AvatarFallback>{t.counterpart.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="text-sm font-medium">@{t.counterpart.username}</div>
        </div>
        <StatusBadge status={t.status} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">You give</div>
          <ItemStack items={give} />
        </div>
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">You get</div>
          <ItemStack items={get} />
        </div>
      </div>
      {Number(t.cash_amount) > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          Cash: {money(Number(t.cash_amount))} ({t.cash_direction === "from_pays" ? (t.role === "outgoing" ? "you pay" : "they pay") : (t.role === "outgoing" ? "they pay" : "you pay")})
        </div>
      )}
      {t.message && <p className="mt-2 rounded bg-muted/50 p-2 text-xs italic">"{t.message}"</p>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </Card>
  );
}

// ---------- Trade Builder ----------
type BCard = { id: string; name: string; image_url: string | null; value: number };

function TradeBuilder({ toUser, onClose, onDone }: { toUser: string; onClose: () => void; onDone: () => void }) {
  const dataFn = useServerFn(getTradeBuilderData);
  const createFn = useServerFn(createTrade);
  const [myPick, setMyPick] = useState<Set<string>>(new Set());
  const [theirPick, setTheirPick] = useState<Set<string>>(new Set());
  const [cash, setCash] = useState("");
  const [cashDir, setCashDir] = useState<"none" | "from_pays" | "to_pays">("none");
  const [message, setMessage] = useState("");

  const q = useQuery({
    queryKey: ["trade-builder", toUser],
    queryFn: () => dataFn({ data: { toUser } }),
  });

  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        toUser,
        fromCardIds: [...myPick],
        toCardIds: [...theirPick],
        cashAmount: Number(cash) || 0,
        cashDirection: (Number(cash) || 0) > 0 ? cashDir === "none" ? "from_pays" : cashDir : "none",
        message: message || undefined,
      },
    }),
    onSuccess: () => { toast.success("Trade offer sent!"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not send trade"),
  });

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setter(n);
  };

  const cp = q.data?.counterpart;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Trade with {cp ? `@${cp.username}` : "…"}
          </DialogTitle>
        </DialogHeader>

        {q.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading vaults…</p>}
        {q.data && (
          <div className="space-y-4">
            <CardPicker title="Your cards to offer" cards={q.data.myCards} picked={myPick} onToggle={(id) => toggle(myPick, setMyPick, id)} />
            <CardPicker title={`${cp?.username ?? "Their"}'s tradeable cards`} cards={q.data.theirCards} picked={theirPick} onToggle={(id) => toggle(theirPick, setTheirPick, id)} empty="This collector has no cards marked for trade." />

            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" min={0} placeholder="Add cash (optional)" value={cash} onChange={(e) => setCash(e.target.value)} className="w-40" />
              {Number(cash) > 0 && (
                <select className="rounded-md border bg-background px-2 py-2 text-sm" value={cashDir === "none" ? "from_pays" : cashDir} onChange={(e) => setCashDir(e.target.value as any)}>
                  <option value="from_pays">You pay</option>
                  <option value="to_pays">They pay</option>
                </select>
              )}
            </div>
            <Textarea placeholder="Add a message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={createMut.isPending || (myPick.size + theirPick.size === 0 && Number(cash) <= 0)}
            onClick={() => createMut.mutate()}
          >
            <Send className="mr-1 h-4 w-4" />Send offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardPicker({ title, cards, picked, onToggle, empty }: {
  title: string; cards: BCard[]; picked: Set<string>; onToggle: (id: string) => void; empty?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {cards.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty ?? "No cards available."}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {cards.map((c) => {
            const on = picked.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={`relative overflow-hidden rounded-lg border-2 text-left transition ${on ? "border-primary ring-2 ring-primary/40" : "border-transparent"}`}
              >
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted text-xs">{c.name}</div>
                )}
                {on && <div className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground"><CheckCircle2 className="h-3.5 w-3.5" /></div>}
                <div className="truncate p-1 text-[10px]">{c.name} {c.value ? `· ${money(c.value)}` : ""}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Rating ----------
function RatingDialog({ trade, onClose, onDone }: { trade: Trade; onClose: () => void; onDone: () => void }) {
  const rateFn = useServerFn(rateTrade);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const mut = useMutation({
    mutationFn: () => rateFn({ data: { tradeId: trade.id, stars, comment: comment || undefined } }),
    onSuccess: () => { toast.success("Thanks for rating!"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not submit rating"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Rate @{trade.counterpart.username}</DialogTitle></DialogHeader>
        <div className="flex justify-center gap-1 py-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setStars(n)}>
              <Star className={`h-7 w-7 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
        <Textarea placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
