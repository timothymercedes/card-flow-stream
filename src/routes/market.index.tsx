import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Search, Sparkles, Flame, Clock, Tag } from "lucide-react";
import { LISTING_CATEGORIES, categoryEmoji, categoryLabel } from "@/lib/listingCategories";
import { SellerBadge } from "@/components/SellerBadge";
import { getListingPriceDisplay, isPublicListingVisible } from "@/lib/listingDisplay";
import { useShuffleBucket, seededHash } from "@/lib/shuffle";
import { WatchTutorial } from "@/components/WatchTutorial";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

export const Route = createFileRoute("/market/")({ component: Market });

type Sort = "shuffled" | "newest" | "price_asc" | "price_desc" | "ending_soon" | "fast_shipping";

// Shuffle seed rotates every 5 minutes (see @/lib/shuffle).

function fmtRemain(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function Market() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("shuffled");
  const [category, setCategory] = useState<string>("all");
  const seed = useShuffleBucket();

  async function loadMarket() {
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) { console.error("[market] listings query failed", error); return; }
    setItems(((data || []) as any[]).filter(isPublicListingVisible));
  }
  useEffect(() => { loadMarket(); }, []);

  // Realtime: new listings, bid bumps, and sold-outs reflect across the marketplace
  useRealtimeTable(
    { name: "market-listings", table: "listings", debounceMs: 500 },
    () => loadMarket()
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of items) {
      const k = l.category || "other";
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let arr = items.filter((l) => {
      if (category !== "all" && (l.category || "other") !== category) return false;
      if (!term) return true;
      return (
        l.title?.toLowerCase().includes(term) ||
        l.description?.toLowerCase().includes(term) ||
        l.tcg_set?.toLowerCase().includes(term) ||
        l.tcg_number?.toLowerCase().includes(term)
      );
    });
    const priceOf = (l: any) => getListingPriceDisplay(l).amount;
    switch (sort) {
      case "price_asc": arr = [...arr].sort((a, b) => priceOf(a) - priceOf(b)); break;
      case "price_desc": arr = [...arr].sort((a, b) => priceOf(b) - priceOf(a)); break;
      case "ending_soon":
        arr = [...arr].sort((a, b) => {
          const ae = a.auction_ends_at ? new Date(a.auction_ends_at).getTime() : Infinity;
          const be = b.auction_ends_at ? new Date(b.auction_ends_at).getTime() : Infinity;
          return ae - be;
        });
        break;
      case "shuffled":
        arr = [...arr].sort((a, b) => seededHash(a.id, seed) - seededHash(b.id, seed));
        break;
      default: break;
    }
    return arr;
  }, [items, q, sort, category, seed]);

  const trendingCount = items.filter((l) => l.is_auction && (l.current_bid || 0) > (l.starting_bid || 0)).length;
  const endingSoonCount = items.filter((l) => {
    if (!l.auction_ends_at) return false;
    const ms = new Date(l.auction_ends_at).getTime() - Date.now();
    return ms > 0 && ms < 24 * 3600 * 1000;
  }).length;

  return (
    <AppShell>
      <div className="px-4 py-4">
        {/* Hero */}
        <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold">Marketplace</h1>
            </div>
            <WatchTutorial routePath="/market" label="How it works" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Trading cards • Funko Pops • Anime figures • Memorabilia
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-card/80 px-2.5 py-1">{items.length} live listings</span>
            {trendingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2.5 py-1 text-orange-500">
                <Flame className="h-3 w-3" /> {trendingCount} trending
              </span>
            )}
            {endingSoonCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2.5 py-1 text-destructive">
                <Clock className="h-3 w-3" /> {endingSoonCount} ending in 24h
              </span>
            )}
          </div>
        </div>

        {/* Search + sort */}
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Pikachu, Luffy, Funko #42…"
              className="w-full rounded-full bg-input py-2 pl-9 pr-3 text-sm outline-none"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-full bg-input px-3 py-2 text-xs font-semibold"
          >
            <option value="shuffled">Discover</option>
            <option value="newest">Newest</option>
            <option value="price_asc">Lowest price</option>
            <option value="price_desc">Highest price</option>
            <option value="ending_soon">Ending soon</option>
          </select>
        </div>

        {/* Category chips */}
        <div className="mb-4 -mx-4 overflow-x-auto px-4">
          <div className="flex gap-2 pb-1">
            <button
              onClick={() => setCategory("all")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${category === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              ✨ All ({items.length})
            </button>
            {LISTING_CATEGORIES.map((c) => {
              const n = counts[c.value] || 0;
              return (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${category === c.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                >
                  {c.emoji} {c.label}{n > 0 && <span className="ml-1 opacity-60">({n})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {visible.length === 0 && (
          <div className="rounded-2xl bg-card py-12 text-center">
            <Tag className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold">No listings match</p>
            <p className="mt-1 text-xs text-muted-foreground">Try another category or clear your search.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((l) => {
            const display = getListingPriceDisplay(l, true);
            const remain = fmtRemain(l.is_auction ? l.auction_ends_at : l.expires_at);
            const hot = l.is_auction && (l.current_bid || 0) > (l.starting_bid || 0);
            const endingSoon = l.auction_ends_at && new Date(l.auction_ends_at).getTime() - Date.now() < 24 * 3600 * 1000;
            const soldOut = !l.is_auction && Number(l.sold_count ?? 0) >= Number(l.quantity ?? 1);
            return (
              <CardQuickActions
                key={l.id}
                sellerId={l.seller_id}
                previewHref={`/market/${l.id}`}
                className="overflow-hidden rounded-xl"
              >
              <Link
                to="/market/$id"
                params={{ id: l.id }}
                className="group block overflow-hidden rounded-xl bg-card transition hover:scale-[1.02] hover:shadow-lg"
              >
                <div className="relative aspect-square overflow-hidden bg-muted">
                  {l.image_url ? (
                    <img src={l.image_url} loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" alt={l.title} />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />
                  )}
                  {/* Top badges */}
                  <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                    {hot && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                        <Flame className="h-2.5 w-2.5" /> Hot
                      </span>
                    )}
                    {endingSoon && (
                      <span className="rounded-full bg-destructive/90 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                        Ending soon
                      </span>
                    )}
                    {(l as any).is_demo && (
                      <span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                        DEMO
                      </span>
                    )}
                  </div>
                  {soldOut && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <span className="rounded-full bg-destructive px-3 py-1 text-[11px] font-extrabold text-white">SOLD OUT</span>
                    </div>
                  )}
                  {l.category && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                      {categoryEmoji(l.category)}
                    </span>
                  )}
                  {l.is_auction && (
                    <span className="absolute bottom-1.5 right-1.5 rounded-full bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                      AUCTION
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-1 text-sm font-semibold">{l.title}</p>
                  <div className="mt-1"><SellerBadge sellerId={l.seller_id} linkable={false} /></div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    {display.kind === "price" ? (
                      <p className="text-sm font-bold text-primary">
                        {display.label}
                        {display.suffix && <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{display.suffix}</span>}
                      </p>
                    ) : display.kind === "offer" ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Make Offer</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                    {l.condition && (
                      <span className="rounded bg-muted px-1 text-[9px] font-bold text-muted-foreground">{l.condition}</span>
                    )}
                  </div>
                  {remain && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" /> {remain}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
