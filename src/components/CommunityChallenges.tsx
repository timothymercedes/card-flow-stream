// Community Collection Challenges — shared set-completion goals for a community.
// Members contribute the distinct cards they own from the target set; aggregate
// progress drives the community toward the target.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Target, Plus, Users, Trophy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  getCommunityChallenges,
  createCommunityChallenge,
  contributeToChallenge,
  leaveChallenge,
} from "@/lib/challenges.functions";

export function CommunityChallenges({
  communityId,
  canParticipate,
}: {
  communityId: string;
  canParticipate: boolean;
}) {
  const qc = useQueryClient();
  const list = useServerFn(getCommunityChallenges);
  const create = useServerFn(createCommunityChallenge);
  const contribute = useServerFn(contributeToChallenge);
  const leave = useServerFn(leaveChallenge);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", setName: "", description: "", target: 100 });

  const challengesQ = useQuery({
    queryKey: ["community-challenges", communityId],
    queryFn: () => list({ data: { communityId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["community-challenges", communityId] });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          communityId,
          title: form.title.trim(),
          setName: form.setName.trim() || undefined,
          description: form.description.trim() || undefined,
          targetCount: Number(form.target) || 100,
        },
      }),
    onSuccess: () => {
      setShowForm(false);
      setForm({ title: "", setName: "", description: "", target: 100 });
      invalidate();
      toast.success("Challenge created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const contribMut = useMutation({
    mutationFn: (id: string) => contribute({ data: { challengeId: id } }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`You contributed ${r.contribution} card${r.contribution === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leaveMut = useMutation({
    mutationFn: (id: string) => leave({ data: { challengeId: id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const challenges = challengesQ.data ?? [];

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Collection Challenges
        </p>
        {canParticipate && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowForm((s) => !s)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New
          </Button>
        )}
      </div>

      {showForm && (
        <div className="space-y-2 rounded-lg border p-3">
          <Input
            placeholder="Challenge title (e.g. Complete Team Rocket together)"
            value={form.title}
            maxLength={120}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Input
            placeholder="Target set name (e.g. Team Rocket)"
            value={form.setName}
            maxLength={120}
            onChange={(e) => setForm((f) => ({ ...f, setName: e.target.value }))}
          />
          <Textarea
            placeholder="Description (optional)"
            rows={2}
            maxLength={500}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Target cards</label>
            <Input
              type="number"
              min={1}
              className="h-8 w-24"
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: Number(e.target.value) }))}
            />
            <Button
              size="sm"
              className="ml-auto"
              disabled={form.title.trim().length < 3 || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Create
            </Button>
          </div>
        </div>
      )}

      {challengesQ.isLoading && <p className="py-3 text-center text-xs text-muted-foreground">Loading challenges…</p>}

      {!challengesQ.isLoading && challenges.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          No challenges yet. {canParticipate ? "Start one and complete a set together!" : "Join to start one."}
        </p>
      )}

      <div className="space-y-2">
        {challenges.map((c) => (
          <div key={c.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.title}</p>
                {c.setName && <p className="text-[11px] text-muted-foreground">Set: {c.setName}</p>}
              </div>
              {c.complete ? (
                <Badge className="gap-1 bg-amber-500/15 text-[10px] text-amber-600">
                  <Trophy className="h-3 w-3" /> Done
                </Badge>
              ) : (
                <span className="text-xs font-bold text-primary">{c.percent}%</span>
              )}
            </div>
            {c.description && <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>}
            <Progress value={c.percent} className="mt-2 h-1.5" />
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{c.progress}/{c.targetCount} cards</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.contributors} contributing</span>
            </div>
            {canParticipate && (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 flex-1"
                  variant={c.hasJoined ? "secondary" : "default"}
                  disabled={contribMut.isPending}
                  onClick={() => contribMut.mutate(c.id)}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {c.hasJoined ? `Update (${c.myContribution})` : "Contribute my cards"}
                </Button>
                {c.hasJoined && (
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => leaveMut.mutate(c.id)}>
                    Leave
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
