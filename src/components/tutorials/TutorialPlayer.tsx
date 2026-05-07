import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type Tutorial = {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  captions_url: string | null;
  duration_seconds: number | null;
};

export function TutorialPlayer({ tutorial, onClose }: { tutorial: Tutorial; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [me, setMe] = useState<string | null>(null);
  const lastSavedRef = useRef(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // Load saved position
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur" onClick={onClose}>
      <div className="relative w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
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
          <h3 className="text-sm font-bold">{tutorial.title}</h3>
          {tutorial.description && <p className="mt-1 text-xs text-muted-foreground">{tutorial.description}</p>}
        </div>
      </div>
    </div>
  );
}
