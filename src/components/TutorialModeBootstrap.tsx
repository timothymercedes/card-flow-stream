import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  enableTutorialMode,
  disableTutorialMode,
  isTutorialMode,
  tutorialModeBuildAllowed,
} from "@/lib/tutorialMode";

/**
 * Reads ?tour=1 from URL and validates whether tutorial mode may activate.
 * Mounts a persistent banner whenever it's on. Renders nothing otherwise.
 */
export function TutorialModeBootstrap() {
  const { user } = useAuth();
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = new URL(window.location.href);
      const tour = url.searchParams.get("tour");

      if (tour === "0") {
        disableTutorialMode();
        url.searchParams.delete("tour");
        window.history.replaceState({}, "", url.toString());
        if (!cancelled) setActive(false);
        window.dispatchEvent(new Event("pbl-tour-change"));
        return;
      }

      if (tour === "1") {
        if (tutorialModeBuildAllowed()) {
          enableTutorialMode(false);
        } else if (user) {
          // Prod: only admins may activate.
          const { data } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .in("role", ["admin", "owner"])
            .maybeSingle();
          if (data) enableTutorialMode(true);
        }
        url.searchParams.delete("tour");
        window.history.replaceState({}, "", url.toString());
        window.dispatchEvent(new Event("pbl-tour-change"));
      }

      if (!cancelled) setActive(isTutorialMode());
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!active) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[300] flex items-center justify-center gap-3 bg-amber-500 px-3 py-1 text-[11px] font-bold text-black shadow">
      <span>● TUTORIAL MODE — demo data, gates bypassed (internal only)</span>
      <button
        onClick={() => {
          disableTutorialMode();
          window.dispatchEvent(new Event("pbl-tour-change"));
          setActive(false);
        }}
        className="rounded bg-black/20 px-2 py-0.5 text-[10px] hover:bg-black/30"
      >
        Exit
      </button>
    </div>
  );
}
