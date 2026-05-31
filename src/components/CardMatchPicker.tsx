import { useEffect, useRef, useState } from "react";
import { X, Search, Loader2, Check, ImageOff, PencilLine } from "lucide-react";

// A possible catalog match. Structurally compatible with the Vault `Alt` type.
export type MatchOption = {
  id: string;
  name: string;
  set?: string;
  number?: string;
  image?: string;
  price?: number;
  year?: string;
  category?: string;
  rarity?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tcgPrices?: any;
};

// Free-form manual entry for collectors who know exactly what card they have.
export type ManualCardEntry = {
  name: string;
  set?: string;
  number?: string;
  year?: string;
  condition?: string;
  notes?: string;
};

type FetchOpts = { name?: string; set?: string; number?: string; category?: string };

const CONDITIONS = ["NM", "LP", "MP", "Damaged"] as const;


/**
 * Visual card-matching modal. Shows the uploaded card at the top and a grid of
 * possible matches below — the user simply taps the correct card image.
 * Works for any TCG category (Pokémon, One Piece, Yu-Gi-Oh!, MTG, Lorcana,
 * Dragon Ball, Digimon, Sports, …) because matching is delegated to `fetchMatches`.
 */
export function CardMatchPicker({
  uploadedImage,
  card,
  fetchMatches,
  onSelect,
  onClose,
}: {
  uploadedImage?: string | null;
  card: { name?: string | null; tcg_set?: string | null; tcg_number?: string | null; category?: string | null };
  fetchMatches: (opts: FetchOpts) => Promise<MatchOption[]>;
  onSelect: (match: MatchOption) => Promise<void> | void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [query, setQuery] = useState(card.name || "");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const ranInitial = useRef(false);

  async function run(opts: FetchOpts) {
    setLoading(true);
    try {
      const rows = await fetchMatches(opts);
      setMatches(rows.slice(0, 20));
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ranInitial.current) return;
    ranInitial.current = true;
    run({
      name: card.name || undefined,
      set: card.tcg_set || undefined,
      number: card.tcg_number || undefined,
      category: card.category || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(m: MatchOption) {
    setApplyingId(m.id);
    try {
      await onSelect(m);
      onClose();
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-bold">Pick the correct card</p>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {/* Uploaded card */}
        {uploadedImage && (
          <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-2">
            <img src={uploadedImage} alt="Your card" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Your card</p>
              <p className="line-clamp-1 text-sm font-semibold">{card.name || "Unknown card"}</p>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                {[card.category, card.tcg_set, card.tcg_number && `#${card.tcg_number}`].filter(Boolean).join(" • ") || "—"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Tap the matching card below.</p>
            </div>
          </div>
        )}

        {/* Search */}
        <form
          onSubmit={(e) => { e.preventDefault(); run({ name: query.trim() || undefined, category: card.category || undefined }); }}
          className="flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-input px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name (any language)…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
            Search
          </button>
        </form>

        {/* Matches */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding matches…
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-10 text-center text-sm text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <p>No matches found. Try a different search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => pick(m)}
                disabled={!!applyingId}
                className="group overflow-hidden rounded-xl bg-muted/40 text-left ring-1 ring-border/60 transition hover:ring-primary active:scale-[0.98] disabled:opacity-60"
              >
                <div className="relative aspect-[3/4] bg-muted">
                  {m.image ? (
                    <img src={m.image} alt={m.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No image</div>
                  )}
                  {applyingId === m.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  <div className="absolute right-1 top-1 rounded-full bg-primary p-1 opacity-0 transition group-hover:opacity-100">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
                <div className="p-1.5">
                  <p className="line-clamp-1 text-[11px] font-semibold">{m.name}</p>
                  <p className="line-clamp-1 text-[9px] text-muted-foreground">
                    {[m.set, m.number && `#${m.number}`, m.year].filter(Boolean).join(" • ") || "—"}
                  </p>
                  {m.rarity && <p className="line-clamp-1 text-[9px] text-muted-foreground">{m.rarity}</p>}
                  {typeof m.price === "number" && m.price > 0 && (
                    <p className="text-[11px] font-bold text-primary">${m.price.toFixed(2)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
