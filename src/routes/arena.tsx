import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  syncCompanions, listMyCompanions, findOpponents, challengeAndResolve, getLeaderboards,
  battlePve, getBattleHistory,
} from "@/lib/arena.functions";
import {
  TITLE_META, COMMUNITY_META, DIFFICULTY_META, companionLevelProgress,
  type ArenaCommunity, type ArenaTitle, type ArenaDifficulty, PVP_WIN_XP,
} from "@/lib/arenaShared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Swords, Shield, Zap, Trophy, Flame, Sparkles, RefreshCw, Crown, Lock, Medal,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "PullBid Arena — Battle Your Digital Companions" },
      { name: "description", content: "Unlock digital companions from your real card collection, train them, and battle other collectors. Real cards are never at risk." },
    ],
  }),
  component: ArenaPage,
});

type Companion = Awaited<ReturnType<typeof listMyCompanions>>["companions"][number];
type PublicCompanion = Awaited<ReturnType<typeof findOpponents>>["opponents"][number];

function titleBadge(title: ArenaTitle) {
  const m = TITLE_META[title];
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${m.color}`}><Crown className="h-3 w-3" />{m.label}</span>;
}

function StatBar({ icon: Icon, label, value, max = 60 }: { icon: any; label: string; value: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Progress value={Math.min(100, (value / max) * 100)} className="h-2 flex-1" />
      <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ArenaPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [community, setCommunity] = useState<ArenaCommunity>("general");
  const [difficulty, setDifficulty] = useState<ArenaDifficulty>("normal");
  const [battleResult, setBattleResult] = useState<
    | Awaited<ReturnType<typeof challengeAndResolve>>
    | Awaited<ReturnType<typeof battlePve>>
    | null
  >(null);
  const [selectedMine, setSelectedMine] = useState<string | null>(null);

  const listFn = useServerFn(listMyCompanions);
  const syncFn = useServerFn(syncCompanions);
  const oppFn = useServerFn(findOpponents);
  const battleFn = useServerFn(challengeAndResolve);
  const pveFn = useServerFn(battlePve);
  const historyFn = useServerFn(getBattleHistory);
  const lbFn = useServerFn(getLeaderboards);

  const myQ = useQuery({
    queryKey: ["arena", "mine"],
    queryFn: () => listFn(),
    enabled: !!user,
  });
  const companions = myQ.data?.companions ?? [];

  const oppQ = useQuery({
    queryKey: ["arena", "opponents", community],
    queryFn: () => oppFn({ data: { community } }),
    enabled: !!user,
  });

  const historyQ = useQuery({
    queryKey: ["arena", "history"],
    queryFn: () => historyFn(),
    enabled: !!user,
  });

  const lbQ = useQuery({ queryKey: ["arena", "leaderboards"], queryFn: () => lbFn() });

  const syncM = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(r.created > 0 ? `Unlocked ${r.created} new companion${r.created > 1 ? "s" : ""}!` : "All companions already unlocked");
      qc.invalidateQueries({ queryKey: ["arena", "mine"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not sync companions"),
  });

  const battleM = useMutation({
    mutationFn: (vars: { myCompanionId: string; opponentCompanionId: string }) => battleFn({ data: vars }),
    onSuccess: (r) => {
      setBattleResult(r);
      qc.invalidateQueries({ queryKey: ["arena"] });
    },
    onError: (e: any) => toast.error(e?.message || "Battle failed"),
  });

  const pveM = useMutation({
    mutationFn: (vars: { myCompanionId: string; difficulty: ArenaDifficulty }) => pveFn({ data: vars }),
    onSuccess: (r) => {
      setBattleResult(r);
      qc.invalidateQueries({ queryKey: ["arena"] });
    },
    onError: (e: any) => toast.error(e?.message || "Training battle failed"),
  });

  const activeMine = useMemo(
    () => companions.find((c) => c.id === selectedMine) ?? companions[0],
    [companions, selectedMine],
  );

  function fight(opponentId: string) {
    if (!activeMine) { toast.error("Select one of your companions first"); return; }
    battleM.mutate({ myCompanionId: activeMine.id, opponentCompanionId: opponentId });
  }

  function quickMatch() {
    const pool = oppQ.data?.opponents ?? [];
    if (pool.length === 0) { toast.error("No opponents available right now"); return; }
    fight(pool[Math.floor(Math.random() * pool.length)].id);
  }

  function trainCpu() {
    if (!activeMine) { toast.error("Select one of your companions first"); return; }
    pveM.mutate({ myCompanionId: activeMine.id, difficulty });
  }

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <Swords className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h1 className="mb-2 text-2xl font-bold">PullBid Arena</h1>
          <p className="text-muted-foreground">Sign in to unlock digital companions from your Vault and battle other collectors. Your real cards are never at risk.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><Swords className="h-6 w-6 text-primary" />PullBid Arena</h1>
            <p className="text-sm text-muted-foreground">Battle digital companions. Real cards are never at risk.</p>
          </div>
          <Button onClick={() => syncM.mutate()} disabled={syncM.isPending} size="sm" variant="secondary">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncM.isPending ? "animate-spin" : ""}`} />Unlock from Vault
          </Button>
        </div>

        <Tabs defaultValue="roster">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="roster"><Sparkles className="mr-1 h-4 w-4" />Companions</TabsTrigger>
            <TabsTrigger value="battle"><Swords className="mr-1 h-4 w-4" />Battle (PVP)</TabsTrigger>
            <TabsTrigger value="train"><Shield className="mr-1 h-4 w-4" />Train (PVE)</TabsTrigger>
            <TabsTrigger value="history"><Flame className="mr-1 h-4 w-4" />History</TabsTrigger>
            <TabsTrigger value="leaderboards"><Trophy className="mr-1 h-4 w-4" />Leaderboards</TabsTrigger>
          </TabsList>

          {/* ---- Roster ---- */}
          <TabsContent value="roster">
            {companions.length === 0 ? (
              <Card className="p-8 text-center">
                <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="mb-4 text-muted-foreground">No companions yet. Add cards to your Vault, then unlock their digital companions.</p>
                <Button onClick={() => syncM.mutate()} disabled={syncM.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncM.isPending ? "animate-spin" : ""}`} />Unlock companions
                </Button>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {companions.map((c) => <OwnerCompanionCard key={c.id} c={c} />)}
              </div>
            )}
          </TabsContent>

          {/* ---- Battle ---- */}
          <TabsContent value="battle">
            {companions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">Unlock a companion first to enter the arena.</Card>
            ) : (
              <>
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">Your fighter</p>
                  <div className="flex flex-wrap gap-2">
                    {companions.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedMine(c.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${activeMine?.id === c.id ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}
                      >
                        {c.name} · Lv{c.level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">Arena</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(COMMUNITY_META) as ArenaCommunity[]).map((k) => (
                      <button
                        key={k}
                        onClick={() => setCommunity(k)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${community === k ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}
                      >
                        {COMMUNITY_META[k].emoji} {COMMUNITY_META[k].arena}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-primary/5 p-3">
                  <p className="flex-1 text-xs text-muted-foreground">
                    Real battles reward the most — up to <span className="font-semibold text-foreground">+{PVP_WIN_XP} XP</span>, trophies, rank and leaderboard points.
                  </p>
                  <Button onClick={quickMatch} disabled={battleM.isPending || (oppQ.data?.opponents.length ?? 0) === 0} size="sm">
                    <Zap className="mr-2 h-4 w-4" />Quick Match
                  </Button>
                </div>

                {oppQ.isLoading ? (
                  <Card className="p-8 text-center text-muted-foreground">Finding opponents…</Card>
                ) : (oppQ.data?.opponents.length ?? 0) === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">No opponents in this arena yet. Check back soon!</Card>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {oppQ.data!.opponents.map((o) => (
                      <OpponentCard key={o.id} o={o} onFight={() => fight(o.id)} disabled={battleM.isPending} />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ---- Train (PVE) ---- */}
          <TabsContent value="train">
            {companions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">Unlock a companion first to start training.</Card>
            ) : (
              <>
                <Card className="mb-4 border-dashed p-4">
                  <p className="text-sm">
                    Practice against computer opponents to learn the Arena and train your companions risk-free.
                    Training gives <span className="font-semibold">reduced XP and rewards</span> and earns
                    <span className="font-semibold"> no rank or leaderboard points</span> — real PVP battles are always worth more.
                  </p>
                </Card>

                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">Your fighter</p>
                  <div className="flex flex-wrap gap-2">
                    {companions.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedMine(c.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${activeMine?.id === c.id ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}
                      >
                        {c.name} · Lv{c.level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">Difficulty</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(DIFFICULTY_META) as ArenaDifficulty[]).map((k) => {
                      const m = DIFFICULTY_META[k];
                      return (
                        <button
                          key={k}
                          onClick={() => setDifficulty(k)}
                          className={`rounded-lg border p-3 text-left transition ${difficulty === k ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                        >
                          <div className="text-sm font-semibold">{m.emoji} {m.label}</div>
                          <div className="text-[10px] text-muted-foreground">Win +{m.winXp} XP</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button onClick={trainCpu} disabled={pveM.isPending} className="w-full">
                  <Swords className="mr-2 h-4 w-4" />
                  {pveM.isPending ? "Training…" : `Train vs Computer (${DIFFICULTY_META[difficulty].label})`}
                </Button>
              </>
            )}
          </TabsContent>

          {/* ---- Battle History ---- */}
          <TabsContent value="history">
            <div className="mb-4 grid grid-cols-3 gap-3">
              <Card className="p-4 text-center"><div className="text-2xl font-bold text-emerald-500">{historyQ.data?.wins ?? 0}</div><div className="text-xs text-muted-foreground">Wins</div></Card>
              <Card className="p-4 text-center"><div className="text-2xl font-bold text-muted-foreground">{historyQ.data?.losses ?? 0}</div><div className="text-xs text-muted-foreground">Losses</div></Card>
              <Card className="p-4 text-center"><div className="text-2xl font-bold text-amber-500">{historyQ.data?.currentStreak ?? 0} 🔥</div><div className="text-xs text-muted-foreground">Current Streak</div></Card>
            </div>
            {historyQ.isLoading ? (
              <Card className="p-8 text-center text-muted-foreground">Loading battle history…</Card>
            ) : (historyQ.data?.battles.length ?? 0) === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">No battles yet. Jump into the arena!</Card>
            ) : (
              <Card className="divide-y">
                {historyQ.data!.battles.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={b.iWon ? "default" : "secondary"}>{b.iWon ? "Win" : "Loss"}</Badge>
                      <span className="text-muted-foreground">
                        {b.type === "pve" ? `Training${b.difficulty ? ` · ${DIFFICULTY_META[b.difficulty].label}` : ""}` : "PVP Battle"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </Card>
            )}
          </TabsContent>

          {/* ---- Leaderboards ---- */}
          <TabsContent value="leaderboards">
            <div className="grid gap-4 md:grid-cols-2">
              <LeaderboardCard title="Most Wins" icon={Trophy} rows={(lbQ.data?.mostWins ?? []).map((r) => ({ name: r.name, value: `${r.wins} W`, title: r.title }))} />
              <LeaderboardCard title="Longest Win Streak" icon={Flame} rows={(lbQ.data?.longestStreak ?? []).map((r) => ({ name: r.name, value: `${r.longest_win_streak} 🔥`, title: r.title }))} />
              <LeaderboardCard title="Top Trainers" icon={Medal} rows={(lbQ.data?.topTrainers ?? []).map((r, i) => ({ name: `Trainer #${i + 1}`, value: `${r.season_wins} season wins` }))} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Battle result dialog */}
      <Dialog open={!!battleResult} onOpenChange={(o) => !o && setBattleResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {battleResult?.iWon ? <><Trophy className="h-5 w-5 text-amber-500" />Victory!</> : <><Swords className="h-5 w-5 text-muted-foreground" />Defeat</>}
            </DialogTitle>
          </DialogHeader>
          {battleResult && (
            <div className="space-y-3">
              <p className="text-sm">
                {activeMine?.name} vs {battleResult.opponentName} — {battleResult.myRounds}–{battleResult.theirRounds}
              </p>
              <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                {battleResult.log.map((r) => (
                  <div key={r.round} className="flex justify-between">
                    <span>Round {r.round}</span>
                    <span className={r.winner === "mine" ? "font-semibold text-emerald-500" : "text-muted-foreground"}>
                      {r.mine} vs {r.theirs}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-around rounded-lg border p-3 text-center text-sm">
                <div><div className="font-bold">{battleResult.rewards.xp > 0 ? "+" : ""}{battleResult.rewards.xp}</div><div className="text-xs text-muted-foreground">XP</div></div>
                <div><div className="font-bold">+{battleResult.rewards.trophies}</div><div className="text-xs text-muted-foreground">Trophies</div></div>
                <div><div className="font-bold">{battleResult.rewards.rank > 0 ? "+" : ""}{battleResult.rewards.rank}</div><div className="text-xs text-muted-foreground">Rank</div></div>
              </div>
              <Button className="w-full" onClick={() => setBattleResult(null)}>Continue</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function OwnerCompanionCard({ c }: { c: Companion }) {
  const prog = companionLevelProgress(c.xp);
  const cm = COMMUNITY_META[(c.community as ArenaCommunity)] ?? COMMUNITY_META.general;
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex gap-3">
        {c.image_url ? (
          <img src={c.image_url} alt={c.name} className="h-20 w-16 rounded object-cover" loading="lazy" />
        ) : (
          <div className="flex h-20 w-16 items-center justify-center rounded bg-muted"><Sparkles className="h-6 w-6 text-muted-foreground" /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-bold">{c.name}</h3>
            <Badge variant="secondary" className="shrink-0">Lv {c.level}</Badge>
          </div>
          <div className="mt-0.5">{titleBadge(c.title as ArenaTitle)}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{cm.emoji} {cm.arena} · {c.wins}W / {c.losses}L</p>
          <div className="mt-1">
            <Progress value={prog.pct} className="h-1.5" />
            <p className="mt-0.5 text-[10px] text-muted-foreground">{prog.current}/{prog.needed} XP to Lv {prog.level + 1}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <StatBar icon={Swords} label="Attack" value={c.attack} />
        <StatBar icon={Shield} label="Defense" value={c.defense} />
        <StatBar icon={Zap} label="Speed" value={c.speed} />
      </div>
      {c.hidden_traits?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.hidden_traits.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
        </div>
      )}
    </Card>
  );
}

function OpponentCard({ o, onFight, disabled }: { o: PublicCompanion; onFight: () => void; disabled: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        {o.image_url ? (
          <img src={o.image_url} alt={o.name} className="h-16 w-12 rounded object-cover" loading="lazy" />
        ) : (
          <div className="flex h-16 w-12 items-center justify-center rounded bg-muted"><Sparkles className="h-5 w-5 text-muted-foreground" /></div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{o.name}</h3>
          <div>{titleBadge(o.title as ArenaTitle)}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{o.wins}W · {o.losses}L · {o.win_rate}% win rate</p>
          <p className="text-[10px] text-muted-foreground">Stats hidden — strategy at play 🔒</p>
        </div>
      </div>
      <Button onClick={onFight} disabled={disabled} size="sm" className="mt-3 w-full">
        <Swords className="mr-2 h-4 w-4" />Challenge
      </Button>
    </Card>
  );
}

function LeaderboardCard({ title, icon: Icon, rows }: { title: string; icon: any; rows: Array<{ name: string; value: string; title?: ArenaTitle }> }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 font-bold"><Icon className="h-4 w-4 text-primary" />{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.slice(0, 10).map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-center font-bold text-muted-foreground">{i + 1}</span>
                <span className="truncate">{r.name}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
