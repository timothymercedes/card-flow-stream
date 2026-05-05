import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gift, X, Sparkles, Trophy, Truck, Loader2, Check } from "lucide-react";
import { Confetti } from "@/components/Confetti";

type Giveaway = {
  id: string;
  stream_id: string;
  seller_id: string;
  title: string;
  prize_label: string;
  code: string;
  eligibility: "anyone" | "followers" | "buyers";
  status: "open" | "drawing" | "complete";
  winner_id: string | null;
  winner_username: string | null;
  shipping_covered: boolean;
  duration_sec: number;
  ends_at: string | null;
  quantity: number;
};

type Entry = {
  id: string;
  giveaway_id: string;
  user_id: string;
  username: string;
  reaction_ms: number | null;
};

type Props = {
  streamId: string;
  isSeller: boolean;
  userId: string | null;
  username: string | null;
  isFollower: boolean;
  isBuyer: boolean;
  sellerId: string | null;
  onFollowed?: () => void;
  open: boolean;
  onClose: () => void;
  hostOpenComposer: boolean;
  setHostOpenComposer: (v: boolean) => void;
};

function suggestCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 3; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export function LiveGiveaway({
  streamId, isSeller, userId, username,
  isFollower, isBuyer, sellerId, onFollowed,
  open, onClose, hostOpenComposer, setHostOpenComposer,
}: Props) {
  const [giveaway, setGiveaway] = useState<Giveaway | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasEntered, setHasEntered] = useState(false);
  const [joining, setJoining] = useState(false);

  // Composer (host)
  const [draftPrize, setDraftPrize] = useState("");
  const [draftCode, setDraftCode] = useState(suggestCode());
  const [draftEligibility, setDraftEligibility] = useState<"anyone" | "followers" | "buyers">("anyone");
  const [draftDuration, setDraftDuration] = useState<number>(120);

  // Drawing reel
  const [reelName, setReelName] = useState<string | null>(null);
  const drawTimerRef = useRef<number | null>(null);

  // Live ticker
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const remainingMs = giveaway?.ends_at ? Math.max(0, new Date(giveaway.ends_at).getTime() - now) : 0;

  // Load + subscribe
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("giveaways").select("*").eq("stream_id", streamId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      setGiveaway((data as any) || null);
      if (data) {
        const { data: ents } = await supabase
          .from("giveaway_entries").select("*").eq("giveaway_id", (data as any).id);
        if (!cancelled) setEntries((ents || []) as any);
      } else setEntries([]);
    }
    load();

    const ch = supabase
      .channel(`giveaway-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "giveaways", filter: `stream_id=eq.${streamId}` }, (p) => {
        const next = (p.new as any) || (p.old as any);
        if (p.eventType === "DELETE") setGiveaway(null);
        else setGiveaway(next || null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "giveaway_entries" }, (p) => {
        const row = (p.new as any) || (p.old as any);
        if (!giveaway || row.giveaway_id !== giveaway.id) {
          supabase.from("giveaway_entries").select("*").eq("giveaway_id", row.giveaway_id).then(({ data }) => {
            setEntries((data || []) as any);
          });
          return;
        }
        if (p.eventType === "INSERT") setEntries((s) => [...s, row]);
        if (p.eventType === "DELETE") setEntries((s) => s.filter((e) => e.id !== row.id));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  useEffect(() => {
    if (!userId || !giveaway) { setHasEntered(false); return; }
    setHasEntered(entries.some((e) => e.user_id === userId));
  }, [entries, userId, giveaway]);

  useEffect(() => {
    if (giveaway?.status !== "drawing") setReelName(null);
  }, [giveaway?.id, giveaway?.status]);

  // Spin reel
  useEffect(() => {
    if (giveaway?.status !== "drawing" || entries.length === 0) {
      if (drawTimerRef.current) window.clearInterval(drawTimerRef.current);
      return;
    }
    if (drawTimerRef.current) window.clearInterval(drawTimerRef.current);
    drawTimerRef.current = window.setInterval(() => {
      const pick = entries[Math.floor(Math.random() * entries.length)];
      setReelName(pick.username);
    }, 80);
    return () => { if (drawTimerRef.current) window.clearInterval(drawTimerRef.current); };
  }, [giveaway?.status, entries]);

  const eligibilityOk = useMemo(() => {
    if (!giveaway) return false;
    if (giveaway.eligibility === "anyone") return true;
    if (giveaway.eligibility === "followers") return isFollower;
    if (giveaway.eligibility === "buyers") return isBuyer;
    return false;
  }, [giveaway, isFollower, isBuyer]);

  // ===== Host actions =====
  async function createGiveaway() {
    if (!isSeller || !userId) return;
    const prize = draftPrize.trim();
    if (!prize) return toast.error("Add a prize label");
    const dur = Math.max(15, Math.min(600, Math.floor(draftDuration || 60)));
    const ends = new Date(Date.now() + dur * 1000).toISOString();
    const code = draftCode || suggestCode();
    const { error } = await supabase.from("giveaways").insert({
      stream_id: streamId, seller_id: userId,
      prize_label: prize, code, eligibility: draftEligibility,
      duration_sec: dur, ends_at: ends, quantity: 1,
      title: "Giveaway",
    });
    if (error) return toast.error(error.message);
    await supabase.from("chat_messages").insert({
      stream_id: streamId, user_id: userId, username: username || "host",
      content: `🎁 Giveaway opened: ${prize} — tap "Join" to enter!`,
      is_system: true, is_announcement: true,
    });
    setHostOpenComposer(false);
    setDraftPrize(""); setDraftCode(suggestCode());
    toast.success(`Giveaway opened — ${dur}s · 1 winner`);
  }

  async function startDraw() {
    if (!isSeller || !giveaway) return;
    if (entries.length === 0) return toast.error("No entries yet");
    await supabase.from("giveaways").update({ status: "drawing", closed_at: new Date().toISOString() }).eq("id", giveaway.id);
    setTimeout(async () => {
      const pool = [...entries];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const giveawayId = giveaway.id;
      await supabase.from("giveaways").update({
        status: "complete",
        winner_id: pick?.user_id || null,
        winner_username: pick?.username || null,
        drawn_at: new Date().toISOString(),
      }).eq("id", giveawayId);
      // 🆕 Push the prize into seller's My Store as a $0 paid order ready to ship
      if (pick?.user_id) {
        const { error } = await (supabase.rpc as any)("create_giveaway_order", { _giveaway_id: giveawayId });
        if (error) console.error("create_giveaway_order failed:", error);
        else toast.success("Prize added to My Store · ready to ship");
      }
    }, 3000);
  }

  // Auto-draw when timer expires
  useEffect(() => {
    if (!isSeller || !giveaway) return;
    if (giveaway.status !== "open" || !giveaway.ends_at) return;
    if (remainingMs > 0) return;
    if (entries.length === 0) {
      supabase.from("giveaways").update({ status: "complete", closed_at: new Date().toISOString() }).eq("id", giveaway.id);
      return;
    }
    startDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller, giveaway?.id, giveaway?.status, giveaway?.ends_at, remainingMs, entries.length]);

  async function clearGiveaway() {
    if (!isSeller || !giveaway) return;
    if (!confirm("End this giveaway? Entries will be lost.")) return;
    await supabase.from("giveaways").update({ status: "complete" }).eq("id", giveaway.id);
  }

  async function ensureFollow(): Promise<boolean> {
    if (!giveaway || !userId) return false;
    if (giveaway.eligibility !== "followers") return true;
    if (isFollower) return true;
    if (!sellerId) return false;
    const { error } = await supabase.from("follows").insert({ follower_id: userId, followee_id: sellerId });
    if (error && error.code !== "23505") {
      toast.error("Couldn't follow — try again");
      return false;
    }
    onFollowed?.();
    return true;
  }

  // 🆕 ONE-TAP JOIN — no mini-game, no code typing
  async function joinGiveaway() {
    if (!giveaway || !userId || hasEntered || joining) return;
    setJoining(true);
    try {
      if (!eligibilityOk) {
        const ok = await ensureFollow();
        if (!ok) {
          toast.error(eligibilityHint(giveaway.eligibility));
          return;
        }
      }
      const { error } = await supabase.from("giveaway_entries").insert({
        giveaway_id: giveaway.id,
        user_id: userId,
        username: username || "viewer",
        reaction_ms: null,
      });
      if (error) {
        if (error.code === "23505") toast.success("You're already in!");
        else toast.error(error.message);
      } else {
        toast.success("🎁 You're in the giveaway!");
      }
    } finally {
      setJoining(false);
    }
  }

  const isDrawingMoment = !!giveaway && giveaway.status === "drawing";
  const isWinnerReveal = !!giveaway && giveaway.status === "complete" && !!giveaway.winner_username;

  // === VIEWER COMPACT WIDGET ===
  // Always visible (small, non-blocking) when there's an open giveaway and viewer hasn't manually closed.
  // Becomes a fullscreen reveal during draw/winner.
  if (!isSeller) {
    if (!giveaway) return null;

    if (isDrawingMoment || isWinnerReveal) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white">
            <X className="h-5 w-5" />
          </button>
          {isDrawingMoment && (
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 p-6 text-center text-white">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-amber-300" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Drawing winner…</p>
              <p className="mt-2 text-3xl font-extrabold">@{reelName || "…"}</p>
              <p className="mt-3 text-[10px] text-white/60">{entries.length} entries · {giveaway.prize_label}</p>
            </div>
          )}
          {isWinnerReveal && (
            <>
              <Confetti count={80} durationMs={2600} />
              <div className="winner-burst rounded-2xl bg-gradient-to-br from-emerald-500/40 via-teal-500/30 to-cyan-500/40 p-6 text-center text-white owned-glow ring-1 ring-white/20">
                <Trophy className="mx-auto mb-2 h-12 w-12 text-amber-300 drop-shadow" />
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">Winner</p>
                <p className="mt-1 winner-shine bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">@{giveaway.winner_username}</p>
                <p className="mt-2 text-sm text-white/85">won <b>{giveaway.prize_label}</b></p>
                <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-white/70">
                  <Truck className="h-3 w-3" /> Shipping covered by host
                </p>
              </div>
            </>
          )}
        </div>
      );
    }

    // Viewer-side floating gift widget removed entirely — keeps the stream clean.
    // Viewers join via the announcement banner / chat prompt only.
    return null;
  }

  // === HOST CONTROLS ===
  // Compact, non-blocking floating widget when a giveaway is running and the host
  // hasn't explicitly opened the full panel.
  if (
    !open &&
    !hostOpenComposer &&
    !isDrawingMoment &&
    !isWinnerReveal &&
    giveaway &&
    giveaway.status === "open"
  ) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-3 sm:bottom-28">
        <div className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full bg-card/90 px-3 py-2 text-xs shadow-2xl ring-1 ring-emerald-400/30 backdrop-blur">
          <Gift className="h-4 w-4 shrink-0 text-emerald-400" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[11px] font-bold text-foreground">{giveaway.prize_label}</span>
            <span className="text-[10px] text-muted-foreground">
              {entries.length} joined · {Math.ceil(remainingMs / 1000)}s left
            </span>
          </div>
          <button
            onClick={startDraw}
            disabled={entries.length === 0}
            className="ml-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1 text-[11px] font-extrabold text-white disabled:opacity-50"
          >
            Draw
          </button>
        </div>
      </div>
    );
  }

  if (!open && !giveaway) return null;
  if (giveaway && giveaway.status === "complete" && !isWinnerReveal) {
    if (!open) return null;
  }
  if (!open && !hostOpenComposer && !isDrawingMoment && !isWinnerReveal && (!giveaway || giveaway.status !== "open")) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white">
        <X className="h-5 w-5" />
      </button>

      <div className="w-full max-w-md">
        <p className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-300">
          <Gift className="h-3.5 w-3.5" /> Giveaway
        </p>

        {hostOpenComposer && (
          <div className="rounded-2xl bg-card p-4 text-foreground shadow-2xl">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold">
              <Sparkles className="h-4 w-4 text-emerald-400" /> New Giveaway
            </p>
            <input value={draftPrize} onChange={(e) => setDraftPrize(e.target.value)}
              placeholder="Prize (e.g. Charizard graded)" maxLength={60}
              className="mb-2 w-full rounded-lg bg-muted px-3 py-2 text-sm outline-none" />

            <div className="mb-3">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Duration</p>
              <div className="flex items-center gap-1">
                <input type="number" min={15} max={600} value={draftDuration}
                  onChange={(e) => setDraftDuration(Number(e.target.value) || 60)}
                  className="w-16 rounded-md bg-muted px-2 py-1.5 text-center text-sm font-bold outline-none" />
                <span className="text-[11px] text-muted-foreground">sec</span>
                {[60, 120, 240, 360].map((s) => (
                  <button key={s} type="button" onClick={() => setDraftDuration(s)}
                    className={`rounded-md px-1.5 py-1 text-[10px] font-bold ${draftDuration === s ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                    {s < 60 ? `${s}s` : `${s / 60}m`}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">🏆 1 winner per giveaway. Viewers join with one tap.</p>
            </div>

            <div className="mb-3">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Who can enter</p>
              <div className="grid grid-cols-3 gap-1">
                {(["anyone", "followers", "buyers"] as const).map((e) => (
                  <button key={e} onClick={() => setDraftEligibility(e)}
                    className={`rounded-md py-1.5 text-[11px] font-bold ${draftEligibility === e ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                    {e === "anyone" ? "Anyone" : e === "followers" ? "Followers" : "Past buyers"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
              <Truck className="mt-0.5 h-3.5 w-3.5" />
              <span><b>Shipping is on you, the seller.</b> Winner enters their address and ships free.</span>
            </div>
            <button onClick={createGiveaway}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-extrabold text-white">
              Open Giveaway
            </button>
          </div>
        )}

        {!giveaway && !hostOpenComposer && (
          <div className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/70">
            No giveaway running yet.
            <button onClick={() => setHostOpenComposer(true)}
              className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-extrabold text-white">
              + Start a Giveaway
            </button>
          </div>
        )}

        {giveaway && giveaway.status === "open" && !hostOpenComposer && (
          <div className="rounded-2xl bg-white/5 p-4 text-white shadow-2xl">
            <p className="text-center text-[11px] uppercase tracking-widest text-emerald-300">Prize</p>
            <p className="mb-1 text-center text-xl font-extrabold">{giveaway.prize_label}</p>
            <p className="mb-2 text-center text-[10px] text-white/60">
              {entries.length} joined · 1 winner
            </p>
            {giveaway.ends_at && (
              <div className={`mb-3 mx-auto w-fit rounded-full px-3 py-1 text-xs font-extrabold tabular-nums ${remainingMs <= 5000 ? "bg-red-500 text-white animate-pulse" : "bg-emerald-500/20 text-emerald-200"}`}>
                ⏱ {Math.ceil(remainingMs / 1000)}s left
              </div>
            )}

            {entries.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-white/5 p-2 text-[11px]">
                {entries.slice(-12).reverse().map((e) => (
                  <div key={e.id} className="py-0.5 text-white/80">@{e.username}</div>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button onClick={startDraw} disabled={entries.length === 0}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
                🎁 Draw winner ({entries.length})
              </button>
              <button onClick={clearGiveaway} className="rounded-xl bg-white/10 px-3 py-2.5 text-xs text-white/70">End</button>
            </div>
          </div>
        )}

        {isDrawingMoment && (
          <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 p-6 text-center text-white">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-amber-300" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Drawing winner…</p>
            <p className="mt-2 text-3xl font-extrabold">@{reelName || "…"}</p>
            <p className="mt-3 text-[10px] text-white/60">{entries.length} entries · {giveaway?.prize_label}</p>
          </div>
        )}

        {isWinnerReveal && giveaway && (
          <>
            <Confetti count={80} durationMs={2600} />
            <div className="winner-burst rounded-2xl bg-gradient-to-br from-emerald-500/40 via-teal-500/30 to-cyan-500/40 p-6 text-center text-white owned-glow ring-1 ring-white/20">
              <Trophy className="mx-auto mb-2 h-12 w-12 text-amber-300 drop-shadow" />
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">Winner</p>
              <p className="mt-1 winner-shine bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">@{giveaway.winner_username}</p>
              <p className="mt-2 text-sm text-white/85">won <b>{giveaway.prize_label}</b></p>
              <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-white/70">
                <Truck className="h-3 w-3" /> Shipping covered by host
              </p>
              <button onClick={() => setHostOpenComposer(true)}
                className="mt-4 w-full rounded-xl bg-white/15 py-2 text-xs font-bold text-white backdrop-blur hover:bg-white/25">
                Start a new giveaway
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function eligibilityHint(eligibility: string) {
  if (eligibility === "followers") return "Follow the host to enter";
  if (eligibility === "buyers") return "Only past buyers can enter";
  return "Sign in to enter";
}
