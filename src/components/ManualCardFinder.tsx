import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, Clock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * PriceCharting-style fallback browser. Searches the free Pokémon TCG API
 * (https://api.pokemontcg.io) for cards by name + filters, with live
 * suggestions, recents (localStorage) and recently scanned (Supabase).
 *
 * Returns a card-shaped object to the caller via `onPick`. Caller decides
 * whether this replaces the AI scan or just auto-fills a form.
 */

export type FinderCard = {
  id: string;
  name: string;
  set?: string;
  set_code?: string;
  number?: string;
  rarity?: string;
  year?: string;
  is_holo?: boolean;
  is_reverse_holo?: boolean;
  subtypes?: string[];
  image_small?: string;
  image_large?: string;
  tcgplayer_price?: number;
};

type Props = {
  onPick: (card: FinderCard) => void;
  onClose: () => void;
  initialQuery?: string;
};

const RARITIES = [
  "Common", "Uncommon", "Rare", "Rare Holo", "Ultra Rare", "Secret Rare",
  "Promo", "Amazing Rare", "Illustration Rare",
];

const SUBTYPES = ["Pokémon", "Trainer", "Item", "Supporter", "Stadium", "Energy"];

const RECENT_KEY = "pbl_card_recents_v1";

function readRecents(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(RECENT_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch { return []; }
}
function pushRecent(q: string) {
  if (!q || typeof window === "undefined") return;
  const prev = readRecents().filter((r) => r.toLowerCase() !== q.toLowerCase());
  const next = [q, ...prev].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
}

function pokeQ(parts: Record<string, string | undefined>): string {
  const q: string[] = [];
  if (parts.name) q.push(`name:"${parts.name.replace(/"/g, "")}*"`);
  if (parts.number) q.push(`number:"${parts.number.split("/")[0].trim()}"`);
  if (parts.set) q.push(`set.name:"${parts.set.replace(/"/g, "")}*"`);
  if (parts.rarity) q.push(`rarity:"${parts.rarity.replace(/"/g, "")}"`);
  if (parts.subtype) q.push(`subtypes:"${parts.subtype}"`);
  return q.join(" ");
}

function mapPokeCard(c: any): FinderCard {
  return {
    id: c.id,
    name: c.name,
    set: c.set?.name,
    set_code: c.set?.id,
    number: c.number,
    rarity: c.rarity,
    year: c.set?.releaseDate ? String(c.set.releaseDate).slice(0, 4) : undefined,
    subtypes: c.subtypes,
    image_small: c.images?.small,
    image_large: c.images?.large,
    tcgplayer_price:
      c.tcgplayer?.prices?.holofoil?.market ??
      c.tcgplayer?.prices?.normal?.market ??
      c.tcgplayer?.prices?.reverseHolofoil?.market ??
      c.cardmarket?.prices?.averageSellPrice,
  };
}

function mapPriceMatch(m: any, index: number): FinderCard | null {
  const name = String(m?.name || "").trim();
  if (!name) return null;
  return {
    id: `price-${m?.set || "set"}-${m?.tcg_number || index}-${index}`,
    name,
    set: m?.set || undefined,
    number: m?.tcg_number || undefined,
    rarity: m?.rarity || undefined,
    year: m?.year || undefined,
    image_small: m?.image_url || undefined,
    image_large: m?.image_url || undefined,
    tcgplayer_price: Number(m?.estimated_value || 0) || undefined,
  };
}

export function ManualCardFinder({ onPick, onClose, initialQuery = "" }: Props) {
  const [name, setName] = useState(initialQuery);
  const [setQuery, setSetQuery] = useState("");
  const [number, setNumber] = useState("");
  const [rarity, setRarity] = useState("");
  const [subtype, setSubtype] = useState("");
  const [year, setYear] = useState("");
  const [holoOnly, setHoloOnly] = useState(false);
  const [results, setResults] = useState<FinderCard[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [recentScans, setRecentScans] = useState<FinderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debRef = useRef<number | null>(null);

  useEffect(() => { setRecents(readRecents()); }, []);

  // Recently scanned (from this user's scan history)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("scan_history")
        .select("top_name, top_set, top_number, top_rarity")
        .order("created_at", { ascending: false })
        .limit(8);
      if (data) {
        setRecentScans(data
          .filter((d) => d.top_name)
          .map((d, i) => ({
            id: `scan-${i}`,
            name: d.top_name as string,
            set: d.top_set || undefined,
            number: d.top_number || undefined,
            rarity: d.top_rarity || undefined,
          })));
      }
    })();
  }, []);

  // Debounced search
  const queryStr = useMemo(() => pokeQ({
    name: name.trim() || undefined,
    set: setQuery.trim() || undefined,
    number: number.trim() || undefined,
    rarity: rarity || undefined,
    subtype: subtype || undefined,
  }), [name, setQuery, number, rarity, subtype]);

  useEffect(() => {
    if (debRef.current) window.clearTimeout(debRef.current);
    const trimmed = name.trim();
    if (!queryStr && trimmed.length < 2) { setResults([]); return; }
    debRef.current = window.setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        // 1) Pokémon TCG API (free, public)
        let list: FinderCard[] = [];
        // Live pricing lookup first: this hits the same backend matcher used by scans,
        // including JustTCG-backed TCGplayer pricing when available.
        if (trimmed.length >= 2) {
          try {
            const params = new URLSearchParams({ name: trimmed });
            if (setQuery.trim()) params.set("set", setQuery.trim());
            if (number.trim()) params.set("number", number.trim());
            if (rarity) params.set("rarity", rarity);
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
            const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-prices?${params}`, {
              headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
            });
            if (r.ok) {
              const j = await r.json();
              const matches = Array.isArray(j?.price?.matches) ? j.price.matches : [];
              list = matches.map(mapPriceMatch).filter(Boolean) as FinderCard[];
            }
          } catch { /* fall through to public/local search */ }
        }
        if (queryStr) {
          try {
            const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryStr)}&pageSize=30&orderBy=-set.releaseDate`;
            const r = await fetch(url);
            if (r.ok) {
              const j = await r.json();
              for (const card of (j?.data || []).map(mapPokeCard)) {
                if (!list.some((c) => c.id === card.id || (c.name === card.name && c.set === card.set && c.number === card.number))) {
                  list.push(card);
                }
              }
            }
          } catch { /* fall through to local catalog */ }
        }
        // 2) Local catalog (One Piece / Lorcana / DBSFW / SW Unlimited / FAB / cached Pokémon)
        if (trimmed.length >= 2) {
          let q = supabase
            .from("tcg_prices")
            .select("tcgplayer_product_id, name, set_name, number, rarity, image_url, market_price")
            .ilike("name", `%${trimmed}%`)
            .order("market_price", { ascending: false, nullsFirst: false })
            .limit(30);
          if (setQuery.trim()) q = q.ilike("set_name", `%${setQuery.trim()}%`);
          if (number.trim()) q = q.ilike("number", `%${number.trim().split("/")[0]}%`);
          if (rarity) q = q.ilike("rarity", `%${rarity}%`);
          const { data } = await q;
          for (const row of data || []) {
            const id = `tcg-${row.tcgplayer_product_id}`;
            if (list.some((c) => c.id === id)) continue;
            list.push({
              id,
              name: row.name,
              set: row.set_name || undefined,
              number: row.number || undefined,
              rarity: row.rarity || undefined,
              image_small: row.image_url || undefined,
              image_large: row.image_url || undefined,
              tcgplayer_price: row.market_price ? Number(row.market_price) : undefined,
            });
          }
        }
        if (year) list = list.filter((c) => c.year === year);
        if (holoOnly) list = list.filter((c) => /holo|reverse|foil/i.test(c.rarity || ""));
        setResults(list);
      } catch (e: any) {
        setError(e?.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debRef.current) window.clearTimeout(debRef.current); };
  }, [queryStr, year, holoOnly, name, setQuery, number, rarity]);

  function pickAndClose(c: FinderCard) {
    pushRecent(c.name);
    onPick(c);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 p-3">
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
          <X className="h-5 w-5" />
        </button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Search card name…"
            className="w-full rounded-full bg-white/10 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-emerald-400/60"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2 border-b border-white/10 p-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            value={setQuery}
            onChange={(e) => setSetQuery(e.target.value)}
            placeholder="Set (e.g. Base, Evolving Skies)"
            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40"
          />
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Card # (e.g. 4)"
            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40"
          />
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Year (e.g. 2021)"
            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40"
          />
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white"
          >
            <option value="">Any rarity</option>
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSubtype("")}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${subtype === "" ? "bg-white text-black" : "bg-white/10 text-white"}`}
          >All</button>
          {SUBTYPES.map((s) => (
            <button
              key={s}
              onClick={() => setSubtype(subtype === s ? "" : s)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${subtype === s ? "bg-emerald-500 text-white" : "bg-white/10 text-white"}`}
            >{s}</button>
          ))}
          <button
            onClick={() => setHoloOnly((h) => !h)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${holoOnly ? "bg-fuchsia-500 text-white" : "bg-white/10 text-white"}`}
          >Holo / Reverse</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {!name && !setQuery && !number && !rarity && !subtype && (
          <div className="space-y-4">
            {recents.length > 0 && (
              <section>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white/60">
                  <Clock className="h-3 w-3" /> Recent searches
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recents.map((r) => (
                    <button
                      key={r}
                      onClick={() => setName(r)}
                      className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white"
                    >{r}</button>
                  ))}
                </div>
              </section>
            )}
            {recentScans.length > 0 && (
              <section>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white/60">
                  <Sparkles className="h-3 w-3" /> Recently scanned
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recentScans.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setName(c.name)}
                      className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white"
                    >{c.name}{c.set ? ` · ${c.set}` : ""}</button>
                  ))}
                </div>
              </section>
            )}
            <p className="pt-6 text-center text-[11px] text-white/40">
              Type a card name to begin. Filter by set, number, rarity or year.
            </p>
          </div>
        )}

        {error && <p className="text-center text-xs text-red-300">{error}</p>}
        {loading && (
          <p className="flex items-center justify-center gap-2 py-6 text-xs text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </p>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => pickAndClose(c)}
                className="overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/10 transition hover:ring-emerald-400/60"
              >
                <div className="aspect-[3/4] w-full bg-black">
                  {c.image_small ? (
                    <img src={c.image_small} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : <div className="flex h-full w-full items-center justify-center text-[10px] text-white/40">No image</div>}
                </div>
                <div className="space-y-0.5 p-2 text-white">
                  <p className="truncate text-[12px] font-bold">{c.name}</p>
                  <p className="truncate text-[10px] text-white/60">
                    {c.set || "—"}{c.number ? ` · #${c.number}` : ""}
                  </p>
                  <p className="truncate text-[10px] text-white/60">
                    {c.rarity || "—"}{c.year ? ` · ${c.year}` : ""}
                  </p>
                  {c.tcgplayer_price ? (
                    <p className="text-[10px] font-bold text-emerald-300">${c.tcgplayer_price.toFixed(2)}</p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && queryStr && results.length === 0 && !error && (
          <p className="py-6 text-center text-xs text-white/50">No matches — try a different filter.</p>
        )}
      </div>
    </div>
  );
}
