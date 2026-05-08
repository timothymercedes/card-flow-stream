import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TutorialPlayer, type Tutorial } from "./TutorialPlayer";

/**
 * Small contextual "Watch how" button. Looks up a tutorial by title (exact)
 * and opens the player modal. Renders nothing if the tutorial isn't found.
 */
export function TutorialHint({
  title,
  label = "Watch how",
  className = "",
}: {
  title: string;
  label?: string;
  className?: string;
}) {
  const [active, setActive] = useState<Tutorial | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    const { data } = await supabase
      .from("tutorials")
      .select("id,title,description,video_url,captions_url,duration_seconds")
      .eq("title", title)
      .eq("is_published", true)
      .maybeSingle();
    setLoading(false);
    if (data) setActive(data as Tutorial);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/20 disabled:opacity-50 ${className}`}
      >
        <PlayCircle className="h-3.5 w-3.5" />
        {label}
      </button>
      {active && <TutorialPlayer tutorial={active} onClose={() => setActive(null)} />}
    </>
  );
}
