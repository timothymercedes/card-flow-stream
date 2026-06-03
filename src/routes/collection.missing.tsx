import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  getMissingCardCenter,
  bulkAddMissingToWishlist,
  bulkAddAllMissingToWishlist,
  getMissingCardFinder,
} from "@/lib/collection.functions";
import { addWishlistItem } from "@/lib/wishlist.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  BookOpen,
  ArrowLeft,
  Tag,
  ArrowLeftRight,
  Heart,
  Gavel,
  Search,
  Sparkles,
  Eye,
  Star,
  Trophy,
  Users,
  Radio,
  ExternalLink,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/collection/missing")({
  validateSearch: (s: Record<string, unknown>) => ({
    set: typeof s.set === "string" ? s.set : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Missing Cards Center — PullBid Live" },
      { name: "description", content: "Every card you still need across your sets — buy, trade, watch, or wishlist them in one place." },
    ],
  }),
  component: MissingCenter,
});

type Group = Awaited<ReturnType<typeof getMissingCardCenter>>["groups"][number];
type Missing = Group["missing"][number];

function money(v: number) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function MissingCenter() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const getCenter = useServerFn(getMissingCardCenter);
  const addAllAll = useServerFn(bulkAddAllMissingToWishlist);
  const [addingAll, setAddingAll] = useState(false);

  const q = useQuery({
    queryKey: ["missing-card-center"],
    queryFn: () => getCenter(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-6 text-center">
          <Search className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-bold">Missing Cards Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to see every card you still need.</p>
          <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
        </div>
      </AppShell>
    );
  }

  const groups = q.data?.groups ?? [];
  const shownGroups = search.set
    ? [...groups].sort((a, b) => {
        const am = a.setName === search.set && (!search.category || a.category === search.category) ? 1 : 0;
        const bm = b.setName === search.set && (!search.category || b.category === search.category) ? 1 : 0;
        return bm - am;
      })
    : groups;
  const totalMissing = groups.reduce((s, g) => s + g.missing.length, 0);
  const totalAvailable = groups.reduce((s, g) => s + g.availableCount, 0);
  const oneAway = groups.filter((g) => g.remaining === 1).length;

  const onAddAll = async () => {
    setAddingAll(true);
    try {
      const r = await addAllAll();
      toast.success(r.added > 0 ? `Added ${r.added} cards to your wishlist` : "Everything's already on your wishlist");
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAddingAll(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link to="/collection" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Collection Books
        </Link>

        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Missing Cards Center</h1>
              <p className="text-xs text-muted-foreground">Complete your sets — buy, trade, watch, or wishlist what you need.</p>
            </div>
          </div>
          <Button asChild size="sm" variant="secondary" className="h-8 shrink-0">
            <Link to="/trades/discover"><Sparkles className="mr-1 h-3.5 w-3.5" /> Find trades</Link>
          </Button>
        </header>

        {groups.length > 0 && (
          <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-sm">
            <span><b>{totalMissing}</b> cards missing</span>
            <span className="text-green-600 dark:text-green-500"><b>{totalAvailable}</b> available now</span>
            {oneAway > 0 && (
              <span className="font-medium text-amber-600 dark:text-amber-500">
                <Trophy className="mr-1 inline h-3.5 w-3.5" />{oneAway} set{oneAway > 1 ? "s" : ""} just 1 card away!
              </span>
            )}
            <Button size="sm" className="ml-auto h-8" onClick={onAddAll} disabled={addingAll}>
              <Heart className="mr-1 h-3.5 w-3.5" /> Add all to wishlist
            </Button>
          </Card>
        )}

        {q.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Finding your missing cards…</p>}

        {!q.isLoading && groups.length === 0 && (
          <Card className="p-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-amber-500" />
            <p className="mt-3 font-medium">Nothing missing right now</p>
            <p className="mt-1 text-sm text-muted-foreground">Add more cards to your Vault to start tracking sets, or your in-progress sets have no catalog previews yet.</p>
            <Button asChild className="mt-4"><Link to="/collection">View Collection Books</Link></Button>
          </Card>
        )}

        {shownGroups.map((g) => <MissingGroup key={g.category + g.setName} group={g} />)}
      </div>
    </AppShell>
  );
}

function SetAlert({ g }: { g: Group }) {
  if (g.remaining === 1) {
    return (
      <Badge className="border-0 bg-amber-500 text-[10px] text-white">
        <Trophy className="mr-1 h-3 w-3" /> Only 1 card left — Reward Wheel after completion!
      </Badge>
    );
  }
  if (g.remaining > 0 && g.remaining <= 3) {
    return <Badge className="border-0 bg-amber-500/90 text-[10px] text-white">Only {g.remaining} cards left</Badge>;
  }
  if (g.completion >= 75) {
    return <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">Set completion within reach</Badge>;
  }
  return null;
}

function MissingGroup({ group: g }: { group: Group }) {
  const qc = useQueryClient();
  const bulkAdd = useServerFn(bulkAddMissingToWishlist);
  const [adding, setAdding] = useState(false);

  const addAll = async () => {
    setAdding(true);
    try {
      const r = await bulkAdd({ data: { setName: g.setName, category: g.category } });
      toast.success(r.added > 0 ? `Added ${r.added} cards to your wishlist` : "All missing cards already on your wishlist");
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {g.favorited && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />}
            <p className="truncate font-semibold">{g.setName}</p>
            <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">{g.category}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {g.ownedDistinct}/{g.knownTotal} · {g.missing.length} missing · {g.availableCount} available now
          </p>
        </div>
        <div className="w-20 shrink-0 text-right">
          <p className="text-sm font-bold text-primary">{g.completion}%</p>
          <Progress value={g.completion} className="mt-1 h-1.5" />
        </div>
      </div>

      <div className="mt-2"><SetAlert g={g} /></div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="default" className="h-8" onClick={addAll} disabled={adding}>
          <Heart className="mr-1 h-3.5 w-3.5" /> Add all to wishlist
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/market" search={{ q: g.setName }}><Tag className="mr-1 h-3.5 w-3.5" /> Shop set</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/trades/discover" search={{ q: g.setName }}><ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Trade</Link>
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {g.missing.map((c: Missing) => (
          <MissingCard key={c.number + c.name} card={c} group={g} />
        ))}
      </div>
    </Card>
  );
}

function MissingCard({ card, group: g }: { card: Missing; group: Group }) {
  const addWish = useServerFn(addWishlistItem);
  const [added, setAdded] = useState(false);
  const [watched, setWatched] = useState(false);
  const [open, setOpen] = useState(false);

  const track = async (live: boolean) => {
    await addWish({ data: {
      name: card.name || `${g.setName} #${card.number}`,
      set_name: g.setName, tcg_number: card.number, category: g.category,
      image_url: card.image_url, notify_sale: true, notify_trade: true, notify_live: live,
    } });
  };
  const onWish = async () => {
    try { await track(false); setAdded(true); toast.success("Added to wishlist"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onWatch = async () => {
    try { await track(true); setWatched(true); toast.success("Watching — you'll be alerted when it's listed, traded, or live"); }
    catch (e) { toast.error((e as Error).message); }
  };

  const buyLabel = card.listingsCount > 0 ? "Buy" : card.auctionCount > 0 ? "Bid" : "Find";
  const BuyIcon = card.auctionCount > 0 && card.listingsCount === 0 ? Gavel : card.listingsCount > 0 ? Tag : Search;

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[3/4] bg-muted">
        {card.image_url ? (
          <img src={card.image_url} alt={`${card.name} ${g.setName} #${card.number}`} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <span className="text-2xl font-bold opacity-50">#{card.number}</span>
            <span className="text-[9px]">{card.catalogPending ? "Catalog pending" : "No image"}</span>
          </div>
        )}
        {card.rarity && <Badge className="absolute right-1 top-1 border-0 bg-black/65 text-[8px] text-white">{card.rarity}</Badge>}
        {card.listingsCount > 0 && <Badge className="absolute left-1 top-1 border-0 bg-green-600 text-[9px] text-white">For sale</Badge>}
        {card.auctionCount > 0 && <Badge className="absolute left-1 bottom-1 border-0 bg-purple-600 text-[9px] text-white">Auction</Badge>}
        {card.tradeCount > 0 && <Badge className="absolute right-1 bottom-1 border-0 bg-blue-600 text-[9px] text-white">Trade</Badge>}
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-medium" title={card.name || `Card #${card.number}`}>{card.name || `Card #${card.number}`}</p>
        <p className="text-[10px] text-muted-foreground">{g.setName} #{card.number}</p>
        <p className="text-[10px] font-medium text-foreground">{card.value > 0 ? `Est. ${money(card.value)}` : card.catalogPending ? "Details pending" : "Value n/a"}</p>

        <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground">
          Completes {g.ownedDistinct}/{g.knownTotal} → {g.ownedDistinct + 1}/{g.knownTotal}
        </p>

        <div className="mt-1.5 grid grid-cols-4 gap-1">
          <Button asChild size="sm" variant="secondary" className="col-span-2 h-7 px-1 text-[10px]">
            <Link to="/market" search={{ q: `${g.setName} ${card.number}`.trim() }}>
              <BuyIcon className="h-3 w-3" /><span className="ml-1">{buyLabel}</span>
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="col-span-2 h-7 px-1 text-[10px]" aria-label="Trade">
            <Link to="/trades/discover" search={{ q: `${g.setName} ${card.number}`.trim() }}>
              <ArrowLeftRight className="h-3 w-3" /><span className="ml-1">Trade</span>
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-0 text-[10px]" onClick={onWish} disabled={added} aria-label="Add to wishlist" title="Add to wishlist">
            <Heart className={`h-3 w-3 ${added ? "fill-primary text-primary" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-0 text-[10px]" onClick={onWatch} disabled={watched} aria-label="Watch" title="Watch">
            <Eye className={`h-3 w-3 ${watched ? "fill-primary text-primary" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" className="col-span-2 h-7 px-1 text-[10px]" onClick={() => setOpen(true)} aria-label="View details">
            <Search className="h-3 w-3" /><span className="ml-1">Details</span>
          </Button>
        </div>
      </div>
      {open && <CardDetailsDialog card={card} group={g} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function CardDetailsDialog({ card, group: g, onClose }: { card: Missing; group: Group; onClose: () => void }) {
  const getFinder = useServerFn(getMissingCardFinder);
  const q = useQuery({
    queryKey: ["missing-finder", g.setName, card.number],
    queryFn: () => getFinder({ data: { setName: g.setName, category: g.category, number: card.number, name: card.name } }),
  });
  const d = q.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{card.name || "Missing card"}</DialogTitle>
          <DialogDescription>{g.setName} #{card.number}{card.rarity ? ` · ${card.rarity}` : ""}{card.value > 0 ? ` · Est. ${money(card.value)}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <div className="aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-md bg-muted">
            {card.image_url ? (
              <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground"><BookOpen className="h-6 w-6" /></div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This card moves <b className="text-foreground">{g.setName}</b> from {g.ownedDistinct}/{g.knownTotal} to {g.ownedDistinct + 1}/{g.knownTotal}.
            {g.remaining === 1 && <span className="mt-1 block font-medium text-amber-600 dark:text-amber-500">It's the last card — completing the set unlocks the Reward Wheel!</span>}
          </p>
        </div>

        {q.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Searching the marketplace…</p>}

        {d && (
          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
              <Stat icon={<Tag className="mx-auto h-3.5 w-3.5" />} n={d.counts.buyNow} label="Buy" />
              <Stat icon={<Gavel className="mx-auto h-3.5 w-3.5" />} n={d.counts.auctions} label="Auctions" />
              <Stat icon={<ArrowLeftRight className="mx-auto h-3.5 w-3.5" />} n={d.counts.trades} label="Trades" />
              <Stat icon={<Users className="mx-auto h-3.5 w-3.5" />} n={d.counts.owners} label="Owners" />
              <Stat icon={<Radio className="mx-auto h-3.5 w-3.5" />} n={d.counts.liveShows} label="Live" />
            </div>

            {d.listings.length > 0 && (
              <Section title="Buy now">
                {d.listings.map((l) => (
                  <Row key={l.id} to="/market" search={{ q: `${g.setName} ${card.number}`.trim() }} title={l.title} sub={`${l.seller} · ${money(l.priceCents / 100)}`} />
                ))}
              </Section>
            )}

            {d.auctions.length > 0 && (
              <Section title="Live auctions">
                {d.auctions.map((l) => (
                  <Row key={l.id} to="/market" search={{ q: `${g.setName} ${card.number}`.trim() }} title={l.title} sub={`${l.seller} · bid ${money(l.bidCents / 100)}`} />
                ))}
              </Section>
            )}

            {d.liveShows.length > 0 && (
              <Section title="Featured in live shows">
                {d.liveShows.map((s) => (
                  <Row key={s.id} to="/live" title={s.title} sub={`Hosted by ${s.host}`} />
                ))}
              </Section>
            )}

            {d.owners.length > 0 && (
              <Section title="Collectors who own it">
                <div className="flex flex-wrap gap-1.5">
                  {d.owners.map((o, i) => (
                    <Badge key={i} variant={o.openToTrade ? "default" : "secondary"} className="text-[10px]">
                      {o.username}{o.openToTrade ? " · trades" : ""}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" className="h-8 flex-1">
                <Link to="/market" search={{ q: `${g.setName} ${card.number}`.trim() }}><Tag className="mr-1 h-3.5 w-3.5" /> Shop</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-8 flex-1">
                <Link to="/trades/discover" search={{ q: `${g.setName} ${card.number}`.trim() }}><ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Find a trade</Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <div className={`rounded-md border p-1.5 ${n > 0 ? "border-primary/40 text-foreground" : "text-muted-foreground"}`}>
      {icon}
      <p className="mt-0.5 font-bold">{n}</p>
      <p className="text-[8px]">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold"><Layers className="h-3.5 w-3.5" /> {title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ to, search, title, sub }: { to: string; search?: Record<string, unknown>; title: string; sub: string }) {
  return (
    <Link to={to as any} search={search as any} className="flex items-center justify-between gap-2 rounded-md border p-1.5 text-xs hover:bg-muted/50">
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
