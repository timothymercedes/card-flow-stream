import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Search, Sparkles, Flame, Clock, Tag, ChevronDown, Check, X, SlidersHorizontal, ArrowLeftRight } from "lucide-react";
import { LISTING_CATEGORIES, categoryEmoji, categoryLabel } from "@/lib/listingCategories";
import { SellerBadge } from "@/components/SellerBadge";
import { getListingPriceDisplay, isPublicListingVisible } from "@/lib/listingDisplay";
import { useShuffleBucket, seededHash } from "@/lib/shuffle";
import { WatchTutorial } from "@/components/WatchTutorial";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { MarketQuickView } from "@/components/MarketQuickView";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Button } from "@/components/ui/button";
import { MARKET_DEPARTMENTS, filterFields, retainCommonFilters, GENERAL_CONDITIONS } from "@/lib/marketplaceDepartments";
import { searchMarketplace } from "@/lib/marketplaceSearch";

export const Route = createFileRoute("/market/")({
  validateSearch: zodValidator(z.object({ q: z.string().optional(), department: z.string().optional(), category: z.string().optional(), filters: z.record(z.string(), z.string()).optional(), sort: z.string().optional(), page: z.number().optional() })),
  head: () => ({ meta: [
    { title: "Marketplace — PullBid Live" },
    { name: "description", content: "Browse products, collectibles, auctions and offers across every PullBid Live department." },
    { property: "og:title", content: "Marketplace — PullBid Live" },
    { property: "og:description", content: "Find products and collectibles from PullBid Live sellers." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Market,
});

type Sort = "shuffled" | "newest" | "price_asc" | "price_desc" | "ending_soon" | "fast_shipping";
type ListingFilter = "all" | "auction" | "buy_now" | "make_offer" | "ending_soon" | "trending" | "newly_listed";

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
  const [loading, setLoading] = useState(true);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/market/' });
  const q = search.q ?? '';
  const department = MARKET_DEPARTMENTS.some(d => d.value === search.department) ? search.department ?? 'all' : 'all';
  const filters = search.filters ?? {};
  const page = Math.max(1, search.page ?? 1);
  const [total, setTotal] = useState(0);
  const [searchError, setSearchError] = useState('');
  const update = (next: Partial<typeof search>) => navigate({ search: prev => ({ ...prev, ...next, page: next.page ?? 1 }), replace: true });
  const setQ = (q: string) => update({ q });
  const setCategory = (category: string) => update({ category });
  const category = search.category ?? 'all';
  const sort = (search.sort ?? 'shuffled') as Sort;
  const setSort = (sort: Sort) => update({ sort });
  const listingFilter = (filters.kind ?? 'all') as ListingFilter;
  const setListingFilter = (kind: ListingFilter) => update({ filters: { ...filters, kind } });
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [quickView, setQuickView] = useState<any | null>(null);
  const seed = useShuffleBucket();

  async function loadMarket() {
    setLoading(true);
    try {
      const result = await searchMarketplace(q, department, { ...filters, ...(category !== 'all' ? { category } : {}), sort }, page);
      setItems(result.items);
      setTotal(result.total);
      setSearchError('');
    } catch (error) { setSearchError(error instanceof Error ? error.message : 'Search unavailable'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await searchMarketplace(q, department, { ...filters, ...(category !== 'all' ? { category } : {}), sort }, page);
        if (active) { setItems(result.items); setTotal(result.total); setSearchError(''); }
      } catch (error) { if (active) setSearchError(error instanceof Error ? error.message : 'Search unavailable'); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [q, department, category, JSON.stringify(filters), sort, page]);

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
    let arr = [...items];
    // Apply listing type filter
    switch (listingFilter) {
      case "auction":
        arr = arr.filter((l) => l.is_auction);
        break;
      case "buy_now":
        arr = arr.filter((l) => !l.is_auction && (l.price ?? 0) > 0);
        break;
      case "make_offer":
        arr = arr.filter((l) => {
          const d = getListingPriceDisplay(l, true);
          return d.kind === "offer";
        });
        break;
      case "ending_soon":
        arr = arr.filter((l) => l.auction_ends_at && new Date(l.auction_ends_at).getTime() - Date.now() < 24 * 3600 * 1000);
        arr = arr.sort((a, b) => new Date(a.auction_ends_at).getTime() - new Date(b.auction_ends_at).getTime());
        break;
      case "trending":
        arr = arr.filter((l) => l.is_auction && (l.current_bid || 0) > (l.starting_bid || 0));
        break;
      case "newly_listed":
        arr = arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      default:
        break;
    }
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
  }, [items, q, sort, category, seed, listingFilter]);

  const trendingCount = items.filter((l) => l.is_auction && (l.current_bid || 0) > (l.starting_bid || 0)).length;
  const endingSoonCount = items.filter((l) => {
    if (!l.auction_ends_at) return false;
    const ms = new Date(l.auction_ends_at).getTime() - Date.now();
    return ms > 0 && ms < 24 * 3600 * 1000;
  }).length;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        {/* Hero */}
        <div
          className="mb-4 overflow-hidden rounded-2xl border border-border/60 p-4 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-surface)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Marketplace</h1>
            </div>
            <WatchTutorial routePath="/market" label="How it works" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Products • Collectibles • Auctions • Offers
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-card/80 px-2.5 py-1 ring-1 ring-border/60">{total} live listings</span>
            {trendingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-orange-500 ring-1 ring-orange-500/30">
                <Flame className="h-3 w-3" /> {trendingCount} trending
              </span>
            )}
            {endingSoonCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-destructive ring-1 ring-destructive/30">
                <Clock className="h-3 w-3" /> {endingSoonCount} ending in 24h
              </span>
            )}
          </div>
        </div>

        {/* Sticky search + sort + categories */}
        <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search marketplace" placeholder="Search products, brands, stores…"
                className="w-full rounded-full bg-input/60 py-2 pl-9 pr-3 text-sm shadow-[var(--shadow-xs)] outline-none ring-1 ring-border/60 focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>

            {/* Filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-input/60 px-3 py-2 text-xs font-semibold ring-1 ring-border/60 hover:bg-muted/70"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {listingFilter === "all" && "All"}
                  {listingFilter === "auction" && "Auction"}
                  {listingFilter === "buy_now" && "Buy Now"}
                  {listingFilter === "make_offer" && "Make Offer"}
                  {listingFilter === "ending_soon" && "Ending Soon"}
                  {listingFilter === "trending" && "Trending"}
                  {listingFilter === "newly_listed" && "New"}
                </span>
                <ChevronDown className={`h-3 w-3 transition ${filterOpen ? "rotate-180" : ""}`} />
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-border/60 bg-card p-1.5 shadow-[var(--shadow-lg)]">
                    {[
                      { key: "all", label: "All Listings", icon: "✨" },
                      { key: "auction", label: "Auction", icon: "🔨" },
                      { key: "buy_now", label: "Buy Now", icon: "💰" },
                      { key: "make_offer", label: "Make Offer", icon: "🤝" },
                      { key: "ending_soon", label: "Ending Soon", icon: "⏰" },
                      { key: "trending", label: "Trending", icon: "🔥" },
                      { key: "newly_listed", label: "Newly Listed", icon: "🆕" },
                    ].map((f) => (
                      <button
                        key={f.key}
                        onClick={() => { setListingFilter(f.key as ListingFilter); setFilterOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${listingFilter === f.key ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      >
                        <span>{f.icon}</span>
                        <span className="flex-1">{f.label}</span>
                        {listingFilter === f.key && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setSortOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-input/60 px-3 py-2 text-xs font-semibold ring-1 ring-border/60 hover:bg-muted/70"
              >
                <span className="hidden sm:inline">
                  {sort === "shuffled" && "Discover"}
                  {sort === "newest" && "Newest"}
                  {sort === "price_asc" && "Lowest Price"}
                  {sort === "price_desc" && "Highest Price"}
                  {sort === "ending_soon" && "Ending Soon"}
                </span>
                <ChevronDown className={`h-3 w-3 transition ${sortOpen ? "rotate-180" : ""}`} />
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-border/60 bg-card p-1.5 shadow-[var(--shadow-lg)]">
                    {[
                      { key: "shuffled", label: "Discover" },
                      { key: "newest", label: "Newest" },
                      { key: "price_asc", label: "Lowest Price" },
                      { key: "price_desc", label: "Highest Price" },
                      { key: "ending_soon", label: "Ending Soon" },
                    ].map((s) => (
                      <button
                        key={s.key}
                        onClick={() => { setSort(s.key as Sort); setSortOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${sort === s.key ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      >
                        <span className="flex-1">{s.label}</span>
                        {sort === s.key && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div role="tablist" aria-label="Marketplace departments" className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {[{ value: 'all', label: 'All' }, ...MARKET_DEPARTMENTS].map(d => <Button key={d.value} role="tab" aria-selected={department === d.value} size="sm" variant={department === d.value ? 'default' : 'ghost'} className="shrink-0 rounded-full text-xs" onClick={() => update({ department: d.value, category: 'all', filters: retainCommonFilters(filters) })}>{d.label}</Button>)}
          </div>
          {/* Category dropdown */}
          <div className="relative mt-2">
            <button
              onClick={() => setCatOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-full bg-input/60 px-3 py-1.5 text-xs font-semibold ring-1 ring-border/60 hover:bg-muted/70"
            >
              <span>{category === "all" ? "✨" : categoryEmoji(category)}</span>
              <span className="flex-1 text-left">{category === "all" ? "All Categories" : categoryLabel(category)}</span>
              <span className="text-[10px] text-muted-foreground">
                {category === "all" ? items.length : (counts[category] || 0)}
              </span>
              <ChevronDown className={`h-3 w-3 transition ${catOpen ? "rotate-180" : ""}`} />
            </button>
            {catOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCatOpen(false)} />
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-card p-1.5 shadow-[var(--shadow-lg)]">
                  <button
                    onClick={() => { setCategory("all"); setCatOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${category === "all" ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    <span>✨</span>
                    <span className="flex-1">All Categories</span>
                    <span className="text-[10px] text-muted-foreground">{items.length}</span>
                    {category === "all" && <Check className="h-3.5 w-3.5" />}
                  </button>
                  {(department === "all" || department === "collectibles" ? LISTING_CATEGORIES : []).map((c) => {
                    const n = counts[c.value] || 0;
                    return (
                      <button
                        key={c.value}
                        onClick={() => { setCategory(c.value); setCatOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${category === c.value ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      >
                        <span>{c.emoji}</span>
                        <span className="flex-1">{c.label}</span>
                        <span className="text-[10px] text-muted-foreground">{n}</span>
                        {category === c.value && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          {['min_price', 'max_price', ...filterFields(department), ...(department === 'collectibles' ? ['set','number'] : [])].map(key => <label key={key} className="text-[11px] capitalize text-muted-foreground">{key.replaceAll('_',' ')}
            <input aria-label={`Filter ${key.replaceAll('_',' ')}`} value={filters[key] ?? ''} type={['min_price','max_price','year','max_mileage'].includes(key) ? 'number' : 'text'} min="0" className="mt-1 block w-28 rounded-lg bg-input px-2 py-1.5 text-xs text-foreground" onChange={e => update({ filters: { ...filters, [key]: e.target.value } })}/>
          </label>)}
          <label className="text-[11px] text-muted-foreground">Condition
            <select aria-label="Filter condition" value={filters.condition ?? ''} className="mt-1 block rounded-lg bg-input px-2 py-1.5 text-xs text-foreground" onChange={e => update({ filters: {...filters,condition:e.target.value} })}>
              <option value="">All conditions</option>{(department === 'collectibles' ? ['NM','LP','MP','Damaged'] : department === 'all' ? [...GENERAL_CONDITIONS,'NM','LP','MP','Damaged'] : GENERAL_CONDITIONS).map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <Button variant="ghost" size="sm" onClick={() => update({ q:'', department:'all',category:'all',filters:{},sort:'shuffled' })}><X className="h-3 w-3"/> Clear</Button>
        </div>
        {searchError && <p role="alert" className="mb-3 text-sm text-destructive">{searchError} <Button variant="ghost" size="sm" onClick={loadMarket}>Retry</Button></p>}
        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl bg-card ring-1 ring-border/60 shadow-[var(--shadow-card)]">
                <div className="aspect-square animate-pulse bg-muted" />
                <div className="space-y-2 p-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 py-12 text-center">
            <Tag className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold">No listings match</p>
            <p className="mt-1 text-xs text-muted-foreground">Try another category or clear your search.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">

          {visible.map((l) => {
            const display = getListingPriceDisplay(l, true);
            const remain = fmtRemain(l.is_auction ? l.auction_ends_at : l.expires_at);
            const hot = l.is_auction && (l.current_bid || 0) > (l.starting_bid || 0);
            const endingSoon = l.auction_ends_at && new Date(l.auction_ends_at).getTime() - Date.now() < 24 * 3600 * 1000;
            const soldOut = !l.is_auction && Number(l.sold_count ?? 0) >= Number(l.quantity ?? 1);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setQuickView(l)}
                className="group block w-full overflow-hidden rounded-xl bg-card text-left shadow-[var(--shadow-card)] ring-1 ring-border/60 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Quick view ${l.title}`}
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
                    ) : display.kind === "trade" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <ArrowLeftRight className="h-3 w-3" /> Trade
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                    {(l.product_details?.condition || l.condition) && (
                      <span className="rounded bg-muted px-1 text-[9px] font-bold text-muted-foreground">{l.product_details?.condition || l.condition}</span>
                    )}
                  </div>
                  {remain && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" /> {remain}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => update({ page: page - 1 })}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} · {total} results</span>
          <Button variant="outline" disabled={page * 40 >= total || loading} onClick={() => update({ page: page + 1 })}>Next</Button>
        </div>
      </div>
      <MarketQuickView
        listing={quickView}
        open={!!quickView}
        onOpenChange={(v) => { if (!v) setQuickView(null); }}
      />
    </AppShell>
  );
}
