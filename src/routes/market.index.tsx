import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Search } from "lucide-react";

export const Route = createFileRoute("/market/")({ component: Market });

type Sort = "newest" | "price_asc" | "price_desc" | "ending_soon" | "fast_shipping";

function Market() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  useEffect(() => {
    supabase.from("listings").select("*").order("created_at", { ascending: false }).then(({ data }) => setItems(data || []));
  }, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let arr = items.filter((l) => {
      if (!term) return true;
      return (
        l.title?.toLowerCase().includes(term) ||
        l.description?.toLowerCase().includes(term) ||
        l.tcg_set?.toLowerCase().includes(term) ||
        l.tcg_number?.toLowerCase().includes(term)
      );
    });
    const priceOf = (l: any) => Number(l.is_auction ? l.current_bid || l.starting_bid || 0 : l.price || 0);
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
      case "fast_shipping":
        arr = [...arr].sort((a, b) => {
          const score = (l: any) => {
            const m = (l.shipping_method || "").toLowerCase();
            if (m.includes("express") || m.includes("overnight") || m.includes("priority")) return 0;
            if (m.includes("standard")) return 1;
            return 2;
          };
          return score(a) - score(b);
        });
        break;
      default: break;
    }
    return arr;
  }, [items, q, sort]);

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-3 text-2xl font-bold">Marketplace</h1>
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cards, sets..."
              className="w-full rounded-full bg-input py-2 pl-9 pr-3 text-sm outline-none"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-full bg-input px-3 py-2 text-xs font-semibold"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Lowest price</option>
            <option value="price_desc">Highest price</option>
            <option value="ending_soon">Ending soon</option>
            <option value="fast_shipping">Fast shipping</option>
          </select>
        </div>
        {visible.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No listings match</p>}
        <div className="grid grid-cols-2 gap-3">
          {visible.map((l) => (
            <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="overflow-hidden rounded-xl bg-card">
              <div className="aspect-square bg-muted">
                {l.image_url ? <img src={l.image_url} className="h-full w-full object-cover" alt={l.title} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-sm font-semibold">{l.title}</p>
                <p className="text-xs text-primary">${Number(l.is_auction ? l.current_bid || 0 : l.price || 0).toFixed(0)}{l.is_auction ? " bid" : ""}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
