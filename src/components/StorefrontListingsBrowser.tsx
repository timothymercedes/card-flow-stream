import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Package, Search } from "lucide-react";
import { getListingPriceDisplay } from "@/lib/listingDisplay";

type Listing = any;
type Sort = "newest" | "ending_soon" | "price_low" | "price_high";
type Kind = "all" | "buy_now" | "auction" | "offer";

export function StorefrontListingsBrowser({ listings }: { listings: Listing[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [kind, setKind] = useState<Kind>("all");
  const [condition, setCondition] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [maxPrice, setMaxPrice] = useState<string>("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    listings.forEach((l) => l.category && set.add(String(l.category)));
    return Array.from(set).sort();
  }, [listings]);

  const conditions = useMemo(() => {
    const set = new Set<string>();
    listings.forEach((l) => l.condition && set.add(String(l.condition)));
    return Array.from(set).sort();
  }, [listings]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const maxP = maxPrice ? Number(maxPrice) : null;
    let out = listings.filter((l) => {
      if (kind === "buy_now" && !(l.listing_type === "buy_now" || l.buy_now_price != null)) return false;
      if (kind === "auction" && !l.is_auction) return false;
      if (kind === "offer" && !l.accepts_offers) return false;
      if (condition !== "all" && l.condition !== condition) return false;
      if (category !== "all" && l.category !== category) return false;
      if (maxP != null && !Number.isNaN(maxP)) {
        const p = Number(l.buy_now_price ?? l.price ?? l.current_bid ?? l.starting_bid ?? 0);
        if (p > maxP) return false;
      }
      if (ql) {
        const hay = `${l.title ?? ""} ${l.tcg_set ?? ""} ${l.tcg_number ?? ""} ${l.category ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "ending_soon") {
        const ax = a.auction_ends_at ? new Date(a.auction_ends_at).getTime() : Number.POSITIVE_INFINITY;
        const bx = b.auction_ends_at ? new Date(b.auction_ends_at).getTime() : Number.POSITIVE_INFINITY;
        return ax - bx;
      }
      if (sort === "price_low" || sort === "price_high") {
        const ap = Number(a.buy_now_price ?? a.price ?? a.current_bid ?? a.starting_bid ?? 0);
        const bp = Number(b.buy_now_price ?? b.price ?? b.current_bid ?? b.starting_bid ?? 0);
        return sort === "price_low" ? ap - bp : bp - ap;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return out;
  }, [listings, q, sort, kind, condition, category, maxPrice]);

  const kinds: { id: Kind; label: string }[] = [
    { id: "all", label: "All" },
    { id: "buy_now", label: "Buy Now" },
    { id: "auction", label: "Auctions" },
    { id: "offer", label: "Make Offer" },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this storefront…"
            className="w-full rounded-lg bg-input pl-7 pr-3 py-2 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {kinds.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-full px-2.5 py-1 font-bold ${kind === k.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md bg-muted px-2 py-1">
            <option value="newest">Newest</option>
            <option value="ending_soon">Ending soon</option>
            <option value="price_low">Price ↑</option>
            <option value="price_high">Price ↓</option>
          </select>
          {categories.length > 0 && (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md bg-muted px-2 py-1">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {conditions.length > 0 && (
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className="rounded-md bg-muted px-2 py-1">
              <option value="all">All conditions</option>
              {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Max $"
            inputMode="decimal"
            className="w-20 rounded-md bg-muted px-2 py-1"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">{filtered.length} of {listings.length}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">No items match your filters.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((l) => {
            const display = getListingPriceDisplay(l);
            return (
              <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="overflow-hidden rounded-xl bg-card">
                <div className="aspect-square overflow-hidden bg-muted">
                  {l.image_url ? (
                    <img src={l.image_url} alt={l.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"><Package className="h-8 w-8 text-muted-foreground" /></div>
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                  {display.kind === "offer" ? (
                    <span className="mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Make Offer</span>
                  ) : (
                    <p className="text-xs text-primary">{display.label}{display.suffix ? ` ${display.suffix}` : ""}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
