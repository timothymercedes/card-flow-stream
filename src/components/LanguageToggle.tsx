import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { Languages } from "lucide-react";
import { useState } from "react";

/** Compact EN/ES toggle for the app header. Persists to profile when signed in. */
export function LanguageToggle() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = (i18n.language || "en").slice(0, 2);

  async function pick(code: string) {
    setOpen(false);
    if (code === current) return;
    await i18n.changeLanguage(code);
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase.from("profiles").update({ preferred_language: code }).eq("id", data.user.id);
      }
    } catch {
      /* ignore — local change still applies */
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1 rounded-full bg-muted px-2 text-[11px] font-bold uppercase"
      >
        <Languages className="h-3.5 w-3.5" />
        {current.toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                role="menuitemradio"
                aria-checked={current === l.code}
                onClick={() => pick(l.code)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs ${
                  current === l.code ? "bg-primary/15 text-foreground" : "hover:bg-muted"
                }`}
              >
                <span className="text-base">{l.flag}</span>
                <span className="font-semibold">{l.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
