import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TutorialPlayer, type Tutorial } from "./tutorials/TutorialPlayer";

/**
 * "Watch Tutorial" button — fetches the tutorial(s) for a given route_path
 * (or by tutorial id) and opens the first match in the player.
 */
export function WatchTutorial({
  routePath,
  tutorialId,
  label = "Watch Tutorial",
  className = "",
  variant = "chip",
}: {
  routePath?: string;
  tutorialId?: string;
  label?: string;
  className?: string;
  variant?: "chip" | "block";
}) {
  const [tut, setTut] = useState<Tutorial | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      let q = supabase.from("tutorials").select("*").eq("is_published", true);
      if (tutorialId) q = q.eq("id", tutorialId);
      else if (routePath) q = q.eq("route_path", routePath);
      else return;
      const { data } = await q.order("order_index").limit(1).maybeSingle();
      if (!cancel) setTut(data as Tutorial | null);
    })();
    return () => { cancel = true; };
  }, [routePath, tutorialId]);

  if (!tut) return null;

  const base = "inline-flex items-center gap-1.5 font-bold transition";
  const styles = variant === "chip"
    ? "rounded-full bg-primary/15 px-3 py-1.5 text-[11px] text-primary hover:bg-primary/25"
    : "w-full justify-center rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground hover:opacity-90";

  return (
    <>
      <button
        type="button"
        onClick={() => { setLoading(true); setOpen(true); setTimeout(() => setLoading(false), 50); }}
        className={`${base} ${styles} ${className}`}
      >
        <GraduationCap className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && !loading && <TutorialPlayer tutorial={tut} onClose={() => setOpen(false)} />}
    </>
  );
}
