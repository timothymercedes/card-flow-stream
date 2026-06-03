import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProgression } from "@/hooks/useProgression";
import { progressToNextLevel, openDailyCrate, RARITY_STYLE, type CrateReward } from "@/lib/progression";
import { Trophy, Flame, Zap, CheckCircle2, Lock, Gift, Sparkles, Gem } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/quests")({
  head: () => ({ meta: [
    { title: "Quests & Achievements — PullBid Live" },
    { name: "description", content: "Daily quests, XP progression, and unlockable achievements." },
  ] }),
  component: QuestsPage,
});

type Quest = { slug: string; title: string; description: string; xp_reward: number; target: number; kind: string };
type Progress = { quest_slug: string; progress: number; period_key: string; completed_at: string | null };
type Achievement = { id: string; slug: string; title: string; description: string; xp_reward: number; category: string; is_secret: boolean };

function QuestsPage() {
  const { user } = useAuth();
  const { progression } = useProgression();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: qs } = await supabase.from("daily_quests" as any).select("*").eq("is_active", true).order("sort_order");
      setQuests((qs as any) || []);
      const { data: ach } = await supabase.from("achievements" as any).select("*").order("sort_order");
      setAchievements((ach as any) || []);
      if (user) {
        const today = new Date().toISOString().slice(0, 10);
        const week = (() => { const d = new Date(); const onejan = new Date(d.getFullYear(),0,1); const w = Math.ceil((((d as any) - (onejan as any))/86400000 + onejan.getDay()+1)/7); return `${d.getFullYear()}-W${String(w).padStart(2,"0")}`; })();
        const { data: prog } = await supabase.from("user_quest_progress" as any).select("*").eq("user_id", user.id).in("period_key", [today, week]);
        const map: Record<string, Progress> = {};
        ((prog as any) || []).forEach((p: Progress) => { map[p.quest_slug] = p; });
        setProgress(map);
        const { data: ua } = await supabase.from("user_achievements" as any).select("achievement_id").eq("user_id", user.id);
        setUnlocked(new Set(((ua as any) || []).map((u: any) => u.achievement_id)));
      }
    })();
  }, [user?.id]);

  const lvl = progression ? progressToNextLevel(progression.xp) : null;

  return (
    <AppShell>
      <div className="px-4 py-4 space-y-4">
        {/* Hero — level + XP */}
        {progression && (
          <div className="rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-fuchsia-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Your level</p>
                <p className="text-4xl font-extrabold leading-none">Lv {progression.level}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 flex items-center justify-end gap-1"><Flame className="h-3 w-3" /> Streak</p>
                <p className="text-2xl font-extrabold">{progression.login_streak}d</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
              <div className="h-full bg-white transition-[width] duration-700" style={{ width: `${lvl?.pct ?? 0}%` }} />
            </div>
            <p className="mt-1 text-[11px] font-bold opacity-90 flex items-center gap-1"><Zap className="h-3 w-3" /> {lvl?.current.toLocaleString()} / {lvl?.needed.toLocaleString()} XP — {progression.lifetime_xp.toLocaleString()} lifetime</p>
          </div>
        )}

        {/* Daily quests */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Daily & Weekly Quests</h2>
          <div className="space-y-2">
            {quests.map((q) => {
              const p = progress[q.slug];
              const done = !!p?.completed_at;
              const cur = Math.min(q.target, p?.progress ?? 0);
              const pct = Math.round((cur / q.target) * 100);
              return (
                <div key={q.slug} className={`rounded-2xl border p-3 ${done ? "border-emerald-400/50 bg-emerald-500/10" : "border-border bg-card"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-bold">
                        {done && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {q.title}
                        <span className="rounded-full bg-amber-500/20 px-1.5 text-[9px] font-extrabold uppercase text-amber-700 dark:text-amber-300">{q.kind}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{q.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-1 text-[10px] font-extrabold text-white">+{q.xp_reward} XP</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full transition-[width] duration-500 ${done ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">{cur}/{q.target}</p>
                </div>
              );
            })}
            {quests.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No active quests.</p>}
          </div>
        </section>

        {/* Achievements */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" /> Achievements ({unlocked.size}/{achievements.length})
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {achievements.map((a) => {
              const got = unlocked.has(a.id);
              const hidden = a.is_secret && !got;
              return (
                <div key={a.id} className={`rounded-2xl border p-3 ${got ? "border-amber-400/50 bg-gradient-to-br from-amber-500/10 to-orange-500/10" : "border-border bg-card opacity-70"}`}>
                  <div className="flex items-center justify-between">
                    {got ? <Trophy className="h-5 w-5 text-amber-500" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                    <span className="rounded-full bg-muted px-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{a.category}</span>
                  </div>
                  <p className="mt-1.5 text-xs font-extrabold">{hidden ? "???" : a.title}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{hidden ? "Secret achievement." : a.description}</p>
                  <p className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">+{a.xp_reward} XP</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
