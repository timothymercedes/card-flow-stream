// PullBid Arena — staged battle viewer.
// Card unlocks the fighter; the COMPANION fights — not the card image.
// Flow: arena intro → entrances → round-by-round attacks (with crit / dodge /
// floating damage + HP bars) → victory/defeat → battle summary, with replay &
// share. Purely presentational: the outcome is resolved server-side; this only
// animates the saved battle log, so it doubles as a replay viewer.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ARENA_BADGES, type ArenaBadgeKey } from "@/lib/arenaShared";
import { arenaCategoryMeta } from "@/lib/arenaCategories";
import { CompanionSprite, type CompanionAnim } from "@/components/arena/CompanionSprite";
import { Swords, Trophy, RotateCcw, Share2, Shield, Zap, Coins, Heart, Users, FastForward, SkipForward } from "lucide-react";
import { toast } from "sonner";

type BattleLog = Array<{ round: number; mine: number; theirs: number; winner: "mine" | "theirs" }>;
export type StageResult = {
  iWon: boolean;
  myRounds: number;
  theirRounds: number;
  log: BattleLog;
  battleId?: string | null;
  rewards: { xp: number; trophies: number; rank: number; credits: number };
  opponentName: string;
  opponentImage?: string | null;
  opponentEmoji?: string | null;
  environment?: string | null;
  newBadges: ArenaBadgeKey[];
};

type Phase = "intro" | "fight" | "summary";
type RoundFx = "crit" | "dodge" | "hit" | "block";
type SkillKind = "basic" | "special" | "recover";

type RoundEvent = {
  attacker: "mine" | "theirs";
  defender: "mine" | "theirs";
  fx: RoundFx;
  dmg: number;
  healAmt: number;       // > 0 when the attacker uses a Recover special
  skill: SkillKind;
  round: number;
};

const SKILL_LABEL: Record<SkillKind, string> = {
  basic: "Basic Attack", special: "Special Attack", recover: "Recover",
};

// Map the saved battle log into a richer, fully deterministic playback timeline.
// A small seeded PRNG (derived from the log) decides block/recover flavour so
// the same battle always replays identically — outcomes are still server-side.
function roundEvents(log: BattleLog): RoundEvent[] {
  let seed = log.reduce((s, r) => ((s * 31 + r.mine + r.theirs * 7 + r.round) >>> 0), 7) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return log.map((r) => {
    const max = Math.max(r.mine, r.theirs, 1);
    const margin = Math.abs(r.mine - r.theirs) / max;
    const attacker: "mine" | "theirs" = r.winner;
    const defender: "mine" | "theirs" = r.winner === "mine" ? "theirs" : "mine";

    let fx: RoundFx; let dmg: number; let skill: SkillKind = "basic"; let healAmt = 0;
    if (margin >= 0.24) { fx = "crit"; dmg = 40; skill = "special"; }
    else if (margin <= 0.05) { fx = "dodge"; dmg = 7; }
    else if (rnd() < 0.2) { fx = "block"; dmg = 14; }
    else { fx = "hit"; dmg = 26; }

    // Occasional healing special by the attacker (never on a whiffed dodge).
    if (fx !== "dodge" && rnd() < 0.16) {
      skill = "recover"; healAmt = 12; dmg = Math.round(dmg * 0.6);
    }
    return { attacker, defender, fx, dmg, healAmt, skill, round: r.round };
  });
}

const THEME_CLASS: Record<string, string> = {
  pokemon: "arena-theme-pokemon", onepiece: "arena-theme-onepiece", mtg: "arena-theme-mtg",
  yugioh: "arena-theme-yugioh", sports: "arena-theme-sports", lorcana: "arena-theme-lorcana",
  wrestling: "arena-theme-wrestling", marvel: "arena-theme-marvel", starwars: "arena-theme-starwars",
};

function HpBar({ hp, side }: { hp: number; side: "left" | "right" }) {
  const color = hp > 50 ? "bg-emerald-500" : hp > 22 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className={`flex w-full items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
      <Heart className="h-3 w-3 shrink-0 text-rose-400" />
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/15">
        <div className={`arena-hp-fill h-full rounded-full ${color}`} style={{ width: `${Math.max(0, hp)}%` }} />
      </div>
    </div>
  );
}

function Fighter({
  name, cardImage, emoji, side, category, seedKey, level = 1, wrapperAnim, companionAnim,
  frameClass = "", effectClass = "", title, hp,
}: {
  name: string; cardImage?: string | null; emoji?: string | null; side: "left" | "right";
  category: string; seedKey: string; level?: number; wrapperAnim: string; companionAnim: CompanionAnim;
  frameClass?: string; effectClass?: string; title?: string; hp: number;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <HpBar hp={hp} side={side} />
      <div className={`relative ${wrapperAnim}`}>
        {effectClass && <span className={`arena-fx ${effectClass}`} aria-hidden />}
        <CompanionSprite
          seedKey={seedKey}
          category={category}
          anim={companionAnim}
          size={104}
          level={level}
          flip={side === "right"}
          className={frameClass}
        />
      </div>
      <p className="max-w-[8rem] truncate text-center text-xs font-bold sm:text-sm">{name}</p>
      {/* Card stays a collectible reference — never the primary battle visual. */}
      {cardImage ? (
        <span className="flex items-center gap-1 rounded-full border bg-background/70 px-1.5 py-0.5">
          <img src={cardImage} alt={`${name} card`} className="h-5 w-3.5 rounded-[2px] object-cover" />
          <span className="text-[9px] text-muted-foreground">Card</span>
        </span>
      ) : emoji ? (
        <span className="text-base" aria-hidden>{emoji}</span>
      ) : null}
      {title ? (
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{title}</span>
      ) : (
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {side === "left" ? "You" : "Opponent"}
        </span>
      )}
    </div>
  );
}

export function ArenaBattleStage({
  result, myName, myImage, mySeed, myLevel = 1, myPassive, myFrameClass = "", myEffectClass = "", myTitle, arenaCategory = "all",
  isTraining = false, environmentLabel, hideRewards = false, onShareToFeed, sharingToFeed = false, onClose,
}: {
  result: StageResult;
  myName: string;
  myImage?: string | null;
  mySeed?: string | null;
  myLevel?: number;
  myPassive?: string | null;
  myFrameClass?: string;
  myEffectClass?: string;
  myTitle?: string;
  arenaCategory?: string;
  isTraining?: boolean;
  environmentLabel?: string;
  hideRewards?: boolean;
  onShareToFeed?: () => void;
  sharingToFeed?: boolean;
  onClose: () => void;
}) {
  const events = useMemo(() => roundEvents(result.log), [result.log]);
  const meta = arenaCategoryMeta(arenaCategory);
  const themeClass = THEME_CLASS[arenaCategory] ?? "";

  const [phase, setPhase] = useState<Phase>("intro");
  const [roundIdx, setRoundIdx] = useState(-1);
  const [fx, setFx] = useState<
    | { defender: "mine" | "theirs"; kind: RoundFx; dmg: number; skill: SkillKind; healSide: "mine" | "theirs" | null; healAmt: number }
    | null
  >(null);
  const [myHp, setMyHp] = useState(100);
  const [theirHp, setTheirHp] = useState(100);
  const [runKey, setRunKey] = useState(0); // forces re-mount on replay
  const [speed, setSpeed] = useState<1 | 2>(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("intro");
    setRoundIdx(-1);
    setFx(null);
    setMyHp(100);
    setTheirHp(100);

    // Precompute HP timeline so re-renders never double-apply damage / heals.
    let my = 100, their = 100;
    const timeline = events.map((e) => {
      if (e.defender === "mine") my = Math.max(0, my - e.dmg);
      else their = Math.max(0, their - e.dmg);
      if (e.healAmt > 0) {
        if (e.attacker === "mine") my = Math.min(100, my + e.healAmt);
        else their = Math.min(100, their + e.healAmt);
      }
      return { my, their };
    });

    const sf = 1 / speed; // speed factor — 2x halves every delay
    const t = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms * sf));
    const INTRO_MS = 1500;
    const ROUND_MS = 1050;
    t(INTRO_MS, () => setPhase("fight"));

    events.forEach((e, i) => {
      const at = INTRO_MS + 500 + i * ROUND_MS;
      t(at, () => {
        setRoundIdx(i);
        setFx({
          defender: e.defender, kind: e.fx, dmg: e.dmg, skill: e.skill,
          healSide: e.healAmt > 0 ? e.attacker : null, healAmt: e.healAmt,
        });
        setMyHp(timeline[i].my);
        setTheirHp(timeline[i].their);
      });
      t(at + 600, () => setFx(null));
    });

    // Summary — force the overall loser to 0 HP for a clean finish.
    t(INTRO_MS + 500 + events.length * ROUND_MS + 300, () => {
      setPhase("summary");
      if (result.iWon) setTheirHp(0);
      else setMyHp(0);
    });

    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [events, result.iWon, runKey, speed]);

  const ev = roundIdx >= 0 ? events[roundIdx] : null;
  const critActive = !!fx && fx.kind === "crit";

  // Map the current phase/round into a companion sprite animation per side.
  function companionAnimFor(sideKey: "mine" | "theirs"): CompanionAnim {
    if (phase === "summary") return result.iWon === (sideKey === "mine") ? "victory" : "defeat";
    if (phase === "fight" && ev && fx) {
      if (ev.attacker === sideKey) return "attack";
      if (fx.defender === sideKey) return fx.kind === "dodge" ? "dodge" : "hit";
    }
    return "idle";
  }
  const myAnim = companionAnimFor("mine");
  const theirAnim = companionAnimFor("theirs");

  function share() {
    const text = result.iWon
      ? `My ${myName} won its PullBid Arena battle against ${result.opponentName} ${result.myRounds}–${result.theirRounds}! ⚔️`
      : `Tough PullBid Arena battle vs ${result.opponentName} (${result.myRounds}–${result.theirRounds}). Rematch incoming! ⚔️`;
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "PullBid Arena", text, url }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`.trim());
      toast.success("Battle result copied to clipboard");
    }
  }

  return (
    <div className="space-y-4">
      {/* Stage */}
      <div className={`arena-stage arena-theme arena-scanlines relative overflow-hidden rounded-xl border p-4 ${themeClass}`}>
        {/* Critical-hit screen flash */}
        {critActive && <span key={`crit-${runKey}-${roundIdx}`} className="arena-crit-flash pointer-events-none absolute inset-0 z-20 bg-white" aria-hidden />}

        {/* Arena intro banner */}
        {phase === "intro" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
            <div className="arena-banner-in">
              {isTraining && (
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Training Mode</p>
              )}
              <div className="text-4xl">{meta.emoji}</div>
              <p className="mt-1 text-sm font-black uppercase tracking-widest text-primary drop-shadow">{meta.label}</p>
              {environmentLabel && (
                <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{environmentLabel}</p>
              )}
              <p className="mt-2 text-2xl font-black tracking-widest text-foreground">VS</p>
            </div>
          </div>
        )}

        {/* Round counter / result */}
        <div className="relative z-10 mb-2 min-h-5 text-center">
          {phase === "fight" && ev && (
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Round {ev.round} · {(ev.attacker === "mine" ? myName : result.opponentName).split(" ")[0]} used {SKILL_LABEL[ev.skill]}
            </p>
          )}
          {phase === "summary" && (
            <p className={`arena-victory text-xl font-black tracking-wide ${result.iWon ? "text-amber-500" : "text-muted-foreground"}`}>
              {result.iWon ? "VICTORY!" : "DEFEAT"}
            </p>
          )}
        </div>

        <div className={`relative z-10 flex items-end justify-between gap-3 ${phase === "summary" && !result.iWon ? "arena-shake" : ""}`}>
          <div className="relative flex-1">
            <Fighter
              name={myName}
              cardImage={myImage}
              side="left"
              category={arenaCategory}
              seedKey={mySeed ?? myName}
              level={myLevel}
              hp={myHp}
              frameClass={myFrameClass}
              effectClass={myEffectClass}
              title={myTitle}
              wrapperAnim={phase === "intro" ? "arena-enter-left" : ""}
              companionAnim={myAnim}
            />
            {fx?.defender === "mine" && <FloatText kind={fx.kind} dmg={fx.dmg} runKey={`d-${runKey}-${roundIdx}`} />}
            {fx?.healSide === "mine" && <FloatText kind="heal" dmg={fx.healAmt} runKey={`h-${runKey}-${roundIdx}`} />}
          </div>

          <div className="relative flex h-28 w-10 shrink-0 items-center justify-center sm:h-36">
            <Swords className={`h-6 w-6 text-primary ${phase === "fight" ? "animate-pulse" : ""}`} />
            {fx && fx.kind !== "dodge" && (
              <>
                <span className={`arena-burst absolute left-1/2 top-1/2 rounded-full ${fx.kind === "crit" ? "h-14 w-14 bg-amber-400/70" : "h-10 w-10 bg-primary/60"}`} />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={`${runKey}-${roundIdx}-${i}`}
                    className="arena-spark absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-400"
                    style={{
                      ["--sx" as any]: `${Math.cos((i / 6) * 6.28) * (fx.kind === "crit" ? 48 : 34)}px`,
                      ["--sy" as any]: `${Math.sin((i / 6) * 6.28) * (fx.kind === "crit" ? 48 : 34)}px`,
                    }}
                  />
                ))}
              </>
            )}
          </div>

          <div className="relative flex-1">
            <Fighter
              name={result.opponentName}
              cardImage={result.opponentImage}
              emoji={result.opponentEmoji}
              side="right"
              category={arenaCategory}
              seedKey={result.opponentName}
              level={myLevel}
              hp={theirHp}
              wrapperAnim={phase === "intro" ? "arena-enter-right" : ""}
              companionAnim={theirAnim}
            />
            {fx?.defender === "theirs" && <FloatText kind={fx.kind} dmg={fx.dmg} runKey={`d-${runKey}-${roundIdx}`} />}
            {fx?.healSide === "theirs" && <FloatText kind="heal" dmg={fx.healAmt} runKey={`h-${runKey}-${roundIdx}`} />}
          </div>
        </div>

        {/* Victory confetti */}
        {phase === "summary" && result.iWon && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={`${runKey}-confetti-${i}`}
                className="arena-confetti absolute top-2 h-2 w-2 rounded-sm"
                style={{
                  left: `${(i / 16) * 100}%`,
                  background: ["#f59e0b", "#22c55e", "#38bdf8", "#e879f9", "#f43f5e"][i % 5],
                  ["--cx" as any]: `${(i % 2 ? 1 : -1) * (10 + (i % 5) * 8)}px`,
                  ["--cy" as any]: `${120 + (i % 4) * 24}px`,
                  animationDelay: `${(i % 6) * 60}ms`,
                }}
              />
            ))}
          </div>
        )}

        <p className="relative z-10 mt-3 text-center text-[10px] text-muted-foreground">
          {isTraining ? "Training battle — reduced rewards, no rank points." : "Digital companions only — your real cards are never at risk."}
        </p>
      </div>

      {/* Summary */}
      {phase === "summary" ? (
        <div className="space-y-3">
          <p className="text-center text-sm">
            {myName} vs {result.opponentName} — <span className="font-bold">{result.myRounds}–{result.theirRounds}</span>
          </p>

          {!hideRewards && (
            <div className="grid grid-cols-4 gap-2">
              <Reward icon={Zap} label="XP" value={`${result.rewards.xp > 0 ? "+" : ""}${result.rewards.xp}`} />
              <Reward icon={Trophy} label="Trophies" value={`+${result.rewards.trophies}`} />
              <Reward icon={Shield} label="Rank" value={`${result.rewards.rank > 0 ? "+" : ""}${result.rewards.rank}`} />
              <Reward icon={Coins} label="Credits" value={`+${result.rewards.credits}`} />
            </div>
          )}

          {result.newBadges.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="mb-1 font-semibold">🎖️ New badge{result.newBadges.length > 1 ? "s" : ""}!</p>
              <div className="flex flex-wrap gap-2">
                {result.newBadges.map((k) => (
                  <Badge key={k} variant="secondary" className="text-xs">
                    {ARENA_BADGES[k].emoji} {ARENA_BADGES[k].label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setRunKey((k) => k + 1)}>
              <RotateCcw className="mr-2 h-4 w-4" />Watch replay
            </Button>
            <Button variant="secondary" onClick={share}>
              <Share2 className="mr-2 h-4 w-4" />Share
            </Button>
          </div>
          {onShareToFeed && (
            <Button variant="outline" className="w-full" onClick={onShareToFeed} disabled={sharingToFeed}>
              <Users className="mr-2 h-4 w-4" />{sharingToFeed ? "Posting…" : "Post to Arena Feed"}
            </Button>
          )}
          <Button className="w-full" onClick={onClose}>Continue</Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
            <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Speed</span>
            <Button
              size="sm"
              variant={speed === 1 ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setSpeed(1)}
            >
              1×
            </Button>
            <Button
              size="sm"
              variant={speed === 2 ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setSpeed(2)}
            >
              <FastForward className="mr-1 h-3 w-3" />2×
            </Button>
          </div>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setPhase("summary")}>
            <SkipForward className="mr-1.5 h-4 w-4" />Skip
          </Button>
        </div>
      )}
    </div>
  );
}

function FloatText({ kind, dmg, runKey }: { kind: RoundFx | "heal"; dmg: number; runKey: string }) {
  const label =
    kind === "crit" ? "CRITICAL!" :
    kind === "dodge" ? "DODGED" :
    kind === "block" ? "BLOCKED" :
    kind === "heal" ? `+${dmg} HEAL` :
    `-${dmg}`;
  const cls =
    kind === "crit" ? "text-amber-400" :
    kind === "dodge" ? "text-sky-300" :
    kind === "block" ? "text-slate-200" :
    kind === "heal" ? "text-emerald-400" :
    "text-rose-400";
  const top = kind === "heal" ? "top-8" : "top-2";
  return (
    <span
      key={runKey}
      className={`arena-float-text pointer-events-none absolute left-1/2 ${top} z-30 text-sm font-black drop-shadow ${cls}`}
    >
      {label}
    </span>
  );
}

function Reward({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-2 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-primary" />
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
