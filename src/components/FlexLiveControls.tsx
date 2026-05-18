import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Wand2, Smile, X, Megaphone } from "lucide-react";
import { FLEX_FILTERS, FLEX_REACTIONS, weeklyVibe } from "@/lib/flexFilters";

type FloatingReaction = { id: string; emoji: string; left: number };

/**
 * FlexLiveControls — bottom controls for show_off streams.
 * Replaces auction bidding UI. Same outer skeleton position as the auction
 * bottom-panel, but content is: Weekly Vibe banner → Reaction bar →
 * (host-only) Filter picker. Designed to NOT overlap chat (chat sits on the
 * left; this stays inside the bottom panel) or top tabs.
 */
export function FlexLiveControls({
  streamId,
  isHost,
  userId,
  username,
  currentFilter,
}: {
  streamId: string;
  isHost: boolean;
  userId: string | null;
  username: string | null;
  currentFilter: string;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const vibe = weeklyVibe();

  // Subscribe to stream_reactions for floating-emoji bursts.
  useEffect(() => {
    const ch = supabase
      .channel(`flex-reactions-${streamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stream_reactions", filter: `stream_id=eq.${streamId}` },
        (p: any) => {
          const e = p.new?.emoji || "💜";
          const id = p.new?.id || `${Date.now()}-${Math.random()}`;
          const left = 10 + Math.random() * 80;
          setFloats((f) => [...f, { id, emoji: e, left }]);
          setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 2800);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [streamId]);

  async function react(emoji: string) {
    if (!userId) return toast.error("Sign in to react");
    await supabase.from("stream_reactions").insert({
      stream_id: streamId, user_id: userId, username: username || "viewer", emoji,
    });
  }

  async function setFilter(id: string) {
    if (!isHost) return;
    const { error } = await supabase.from("live_streams").update({ video_filter: id }).eq("id", streamId);
    if (error) return toast.error(error.message);
    setShowFilters(false);
  }

  return (
    <>
      {/* Floating emoji bursts — fixed full-screen so they actually float up over the video */}
      <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
        {floats.map((f) => (
          <span
            key={f.id}
            className="absolute bottom-40 text-4xl flex-emoji-float"
            style={{ left: `${f.left}%` }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        {/* Weekly Vibe banner — refreshes each ISO week */}
        <div className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${vibe.color} px-3 py-2 text-white shadow-md`}>
          <span className="text-lg">{vibe.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">This week's vibe</p>
            <p className="truncate text-sm font-extrabold">{vibe.theme}</p>
          </div>
          <Sparkles className="h-4 w-4 opacity-70" />
        </div>

        {/* Reaction bar — visible to viewers (and host can also tap) */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-white/10 p-1.5 ring-1 ring-white/15 backdrop-blur">
          {FLEX_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => react(e)}
              className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xl transition active:scale-90 hover:bg-white/20"
              title="React"
            >
              {e}
            </button>
          ))}
          {isHost && (
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-fuchsia-500/90 px-3 py-2 text-[11px] font-bold text-white"
              title="AI filters"
            >
              <Wand2 className="h-3.5 w-3.5" /> Filter
            </button>
          )}
          {!isHost && (
            <span className="ml-auto flex shrink-0 items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wider text-white/60">
              <Smile className="h-3 w-3" /> Tap to react
            </span>
          )}
        </div>

        {/* Host-only filter picker */}
        {isHost && showFilters && (
          <div className="rounded-xl bg-black/70 p-2 ring-1 ring-white/15 backdrop-blur">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Live filter</p>
              <button onClick={() => setShowFilters(false)} className="rounded-full bg-white/10 p-1 text-white/70">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {FLEX_FILTERS.map((f) => {
                const on = (currentFilter || "none") === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-bold transition ${
                      on ? "bg-fuchsia-500 text-white ring-2 ring-fuchsia-200" : "bg-white/10 text-white/90 hover:bg-white/15"
                    }`}
                  >
                    <span className="text-base">{f.emoji}</span>
                    {f.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-center text-[9px] text-white/50">Filter is visible to all viewers · changes live</p>
          </div>
        )}
      </div>
    </>
  );
}
