// PullBid Arena — staged battle viewer (Phase 2).
// Hybrid identity: pixelated companion sprites + modern CSS particle/glow FX.
// Replaces the instant result dialog with intro → entrances → round-by-round
// attacks → victory/defeat → summary, with replay & share. Purely presentational:
// the outcome is already resolved server-side; this only animates it.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ARENA_BADGES, type ArenaBadgeKey } from "@/lib/arenaShared";
import { Swords, Trophy, Sparkles, RotateCcw, Share2, Shield, Zap, Coins } from "lucide-react";
import { toast } from "sonner";

type BattleLog = Array<{ round: number; mine: number; theirs: number; winner: "mine" | "theirs" }>;
export type StageResult = {
  iWon: boolean;
  myRounds: number;
  theirRounds: number;
  log: BattleLog;
  rewards: { xp: number; trophies: number; rank: number; credits: number };
  opponentName: string;
  opponentImage?: string | null;
  newBadges: ArenaBadgeKey[];
};

type Phase = "intro" | "fight" | "summary";

function Fighter({
  name, image, side, anim, frameClass = "", effectClass = "", title,
}: {
  name: string; image?: string | null; side: "left" | "right"; anim: string;
  frameClass?: string; effectClass?: string; title?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className={`relative ${anim}`}>
        {effectClass && <span className={`arena-fx ${effectClass}`} aria-hidden />}
        {image ? (
          <img src={image} alt={name} className={`arena-fighter relative h-28 w-20 rounded object-cover sm:h-36 sm:w-28 ${frameClass}`} />
        ) : (
          <div className={`arena-fighter relative flex h-28 w-20 items-center justify-center rounded bg-muted sm:h-36 sm:w-28 ${frameClass}`}>
            <Sparkles className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="max-w-[8rem] truncate text-center text-xs font-bold sm:text-sm">{name}</p>
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
  result, myName, myImage, myFrameClass = "", myEffectClass = "", myTitle, onClose,
}: {
  result: StageResult;
  myName: string;
  myImage?: string | null;
  myFrameClass?: string;
  myEffectClass?: string;
  myTitle?: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [roundIdx, setRoundIdx] = useState(-1);
  const [hit, setHit] = useState<null | "mine" | "theirs">(null);
  const [runKey, setRunKey] = useState(0); // forces re-mount on replay
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("intro");
    setRoundIdx(-1);
    setHit(null);

    const t = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    // Intro → fight
    t(1100, () => setPhase("fight"));
    // Schedule each round: lunge + hit flash
    const ROUND_MS = 950;
    result.log.forEach((r, i) => {
      const at = 1100 + 600 + i * ROUND_MS;
      t(at, () => { setRoundIdx(i); setHit(r.winner === "mine" ? "theirs" : "mine"); });
      t(at + 500, () => setHit(null));
    });
    // Summary
    t(1100 + 600 + result.log.length * ROUND_MS + 300, () => setPhase("summary"));

    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [result, runKey]);

  const myLunging = phase === "fight" && hit === "theirs";
  const theirLunging = phase === "fight" && hit === "mine";

  function share() {
    const text = result.iWon
      ? `I won my PullBid Arena battle against ${result.opponentName} ${result.myRounds}–${result.theirRounds}! ⚔️`
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
      <div className="arena-stage arena-scanlines relative overflow-hidden rounded-xl border p-4">
        {/* Round counter / VS */}
        <div className="mb-2 text-center">
          {phase === "intro" && (
            <p className="arena-victory text-lg font-black tracking-widest text-primary">VS</p>
          )}
          {phase === "fight" && roundIdx >= 0 && (
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Round {result.log[roundIdx].round} · {result.log[roundIdx].mine} vs {result.log[roundIdx].theirs}
            </p>
          )}
          {phase === "summary" && (
            <p className={`arena-victory text-xl font-black tracking-wide ${result.iWon ? "text-amber-500" : "text-muted-foreground"}`}>
              {result.iWon ? "VICTORY!" : "DEFEAT"}
            </p>
          )}
        </div>

        <div className={`flex items-end justify-between gap-3 ${phase === "summary" && !result.iWon ? "arena-shake" : ""}`}>
          <Fighter
            name={myName}
            image={myImage}
            side="left"
            frameClass={myFrameClass}
            effectClass={myEffectClass}
            title={myTitle}
            anim={`${phase === "intro" ? "arena-enter-left" : ""} ${myLunging ? "arena-lunge-left" : ""} ${theirLunging ? "arena-hit" : ""}`.trim()}
          />

          <div className="relative flex h-28 w-10 shrink-0 items-center justify-center sm:h-36">
            <Swords className={`h-6 w-6 text-primary ${phase === "fight" ? "animate-pulse" : ""}`} />
            {/* Impact burst */}
            {hit && (
              <>
                <span className="arena-burst absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-primary/60" />
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={`${runKey}-${roundIdx}-${i}`}
                    className="arena-spark absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-400"
                    style={{
                      ["--sx" as any]: `${Math.cos((i / 5) * 6.28) * 34}px`,
                      ["--sy" as any]: `${Math.sin((i / 5) * 6.28) * 34}px`,
                    }}
                  />
                ))}
              </>
            )}
          </div>

          <Fighter
            name={result.opponentName}
            image={result.opponentImage}
            side="right"
            anim={`${phase === "intro" ? "arena-enter-right" : ""} ${theirLunging ? "arena-lunge-right" : ""} ${myLunging ? "arena-hit" : ""}`.trim()}
          />
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Digital companions only — your real cards are never at risk.
        </p>
      </div>

      {/* Summary */}
      {phase === "summary" ? (
        <div className="space-y-3">
          <p className="text-center text-sm">
            {myName} vs {result.opponentName} — <span className="font-bold">{result.myRounds}–{result.theirRounds}</span>
          </p>

          <div className="grid grid-cols-4 gap-2">
            <Reward icon={Zap} label="XP" value={`${result.rewards.xp > 0 ? "+" : ""}${result.rewards.xp}`} />
            <Reward icon={Trophy} label="Trophies" value={`+${result.rewards.trophies}`} />
            <Reward icon={Shield} label="Rank" value={`${result.rewards.rank > 0 ? "+" : ""}${result.rewards.rank}`} />
            <Reward icon={Coins} label="Credits" value={`+${result.rewards.credits}`} />
          </div>

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
              <RotateCcw className="mr-2 h-4 w-4" />Replay
            </Button>
            <Button variant="secondary" onClick={share}>
              <Share2 className="mr-2 h-4 w-4" />Share
            </Button>
          </div>
          <Button className="w-full" onClick={onClose}>Continue</Button>
        </div>
      ) : (
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setPhase("summary")}>
          Skip animation
        </Button>
      )}
    </div>
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
