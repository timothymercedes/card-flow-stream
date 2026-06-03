import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { getMissingCardCenter, bulkAddMissingToWishlist } from "@/lib/collection.functions";
import { addWishlistItem } from "@/lib/wishlist.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, ArrowLeft, Tag, ArrowLeftRight, Heart, Gavel, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/collection/missing")({
  head: () => ({
    meta: [
      { title: "Missing Card Center — PullBid Live" },
      { name: "description", content: "Every card you still need across your sets — buy, trade, or wishlist them in one place." },
    ],
  }),
  component: MissingCenter,
});

type Group = Awaited<ReturnType<typeof getMissingCardCenter>>["groups"][number];
type Missing = Group["missing"][number];

function MissingCenter() {
  const { user } = useAuth();
  const getCenter = useServerFn(getMissingCardCenter);
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
          <h1 className="mt-3 text-xl font-bold">Missing Card Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to see every card you still need.</p>
          <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
        </div>
      </AppShell>
    );
  }

  const groups = q.data?.groups ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link to="/collection" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Collection Books
        </Link>
        <header className="flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Missing Card Center</h1>
            <p className="text-xs text-muted-foreground">Every card you still need — ranked by how close each set is.</p>
          </div>
        </header>

        {q.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Finding your missing cards…</p>}

        {!q.isLoading && groups.length === 0 && (
          <Card className="p-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-amber-500" />
            <p className="mt-3 font-medium">Nothing missing right now</p>
            <p className="mt-1 text-sm text-muted-foreground">Add more cards to your Vault to start tracking sets, or your in-progress sets have no catalog previews yet.</p>
            <Button asChild className="mt-4"><Link to="/collection">View Collection Books</Link></Button>
          </Card>
        )}

        {groups.map((g) => <MissingGroup key={g.category + g.setName} group={g} />)}
      </div>
    </AppShell>
  );
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

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="default" className="h-8" onClick={addAll} disabled={adding}>
          <Heart className="mr-1 h-3.5 w-3.5" /> Add all to wishlist
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/market" search={{ q: g.setName }}><Tag className="mr-1 h-3.5 w-3.5" /> Shop set</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/trades" search={{ q: g.setName }}><ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Trade</Link>
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {g.missing.map((c) => (
          <MissingCard key={c.number + c.name} card={c} setName={g.setName} category={g.category} />
        ))}
      </div>
    </Card>
  );
}

function MissingCard({ card, setName, category }: { card: Missing; setName: string; category: string }) {
  const addWish = useServerFn(addWishlistItem);
  const [added, setAdded] = useState(false);
  const onWish = async () => {
    try {
      await addWish({ data: {
        name: card.name, set_name: setName, tcg_number: card.number, category,
        image_url: card.image_url, notify_sale: true, notify_trade: true, notify_live: true,
      } });
      setAdded(true);
      toast.success("Added to wishlist");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const buyLabel = card.listingsCount > 0 ? "Buy" : card.auctionCount > 0 ? "Bid" : "Find";
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[3/4] bg-muted">
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} className="h-full w-full object-cover grayscale-[35%]" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><BookOpen className="h-6 w-6" /></div>
        )}
        {card.listingsCount > 0 && <Badge className="absolute left-1 top-1 border-0 bg-green-600 text-[9px] text-white">For sale</Badge>}
        {card.auctionCount > 0 && <Badge className="absolute left-1 bottom-1 border-0 bg-purple-600 text-[9px] text-white">Auction</Badge>}
        {card.tradeCount > 0 && <Badge className="absolute right-1 top-1 border-0 bg-blue-600 text-[9px] text-white">Trade</Badge>}
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-medium">{card.name}</p>
        <p className="text-[10px] text-muted-foreground">#{card.number}{card.value > 0 ? ` · $${card.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}</p>
        <div className="mt-1.5 flex gap-1">
          <Button asChild size="sm" variant="secondary" className="h-7 flex-1 px-2 text-[10px]">
            <Link to="/market" search={{ q: `${setName} ${card.number}`.trim() }}>
              {card.auctionCount > 0 ? <Gavel className="h-3 w-3" /> : card.listingsCount > 0 ? <Tag className="h-3 w-3" /> : <Search className="h-3 w-3" />}
              <span className="ml-1">{buyLabel}</span>
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={onWish} disabled={added} aria-label="Add to wishlist">
            <Heart className={`h-3 w-3 ${added ? "fill-primary text-primary" : ""}`} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
