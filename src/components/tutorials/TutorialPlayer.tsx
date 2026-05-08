import { useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type TutorialStep = { title: string; body: string };
export type Tutorial = {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  captions_url: string | null;
  duration_seconds: number | null;
  steps?: TutorialStep[] | null;
  route_path?: string | null;
};

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve(); return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function TutorialPlayer({ tutorial, onClose }: { tutorial: Tutorial; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [me, setMe] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);
  const lastSavedRef = useRef(0);
  const steps = (tutorial.steps as TutorialStep[] | null) || [];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    return () => { try { window.speechSynthesis?.cancel(); } catch {} };
  }, []);

  useEffect(() => {
    if (!me) return;
    supabase.from("tutorial_progress")
      .select("watched_seconds")
      .eq("user_id", me).eq("tutorial_id", tutorial.id).maybeSingle()
      .then(({ data }) => {
        const v = videoRef.current;
        if (v && data && (data as any).watched_seconds > 5) {
          v.currentTime = (data as any).watched_seconds;
        }
      });
  }, [me, tutorial.id]);

  async function saveProgress(seconds: number, completed = false) {
    if (!me) return;
    if (!completed && Math.abs(seconds - lastSavedRef.current) < 5) return;
    lastSavedRef.current = seconds;
    await supabase.from("tutorial_progress").upsert({
      user_id: me,
      tutorial_id: tutorial.id,
      watched_seconds: Math.floor(seconds),
      completed_at: completed ? new Date().toISOString() : null,
    }, { onConflict: "user_id,tutorial_id" });
  }

  async function narrateAll() {
    if (narrating) {
      window.speechSynthesis?.cancel();
      setNarrating(false);
      return;
    }
    setNarrating(true);
    try {
      await speak(tutorial.title);
      for (const s of steps) {
        await speak(`${s.title}. ${s.body}`);
      }
    } finally {
      setNarrating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur" onClick={onClose}>
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-card sm:max-w-md sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1.5 text-white">
          <X className="h-4 w-4" />
        </button>
        <video
          ref={videoRef}
          src={tutorial.video_url}
          controls
          autoPlay
          playsInline
          className="aspect-[9/16] w-full bg-black object-contain"
          onTimeUpdate={(e) => saveProgress((e.target as HTMLVideoElement).currentTime)}
          onEnded={(e) => saveProgress((e.target as HTMLVideoElement).currentTime, true)}
        >
          {tutorial.captions_url && (
            <track kind="captions" src={tutorial.captions_url} default srcLang="en" label="English" />
          )}
        </video>
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold">{tutorial.title}</h3>
              {tutorial.description && <p className="mt-1 text-xs text-muted-foreground">{tutorial.description}</p>}
            </div>
            {steps.length > 0 && (
              <button
                onClick={narrateAll}
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary"
              >
                {narrating ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {narrating ? "Stop" : "Listen"}
              </button>
            )}
          </div>

          {steps.length > 0 && (
            <ol className="mt-3 space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="rounded-xl bg-muted/50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <p className="text-xs font-bold">{s.title}</p>
                  </div>
                  <p className="mt-1 pl-7 text-[11px] text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
