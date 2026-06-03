import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  syncCompanions, listMyCompanions, findOpponents, challengeAndResolve, getLeaderboards,
  battlePve, battleAiBoss, getBattleHistory, searchCollectors, getArenaProfile, followCollector,
  unfollowCollector, challengeUser, getRecentOpponents, listMyBadges, getArenaCosmetics,
  getBattleReplay, postBattleToFeed, getMissionClaims, claimMission, setCompanionVisual,
} from "@/lib/arena.functions";
import { ensureCompanionFighter } from "@/lib/arenaFighter.functions";
import { CompanionCustomizeDialog, type VisualMode } from "@/components/arena/CompanionCustomizeDialog";
import {
  TITLE_META, COMMUNITY_META, DIFFICULTY_META, ARENA_BADGES, companionLevelProgress,
  type ArenaCommunity, type ArenaTitle, type ArenaDifficulty, type ArenaBadgeKey, PVP_WIN_XP,
  TRAINING_TRAINERS, AI_BOSSES, bossCharacter, type ArenaBossKey, streakBonusLabel,
} from "@/lib/arenaShared";
import { environmentsFor, environmentMeta, TRAINING_MISSIONS } from "@/lib/arenaTraining";
import { ARENA_CATEGORIES, arenaCategoryMeta } from "@/lib/arenaCategories";
import { evolutionStage } from "@/lib/arenaCompanion";
import { ArenaBattleStage, type StageResult } from "@/components/arena/ArenaBattleStage";
import { CompanionSprite } from "@/components/arena/CompanionSprite";
import { ArenaRewards, equippedClasses } from "@/components/arena/ArenaRewards";
import { ArenaFeed } from "@/components/arena/ArenaFeed";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Swords, Shield, Zap, Trophy, Flame, Sparkles, RefreshCw, Crown, Lock, Medal,
  Users, Search, UserPlus, UserCheck, Award, History, Gift, Rss, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

const ARENA_CATEGORY_KEYS = new Set(ARENA_CATEGORIES.map((c) => c.key));

// Ordered category options for the top-level Arena filter dropdown.
const FILTER_CATEGORY_KEYS = [
  "pokemon", "onepiece", "mtg", "yugioh", "sports", "lorcana", "wrestling", "marvel", "starwars",
] as const;

// Small colored category badge shown on each companion card.
function CategoryBadge({ categoryKey }: { categoryKey: string }) {
  const m = arenaCategoryMeta(categoryKey);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium">
      <span className="leading-none">{m.emoji}</span>
      {m.label.replace(/ Arena$/, "")}
    </span>
  );
}

export const Route = createFileRoute("/arena")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => {
    const c = typeof search.category === "string" ? search.category : undefined;
    return c && ARENA_CATEGORY_KEYS.has(c as any) ? { category: c } : {};
  },
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

function titleLabel(title: ArenaTitle) {
  return TITLE_META[title].label;
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
  const { user, session, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { category: initialCategory } = Route.useSearch();
  const [category, setCategory] = useState<string>(initialCategory ?? "all");
  const [difficulty, setDifficulty] = useState<ArenaDifficulty>("normal");
  const [environment, setEnvironment] = useState<string | null>(null);
  const [battleResult, setBattleResult] = useState<
    | Awaited<ReturnType<typeof challengeAndResolve>>
    | Awaited<ReturnType<typeof challengeUser>>
    | Awaited<ReturnType<typeof battlePve>>
    | Awaited<ReturnType<typeof battleAiBoss>>
    | null
  >(null);
  const [selectedMine, setSelectedMine] = useState<string | null>(null);
  const [collectorQuery, setCollectorQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [tab, setTab] = useState("roster");
  const [battleFor, setBattleFor] = useState<string | null>(null);
  const [trainFor, setTrainFor] = useState<string | null>(null);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [customizeFor, setCustomizeFor] = useState<string | null>(null);
  const [replay, setReplay] = useState<Awaited<ReturnType<typeof getBattleReplay>> | null>(null);

  const listFn = useServerFn(listMyCompanions);
  const syncFn = useServerFn(syncCompanions);
  const oppFn = useServerFn(findOpponents);
  const battleFn = useServerFn(challengeAndResolve);
  const pveFn = useServerFn(battlePve);
  const bossFn = useServerFn(battleAiBoss);
  const historyFn = useServerFn(getBattleHistory);
  const lbFn = useServerFn(getLeaderboards);
  const searchFn = useServerFn(searchCollectors);
  const profileFn = useServerFn(getArenaProfile);
  const followFn = useServerFn(followCollector);
  const unfollowFn = useServerFn(unfollowCollector);
  const challengeUserFn = useServerFn(challengeUser);
  const recentFn = useServerFn(getRecentOpponents);
  const badgesFn = useServerFn(listMyBadges);
  const cosmeticsFn = useServerFn(getArenaCosmetics);
  const replayFn = useServerFn(getBattleReplay);
  const postFeedFn = useServerFn(postBattleToFeed);
  const fighterFn = useServerFn(ensureCompanionFighter);
  const canLoadArena = !!user && !!session && !authLoading;

  // Generate a card-accurate battle figure once per companion (cached server-side).
  const fighterM = useMutation({
    mutationFn: (companionId: string) => fighterFn({ data: { companionId } }),
    onSuccess: (r) => {
      if (r.fighterImage) qc.invalidateQueries({ queryKey: ["arena", "mine"] });
    },
  });
  const fighterPending = useRef<Set<string>>(new Set());
  function ensureFighter(c?: { id: string; fighter_image_url?: string | null; image_url?: string | null }) {
    if (!c || c.fighter_image_url || !c.image_url) return;
    if (fighterPending.current.has(c.id)) return;
    fighterPending.current.add(c.id);
    fighterM.mutate(c.id, { onSettled: () => fighterPending.current.delete(c.id) });
  }


  const myQ = useQuery({
    queryKey: ["arena", "mine"],
    queryFn: () => listFn(),
    enabled: canLoadArena,
    retry: false,
  });
  const companions = myQ.data?.companions ?? [];
  const visibleCompanions = useMemo(
    () => (category === "all" ? companions : companions.filter((c) => c.arena_category === category)),
    [companions, category],
  );

  const oppQ = useQuery({
    queryKey: ["arena", "opponents", category],
    queryFn: () => oppFn({ data: { category } }),
    enabled: canLoadArena,
    retry: false,
  });

  const historyQ = useQuery({
    queryKey: ["arena", "history"],
    queryFn: () => historyFn(),
    enabled: canLoadArena,
    retry: false,
  });

  const claimsFn = useServerFn(getMissionClaims);
  const claimFn = useServerFn(claimMission);
  const claimsQ = useQuery({ queryKey: ["arena", "claims"], queryFn: () => claimsFn(), enabled: canLoadArena, retry: false });
  const claimM = useMutation({
    mutationFn: (missionKey: string) => claimFn({ data: { missionKey } }),
    onSuccess: (r) => {
      toast.success(`Reward claimed: ${r.reward}`);
      qc.invalidateQueries({ queryKey: ["arena", "claims"] });
      qc.invalidateQueries({ queryKey: ["arena", "cosmetics"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not claim reward"),
  });

  const badgesQ = useQuery({ queryKey: ["arena", "badges"], queryFn: () => badgesFn(), enabled: canLoadArena, retry: false });
  const cosmeticsQ = useQuery({ queryKey: ["arena", "cosmetics"], queryFn: () => cosmeticsFn(), enabled: canLoadArena, retry: false });
  const equipped = useMemo(() => equippedClasses(cosmeticsQ.data?.owned), [cosmeticsQ.data]);
  const recentQ = useQuery({ queryKey: ["arena", "recent"], queryFn: () => recentFn(), enabled: canLoadArena, retry: false });
  const searchQ = useQuery({
    queryKey: ["arena", "collectors", searchTerm],
    queryFn: () => searchFn({ data: { query: searchTerm } }),
    enabled: canLoadArena,
    retry: false,
  });
  const profileQ = useQuery({
    queryKey: ["arena", "profile", profileUserId],
    queryFn: () => profileFn({ data: { userId: profileUserId! } }),
    enabled: canLoadArena && !!profileUserId,
    retry: false,
  });

  const lbQ = useQuery({ queryKey: ["arena", "leaderboards", category], queryFn: () => lbFn({ data: { category } }) });

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
      setBattleFor(null);
      setBattleResult(r);
      qc.invalidateQueries({ queryKey: ["arena"] });
    },
    onError: (e: any) => toast.error(e?.message || "Battle failed"),
  });

  const pveM = useMutation({
    mutationFn: (vars: { myCompanionId: string; difficulty: ArenaDifficulty; environment?: string }) => pveFn({ data: vars }),
    onSuccess: (r) => {
      setTrainFor(null);
      setBattleResult(r);
      qc.invalidateQueries({ queryKey: ["arena"] });
    },
    onError: (e: any) => toast.error(e?.message || "Training battle failed"),
  });

  const bossM = useMutation({
    mutationFn: (vars: { myCompanionId: string; boss: ArenaBossKey }) => bossFn({ data: vars }),
    onSuccess: (r) => {
      setTrainFor(null);
      setBattleResult(r);
      qc.invalidateQueries({ queryKey: ["arena"] });
    },
    onError: (e: any) => toast.error(e?.message || "Boss battle failed"),
  });

  const challengeUserM = useMutation({
    mutationFn: (vars: { myCompanionId: string; targetUserId: string }) => challengeUserFn({ data: vars }),
    onSuccess: (r) => {
      setBattleResult(r);
      qc.invalidateQueries({ queryKey: ["arena"] });
    },
    onError: (e: any) => toast.error(e?.message || "Battle failed"),
  });

  const followM = useMutation({
    mutationFn: async (vars: { userId: string; follow: boolean }): Promise<{ following: boolean }> =>
      vars.follow ? followFn({ data: { userId: vars.userId } }) : unfollowFn({ data: { userId: vars.userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arena", "profile"] });
      qc.invalidateQueries({ queryKey: ["arena", "collectors"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not update follow"),
  });

  const replayM = useMutation({
    mutationFn: (battleId: string) => replayFn({ data: { battleId } }),
    onSuccess: (r) => setReplay(r),
    onError: (e: any) => toast.error(e?.message || "Could not load replay"),
  });

  const shareFeedM = useMutation({
    mutationFn: (vars: { result: StageResult; companionName: string; companionImage: string | null }) =>
      postFeedFn({ data: {
        battleId: vars.result.battleId ?? null,
        won: vars.result.iWon,
        opponentName: vars.result.opponentName,
        companionName: vars.companionName,
        imageUrl: vars.companionImage,
      } }),
    onSuccess: () => {
      toast.success("Shared to the Arena feed!");
      qc.invalidateQueries({ queryKey: ["arena", "feed"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not share to feed"),
  });

  function watchReplay(battleId: string) { replayM.mutate(battleId); }

  const visualFn = useServerFn(setCompanionVisual);
  const visualM = useMutation({
    mutationFn: (vars: { companionId: string; mode: VisualMode; custom: { body?: string; accent?: string; head?: string } }) =>
      visualFn({ data: vars }),
    onSuccess: () => {
      toast.success("Appearance updated!");
      setCustomizeFor(null);
      qc.invalidateQueries({ queryKey: ["arena", "mine"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not update appearance"),
  });

  const customizeCompanion = useMemo(
    () => companions.find((c) => c.id === customizeFor) ?? null,
    [companions, customizeFor],
  );

  const activeMine = useMemo(
    () => companions.find((c) => c.id === selectedMine) ?? companions[0],
    [companions, selectedMine],
  );

  const statsCompanion = useMemo(
    () => companions.find((c) => c.id === statsFor) ?? null,
    [companions, statsFor],
  );

  function openBattle(id: string) {
    setSelectedMine(id);
    ensureFighter(companions.find((x) => x.id === id));
    setBattleFor(id);
  }
  function openTrain(id: string) {
    setSelectedMine(id);
    const c = companions.find((x) => x.id === id);
    ensureFighter(c);
    setEnvironment(environmentsFor(c?.arena_category)[0]?.key ?? null);
    setTrainFor(id);
  }
  function openCustomize(id: string) { setCustomizeFor(id); }

  function battleCollector(targetUserId: string) {
    if (!activeMine) { toast.error("Select one of your companions first"); return; }
    challengeUserM.mutate({ myCompanionId: activeMine.id, targetUserId });
  }

  function fight(opponentId: string) {
    if (!activeMine) { toast.error("Select one of your companions first"); return; }
    battleM.mutate({ myCompanionId: activeMine.id, opponentCompanionId: opponentId });
  }

  // ---- AI fill-in matchmaking: never wait indefinitely for a human ----

  const SEARCH_SECONDS = 10;
  const [matchPhase, setMatchPhase] = useState<"idle" | "searching" | "ai-offer">("idle");
  const [searchSecs, setSearchSecs] = useState(SEARCH_SECONDS);
  const searchTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearSearch() {
    if (searchTimer.current) { clearInterval(searchTimer.current); searchTimer.current = null; }
  }

  function startMatchmaking() {
    if (!activeMine) { toast.error("Select one of your companions first"); return; }
    const pool = oppQ.data?.opponents ?? [];
    clearSearch();
    setMatchPhase("searching");
    // Priority 1 — real player. If one is available, match quickly (short search).
    if (pool.length > 0) {
      setSearchSecs(3);
      let s = 3;
      searchTimer.current = setInterval(() => {
        s -= 1; setSearchSecs(s);
        if (s <= 0) {
          clearSearch();
          setMatchPhase("idle");
          fight(pool[Math.floor(Math.random() * pool.length)].id);
        }
      }, 1000);
      return;
    }
    // No real player — search the full window, then offer AI fill-in opponents.
    setSearchSecs(SEARCH_SECONDS);
    let s = SEARCH_SECONDS;
    searchTimer.current = setInterval(() => {
      s -= 1; setSearchSecs(s);
      if (s <= 0) { clearSearch(); setMatchPhase("ai-offer"); }
    }, 1000);
  }

  function cancelMatchmaking() { clearSearch(); setMatchPhase("idle"); }

  function fightAiTrainer(d: ArenaDifficulty) {
    if (!activeMine) return;
    setMatchPhase("idle");
    pveM.mutate({ myCompanionId: activeMine.id, difficulty: d });
  }

  // Reset matchmaking whenever the Battle dialog opens/closes.
  useEffect(() => {
    if (!battleFor) { clearSearch(); setMatchPhase("idle"); }
  }, [battleFor]);
  useEffect(() => () => clearSearch(), []);


  function trainCpu() {
    if (!activeMine) { toast.error("Select one of your companions first"); return; }
    pveM.mutate({ myCompanionId: activeMine.id, difficulty, environment: environment ?? undefined });
  }

  function fightBoss(boss: ArenaBossKey) {
    if (!activeMine) { toast.error("Select one of your companions first"); return; }
    bossM.mutate({ myCompanionId: activeMine.id, boss });
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

        {/* Top-level Arena Category filter — keeps the roster visible, no category page. */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Arena Category</span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">⚔️ All Categories</SelectItem>
              {FILTER_CATEGORY_KEYS.map((k) => {
                const m = arenaCategoryMeta(k);
                return (
                  <SelectItem key={k} value={k}>{m.emoji} {m.label}</SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>



        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="roster"><Sparkles className="mr-1 h-4 w-4" />Companions</TabsTrigger>
            <TabsTrigger value="collectors"><Users className="mr-1 h-4 w-4" />Collectors</TabsTrigger>
            <TabsTrigger value="feed"><Rss className="mr-1 h-4 w-4" />Feed</TabsTrigger>
            <TabsTrigger value="history"><Flame className="mr-1 h-4 w-4" />History</TabsTrigger>
            <TabsTrigger value="leaderboards"><Trophy className="mr-1 h-4 w-4" />Leaderboards</TabsTrigger>
            <TabsTrigger value="rewards"><Gift className="mr-1 h-4 w-4" />Rewards</TabsTrigger>
          </TabsList>

          {/* ---- Roster (companion-driven gameplay starts here) ---- */}
          <TabsContent value="roster">
            {companions.length === 0 ? (
              <Card className="p-8 text-center">
                <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="mb-4 text-muted-foreground">No companions yet. Add cards to your Vault, then unlock their digital companions.</p>
                <Button onClick={() => syncM.mutate()} disabled={syncM.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncM.isPending ? "animate-spin" : ""}`} />Unlock companions
                </Button>
              </Card>
            ) : visibleCompanions.length === 0 ? (
              <Card className="p-8 text-center">
                <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="mb-4 text-muted-foreground">No companions in {arenaCategoryMeta(category).label}. Switch categories or unlock more from your Vault.</p>
                <Button variant="secondary" onClick={() => setCategory("all")}>Show all categories</Button>
              </Card>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">Pick a companion, then choose its next move.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleCompanions.map((c) => (
                    <OwnerCompanionCard
                      key={c.id}
                      c={c}
                      frameClass={equipped.frameClass}
                      onBattle={() => openBattle(c.id)}
                      onTrain={() => openTrain(c.id)}
                      onStats={() => setStatsFor(c.id)}
                      onCustomize={() => openCustomize(c.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </TabsContent>


          {/* ---- Collectors (search / follow / friends battle / rematch) ---- */}
          <TabsContent value="collectors">
            {!activeMine && (
              <Card className="mb-4 p-4 text-center text-sm text-muted-foreground">
                Unlock a companion first to challenge collectors.
              </Card>
            )}

            {/* My badges */}
            <Card className="mb-4 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-bold"><Award className="h-4 w-4 text-primary" />Your Badges</h3>
              {(badgesQ.data?.badges.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No badges yet — win battles to earn them.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {badgesQ.data!.badges.map((b) => {
                    const m = ARENA_BADGES[b.key];
                    return (
                      <span key={b.key} title={m.desc} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                        <span className="text-base leading-none">{m.emoji}</span>{m.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Rematch recent opponents */}
            {(recentQ.data?.opponents.length ?? 0) > 0 && (
              <Card className="mb-4 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-bold"><History className="h-4 w-4 text-primary" />Rematch</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {recentQ.data!.opponents.map((o) => (
                    <div key={o.user_id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                      <button onClick={() => setProfileUserId(o.user_id)} className="flex min-w-0 items-center gap-2">
                        <Avatar className="h-8 w-8"><AvatarImage src={o.avatar_url ?? undefined} /><AvatarFallback>{o.username[0]?.toUpperCase()}</AvatarFallback></Avatar>
                        <span className="truncate text-sm font-medium">{o.username}</span>
                      </button>
                      <Button size="sm" variant="secondary" disabled={!activeMine || challengeUserM.isPending} onClick={() => battleCollector(o.user_id)}>
                        <Swords className="mr-1 h-3.5 w-3.5" />Rematch
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Search collectors */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 font-bold"><Search className="h-4 w-4 text-primary" />Find Collectors</h3>
              <form
                className="mb-4 flex gap-2"
                onSubmit={(e) => { e.preventDefault(); setSearchTerm(collectorQuery.trim()); }}
              >
                <Input value={collectorQuery} onChange={(e) => setCollectorQuery(e.target.value)} placeholder="Search by username…" />
                <Button type="submit" variant="secondary"><Search className="h-4 w-4" /></Button>
              </form>
              {searchQ.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
              ) : (searchQ.data?.collectors.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No collectors found.</p>
              ) : (
                <div className="divide-y">
                  {searchQ.data!.collectors.map((c) => (
                    <div key={c.user_id} className="flex items-center justify-between gap-2 py-2">
                      <button onClick={() => setProfileUserId(c.user_id)} className="flex min-w-0 items-center gap-3 text-left">
                        <Avatar className="h-9 w-9"><AvatarImage src={c.avatar_url ?? undefined} /><AvatarFallback>{c.username[0]?.toUpperCase()}</AvatarFallback></Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{c.username}</p>
                          <p className="text-xs text-muted-foreground">{c.wins}W · {c.companions} companions · {titleLabel(c.best)}</p>
                        </div>
                      </button>
                      <div className="flex shrink-0 gap-1.5">
                        <Button size="icon" variant={c.isFollowing ? "default" : "outline"} className="h-8 w-8"
                          disabled={followM.isPending}
                          onClick={() => followM.mutate({ userId: c.user_id, follow: !c.isFollowing })}>
                          {c.isFollowing ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" disabled={!activeMine || challengeUserM.isPending} onClick={() => battleCollector(c.user_id)}>
                          <Swords className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

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
                        {b.type === "pve" ? `Training${b.difficulty ? ` · ${DIFFICULTY_META[b.difficulty].label}` : ""}` : b.type === "boss" ? `Boss Battle${b.difficulty ? ` · ${b.difficulty}` : ""}` : "PVP Battle"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</span>
                      <Button size="sm" variant="ghost" onClick={() => watchReplay(b.id)} disabled={replayM.isPending}>
                        <PlayCircle className="mr-1 h-4 w-4" />Replay
                      </Button>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </TabsContent>

          {/* ---- Feed (shared battles) ---- */}
          <TabsContent value="feed">
            <ArenaFeed onWatchReplay={watchReplay} />
          </TabsContent>


          {/* ---- Leaderboards ---- */}
          <TabsContent value="leaderboards">
            <div className="grid gap-4 md:grid-cols-2">
              <LeaderboardCard title="Most Wins" icon={Trophy} rows={(lbQ.data?.mostWins ?? []).map((r) => ({ name: r.name, value: `${r.wins} W`, title: r.title }))} />
              <LeaderboardCard title="Longest Win Streak" icon={Flame} rows={(lbQ.data?.longestStreak ?? []).map((r) => ({ name: r.name, value: `${r.longest_win_streak} 🔥`, title: r.title }))} />
              <LeaderboardCard title="Top Trainers" icon={Medal} rows={(lbQ.data?.topTrainers ?? []).map((r, i) => ({ name: `Trainer #${i + 1}`, value: `${r.season_wins} season wins` }))} />
            </div>
          </TabsContent>

          {/* ---- Rewards (daily challenges + cosmetics) ---- */}
          <TabsContent value="rewards">
            <ArenaRewards category={category} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Battle result — staged animated viewer (hybrid pixel + modern FX) */}
      <Dialog open={!!battleResult} onOpenChange={(o) => !o && setBattleResult(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary" />Arena Battle
            </DialogTitle>
          </DialogHeader>
          {battleResult && (
            <ArenaBattleStage
              result={battleResult}
              myName={activeMine?.name ?? "Your companion"}
              myImage={activeMine?.fighter_image_url ?? activeMine?.image_url}
              mySeed={activeMine ? `${activeMine.id}:${activeMine.name}` : null}
              myLevel={activeMine?.level ?? 1}
              myPassive={activeMine?.hidden_traits?.[0] ?? null}
              myFrameClass={equipped.frameClass}
              myEffectClass={equipped.effectClass}
              myTitle={equipped.titleText}
              arenaCategory={activeMine?.arena_category ?? category}
              isTraining={battleResult.rewards.rank === 0 && battleResult.rewards.credits === 0}
              environmentLabel={
                "environment" in battleResult && battleResult.environment
                  ? environmentMeta(activeMine?.arena_category, battleResult.environment).label
                  : undefined
              }
              onShareToFeed={() => shareFeedM.mutate({
                result: battleResult,
                companionName: activeMine?.name ?? "Your companion",
                companionImage: activeMine?.image_url ?? null,
              })}
              sharingToFeed={shareFeedM.isPending}
              onClose={() => setBattleResult(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Battle replay viewer */}
      <Dialog open={!!replay} onOpenChange={(o) => !o && setReplay(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />Battle Replay
            </DialogTitle>
          </DialogHeader>
          {replay && (
            <ArenaBattleStage
              result={replay.result}
              myName={replay.myName}
              myImage={replay.myImage}
              myFrameClass={equipped.frameClass}
              myEffectClass={equipped.effectClass}
              myTitle={equipped.titleText}
              isTraining={replay.isTraining}
              hideRewards
              onClose={() => setReplay(null)}
            />
          )}
        </DialogContent>
      </Dialog>


      {/* Collector Arena profile dialog */}
      <Dialog open={!!profileUserId} onOpenChange={(o) => !o && setProfileUserId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Avatar className="h-8 w-8"><AvatarImage src={profileQ.data?.profile.avatar_url ?? undefined} /><AvatarFallback>{profileQ.data?.profile.username?.[0]?.toUpperCase() ?? "?"}</AvatarFallback></Avatar>
              {profileQ.data?.profile.username ?? "Collector"}
            </DialogTitle>
          </DialogHeader>
          {profileQ.isLoading || !profileQ.data ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading profile…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Card className="p-3"><div className="text-lg font-bold text-emerald-500">{profileQ.data.wins}</div><div className="text-xs text-muted-foreground">Wins</div></Card>
                <Card className="p-3"><div className="text-lg font-bold">{profileQ.data.trophies}</div><div className="text-xs text-muted-foreground">Trophies</div></Card>
                <Card className="p-3"><div className="text-lg font-bold text-amber-500">{profileQ.data.longest} 🔥</div><div className="text-xs text-muted-foreground">Best Streak</div></Card>
              </div>

              {!profileQ.data.isSelf && (
                <div className="flex gap-2">
                  <Button variant={profileQ.data.isFollowing ? "secondary" : "default"} className="flex-1"
                    disabled={followM.isPending}
                    onClick={() => followM.mutate({ userId: profileQ.data!.profile.user_id, follow: !profileQ.data!.isFollowing })}>
                    {profileQ.data.isFollowing ? <><UserCheck className="mr-2 h-4 w-4" />Following</> : <><UserPlus className="mr-2 h-4 w-4" />Follow</>}
                  </Button>
                  <Button className="flex-1" disabled={!activeMine || challengeUserM.isPending}
                    onClick={() => battleCollector(profileQ.data!.profile.user_id)}>
                    <Swords className="mr-2 h-4 w-4" />Challenge
                  </Button>
                </div>
              )}

              {profileQ.data.badges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profileQ.data.badges.map((k) => (
                    <span key={k} title={ARENA_BADGES[k].desc} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                      {ARENA_BADGES[k].emoji} {ARENA_BADGES[k].label}
                    </span>
                  ))}
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium">Companions</p>
                {profileQ.data.companions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No companions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {profileQ.data.companions.map((o) => (
                      <div key={o.id} className="flex items-center gap-3 rounded-lg border p-2">
                        {o.image_url ? <img src={o.image_url} alt={o.name} className="h-12 w-9 rounded object-cover" loading="lazy" /> : <div className="flex h-12 w-9 items-center justify-center rounded bg-muted"><Sparkles className="h-4 w-4 text-muted-foreground" /></div>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{o.name}</p>
                          <p className="text-xs text-muted-foreground">{o.wins}W · {o.losses}L · {o.win_rate}%</p>
                        </div>
                        {titleBadge(o.title as ArenaTitle)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Battle Player dialog (per-companion) */}
      <Dialog open={!!battleFor} onOpenChange={(o) => !o && setBattleFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary" />Battle Player · {activeMine?.name ?? "Companion"}
            </DialogTitle>
          </DialogHeader>

          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">Arena Category</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategory("all")}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${category === "all" ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}
              >
                ⚔️ All Categories
              </button>
              {ARENA_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${category === cat.key ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-primary/5 p-3">
            <p className="flex-1 text-xs text-muted-foreground">
              Real battles reward the most — up to <span className="font-semibold text-foreground">+{PVP_WIN_XP} XP</span>, trophies, rank and leaderboard points.
            </p>
            <Button onClick={startMatchmaking} disabled={battleM.isPending || pveM.isPending || matchPhase === "searching"} size="sm">
              <Zap className="mr-2 h-4 w-4" />Find Match
            </Button>
          </div>

          {matchPhase === "searching" ? (
            <Card className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="font-semibold">Searching for opponent…</p>
              <p className="text-sm text-muted-foreground">Looking for a real player ({searchSecs}s)</p>
              <Button variant="ghost" size="sm" onClick={cancelMatchmaking}>Cancel</Button>
            </Card>
          ) : matchPhase === "ai-offer" ? (
            <div className="space-y-3">
              <Card className="border-amber-500/30 bg-amber-500/5 p-3 text-center text-sm">
                No active player found right now. Jump straight into an <span className="font-semibold">AI battle</span> — available 24/7.
                <span className="block text-[11px] text-muted-foreground">AI battles award reduced XP and no ranked progression.</span>
              </Card>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["beginner", "normal", "hard"] as ArenaDifficulty[]).map((k) => {
                  const t = TRAINING_TRAINERS[k];
                  const m = DIFFICULTY_META[k];
                  return (
                    <button
                      key={k}
                      onClick={() => fightAiTrainer(k)}
                      disabled={pveM.isPending}
                      className="rounded-lg border p-3 text-left transition hover:bg-muted disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl" aria-hidden>{t.emoji}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{t.name}</div>
                          <div className="truncate text-[10px] font-medium text-primary">{m.emoji} {t.rank}</div>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{t.style}</span>
                        <span className="font-semibold text-foreground">{t.record}</span>
                      </div>
                    </button>
                  );
                })}
                {(Object.keys(AI_BOSSES) as ArenaBossKey[]).map((k) => {
                  const tier = AI_BOSSES[k];
                  const ch = bossCharacter(k);
                  return (
                    <button
                      key={k}
                      onClick={() => { setMatchPhase("idle"); fightBoss(k); }}
                      disabled={bossM.isPending}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-left transition hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl" aria-hidden>{ch.emoji}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{ch.name}</div>
                          <div className="truncate text-[10px] font-medium text-amber-600">{tier.emoji} {tier.label} · {ch.record}</div>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{ch.style}</span>
                        <span className="font-semibold text-foreground">+{tier.winXp} XP · +{tier.winTrophies} 🏆</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={startMatchmaking}>
                <Zap className="mr-2 h-4 w-4" />Search for a real player again
              </Button>
            </div>
          ) : oppQ.isLoading ? (
            <Card className="p-8 text-center text-muted-foreground">Finding opponents…</Card>
          ) : (oppQ.data?.opponents.length ?? 0) === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No real players in this arena right now. Tap <span className="font-semibold text-foreground">Find Match</span> to battle AI opponents instantly.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {oppQ.data!.opponents.map((o) => (
                <OpponentCard key={o.id} o={o} onFight={() => fight(o.id)} disabled={battleM.isPending} />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Train AI — game-mode select screen (per-companion) */}
      <Dialog open={!!trainFor} onOpenChange={(o) => !o && setTrainFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />Battle Modes · {activeMine?.name ?? "Companion"}
            </DialogTitle>
          </DialogHeader>

          <p className="mb-3 text-xs text-muted-foreground">
            <span className="font-semibold">Practice</span> against AI trainers for risk-free, reduced XP, or take on an
            <span className="font-semibold"> always-available Boss</span> for full rewards. The same HP-based battle engine
            powers every fight — crits, dodges, traits and random events decide the winner.
          </p>

          {/* Choose your AI trainer */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold">Choose your AI trainer</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(TRAINING_TRAINERS) as ArenaDifficulty[]).map((k) => {
                const t = TRAINING_TRAINERS[k];
                const m = DIFFICULTY_META[k];
                const active = difficulty === k;
                return (
                  <button
                    key={k}
                    onClick={() => setDifficulty(k)}
                    className={`rounded-lg border p-3 text-left transition ${active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted"}`}
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={t.image}
                        alt={t.name}
                        loading="lazy"
                        className="h-12 w-12 shrink-0 object-contain drop-shadow"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{t.name}</div>
                        <div className="truncate text-[10px] font-medium text-primary">{m.emoji} {t.rank}</div>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{t.personality}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{t.style}</span>
                      <span className="font-semibold text-foreground">Win +{m.winXp} XP</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Choose your environment */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold">Training environment</p>
            <div className="flex flex-wrap gap-2">
              {environmentsFor(activeMine?.arena_category).map((env) => {
                const active = environment === env.key;
                return (
                  <button
                    key={env.key}
                    onClick={() => setEnvironment(env.key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                  >
                    {env.emoji} {env.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Training missions — progress from your battle history */}
          <div className="mb-4 rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Award className="h-4 w-4 text-primary" />Training Missions
            </p>
            <div className="space-y-2.5">
              {TRAINING_MISSIONS.map((mission) => {
                const have = Math.min(mission.count(historyQ.data?.battles ?? []), mission.goal);
                const done = have >= mission.goal;
                const claimed = (claimsQ.data?.claimed ?? []).includes(mission.key);
                return (
                  <div key={mission.key}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className={done ? "font-semibold text-emerald-500" : "font-medium"}>
                        {done ? "✓ " : ""}{mission.label}
                      </span>
                      {claimed ? (
                        <span className="font-semibold text-emerald-500">Claimed ✓</span>
                      ) : done ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 px-2 text-[10px]"
                          disabled={claimM.isPending}
                          onClick={() => claimM.mutate(mission.key)}
                        >
                          Claim {mission.reward}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">{have}/{mission.goal} · {mission.reward}</span>
                      )}
                    </div>
                    <Progress value={(have / mission.goal) * 100} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>


          <Button onClick={trainCpu} disabled={pveM.isPending || bossM.isPending} className="w-full">
            <Swords className="mr-2 h-4 w-4" />
            {pveM.isPending ? "Training…" : `Practice vs ${TRAINING_TRAINERS[difficulty].name}`}
          </Button>

          {/* AI Challenge — always-available Boss Battles (full rewards) */}
          <div className="mt-5 border-t pt-4">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Flame className="h-4 w-4 text-amber-500" />AI Challenge · Boss Battles
            </p>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Always available — no waiting for opponents. Bosses are tougher AI fighters that pay
              <span className="font-semibold text-foreground"> full XP, trophies, rank & credits</span> on a win.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(AI_BOSSES) as ArenaBossKey[]).map((k) => {
                const tier = AI_BOSSES[k];
                const ch = bossCharacter(k);
                return (
                  <div key={k} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <img
                        src={ch.image}
                        alt={ch.name}
                        loading="lazy"
                        className="h-12 w-12 shrink-0 object-contain drop-shadow"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{ch.name}</div>
                        <div className="truncate text-[10px] font-medium text-amber-600">{tier.emoji} {tier.label} · {ch.record}</div>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{ch.style}</p>
                    <p className="mt-1 text-[11px] italic text-muted-foreground">“{ch.taunt}”</p>
                    <div className="mt-1.5 text-[10px] font-semibold text-foreground">
                      Win +{tier.winXp} XP · +{tier.winTrophies} 🏆 · +{tier.winCredits} 🪙
                    </div>
                    <Button
                      onClick={() => fightBoss(k)}
                      disabled={pveM.isPending || bossM.isPending}
                      size="sm"
                      className="mt-2 w-full"
                      variant="secondary"
                    >
                      <Swords className="mr-1.5 h-3.5 w-3.5" />
                      {bossM.isPending ? "Fighting…" : `Challenge ${tier.label}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

        </DialogContent>
      </Dialog>


      {/* View Stats dialog (per-companion) */}
      <Dialog open={!!statsFor} onOpenChange={(o) => !o && setStatsFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />{statsCompanion?.name ?? "Companion"}
            </DialogTitle>
          </DialogHeader>
          {statsCompanion && (
            <div className="space-y-4">
              <div className="flex gap-3">
                {statsCompanion.image_url ? (
                  <img src={statsCompanion.image_url} alt={statsCompanion.name} className="h-28 w-20 rounded object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-28 w-20 items-center justify-center rounded bg-muted"><Sparkles className="h-7 w-7 text-muted-foreground" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    <span className="mr-1">{statsCompanion.archetype.emoji}</span>{statsCompanion.archetype.label}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="secondary">Lv {statsCompanion.level}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${statsCompanion.rarity.color} ${statsCompanion.rarity.ring}`}>
                      {statsCompanion.rarity.emoji} {statsCompanion.rarity.label}
                    </Badge>
                  </div>
                  <div className="mt-1">{titleBadge(statsCompanion.title as ArenaTitle)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{statsCompanion.wins}W / {statsCompanion.losses}L</p>
                  <div className="mt-2">
                    <Progress value={companionLevelProgress(statsCompanion.xp).pct} className="h-1.5" />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {companionLevelProgress(statsCompanion.xp).current}/{companionLevelProgress(statsCompanion.xp).needed} XP to Lv {companionLevelProgress(statsCompanion.xp).level + 1}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <StatBar icon={Swords} label="Attack" value={statsCompanion.attack} />
                <StatBar icon={Shield} label="Defense" value={statsCompanion.defense} />
                <StatBar icon={Zap} label="Speed" value={statsCompanion.speed} />
              </div>
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-muted/40 p-2.5">
                  <p className="text-xs font-semibold"><Shield className="mr-1 inline h-3.5 w-3.5 text-sky-500" />Passive · {statsCompanion.passive.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{statsCompanion.passive.desc}</p>
                </div>
                <div className="rounded-md border border-primary/40 bg-primary/10 p-2.5">
                  <p className="text-xs font-semibold"><Flame className="mr-1 inline h-3.5 w-3.5 text-amber-500" />Special · {statsCompanion.special.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{statsCompanion.special.desc}</p>
                </div>
              </div>
              {statsCompanion.hidden_traits?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {statsCompanion.hidden_traits.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => { const id = statsCompanion.id; setStatsFor(null); openBattle(id); }} size="sm">
                  <Swords className="mr-1.5 h-4 w-4" />Battle Player
                </Button>
                <Button onClick={() => { const id = statsCompanion.id; setStatsFor(null); openTrain(id); }} size="sm" variant="secondary">
                  <Shield className="mr-1.5 h-4 w-4" />Train AI
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customize — visual mode (Card / Inspired / Custom) + custom-piece builder */}
      <CompanionCustomizeDialog
        companion={customizeCompanion}
        open={!!customizeFor}
        onOpenChange={(o) => !o && setCustomizeFor(null)}
        saving={visualM.isPending}
        onSave={(mode, custom) =>
          customizeCompanion && visualM.mutate({ companionId: customizeCompanion.id, mode, custom })
        }
      />
    </AppShell>


  );
}

function OwnerCompanionCard({
  c, frameClass = "", onBattle, onTrain, onStats, onCustomize,
}: {
  c: Companion;
  frameClass?: string;
  onBattle: () => void;
  onTrain: () => void;
  onStats: () => void;
  onCustomize: () => void;
}) {
  const prog = companionLevelProgress(c.xp);
  const evo = evolutionStage(c.level);
  const evoPct = evo.nextAt ? Math.min(100, Math.round((c.level / evo.nextAt) * 100)) : 100;
  const cm = COMMUNITY_META[(c.community as ArenaCommunity)] ?? COMMUNITY_META.general;
  const cosm = (c.cosmetics ?? {}) as Record<string, any>;
  const mode: VisualMode = (cosm.visual_mode as VisualMode) ?? "inspired";
  const custom = (cosm.custom ?? {}) as { body?: string; accent?: string; head?: string };
  const showCard = mode === "card" && !!c.image_url;
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex gap-3">
        <div className="relative flex h-20 w-16 shrink-0 flex-col items-center justify-end">
          {showCard ? (
            <>
              <img src={c.image_url!} alt={`${c.name} card`} className={`h-20 w-14 rounded object-cover shadow ${frameClass}`} loading="lazy" />
              <CompanionSprite
                seedKey={`${c.id}:${c.name}`}
                category={c.arena_category}
                archetypeKey={c.archetype.key}
                anim="idle"
                level={c.level}
                flair={c.rarity.flair}
                size={28}
                className="absolute -bottom-1 -right-1"
              />
            </>
          ) : (
            <>
              <CompanionSprite
                seedKey={`${c.id}:${c.name}`}
                category={c.arena_category}
                archetypeKey={c.archetype.key}
                anim="idle"
                level={c.level}
                flair={c.rarity.flair}
                size={64}
                className={frameClass}
                bodyColor={mode === "custom" ? custom.body : undefined}
                accentColor={mode === "custom" ? custom.accent : undefined}
                headgear={mode === "custom" ? (custom.head as any) : undefined}
              />
              {c.image_url && (
                <img src={c.image_url} alt={`${c.name} card`} className="absolute -bottom-1 -right-1 h-7 w-5 rounded-[2px] border border-background object-cover shadow" loading="lazy" />
              )}
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-bold">{c.name}</h3>
            <div className="flex shrink-0 items-center gap-1">
              {c.win_streak >= 2 && (
                <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-600">
                  <Flame className="mr-0.5 h-3 w-3" />{c.win_streak} · {streakBonusLabel(c.win_streak + 1)}
                </Badge>
              )}
              <Badge variant="secondary">Lv {c.level}</Badge>
            </div>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium">
            <span className="mr-1">{c.archetype.emoji}</span>{c.archetype.label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <CategoryBadge categoryKey={c.arena_category} />
            <Badge variant="outline" className={`text-[10px] ${c.rarity.color} ${c.rarity.ring}`}>
              {c.rarity.emoji} {c.rarity.short}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${evo.color} ${evo.ring}`}>
              {evo.emoji} {evo.label}
            </Badge>
          </div>
          <div className="mt-0.5">{titleBadge(c.title as ArenaTitle)}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{cm.emoji} {cm.arena} · {c.wins}W / {c.losses}L</p>
          <div className="mt-1">
            <Progress value={prog.pct} className="h-1.5" />
            <p className="mt-0.5 text-[10px] text-muted-foreground">{prog.current}/{prog.needed} XP to Lv {prog.level + 1}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={onBattle} size="sm"><Swords className="mr-1.5 h-4 w-4" />Battle Player</Button>
        <Button onClick={onTrain} size="sm" variant="secondary"><Shield className="mr-1.5 h-4 w-4" />Train AI</Button>
        <Button onClick={onStats} size="sm" variant="outline"><Zap className="mr-1.5 h-4 w-4" />View Stats</Button>
        <Button onClick={onCustomize} size="sm" variant="outline"><Sparkles className="mr-1.5 h-4 w-4" />Customize</Button>
      </div>
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
