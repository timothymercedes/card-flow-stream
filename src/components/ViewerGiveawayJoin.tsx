import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gift, Check, UserPlus, Loader2, Trophy } from "lucide-react";

type Giveaway = {
  id: string;
  stream_id: string;
  seller_id: string;
  prize_label: string;
  status: "open" | "drawing" | "complete";
  eligibility: "anyone" | "followers" | "buyers";
  duration_sec: number;
  ends_at: string | null;
  winner_username: string | null;
};

type Props = {
  streamId: string;
  sellerId: string | null;
  userId: string | null;
  username: string | null;
  isFollower: boolean;
  isBuyer: boolean;
  onFollowed?: () => void;
  floating?: boolean;
};

/**
 * Viewer-facing live giveaway chip.
 * Visible whenever a giveaway is open/drawing/just-complete on the stream.
 * One-tap join — if the giveaway requires followers, joining also follows the host.
 */
export function ViewerGiveawayJoin({
  streamId, sellerId, userId, username, isFollower, isBuyer, onFollowed, floating = false,
}: Props) {
  const [g, setG] = useState<Giveaway | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [hasEntered, setHasEntered] = useState(false);
  const [joining, setJoining] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("giveaways").select("*").eq("stream_id", streamId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      setG((data as any) || null);
      if (data) {
        const { count } = await supabase
          .from("giveaway_entries")
          .select("*", { count: "exact", head: true })
          .eq("giveaway_id", (data as any).id);
        if (!cancelled) setEntryCount(count || 0);
        if (userId) {
          const { data: mine } = await supabase
            .from("giveaway_entries").select("id")
            .eq("giveaway_id", (data as any).id).eq("user_id", userId).maybeSingle();
          if (!cancelled) setHasEntered(!!mine);
        }
      }
    }
    load();
    const ch = supabase
      .channel(`viewer-giveaway-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "giveaways", filter: `stream_id=eq.${streamId}` }, (p) => {
        const next = (p.new as any) || (p.old as any) || null;
        setG(next);
        if (next?.id) {
          supabase.from("giveaway_entries").select("*", { count: "exact", head: true })
            .eq("giveaway_id", next.id).then(({ count }) => setEntryCount(count || 0));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "giveaway_entries" }, (p) => {
        const row = (p.new as any) || (p.old as any);
        if (!row || !g || row.giveaway_id !== g.id) return;
        if (p.eventType === "INSERT") {
          setEntryCount((c) => c + 1);
          if (userId && row.user_id === userId) setHasEntered(true);
        }
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, userId]);

  const remainingMs = g?.ends_at ? Math.max(0, new Date(g.ends_at).getTime() - now) : 0;

  const eligibilityOk = useMemo(() => {
    if (!g) return false;
    if (g.eligibility === "anyone") return true;
    if (g.eligibility === "followers") return isFollower;
    if (g.eligibility === "buyers") return isBuyer;
    return false;
  }, [g, isFollower, isBuyer]);

  async function joinGiveaway() {
    if (!g || !userId || hasEntered || joining) return;
    if (g.seller_id === userId) return;
    setJoining(true);
    try {
      // Auto-follow if eligibility=followers and user isn't following yet
      if (g.eligibility === "followers" && !isFollower && sellerId) {
        const { error: fErr } = await supabase.from("follows").insert({ follower_id: userId, followee_id: sellerId });
        if (fErr && fErr.code !== "23505") {
          toast.error("Couldn't follow host — try again");
          return;
        }
        onFollowed?.();
        toast.success("Followed host ✓");
      }
      if (g.eligibility === "buyers" && !isBuyer) {
        toast.error("Only past buyers from this stream can enter");
        return;
      }
      const { error } = await supabase.from("giveaway_entries").insert({
        giveaway_id: g.id, user_id: userId, username: username || "viewer", reaction_ms: null,
      });
      if (error) {
        if (error.code === "23505") { setHasEntered(true); toast.success("You're already in!"); }
        else toast.error(error.message);
      } else {
        setHasEntered(true);
        toast.success("🎁 You're in the giveaway!");
      }
    } finally {
      setJoining(false);
    }
  }

  if (!g) return null;
  // Vanish once the winner is called — box reappears when host opens a new giveaway
  if (g.status === "complete") return null;

  let content: React.ReactNode;

  // Winner reveal (compact)
  if (g.status === "complete" && g.winner_username) {
    content = (
      <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/30 to-teal-500/20 p-3 ring-1 ring-emerald-400/40">
        <Trophy className="h-5 w-5 text-amber-300" />
        <div className="flex-1 text-xs text-white">
          <p className="font-bold">@{g.winner_username} won {g.prize_label}</p>
          <p className="text-[10px] text-white/70">Shipping covered by host</p>
        </div>
      </div>
    );
  } else if (g.status === "drawing") {
    content = (
      <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500/30 to-rose-500/20 p-3 ring-1 ring-amber-400/40">
        <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
        <div className="flex-1 text-xs text-white">
          <p className="font-bold">Drawing winner…</p>
          <p className="text-[10px] text-white/70">{entryCount} entered · {g.prize_label}</p>
        </div>
      </div>
    );
  } else {
    // Open
    const eligibilityLabel =
      g.eligibility === "anyone" ? "Anyone can join"
      : g.eligibility === "followers" ? (isFollower ? "Followers only · you qualify" : "Followers only · tap to follow + join")
      : (isBuyer ? "Past buyers only · you qualify" : "Past buyers only");
    const urgent = remainingMs <= 8000;

    content = (
      <div className={`rounded-xl p-3 ring-1 backdrop-blur ${urgent ? "bg-rose-500/20 ring-rose-400/50 animate-pulse" : "bg-gradient-to-r from-amber-500/20 to-violet-600/20 ring-amber-400/40"}`}>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${urgent ? "bg-rose-500" : "bg-gradient-to-br from-amber-400 to-violet-600"} shadow-lg`}>
            <Gift className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-amber-200">
              🎁 Giveaway running
            </p>
            <p className="truncate text-sm font-extrabold text-white">{g.prize_label}</p>
            <p className="truncate text-[10px] text-white/70">
              {entryCount} joined · {Math.ceil(remainingMs / 1000)}s · {eligibilityLabel}
            </p>
          </div>
          <button
            onClick={joinGiveaway}
            disabled={!userId || hasEntered || joining || (g.eligibility === "buyers" && !isBuyer)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold shadow-lg transition active:scale-95 ${
              hasEntered
                ? "bg-emerald-500 text-white"
                : "bg-gradient-to-r from-amber-400 to-rose-500 text-white disabled:opacity-50"
            }`}
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" />
              : hasEntered ? <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> In!</span>
              : g.eligibility === "followers" && !isFollower ? <span className="flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Follow + Join</span>
              : "Join"}
          </button>
        </div>
      </div>
    );
  }

  if (floating) {
    return (
      <div className="pointer-events-none absolute left-2 top-12 z-20 flex max-w-[260px] justify-start sm:left-3 sm:top-14">
        <div className="pointer-events-auto w-full">{content}</div>
      </div>
    );
  }

  return content;
}
