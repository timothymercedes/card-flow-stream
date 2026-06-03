import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getCollectionWheel } from "@/lib/wheel.functions";
import { Trophy, Coins, Star, Crown, Frame, Gift, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const RARITY_CLASS: Record<string, string> = {
  common: "text-slate-400 border-slate-400/40",
  rare: "text-blue-400 border-blue-400/40",
  epic: "text-purple-400 border-purple-400/40",
  legendary: "text-amber-400 border-amber-400/50",
};

const RANK = { legendary: 4, epic: 3, rare: 2, common: 1 } as const;

function kindIcon(kind: string) {
  switch (kind) {
    case "title": return <Crown className="h-4 w-4" />;
    case "frame": return <Frame className="h-4 w-4" />;
    case "trophy": return <Trophy className="h-4 w-4" />;
    case "credits": return <Coins className="h-4 w-4" />;
    case "xp": return <Star className="h-4 w-4" />;
    default: return <Gift className="h-4 w-4" />;
  }
}

export function ProfileRewardsShowcase() {
  const getWheel = useServerFn(getCollectionWheel);
  const q = useQuery({ queryKey: ["collection-wheel"], queryFn: () => getWheel() });

  const spins = (q.data?.spins ?? [])
    .slice()
    .sort((a, b) => (RANK[b.rarity as keyof typeof RANK] ?? 0) - (RANK[a.rarity as keyof typeof RANK] ?? 0));

  const setsCompleted = spins.length;
  const rarePlus = spins.filter((s) => s.rarity !== "common").length;

  if (q.isLoading) return null;

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Sparkles className="h-4 w-4 text-primary" /> Set Completion Rewards
      </h2>

      {setsCompleted === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Complete a Collection Book set to spin the reward wheel — your prizes will show off here.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-lg font-bold">{setsCompleted}</p>
              <p className="text-[10px] text-muted-foreground">Sets Completed</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-lg font-bold">{rarePlus}</p>
              <p className="text-[10px] text-muted-foreground">Rare+ Rewards Won</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {spins.map((s) => (
              <div
                key={s.contextKey}
                className={`flex items-center gap-2 rounded-lg border p-2 ${RARITY_CLASS[s.rarity] ?? ""}`}
              >
                {kindIcon(s.rewardKind)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{s.label}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{s.contextLabel}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize ${RARITY_CLASS[s.rarity] ?? ""}`}>
                  {s.rarity}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
