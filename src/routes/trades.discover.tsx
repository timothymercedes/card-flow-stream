import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { getTradeDiscovery } from "@/lib/trades.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sparkles, ArrowLeft, ArrowLeftRight, ArrowRight, Repeat, Gift, Search } from "lucide-react";

export const Route = createFileRoute("/trades/discover")({
  head: () => ({
    meta: [
      { title: "Trade Discovery — PullBid Live" },
      { name: "description", content: "Find collectors who own the cards you need and want what you have. Smart, mutual trade matches in one place." },
    ],
  }),
  component: DiscoverPage,
});

function money(v: number) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

type Opp = Awaited<ReturnType<typeof getTradeDiscovery>>["opportunities"][number];

function DiscoverPage() {
  const { user } = useAuth();
  const discover = useServerFn(getTradeDiscovery);
  const q = useQuery({
    queryKey: ["trade-discovery"],
    queryFn: () => discover(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-6 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-bold">Trade Discovery</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to find collectors who have the cards you need.</p>
          <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
        </div>
      </AppShell>
    );
  }

  const opps = q.data?.opportunities ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link to="/trades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Trade Center
        </Link>

        <header className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Trade Discovery</h1>
            <p className="text-xs text-muted-foreground">Collectors who own cards you need — based on your wishlist & sets in progress.</p>
          </div>
        </header>

        {q.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Finding trade matches…</p>}

        {!q.isLoading && opps.length === 0 && (
          <Card className="p-8 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">No matches yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Add cards to your <Link to="/wishlist" className="text-primary underline">wishlist</Link> or keep building sets in your <Link to="/collection" className="text-primary underline">Collection Books</Link>, and we'll surface collectors who can complete them.
            </p>
          </Card>
        )}

        <div className="space-y-3">
          {opps.map((o) => (
            <OpportunityCard key={o.ownerId} opp={o} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function CardStrip({ cards, extra }: { cards: { vaultCardId: string; name: string; image: string | null }[]; extra: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {cards.map((c) => (
        <div key={c.vaultCardId} className="h-16 w-12 shrink-0 overflow-hidden rounded bg-muted" title={c.name}>
          {c.image ? (
            <img src={c.image} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[8px] text-muted-foreground">{c.name.slice(0, 12)}</div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
          +{extra}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opp }: { opp: Opp }) {
  const reasons = [...new Set(opp.theyHave.map((c) => c.reason))];
  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-9 w-9">
            {opp.avatarUrl ? <AvatarImage src={opp.avatarUrl} alt={opp.username} /> : null}
            <AvatarFallback>{opp.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold">@{opp.username}</p>
            <p className="text-[11px] text-muted-foreground">{opp.theyHaveCount} card{opp.theyHaveCount === 1 ? "" : "s"} you need</p>
          </div>
        </div>
        {opp.mutual && (
          <Badge className="gap-1 bg-emerald-500/15 text-[10px] text-emerald-600">
            <Repeat className="h-3 w-3" /> Mutual match
          </Badge>
        )}
      </div>

      <div className="rounded-lg bg-muted/30 p-2">
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Gift className="h-3 w-3 text-primary" /> They have for trade
        </p>
        <CardStrip cards={opp.theyHave} extra={opp.theyHaveCount - opp.theyHave.length} />
        {reasons.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reasons.slice(0, 3).map((r) => (
              <Badge key={r} variant="outline" className="text-[9px]">{r}</Badge>
            ))}
          </div>
        )}
      </div>

      {opp.mutual && (
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <ArrowLeftRight className="h-3 w-3 text-emerald-600" /> You can offer ({opp.iCanOfferCount})
          </p>
          <CardStrip cards={opp.iCanOffer} extra={opp.iCanOfferCount - opp.iCanOffer.length} />
        </div>
      )}

      <Button asChild size="sm" className="w-full">
        <Link to="/trades" search={{ to: opp.ownerId }}>
          Build a trade <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </Card>
  );
}
