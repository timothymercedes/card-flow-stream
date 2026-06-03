import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProgression } from "@/hooks/useProgression";
import { progressToNextLevel } from "@/lib/progression";
import { collectorRank, nextCollectorRank } from "@/lib/collectorRank";
import { Trophy, Star, Plus, X, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type VaultCard = { id: string; name: string; image_url: string | null; showcase_order: number | null; estimated_value: number | null };

/**
 * CollectorShowcase — the "RPG" identity block (Priority 5).
 * Shows the collector's named rank, level + XP progress, achievement count,
 * and a Showcase 9 grid of pinned favorite cards (editable by the owner).
 */
export function CollectorShowcase({ userId, editable = true }: { userId: string; editable?: boolean }) {
  const { progression } = useProgression();
  const [achTotal, setAchTotal] = useState(0);
  const [achUnlocked, setAchUnlocked] = useState(0);
  const [showcase, setShowcase] = useState<VaultCard[]>([]);
  const [picking, setPicking] = useState(false);

  const level = progression?.level ?? 1;
  const xp = progression?.xp ?? 0;
  const rank = collectorRank(level);
  const next = nextCollectorRank(level);
  const prog = progressToNextLevel(xp);

  const loadShowcase = useCallback(async () => {
    const { data } = await supabase
      .from("vault_cards")
      .select("id, name, image_url, showcase_order, estimated_value")
      .eq("user_id", userId)
      .not("showcase_order", "is", null)
      .order("showcase_order", { ascending: true });
    setShowcase((data as VaultCard[]) ?? []);
  }, [userId]);

  useEffect(() => {
    supabase.from("achievements" as any).select("id", { count: "exact", head: true }).then(({ count }) => setAchTotal(count ?? 0));
    supabase.from("user_achievements" as any).select("achievement_id", { count: "exact", head: true }).eq("user_id", userId).then(({ count }) => setAchUnlocked(count ?? 0));
    loadShowcase();
  }, [userId, loadShowcase]);

  const slots = Array.from({ length: 9 }, (_, i) => showcase.find((c) => c.showcase_order === i + 1) ?? null);

  async function removeFromShowcase(card: VaultCard) {
    const { error } = await supabase.from("vault_cards").update({ showcase_order: null }).eq("id", card.id);
    if (error) return toast.error(error.message);
    loadShowcase();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
      {/* Rank + level header */}
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${rank.gradient} text-2xl shadow-md`}>
          {rank.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{rank.name}</p>
          <p className="text-[11px] text-muted-foreground">Level {level} · {xp.toLocaleString()} XP</p>
        </div>
        <Link to="/quests" className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-500">
          <Trophy className="h-3.5 w-3.5" /> {achUnlocked}/{achTotal}
        </Link>
      </div>

      {/* XP progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full bg-gradient-to-r ${rank.gradient}`} style={{ width: `${prog.pct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {next ? `${prog.current}/${prog.needed} XP to Level ${level + 1} · next rank: ${next.name} (Lv ${next.minLevel})` : `Max rank reached — ${prog.current}/${prog.needed} XP to Level ${level + 1}`}
        </p>
      </div>

      {/* Showcase 9 */}
      <div className="mt-4 flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs font-bold"><Star className="h-3.5 w-3.5 text-amber-400" /> Showcase</p>
        {editable && (
          <button onClick={() => setPicking(true)} className="flex items-center gap-1 text-[11px] font-bold text-primary">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-9">
        {slots.map((card, i) => (
          <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
            {card ? (
              <>
                {card.image_url ? <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" loading="lazy" /> : (
                  <div className="flex h-full w-full items-center justify-center p-1 text-center text-[8px] text-muted-foreground">{card.name}</div>
                )}
                {editable && (
                  <button onClick={() => removeFromShowcase(card)} aria-label="Remove" className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => editable && setPicking(true)}
                disabled={!editable}
                className="flex h-full w-full items-center justify-center text-muted-foreground/50"
              >
                {editable ? <Plus className="h-4 w-4" /> : null}
              </button>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <ShowcasePicker
          open={picking}
          onOpenChange={setPicking}
          userId={userId}
          current={showcase}
          onChanged={loadShowcase}
        />
      )}
    </div>
  );
}

function ShowcasePicker({ open, onOpenChange, userId, current, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; userId: string; current: VaultCard[]; onChanged: () => void;
}) {
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("vault_cards")
      .select("id, name, image_url, showcase_order, estimated_value")
      .eq("user_id", userId)
      .order("estimated_value", { ascending: false })
      .limit(200)
      .then(({ data }) => { setCards((data as VaultCard[]) ?? []); setLoading(false); });
  }, [open, userId, current.length]);

  const showcased = new Set(current.map((c) => c.id));

  async function add(card: VaultCard) {
    if (showcased.size >= 9) return toast.error("Showcase is full (9). Remove one first.");
    const used = new Set(current.map((c) => c.showcase_order));
    let pos = 1;
    while (used.has(pos) && pos <= 9) pos++;
    const { error } = await supabase.from("vault_cards").update({ showcase_order: pos }).eq("id", card.id);
    if (error) return toast.error(error.message);
    onChanged();
    toast.success("Added to showcase");
  }
  async function remove(card: VaultCard) {
    const { error } = await supabase.from("vault_cards").update({ showcase_order: null }).eq("id", card.id);
    if (error) return toast.error(error.message);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Pick your Showcase 9</DialogTitle></DialogHeader>
        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading vault…</p>}
        {!loading && cards.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No cards in your vault yet.</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {cards.map((card) => {
            const on = showcased.has(card.id) || current.some((c) => c.id === card.id);
            return (
              <button
                key={card.id}
                onClick={() => (on ? remove(card) : add(card))}
                className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-muted ring-2 ${on ? "ring-primary" : "ring-transparent"}`}
              >
                {card.image_url ? <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" loading="lazy" /> : (
                  <div className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] text-muted-foreground">{card.name}</div>
                )}
                {on && <span className="absolute right-1 top-1 rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">✓</span>}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
