import { useEffect, useState } from "react";

/**
 * Hook that returns true when the user prefers reduced motion.
 * Reuses the existing `.a11y-reduced-motion` class from A11yClassSync
 * AND the OS-level `prefers-reduced-motion` media query — single source
 * of truth so we don't ship a duplicate animation toggle system.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (document.documentElement.classList.contains("a11y-reduced-motion")) return true;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const recompute = () => {
      const cls = document.documentElement.classList.contains("a11y-reduced-motion");
      setReduced(cls || !!mq?.matches);
    };
    recompute();
    mq?.addEventListener?.("change", recompute);
    const obs = new MutationObserver(recompute);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq?.removeEventListener?.("change", recompute);
      obs.disconnect();
    };
  }, []);

  return reduced;
}

/** Light haptic feedback if supported AND not in reduced motion mode. */
export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (typeof document !== "undefined" && document.documentElement.classList.contains("a11y-reduced-motion")) return;
  try { navigator.vibrate(pattern); } catch {}
}
