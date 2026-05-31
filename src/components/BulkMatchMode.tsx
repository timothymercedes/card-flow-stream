import { useEffect, useRef, useState } from "react";
import { X, Search, Loader2, Check, ImageOff, ChevronLeft, ChevronRight, SkipForward } from "lucide-react";
import type { MatchOption } from "@/components/CardMatchPicker";

type FetchOpts = { name?: string; set?: string; number?: string; category?: string };

export type BulkCard = {
  id: string;
  name?: string | null;
  tcg_set?: string | null;
  tcg_number?: string | null;
  tcg_year?: string | null;
  category?: string | null;
  rarity?: string | null;
  confidence_score?: number | null;
  needs_review?: boolean | null;
};

/**
 * Bulk Match Mode — step through every card in the Review Queue and fix matches
 * one tap at a time. Swipe (or use the arrows / keyboard) to move between cards;
 * tap a suggested card to apply the correct match and auto-advance.
 */
export function BulkMatchMode({
  cards,
  fetchMatches,
  onApply,
  uploadedImageFor,
  onClose,
}: {
  cards: BulkCard[];
  fetchMatches: (opts: FetchOpts) => Promise<MatchOption[]>;
  onApply: (card: BulkCard, match: MatchOption) => Promise<void> | void;
  uploadedImageFor: (card: BulkCard) => string | undefined;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const touchX = useRef<number | null>(null);

  const total = cards.length;
  const card = cards[Math.min(index, total - 1)];

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

  // Load matches whenever the active card changes.
  useEffect(() => {
    if (!card) return;
    setQuery(card.name || "");
    run({
      name: card.name || undefined,
      set: card.tcg_set || undefined,
      number: card.tcg_number || undefined,
      category: card.category || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  function go(delta: number) {
    setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
  }

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  async function pick(m: MatchOption) {
    if (!card) return;
    setApplyingId(m.id);
    try {
      await onApply(card, m);
      // Advance to next card, or close when finished.
      if (index >= total - 1) onClose();
      else setIndex((i) => i + 1);
    } finally {
      setApplyingId(null);
    }
  }

  if (!card) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <div className="rounded-2xl bg-card p-6 text-center" onClick={(e) => e.stopPropagation()}>
          <Check className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 font-bold">Review queue is clear</p>
          <button onClick={onClose} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Done</button>
        </div>
      </div>
    );
  }

  const uploaded = uploadedImageFor(card);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/80 p-4" onClick={onClose}>
      <div
        className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-card p-4"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (dx < -50) go(1);
          else if (dx > 50) go(-1);
          touchX.current = null;
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold">Bulk Match</p>
            <p className="text-[11px] text-muted-foreground">Card {index + 1} of {total} · swipe to move</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        {/* Active card */}
        <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-2">
          {uploaded
            ? <img src={uploaded} alt="Your card" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
            : <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg bg-muted"><ImageOff className="h-4 w-4 text-muted-foreground" /></div>}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Your card</p>
            <p className="line-clamp-1 text-sm font-semibold">{card.name || "Unknown card"}</p>
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {[card.category, card.tcg_set, card.tcg_number && `#${card.tcg_number}`].filter(Boolean).join(" • ") || "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Tap the correct card below to fix this match.</p>
          </div>
        </div>

        {/* Nav + search */}
        <div className="flex items-center gap-2">
          <button onClick={() => go(-1)} disabled={index === 0} className="rounded-lg bg-muted p-2 disabled:opacity-40" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <form
            onSubmit={(e) => { e.preventDefault(); run({ name: query.trim() || undefined, category: card.category || undefined }); }}
            className="flex flex-1 items-center gap-2"
          >
            <div className="flex flex-1 items-center gap-2 rounded-lg bg-input px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-sm outline-none" />
            </div>
          </form>
          <button onClick={() => go(1)} disabled={index >= total - 1} className="rounded-lg bg-muted p-2 disabled:opacity-40" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
        </div>

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
                  {m.image
                    ? <img src={m.image} alt={m.name} loading="lazy" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No image</div>}
                  {applyingId === m.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>
                  )}
                  <div className="absolute right-1 top-1 rounded-full bg-primary p-1 opacity-0 transition group-hover:opacity-100"><Check className="h-3 w-3 text-primary-foreground" /></div>
                </div>
                <div className="p-1.5">
                  <p className="line-clamp-1 text-[11px] font-semibold">{m.name}</p>
                  <p className="line-clamp-1 text-[9px] text-muted-foreground">{[m.set, m.number && `#${m.number}`, m.year].filter(Boolean).join(" • ") || "—"}</p>
                  {m.rarity && <p className="line-clamp-1 text-[9px] text-muted-foreground">{m.rarity}</p>}
                  {typeof m.price === "number" && m.price > 0 && <p className="text-[11px] font-bold text-primary">${m.price.toFixed(2)}</p>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Skip */}
        <button onClick={() => (index >= total - 1 ? onClose() : go(1))} className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted py-2.5 text-sm font-semibold text-muted-foreground">
          <SkipForward className="h-4 w-4" /> Skip for now
        </button>
      </div>
    </div>
  );
}
