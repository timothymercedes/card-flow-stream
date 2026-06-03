// Collection Streak card — shows the user's daily collecting streak and
// records today's activity automatically when the Collection page loads.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Flame, Trophy } from "lucide-react";
import { getCollectionStreak, recordCollectionActivity } from "@/lib/streaks.functions";

export function CollectionStreakCard({ recordOnMount = false }: { recordOnMount?: boolean }) {
  const qc = useQueryClient();
  const getStreak = useServerFn(getCollectionStreak);
  const record = useServerFn(recordCollectionActivity);

  const streakQ = useQuery({
    queryKey: ["collection-streak"],
    queryFn: () => getStreak(),
  });

  useEffect(() => {
    if (!recordOnMount) return;
    let cancelled = false;
    (async () => {
      try {
        await record();
        if (!cancelled) qc.invalidateQueries({ queryKey: ["collection-streak"] });
      } catch {
        /* streak recording is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordOnMount]);

  const s = streakQ.data;
  if (!s) return null;

  const next = s.nextMilestone;
  const pct = next ? Math.min(100, Math.round((s.currentStreak / next) * 100)) : 100;

  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
        <Flame className={s.currentStreak > 0 ? "h-6 w-6 text-orange-500" : "h-6 w-6 text-muted-foreground"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {s.currentStreak}-day streak
            {s.activeToday && <span className="ml-1.5 text-[10px] font-medium text-emerald-500">active today</span>}
          </p>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Trophy className="h-3 w-3 text-amber-500" /> Best {s.longestStreak}
          </span>
        </div>
        {next ? (
          <>
            <Progress value={pct} className="mt-2 h-1.5" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {next - s.currentStreak} day{next - s.currentStreak === 1 ? "" : "s"} to your {next}-day milestone
            </p>
          </>
        ) : (
          <p className="mt-1 text-[10px] text-muted-foreground">Legendary streak — keep it alive!</p>
        )}
      </div>
    </Card>
  );
}
