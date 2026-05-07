import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type A11ySettings = {
  large_text?: boolean;
  high_contrast?: boolean;
  reduced_motion?: boolean;
  captions_default?: boolean;
};

const STORAGE_KEY = "pbl_a11y";

export function applyA11yToDocument(s: A11ySettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("a11y-large-text", !!s.large_text);
  root.classList.toggle("a11y-high-contrast", !!s.high_contrast);
  root.classList.toggle("a11y-reduced-motion", !!s.reduced_motion);
}

export function readA11yLocal(): A11ySettings {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

export function writeA11yLocal(s: A11ySettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  applyA11yToDocument(s);
}

/** Applies cached a11y prefs immediately, then refreshes from profile. */
export function A11yClassSync() {
  useEffect(() => {
    applyA11yToDocument(readA11yLocal());
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("profiles").select("a11y_settings").eq("id", data.user.id).maybeSingle();
      const s = ((prof as any)?.a11y_settings || {}) as A11ySettings;
      writeA11yLocal(s);
    });
  }, []);
  return null;
}
