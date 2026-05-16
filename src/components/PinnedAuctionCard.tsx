import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Timer, Zap, Trophy, Package, ChevronRight } from "lucide-react";

type QueueItem = {
  id: string;
  title: string;
  image_url: string | null;
  starting_bid: number;
  status: string;
  position: number;
  prebid_enabled: boolean;
};

function fmtMoney(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}
function fmtRemaining(ms: number) {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * PinnedAuctionCard — always-visible mini auction strip.
 * Shows current item image, current bid, countdown, going once/twice/sold,
 * pre-bid indicator and a short queue preview.
 */
export function PinnedAuctionCard({
  streamId,
  currentItem,
  currentImage,
  currentBid,
  endsAt,
  auctionLive,
  auctionFinished,
  winnerUsername,
  winningBid,
  prebidCount,
  suddenDeath,
  onTapQueue,
}: {
  streamId: string;
  currentItem: string | null;
  currentImage: string | null;
  currentBid: number;
  endsAt: string | null;
  auctionLive: boolean;
  auctionFinished: boolean;
  winnerUsername: string | null;
  winningBid: number;
  prebidCount: number;
  suddenDeath?: boolean;
  onTapQueue?: () => void;
}) {
  const [remaining, setRemaining] = useState<number>(0);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    const i = setInterval(() => {
      const ms = endsAt ? new Date(endsAt).getTime() - Date.now() : 0;
      setRemaining(ms);
    }, 250);
    return () => clearInterval(i);
  }, [endsAt]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("auction_queue" as any)
        .select("id, title, image_url, starting_bid, status, position, prebid_enabled")
        .eq("stream_id", streamId)
        .eq("status", "queued")
        .order("position", { ascending: true })
        .limit(3);
      if (!cancelled) setQueue((data as any[]) || []);
    }
    load();
    const ch = supabase
      .channel(`pinned-queue-${streamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auction_queue", filter: `stream_id=eq.${streamId}` },
        load
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [streamId]);

  // Compute going once / twice / sold state from time remaining + finished flag
  let phase: "live" | "once" | "twice" | "sold" | "idle" = "idle";
  if (auctionFinished || (winnerUsername && !auctionLive)) phase = "sold";
  else if (auctionLive) {
    if (remaining <= 3000 && remaining > 1500) phase = "once";
    else if (remaining <= 1500 && remaining > 0) phase = "twice";
    else phase = "live";
  }

  const phaseStyles = {
    live: "bg-live text-live-foreground",
    once: "bg-yellow-400 text-black animate-pulse",
    twice: "bg-orange-500 text-white animate-pulse",
    sold: "bg-emerald-500 text-white",
    idle: "bg-white/10 text-white/70",
  } as const;

  const phaseLabel = {
    live: "LIVE",
    once: "GOING ONCE",
    twice: "GOING TWICE",
    sold: "SOLD",
    idle: "READY",
  } as const;

  return (
    <div className="pointer-events-auto w-full max-w-xs rounded-xl bg-black/70 p-1.5 ring-1 ring-white/10 shadow-xl backdrop-blur">
      <div className="flex items-center gap-1.5">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10">
          {currentImage ? (
            <img src={currentImage} alt={currentItem || "Current item"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/40">
              <Package className="h-6 w-6" />
            </div>
          )}
          {phase === "sold" && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/60 text-[10px] font-extrabold uppercase text-white">
              Sold
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[12px] font-bold text-white">
            {currentItem || "Awaiting next item…"}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${phaseStyles[phase]}`}>
              {suddenDeath ? <Zap className="h-2.5 w-2.5" /> : phase === "sold" ? <Trophy className="h-2.5 w-2.5" /> : <Timer className="h-2.5 w-2.5" />}
              {suddenDeath ? "SUDDEN DEATH" : phaseLabel[phase]}
            </span>
            {auctionLive && (
              <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums text-white">
                {fmtRemaining(remaining)}
              </span>
            )}
            {prebidCount > 0 && !auctionLive && (
              <span className="rounded-full bg-purple-500/30 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-purple-100 ring-1 ring-purple-300/30">
                Pre-B {prebidCount}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] uppercase tracking-wider text-white/50">
            {phase === "sold" ? "Final" : "High bid"}
          </p>
          <p className="text-base font-extrabold tabular-nums text-emerald-300">
            {fmtMoney(phase === "sold" ? winningBid : currentBid)}
          </p>
          {phase === "sold" && winnerUsername && (
            <p className="text-[10px] font-bold text-white/80">@{winnerUsername}</p>
          )}
        </div>
      </div>

      {queue.length > 0 && (
        <button
          onClick={onTapQueue}
          className="mt-1.5 flex w-full items-center gap-1.5 overflow-x-auto rounded-lg bg-black/40 px-1.5 py-1 text-left ring-1 ring-white/5 hover:bg-black/60"
          title="Open auction queue"
        >
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-white/50">Next</span>
          {queue.map((q) => (
            <div key={q.id} className="flex shrink-0 items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-white/90 ring-1 ring-white/10">
              {q.image_url && <img src={q.image_url} alt="" className="h-5 w-5 rounded object-cover" />}
              <span className="max-w-[8rem] truncate font-semibold">{q.title}</span>
              <span className="font-extrabold tabular-nums text-emerald-300">{fmtMoney(Number(q.starting_bid))}</span>
            </div>
          ))}
          <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-white/50" />
        </button>
      )}
    </div>
  );
}
