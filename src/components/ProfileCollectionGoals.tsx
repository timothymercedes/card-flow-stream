import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getCollectionDashboard } from "@/lib/collection.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Star, Trophy } from "lucide-react";

// Shows the signed-in collector's favorited sets + live completion progress.
export function ProfileCollectionGoals() {
  const getDash = useServerFn(getCollectionDashboard);
  const q = useQuery({ queryKey: ["collection-dashboard"], queryFn: () => getDash() });
  const dash = q.data;
  if (!dash || (dash.goals.length === 0 && dash.stats.setsCompleted === 0)) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Star className="h-4 w-4 text-amber-500" /> Collection Goals</p>
        <Link to="/collection" className="text-xs text-primary">View all</Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        <Badge className="gap-1 bg-amber-500/15 text-amber-600"><Trophy className="h-3 w-3" /> {dash.stats.setsCompleted} sets done</Badge>
        <Badge variant="outline">{dash.stats.setsInProgress} in progress</Badge>
      </div>
      {dash.goals.length === 0 ? (
        <p className="text-xs text-muted-foreground">Star a set on your Collection Books to track it here.</p>
      ) : (
        <div className="space-y-2">
          {dash.goals.map((g) => (
            <Link key={g.category + g.setName} to="/collection" className="block">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{g.setName}</p>
                {g.complete ? <Badge className="bg-amber-500/15 text-amber-600 text-[10px]">Complete</Badge> : <span className="text-xs font-bold text-primary">{g.completion}%</span>}
              </div>
              <Progress value={g.completion} className="mt-1 h-1.5" />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
