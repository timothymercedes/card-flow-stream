import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { readA11yLocal } from "@/components/A11yClassSync";

/**
 * Live caption overlay — UI shell.
 * Backend wiring (ElevenLabs Scribe Realtime) is intentionally swappable.
 * Right now it uses the browser Web Speech API as a free fallback so the UI
 * is fully usable; switching providers is a one-file change.
 */
export function CaptionOverlay({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const a11y = readA11yLocal();
  const [enabled, setEnabled] = useState<boolean>(!!a11y.captions_default);
  const [text, setText] = useState("");
  const [translateTo, setTranslateTo] = useState<string>(i18n.language?.slice(0, 2) || "en");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (!enabled) {
      try { recRef.current?.stop?.(); } catch { /* noop */ }
      recRef.current = null;
      setText("");
      return;
    }
    const SR: any = (typeof window !== "undefined") &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setText("Captions not supported on this browser.");
      return;
    }
    const r = new SR();
    r.lang = translateTo === "en" ? "en-US" : `${translateTo}-${translateTo.toUpperCase()}`;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let s = "";
      for (let i = e.resultIndex; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(s.trim().slice(-180));
    };
    r.onerror = () => { /* ignore — keeps trying */ };
    r.onend = () => { if (enabled) try { r.start(); } catch { /* noop */ } };
    try { r.start(); } catch { /* noop */ }
    recRef.current = r;
    return () => { try { r.stop(); } catch { /* noop */ } };
  }, [enabled, translateTo]);

  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-16 z-30 flex flex-col items-center gap-2 px-3 ${className}`}>
      {enabled && text && (
        <div className="pointer-events-auto max-w-[90%] rounded-xl bg-black/70 px-3 py-2 text-center text-sm font-semibold text-white backdrop-blur">
          {text || t("captions.listening")}
        </div>
      )}
      <div className="pointer-events-auto flex items-center gap-1.5">
        <button onClick={() => setEnabled(v => !v)} aria-label={enabled ? t("captions.toggle_off") : t("captions.toggle_on")}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur ${enabled ? "bg-primary text-primary-foreground" : "bg-black/60 text-white"}`}>
          {enabled ? <Captions className="h-3.5 w-3.5" /> : <CaptionsOff className="h-3.5 w-3.5" />}
          CC
        </button>
        {enabled && (
          <button onClick={() => setShowLangPicker(v => !v)} aria-label={t("captions.translate_to")}
            className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur">
            <Languages className="h-3.5 w-3.5" /> {translateTo.toUpperCase()}
          </button>
        )}
        {showLangPicker && (
          <div className="absolute bottom-10 right-2 grid grid-cols-2 gap-1 rounded-xl bg-card p-2 shadow-2xl">
            {SUPPORTED_LANGUAGES.map(l => (
              <button key={l.code} onClick={() => { setTranslateTo(l.code); setShowLangPicker(false); }}
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${translateTo === l.code ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <span>{l.flag}</span> {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
