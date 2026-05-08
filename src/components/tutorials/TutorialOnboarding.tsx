import { useEffect, useState } from "react";
import { CheckCircle2, PlayCircle, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TutorialPlayer, type Tutorial } from "./TutorialPlayer";

type Row = Tutorial & { thumbnail_url: string | null; audience: string };

/**
 * Auto-plays a short curated playlist for new users:
 * Welcome → role-specific (buyer/seller/host) → Safety.
 * Used as the final step of /onboarding and as a one-time prompt.
 */
export function TutorialOnboarding({
  role = "buyer",
  onDone,
}: {
  role?: "buyer" | "seller" | "host";
  onDone: () => void;
}) {
  const [items, setItems] = useState<Row[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Tutorial | null>(null);

  useEffect(() => {
    (async () => {
      const audiences = ["general", role];
      const { data } = await supabase
        .from("tutorials")
        .select("id,title,description,video_url,captions_url,thumbnail_url,duration_seconds,audience,order_index")
        .in("audience", audiences)
        .eq("is_published", true)
        .order("audience")
        .order("order_index");
      setItems(((data as any[]) || []).slice(0, 5));

      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: prog } = await supabase
          .from("tutorial_progress")
          .select("tutorial_id, completed_at")
          .eq("user_id", u.user.id);
        setCompleted(new Set(((prog as any[]) || []).filter(p => p.completed_at).map(p => p.tutorial_id)));
      }
    })();
  }, [role]);

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-xl font-bold">Quick start videos</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Get up to speed in under 5 minutes — tap to watch, skip anytime.
        </p>
      </div>

      <div className="space-y-2">
        {items.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left hover:bg-muted"
          >
            <div className="relative h-14 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-black">
              {t.thumbnail_url ? (
                <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <PlayCircle className="h-5 w-5 text-white/70" />
                </div>
              )}
              {completed.has(t.id) && (
                <CheckCircle2 className="absolute right-0.5 top-0.5 h-4 w-4 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{t.title}</p>
              {t.duration_seconds ? (
                <p className="text-[10px] text-muted-foreground">{t.duration_seconds}s</p>
              ) : null}
            </div>
            <PlayCircle className="h-5 w-5 text-primary" />
          </button>
        ))}
        {items.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">Loading videos…</p>
        )}
      </div>

      <button
        onClick={onDone}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-muted-foreground"
      >
        <SkipForward className="h-3.5 w-3.5" /> I'll watch later
      </button>

      {active && <TutorialPlayer tutorial={active} onClose={() => setActive(null)} />}
    </div>
  );
}
