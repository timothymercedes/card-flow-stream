import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { getRewardsOverview, syncCollectorRewards, claimReward } from "@/lib/rewards.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Trophy, Coins, Sparkles, Award, Gift, Lock, Check, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards Center — PullBid Live" },
      { name: "description", content: "Claim set completion rewards, collector milestones, achievements, and PullBid Credits." },
    ],
  }),
  component: RewardsPage,
});

type Overview = Awaited<ReturnType<typeof getRewardsOverview>>;

function RewardsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const getOverview = useServerFn(getRewardsOverview);
  const sync = useServerFn(syncCollectorRewards);
  const claim = useServerFn(claimReward);

  const q = useQuery({
    queryKey: ["rewards-overview"],
    queryFn: () => getOverview(),
    enabled: !!user,
  });

  // Recompute progress from the collection once on load, then refresh.
  useEffect(() => {
    if (!user) return;
    sync().then(() => qc.invalidateQueries({ queryKey: ["rewards-overview"] })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const claimM = useMutation({
    mutationFn: (v: { slug: string; contextKey?: string; contextLabel?: string }) => claim({ data: v }),
    onSuccess: (r) => {
      if (r.granted) {
        toast.success(`Claimed: ${r.title}`, {
          description: `+${r.credits} credits · +${r.xp} XP`,
        });
      } else {
        toast.info("Already claimed");
      }
      qc.invalidateQueries({ queryKey: ["rewards-overview"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-6 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-bold">Rewards Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to track rewards, milestones, and PullBid Credits.</p>
          <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
        </div>
      </AppShell>
    );
  }

  const d = q.data;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <header className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <h1 className="text-xl font-bold">Rewards Center</h1>
            <p className="text-xs text-muted-foreground">Earn as you collect, complete, trade and buy.</p>
          </div>
        </header>

        {/* Wallet */}
        <Card className="flex items-center gap-3 bg-gradient-to-r from-amber-500/15 to-yellow-500/5 p-4">
          <Coins className="h-8 w-8 text-amber-500" />
          <div className="flex-1">
            <p className="text-2xl font-bold">{(d?.wallet.balance ?? 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">PullBid Credits · {(d?.wallet.lifetimeEarned ?? 0).toLocaleString()} earned all-time</p>
          </div>
        </Card>

        {/* Milestones strip */}
        {d && d.milestones.length > 0 && (
          <Card className="p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Collector Milestones</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {d.milestones.map((m) => (
                <div key={m.slug} className="min-w-[120px] rounded-lg border p-2 text-center">
                  <Award className={`mx-auto h-5 w-5 ${m.status === "claimed" ? "text-amber-500" : "text-muted-foreground"}`} />
                  <p className="mt-1 text-[11px] font-bold">{m.threshold} sets</p>
                  <Progress value={Math.min(100, Math.round((m.progress / (m.threshold || 1)) * 100))} className="mt-1 h-1" />
                  <p className="mt-1 text-[10px] text-muted-foreground">{m.progress}/{m.threshold}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {q.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Loading rewards…</p>}

        {d && (
          <Tabs defaultValue="available">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="available">Available{d.available.length ? ` (${d.available.length})` : ""}</TabsTrigger>
              <TabsTrigger value="progress">In Progress</TabsTrigger>
              <TabsTrigger value="redeemed">Redeemed</TabsTrigger>
              <TabsTrigger value="achievements">Achievements</TabsTrigger>
            </TabsList>

            <TabsContent value="available" className="mt-3 space-y-2">
              {d.available.length === 0 ? (
                <EmptyState text="No rewards ready to claim yet. Complete a set to unlock one!" />
              ) : (
                d.available.map((c) => (
                  <RewardRow
                    key={c.id}
                    title={c.contextLabel ? `${c.def!.title} — ${c.contextLabel}` : c.def!.title}
                    description={c.def!.description}
                    credits={c.def!.credits}
                    xp={c.def!.xp}
                    action={
                      <Button size="sm" disabled={claimM.isPending}
                        onClick={() => claimM.mutate({ slug: c.def!.slug, contextKey: c.contextKey, contextLabel: c.contextLabel ?? undefined })}>
                        <Gift className="mr-1 h-3.5 w-3.5" /> Claim
                      </Button>
                    }
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="progress" className="mt-3 space-y-2">
              {d.inProgress.length === 0 ? (
                <EmptyState text="Start collecting toward full sets to see progress here." />
              ) : (
                d.inProgress
                  .sort((a, b) => (b.progress / (b.target || 1)) - (a.progress / (a.target || 1)))
                  .map((c) => (
                    <Card key={c.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.contextLabel ? `${c.def!.title} — ${c.contextLabel}` : c.def!.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">{c.progress}/{c.target}</span>
                      </div>
                      <Progress value={Math.min(100, Math.round((c.progress / (c.target || 1)) * 100))} className="mt-2 h-1.5" />
                      <p className="mt-1.5 text-[11px] text-muted-foreground">Reward: +{c.def!.credits} credits · +{c.def!.xp} XP{c.def!.badge_slug ? " · badge" : ""}</p>
                    </Card>
                  ))
              )}
            </TabsContent>

            <TabsContent value="redeemed" className="mt-3 space-y-2">
              {d.redeemed.length === 0 ? (
                <EmptyState text="Claimed rewards will appear here." />
              ) : (
                d.redeemed.map((c) => (
                  <RewardRow
                    key={c.id}
                    title={c.contextLabel ? `${c.def!.title} — ${c.contextLabel}` : c.def!.title}
                    description={`Claimed ${c.claimedAt ? new Date(c.claimedAt).toLocaleDateString() : ""}`}
                    credits={c.def!.credits}
                    xp={c.def!.xp}
                    action={<Badge variant="secondary"><Check className="mr-1 h-3 w-3" /> Claimed</Badge>}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="achievements" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {d.achievements.map((a) => (
                <Card key={a.slug} className={`flex items-center gap-3 p-3 ${a.unlocked ? "" : "opacity-60"}`}>
                  {a.unlocked ? <Sparkles className="h-5 w-5 text-amber-500" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.is_secret && !a.unlocked ? "Secret achievement" : a.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{a.is_secret && !a.unlocked ? "Keep playing to reveal" : a.description}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-amber-500">+{a.xp_reward} XP</span>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}

        <Button asChild variant="outline" className="w-full">
          <Link to="/collection"><BookOpen className="mr-2 h-4 w-4" /> Go to Collection Books</Link>
        </Button>
      </div>
    </AppShell>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Card className="p-8 text-center text-sm text-muted-foreground">{text}</Card>;
}

function RewardRow({
  title, description, credits, xp, action,
}: { title: string; description: string; credits: number; xp: number; action: React.ReactNode }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <Trophy className="h-6 w-6 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{description}</p>
        <p className="mt-0.5 text-[11px] font-medium text-amber-500">+{credits} credits · +{xp} XP</p>
      </div>
      <div className="shrink-0">{action}</div>
    </Card>
  );
}
