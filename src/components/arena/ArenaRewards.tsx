// PullBid Arena — Rewards tab (Phase 3): daily challenges + cosmetics shop.
// Self-contained: manages its own queries/mutations. Digital-only rewards.
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDailyChallenges, claimArenaChallenge, getArenaCosmetics,
  buyArenaCosmetic, equipArenaCosmetic, getSetCompletionRewards, claimSetReward,
} from "@/lib/arena.functions";
import { ARENA_DAILY_CHALLENGES, CHALLENGE_MAP } from "@/lib/arenaChallenges";
import { ARENA_COSMETICS, COSMETIC_MAP, RARITY_COLOR, type CosmeticType } from "@/lib/arenaCosmetics";
import { arenaCategoryMeta } from "@/lib/arenaCategories";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Coins, Check, Gift, BookCheck } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<CosmeticType, string> = {
  frame: "Frames", effect: "Effect Auras", entrance: "Entrances", title: "Titles",
};

export function ArenaRewards() {
  const qc = useQueryClient();
  const challengesFn = useServerFn(getDailyChallenges);
  const claimFn = useServerFn(claimArenaChallenge);
  const cosmeticsFn = useServerFn(getArenaCosmetics);
  const buyFn = useServerFn(buyArenaCosmetic);
  const equipFn = useServerFn(equipArenaCosmetic);

  const challQ = useQuery({ queryKey: ["arena", "challenges"], queryFn: () => challengesFn() });
  const cosmQ = useQuery({ queryKey: ["arena", "cosmetics"], queryFn: () => cosmeticsFn() });

  const claimM = useMutation({
    mutationFn: (key: string) => claimFn({ data: { challengeKey: key } }),
    onSuccess: (r) => {
      toast.success(`Claimed! +${r.rewardXp} XP · +${r.rewardCredits} credits`);
      qc.invalidateQueries({ queryKey: ["arena", "challenges"] });
      qc.invalidateQueries({ queryKey: ["arena", "cosmetics"] });
      qc.invalidateQueries({ queryKey: ["arena", "mine"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not claim"),
  });

  const buyM = useMutation({
    mutationFn: (key: string) => buyFn({ data: { cosmeticKey: key } }),
    onSuccess: () => {
      toast.success("Cosmetic unlocked!");
      qc.invalidateQueries({ queryKey: ["arena", "cosmetics"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not buy"),
  });

  const equipM = useMutation({
    mutationFn: (v: { key: string; equipped: boolean }) => equipFn({ data: { cosmeticKey: v.key, equipped: v.equipped } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["arena", "cosmetics"] }),
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });

  const ownedMap = new Map((cosmQ.data?.owned ?? []).map((o) => [o.key, o]));
  const balance = cosmQ.data?.balance ?? 0;

  return (
    <div className="space-y-6">
      {/* Daily challenges */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold"><Gift className="h-4 w-4 text-primary" />Daily Challenges</h2>
          <span className="inline-flex items-center gap-1 text-sm font-semibold"><Coins className="h-4 w-4 text-amber-500" />{balance}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {ARENA_DAILY_CHALLENGES.map((c) => {
            const live = challQ.data?.challenges.find((x) => x.key === c.key);
            const progress = live?.progress ?? 0;
            const complete = live?.complete ?? false;
            const claimed = live?.claimed ?? false;
            return (
              <Card key={c.key} className="p-4">
                <p className="font-semibold">{c.emoji} {c.label}</p>
                <p className="mb-2 text-xs text-muted-foreground">{c.description}</p>
                <Progress value={(progress / c.goal) * 100} className="h-2" />
                <p className="mt-1 text-xs text-muted-foreground">{progress}/{c.goal}</p>
                <p className="mt-2 text-xs">Reward: <span className="font-semibold">+{c.rewardXp} XP · +{c.rewardCredits} credits</span></p>
                <Button
                  size="sm" className="mt-3 w-full"
                  disabled={!complete || claimed || claimM.isPending}
                  variant={claimed ? "secondary" : "default"}
                  onClick={() => claimM.mutate(c.key)}
                >
                  {claimed ? <><Check className="mr-1 h-4 w-4" />Claimed</> : complete ? "Claim reward" : "In progress"}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Cosmetics shop */}
      <section>
        <h2 className="mb-1 font-bold">Cosmetics</h2>
        <p className="mb-3 text-xs text-muted-foreground">Visual flair only — cosmetics never affect battle outcomes. One equipped per type.</p>
        {(["frame", "effect", "entrance", "title"] as CosmeticType[]).map((type) => (
          <div key={type} className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{TYPE_LABEL[type]}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ARENA_COSMETICS.filter((c) => c.type === type).map((c) => {
                const owned = ownedMap.get(c.key);
                const isEquipped = owned?.equipped ?? false;
                return (
                  <Card key={c.key} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.emoji} {c.name}</p>
                      <p className={`text-[11px] font-medium capitalize ${RARITY_COLOR[c.rarity]}`}>{c.rarity}</p>
                    </div>
                    {owned ? (
                      <Button
                        size="sm" variant={isEquipped ? "default" : "secondary"}
                        disabled={equipM.isPending}
                        onClick={() => equipM.mutate({ key: c.key, equipped: !isEquipped })}
                      >
                        {isEquipped ? <><Check className="mr-1 h-4 w-4" />Equipped</> : "Equip"}
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        disabled={buyM.isPending || balance < c.cost}
                        onClick={() => buyM.mutate(c.key)}
                      >
                        <Coins className="mr-1 h-3.5 w-3.5 text-amber-500" />{c.cost}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

// Helper used by the battle stage / companion cards to resolve equipped FX.
export function equippedClasses(owned: Array<{ key: string; type: string; equipped: boolean }> | undefined) {
  const eq = (owned ?? []).filter((o) => o.equipped);
  const frame = eq.find((o) => o.type === "frame");
  const effect = eq.find((o) => o.type === "effect");
  const title = eq.find((o) => o.type === "title");
  return {
    frameClass: frame ? COSMETIC_MAP[frame.key]?.frameClass ?? "" : "",
    effectClass: effect ? COSMETIC_MAP[effect.key]?.effectClass ?? "" : "",
    titleText: title ? COSMETIC_MAP[title.key]?.titleText ?? "" : "",
  };
}
