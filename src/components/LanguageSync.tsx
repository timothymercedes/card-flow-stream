import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

/** Loads the user's preferred_language from their profile and applies it to i18n. */
export function LanguageSync() {
  const { i18n } = useTranslation();
  // Keep <html lang> in sync with the active language for screen readers + SEO.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = i18n.language?.split("-")[0] || "en";
    }
  }, [i18n.language]);
  useEffect(() => {
    let cancel = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancel || !data.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("id", data.user.id)
        .maybeSingle();
      const lang = (prof as any)?.preferred_language;
      if (lang && typeof lang === "string" && lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    });
    return () => { cancel = true; };
  }, [i18n]);
  return null;
}
