import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gift, X, Sparkles, Users, Trophy, Truck, Loader2, Check } from "lucide-react";

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
  // Whether the current viewer follows the seller / has bought from them.
  isFollower: boolean;
  isBuyer: boolean;
  open: boolean;
  onClose: () => void;
  // Called by the Live page when the host wants to open a draft form.
  hostOpenComposer: boolean;
  setHostOpenComposer: (v: boolean) => void;
};

// Generate a short code (3 letters) that's easy to tap on mobile.
function suggestCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O for legibility
  let s = "";
  for (let i = 0; i < 3; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export function LiveGiveaway({
  streamId, isSeller, userId, username,
  isFollower, isBuyer,
  open, onClose, hostOpenComposer, setHostOpenComposer,
}: Props) {
  const [giveaway, setGiveaway] = useState<Giveaway | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasEntered, setHasEntered] = useState(false);

  // Composer (host)
  const [draftPrize, setDraftPrize] = useState("");
  const [draftCode, setDraftCode] = useState(suggestCode());
  const [draftEligibility, setDraftEligibility] = useState<"anyone" | "followers" | "buyers">("anyone");
  const [draftDuration, setDraftDuration] = useState<number>(120); // seconds (2 min default)
  // Quantity is locked to 1 winner per Appreciation Gift (per host policy)
  // 🆕 Local "expand widget" state — viewer taps the floating widget to enter via the full overlay.
  const [expandToFull, setExpandToFull] = useState(false);

  // Letter-tap mini game state
  const [tapStep, setTapStep] = useState(0);            // 0..code.length
  const [taps, setTaps] = useState<string[]>([]);       // letters tapped so far (for visual feedback)
  const [shake, setShake] = useState(false);            // wrong letter feedback
  const startTsRef = useRef<number | null>(null);

  // Drawing reel
  const [reelName, setReelName] = useState<string | null>(null);
  const drawTimerRef = useRef<number | null>(null);

  // Live ticker for countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const remainingMs = giveaway?.ends_at ? Math.max(0, new Date(giveaway.ends_at).getTime() - now) : 0;

  // Load + subscribe to current giveaway for this stream.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Most-recent open / drawing / complete giveaway
      const { data } = await supabase
        .from("giveaways")
        .select("*")
        .eq("stream_id", streamId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setGiveaway((data as any) || null);
      if (data) {
        const { data: ents } = await supabase
          .from("giveaway_entries")
          .select("*")
          .eq("giveaway_id", (data as any).id);
        if (!cancelled) setEntries((ents || []) as any);
      } else {
        setEntries([]);
      }
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
          // Refetch to be safe when the giveaway loaded after the channel subscribed.
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

  // Track whether the viewer has already entered.
  useEffect(() => {
    if (!userId || !giveaway) { setHasEntered(false); return; }
    setHasEntered(entries.some((e) => e.user_id === userId));
  }, [entries, userId, giveaway]);

  // Reset tap state when a new giveaway arrives.
  useEffect(() => {
    setTapStep(0); setTaps([]); startTsRef.current = null;
    if (giveaway?.status !== "drawing") setReelName(null);
  }, [giveaway?.id, giveaway?.status]);

  // Spinning reel animation while host is drawing.
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
    const code = draftCode.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!prize) return toast.error("Add a prize label");
    if (code.length < 2 || code.length > 5) return toast.error("Code must be 2–5 letters");
    const dur = Math.max(15, Math.min(600, Math.floor(draftDuration || 60)));
    const qty = 1; // 🆕 Locked: 1 winner per Appreciation Gift
    const ends = new Date(Date.now() + dur * 1000).toISOString();
    const { error } = await supabase.from("giveaways").insert({
      stream_id: streamId, seller_id: userId,
      prize_label: prize, code, eligibility: draftEligibility,
      duration_sec: dur, ends_at: ends, quantity: qty,
      title: "Appreciation Gift",
    });
    if (error) return toast.error(error.message);
    setHostOpenComposer(false);
    setDraftPrize(""); setDraftCode(suggestCode());
    toast.success(`Appreciation Gift opened — ${dur}s · 1 winner`);
  }

  async function startDraw() {
    if (!isSeller || !giveaway) return;
    if (entries.length === 0) return toast.error("No entries yet");
    await supabase.from("giveaways").update({ status: "drawing", closed_at: new Date().toISOString() }).eq("id", giveaway.id);
    // Show ~3s reel then pick N winners.
    setTimeout(async () => {
      const qty = Math.max(1, Math.min(entries.length, Number(giveaway.quantity || 1)));
      const pool = [...entries];
      const picks: typeof entries = [];
      for (let i = 0; i < qty && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picks.push(pool.splice(idx, 1)[0]);
      }
      const winnerNames = picks.map((p) => p.username).join(", @");
      await supabase.from("giveaways").update({
        status: "complete",
        winner_id: picks[0]?.user_id || null,
        winner_username: winnerNames,
        drawn_at: new Date().toISOString(),
      }).eq("id", giveaway.id);
    }, 3000);
  }

  // 🆕 Auto-draw when the host's timer expires (host's tab triggers it)
  useEffect(() => {
    if (!isSeller || !giveaway) return;
    if (giveaway.status !== "open") return;
    if (!giveaway.ends_at) return;
    if (remainingMs > 0) return;
    if (entries.length === 0) {
      // Auto-close with no winner
      supabase.from("giveaways").update({ status: "complete", closed_at: new Date().toISOString() }).eq("id", giveaway.id);
      return;
    }
    startDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller, giveaway?.id, giveaway?.status, giveaway?.ends_at, remainingMs, entries.length]);

  async function clearGiveaway() {
    if (!isSeller || !giveaway) return;
    if (!confirm("Clear this giveaway? Entries will be lost.")) return;
    await supabase.from("giveaways").update({ status: "complete" }).eq("id", giveaway.id);
    // We don't delete history; a new giveaway can be created.
  }

  // ===== Viewer actions =====
  async function tapLetter(letter: string) {
    if (!giveaway || !userId || hasEntered) return;
    if (giveaway.status !== "open") return;
    if (!eligibilityOk) return toast.error(eligibilityHint(giveaway.eligibility));
    const code = giveaway.code.toUpperCase();
    const expected = code[tapStep];
    if (letter !== expected) {
      setShake(true); setTimeout(() => setShake(false), 250);
      setTapStep(0); setTaps([]); startTsRef.current = null;
      return;
    }
    if (tapStep === 0) startTsRef.current = Date.now();
    const nextStep = tapStep + 1;
    setTaps((t) => [...t, letter]);
    setTapStep(nextStep);
    if (nextStep >= code.length) {
      // Submit entry
      const reaction = startTsRef.current ? Date.now() - startTsRef.current : null;
      const { error } = await supabase.from("giveaway_entries").insert({
        giveaway_id: giveaway.id,
        user_id: userId,
        username: username || "viewer",
        reaction_ms: reaction,
      });
      if (error) {
        // Most likely unique violation = already entered
        toast.error(error.code === "23505" ? "You're already in!" : error.message);
      } else {
        toast.success(`You're entered! Reaction: ${reaction ? (reaction/1000).toFixed(2) : "—"}s`);
      }
      setTapStep(0); setTaps([]);
    }
  }

  // Show widget anytime there's an active giveaway, regardless of `open` prop.
  if (!open && !giveaway) return null;
  // 🆕 When a giveaway is OPEN and there's still >5s on the clock, render as a small
  // floating widget so the stream stays visible. Only take over the screen for the
  // last 5s reveal countdown, the drawing animation, and the winner reveal.
  const isRevealMoment =
    !!giveaway && (
      giveaway.status === "drawing" ||
      giveaway.status === "complete" ||
      (giveaway.status === "open" && remainingMs > 0 && remainingMs <= 5000)
    );
  // Host composer and "no giveaway" empty state always need the full overlay for editing.
  const needsFullOverlay = open && (hostOpenComposer || !giveaway || isRevealMoment || expandToFull);

  // ===== Floating widget (stream stays visible) =====
  if (giveaway && giveaway.status === "open" && !needsFullOverlay) {
    return (
      <div className="pointer-events-auto fixed bottom-24 right-3 z-40 w-[min(82vw,260px)] animate-in slide-in-from-right rounded-2xl bg-gradient-to-br from-emerald-600/95 to-teal-700/95 p-3 text-white shadow-2xl ring-2 ring-emerald-300/40 backdrop-blur">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-emerald-200">
            <Gift className="h-3 w-3" /> Appreciation Gift
          </p>
          <button onClick={onClose} className="rounded-full bg-black/30 p-1 text-white/80"><X className="h-3 w-3" /></button>
        </div>
        <p className="line-clamp-1 text-sm font-extrabold">{giveaway.prize_label}</p>
        <p className="text-[10px] text-emerald-100/80">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} · 1 winner
        </p>
        {giveaway.ends_at && (
          <p className="mt-1 text-base font-extrabold tabular-nums text-white">
            ⏱ {Math.ceil(remainingMs / 1000)}s
          </p>
        )}
        {!isSeller && hasEntered && (
          <div className="mt-2 rounded-lg bg-white/15 px-2 py-1 text-center text-[11px] font-bold">
            ✓ You're in!
          </div>
        )}
        {!isSeller && !hasEntered && eligibilityOk && (
          <button
            onClick={() => setExpandToFull(true)}
            className="mt-2 w-full rounded-lg bg-white py-1.5 text-[11px] font-extrabold text-emerald-700"
          >
            Tap to enter →
          </button>
        )}
        {!isSeller && !eligibilityOk && (
          <p className="mt-1 text-[10px] text-emerald-100/80">
            {eligibilityHint(giveaway.eligibility)}
          </p>
        )}
        {isSeller && (
          <button onClick={startDraw} disabled={entries.length === 0}
            className="mt-2 w-full rounded-lg bg-amber-400 py-1.5 text-[11px] font-extrabold text-amber-950 disabled:opacity-50">
            Draw now ({entries.length})
          </button>
        )}
      </div>
    );
  }

  if (!open) return null;

  const code = giveaway?.code?.toUpperCase() || "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button>

      <div className="w-full max-w-md">
        <p className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-300">
          <Gift className="h-3.5 w-3.5" /> Appreciation Gift · Lucky Letter Drop
        </p>

        {/* HOST: composer */}
        {isSeller && hostOpenComposer && (
          <div className="rounded-2xl bg-card p-4 text-foreground shadow-2xl">
            <p className="mb-3 text-sm font-bold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-emerald-400" /> New Appreciation Gift</p>
            <input value={draftPrize} onChange={(e) => setDraftPrize(e.target.value)} placeholder="Prize (e.g. Charizard graded)" maxLength={60}
              className="mb-2 w-full rounded-lg bg-muted px-3 py-2 text-sm outline-none" />
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">Tap-code</span>
              <input value={draftCode} onChange={(e) => setDraftCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0,5))}
                className="w-24 rounded-lg bg-muted px-2 py-1.5 text-center text-sm font-extrabold tracking-[0.4em] outline-none" />
              <button type="button" onClick={() => setDraftCode(suggestCode())}
                className="rounded-md bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">Random</button>
            </div>
            <p className="mb-3 text-[10px] text-muted-foreground">Viewers see letters drop and must tap them in order. Wrong tap = restart.</p>

            {/* 🆕 Duration only — winners locked to 1 per Appreciation Gift */}
            <div className="mb-3">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Duration</p>
              <div className="flex items-center gap-1">
                <input type="number" min={15} max={600} value={draftDuration}
                  onChange={(e) => setDraftDuration(Number(e.target.value) || 60)}
                  className="w-16 rounded-md bg-muted px-2 py-1.5 text-center text-sm font-bold outline-none" />
                <span className="text-[11px] text-muted-foreground">sec</span>
                {[120, 240, 360].map((s) => (
                  <button key={s} type="button" onClick={() => setDraftDuration(s)}
                    className={`rounded-md px-1.5 py-1 text-[10px] font-bold ${draftDuration === s ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>{s/60}m</button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">🏆 1 winner per gift. Viewers must join the live & tap the code to enter.</p>
            </div>

            <div className="mb-3">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Who can enter</p>
              <div className="grid grid-cols-3 gap-1">
                {(["anyone","followers","buyers"] as const).map((e) => (
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
              Open Appreciation Gift
            </button>
          </div>
        )}

        {/* No giveaway yet */}
        {!giveaway && !hostOpenComposer && (
          <div className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/70">
            {isSeller ? "No Appreciation Gift yet. Tap below to create one." : "No Appreciation Gift running right now."}
            {isSeller && (
              <button onClick={() => setHostOpenComposer(true)}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-extrabold text-white">
                + Start an Appreciation Gift
              </button>
            )}
          </div>
        )}

        {/* OPEN giveaway — viewer mini-game */}
        {giveaway && giveaway.status === "open" && (
          <div className="rounded-2xl bg-white/5 p-4 text-white shadow-2xl">
            <p className="text-center text-[11px] uppercase tracking-widest text-emerald-300">Prize</p>
            <p className="mb-1 text-center text-xl font-extrabold">{giveaway.prize_label}</p>
            <p className="mb-2 flex items-center justify-center gap-2 text-[10px] text-white/60">
              <Truck className="h-3 w-3" /> Free shipping · {entries.length} {entries.length === 1 ? "entry" : "entries"} · 1 winner
            </p>
            {giveaway.ends_at && (
              <div className={`mb-3 mx-auto w-fit rounded-full px-3 py-1 text-xs font-extrabold tabular-nums ${remainingMs <= 5000 ? "bg-red-500 text-white animate-pulse" : "bg-emerald-500/20 text-emerald-200"}`}>
                ⏱ {Math.ceil(remainingMs / 1000)}s left
              </div>
            )}

            {/* Eligibility badge */}
            <div className="mb-3 flex items-center justify-center gap-1 text-[10px]">
              <Users className="h-3 w-3 text-white/60" />
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-bold text-white/80">
                {giveaway.eligibility === "anyone" ? "Anyone can enter" : giveaway.eligibility === "followers" ? "Followers only" : "Past buyers only"}
              </span>
            </div>

            {/* Code display + tap pad */}
            {!isSeller && !hasEntered && eligibilityOk && (
              <>
                <div className={`mb-3 flex items-center justify-center gap-2 rounded-xl bg-black/40 py-3 ${shake ? "animate-pulse" : ""}`}>
                  {code.split("").map((c, i) => {
                    const done = i < tapStep;
                    const next = i === tapStep;
                    return (
                      <div key={i}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg font-extrabold transition-all ${done ? "bg-emerald-500 text-white scale-110" : next ? "bg-white text-black ring-2 ring-emerald-400 animate-bounce" : "bg-white/10 text-white/40"}`}>
                        {done ? <Check className="h-5 w-5" /> : c}
                      </div>
                    );
                  })}
                </div>
                <p className="mb-2 text-center text-[10px] text-white/60">
                  Tap the letters in order. Wrong tap = restart.
                </p>
                {/* Tap pad: target letter + 2 decoys */}
                <TapPad code={code} step={tapStep} onTap={tapLetter} shake={shake} />
              </>
            )}

            {!isSeller && hasEntered && (
              <div className="rounded-xl bg-emerald-500/15 p-3 text-center text-sm font-bold text-emerald-300">
                <Check className="mx-auto mb-1 h-5 w-5" />
                You're in! Hang tight for the draw.
              </div>
            )}
            {!isSeller && !eligibilityOk && (
              <div className="rounded-xl bg-yellow-500/15 p-3 text-center text-xs text-yellow-300">
                {eligibilityHint(giveaway.eligibility)}
              </div>
            )}

            {/* Live entry feed */}
            {entries.length > 0 && (
              <div className="mt-3 max-h-24 overflow-y-auto rounded-lg bg-white/5 p-2 text-[11px]">
                {entries.slice(-10).reverse().map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-0.5">
                    <span className="text-white/80">@{e.username}</span>
                    <span className="text-white/40">{e.reaction_ms ? `${(e.reaction_ms/1000).toFixed(2)}s` : ""}</span>
                  </div>
                ))}
              </div>
            )}

            {isSeller && (
              <div className="mt-3 flex gap-2">
                <button onClick={startDraw} disabled={entries.length === 0}
                  className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
                  🎁 Draw winner ({entries.length})
                </button>
                <button onClick={clearGiveaway} className="rounded-xl bg-white/10 px-3 py-2.5 text-xs text-white/70">End</button>
              </div>
            )}
          </div>
        )}

        {/* DRAWING */}
        {giveaway && giveaway.status === "drawing" && (
          <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 p-6 text-center text-white">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-amber-300" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Drawing winner…</p>
            <p className="mt-2 text-3xl font-extrabold">@{reelName || "…"}</p>
            <p className="mt-3 text-[10px] text-white/60">{entries.length} entries · {giveaway.prize_label}</p>
          </div>
        )}

        {/* COMPLETE */}
        {giveaway && giveaway.status === "complete" && giveaway.winner_username && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500/30 via-teal-500/20 to-cyan-500/30 p-6 text-center text-white">
            <Trophy className="mx-auto mb-2 h-10 w-10 text-amber-300" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Winner</p>
            <p className="mt-1 text-2xl font-extrabold">@{giveaway.winner_username}</p>
            <p className="mt-2 text-sm text-white/80">won <b>{giveaway.prize_label}</b></p>
            <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-white/60">
              <Truck className="h-3 w-3" /> Shipping covered by host
            </p>
            {isSeller && (
              <button onClick={() => setHostOpenComposer(true)}
                className="mt-4 w-full rounded-xl bg-white/10 py-2 text-xs font-bold text-white">
                Start a new Appreciation Gift
              </button>
            )}
          </div>
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

// Renders the active letter + 2 decoys, shuffled, so the viewer can't just spam-tap one button.
function TapPad({ code, step, onTap, shake }: { code: string; step: number; onTap: (l: string) => void; shake: boolean }) {
  const target = code[step] || "";
  // Decoys: pick 2 random letters that aren't the target
  const choices = useMemo(() => {
    const pool = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("").filter((c) => c !== target);
    const out = [target];
    for (let i = 0; i < 2; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    // Shuffle
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
    // Re-roll on every step so users have to look, not memorize positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, step]);

  return (
    <div className={`grid grid-cols-3 gap-2 ${shake ? "animate-pulse" : ""}`}>
      {choices.map((c, i) => (
        <button key={`${c}-${i}-${step}`} onClick={() => onTap(c)}
          className="rounded-xl bg-white py-4 text-2xl font-extrabold text-black shadow-lg active:scale-95">
          {c}
        </button>
      ))}
    </div>
  );
}
