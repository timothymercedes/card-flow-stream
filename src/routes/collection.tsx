import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { getCollectionBooks, getCollectionBookDetail } from "@/lib/collection.functions";
import { addWishlistItem } from "@/lib/wishlist.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { BookOpen, ArrowLeft, Search, Tag, ArrowLeftRight, Library, Heart } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "Collection Books — PullBid Live" },
      { name: "description", content: "Track your set completion, see exactly which cards you're missing, and find them for sale or trade." },
    ],
  }),
  component: CollectionPage,
});

type Book = Awaited<ReturnType<typeof getCollectionBooks>>["books"][number];

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function CollectionPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<{ setName: string; category: string } | null>(null);

  const getBooks = useServerFn(getCollectionBooks);
  const booksQ = useQuery({
    queryKey: ["collection-books"],
    queryFn: () => getBooks(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-6 text-center">
          <Library className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-bold">Collection Books</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to track your set completion and find missing cards.</p>
          <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
        </div>
      </AppShell>
    );
  }

  if (selected) {
    return <AppShell><BookDetail setName={selected.setName} category={selected.category} onBack={() => setSelected(null)} /></AppShell>;
  }

  const books = booksQ.data?.books ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <header className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Collection Books</h1>
            <p className="text-xs text-muted-foreground">Your sets, completion progress, and missing cards.</p>
          </div>
        </header>

        {booksQ.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Loading your collection…</p>}

        {!booksQ.isLoading && books.length === 0 && (
          <Card className="p-8 text-center">
            <Library className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">No collection books yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add cards to your Vault and they'll be grouped into sets here.</p>
            <Button asChild className="mt-4"><Link to="/vault">Go to Vault</Link></Button>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {books.map((b) => (
            <BookTile key={b.key} book={b} onOpen={() => setSelected({ setName: b.setName, category: b.category })} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function BookTile({ book, onOpen }: { book: Book; onOpen: () => void }) {
  return (
    <Card
      onClick={onOpen}
      className="flex cursor-pointer gap-3 p-3 transition hover:bg-accent/40"
    >
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {book.cover ? (
          <img src={book.cover} alt={book.setName} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><BookOpen className="h-6 w-6 text-muted-foreground" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold">{book.setName}</p>
          <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">{book.category}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {book.knownTotal > 0 ? `${book.ownedDistinct}/${book.knownTotal} cards` : `${book.ownedCount} cards`}
          {" · "}{money(book.totalValueCents)}
        </p>
        {book.completion != null && (
          <div className="mt-2">
            <Progress value={book.completion} className="h-1.5" />
            <p className="mt-1 text-[10px] font-medium text-muted-foreground">{book.completion}% complete</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function BookDetail({ setName, category, onBack }: { setName: string; category: string; onBack: () => void }) {
  const getDetail = useServerFn(getCollectionBookDetail);
  const q = useQuery({
    queryKey: ["collection-book", setName, category],
    queryFn: () => getDetail({ data: { setName, category } }),
  });
  const [tab, setTab] = useState("missing");

  const d = q.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All books
      </button>

      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">{setName}</h1>
          <Badge variant="secondary" className="capitalize">{category}</Badge>
        </div>
        {d && (
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              {d.knownTotal > 0 ? `${d.ownedCount} of ${d.knownTotal} cards collected` : `${d.ownedCount} cards collected`}
            </p>
            {d.completion != null && (
              <div className="mt-1.5 max-w-xs">
                <Progress value={d.completion} className="h-2" />
                <p className="mt-1 text-xs font-medium">{d.completion}% complete</p>
              </div>
            )}
          </div>
        )}
      </header>

      {q.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Loading set…</p>}

      {d && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="missing">Missing ({d.missing.length})</TabsTrigger>
            <TabsTrigger value="owned">Owned ({d.owned.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="missing" className="mt-3">
            {d.missing.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                🎉 You've collected every known card in this set!
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.missing.map((c) => (
                  <MissingCard key={c.number + c.name} card={c} setName={setName} category={category} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="owned" className="mt-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {d.owned.map((c) => (
                <Card key={c.number + c.name} className="overflow-hidden">
                  <div className="aspect-[3/4] bg-muted">
                    {c.image_url ? <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" loading="lazy" /> : null}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">#{c.number}</p>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type Missing = Awaited<ReturnType<typeof getCollectionBookDetail>>["missing"][number];

function MissingCard({ card }: { card: Missing }) {
  return (
    <Card className="overflow-hidden opacity-95">
      <div className="relative aspect-[3/4] bg-muted">
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} className="h-full w-full object-cover grayscale-[35%]" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><BookOpen className="h-6 w-6" /></div>
        )}
        {card.listingsCount > 0 && (
          <Badge className="absolute left-1 top-1 border-0 bg-green-600 text-[9px] text-white">For sale</Badge>
        )}
        {card.tradeCount > 0 && (
          <Badge className="absolute right-1 top-1 border-0 bg-blue-600 text-[9px] text-white">Trade</Badge>
        )}
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-medium">{card.name}</p>
        <p className="text-[10px] text-muted-foreground">#{card.number}{card.value > 0 ? ` · $${card.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}</p>
        <div className="mt-1.5 flex gap-1">
          <Button asChild size="sm" variant="secondary" className="h-7 flex-1 px-2 text-[10px]">
            <Link to="/market">
              {card.listingsCount > 0 ? <Tag className="h-3 w-3" /> : <Search className="h-3 w-3" />}
              <span className="ml-1">{card.listingsCount > 0 ? "Buy" : "Find"}</span>
            </Link>
          </Button>
        </div>
        {card.tradeCount > 0 && (
          <p className="mt-1 flex items-center gap-1 text-[9px] text-blue-600">
            <ArrowLeftRight className="h-3 w-3" /> {card.tradeCount} collector{card.tradeCount > 1 ? "s" : ""} open to trade
          </p>
        )}
      </div>
    </Card>
  );
}
