import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useScribe } from "@elevenlabs/react";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { readA11yLocal } from "@/components/A11yClassSync";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live caption overlay.
 * Tries ElevenLabs Realtime Scribe (low-latency, multilingual). If the token
 * fetch fails or the user is not signed in, falls back to the browser's
 * Web Speech API so captions still work.
 */
export function CaptionOverlay({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const a11y = readA11yLocal();
  const [enabled, setEnabled] = useState<boolean>(!!a11y.captions_default);
  const [text, setText] = useState("");
  const [translateTo, setTranslateTo] = useState<string>(i18n.language?.slice(0, 2) || "en");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [usingScribe, setUsingScribe] = useState(false);
  const recRef = useRef<any>(null);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: "vad",
    onPartialTranscript: (d: any) => setText(String(d?.text || "").slice(-180)),
    onCommittedTranscript: (d: any) => setText(String(d?.text || "").slice(-180)),
  });

  // Start/stop ElevenLabs Scribe when toggled
  useEffect(() => {
    let cancel = false;
    if (!enabled) {
      try { scribe.disconnect(); } catch { /* noop */ }
      try { recRef.current?.stop?.(); } catch { /* noop */ }
      recRef.current = null;
      setUsingScribe(false);
      setText("");
      return;
    }
    (async () => {
      // Try ElevenLabs Realtime Scribe first
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("no session");
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`;
        const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`token ${r.status}`);
        const { token: scribeToken } = await r.json();
        if (cancel || !scribeToken) throw new Error("no scribe token");
        await scribe.connect({
          token: scribeToken,
          microphone: { echoCancellation: true, noiseSuppression: true },
        });
        if (!cancel) setUsingScribe(true);
        return;
      } catch {
        /* fall through to Web Speech */
      }
      // Fallback: Web Speech API
      const SR: any = (typeof window !== "undefined") &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
      if (!SR) { setText("Captions not supported on this browser."); return; }
      const r = new SR();
      r.lang = translateTo === "en" ? "en-US" : `${translateTo}-${translateTo.toUpperCase()}`;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e: any) => {
        let s = "";
        for (let i = e.resultIndex; i < e.results.length; i++) s += e.results[i][0].transcript;
        setText(s.trim().slice(-180));
      };
      r.onerror = () => { /* keep trying */ };
      r.onend = () => { if (enabled) try { r.start(); } catch { /* noop */ } };
      try { r.start(); } catch { /* noop */ }
      recRef.current = r;
      setUsingScribe(false);
    })();
    return () => {
      cancel = true;
      try { scribe.disconnect(); } catch { /* noop */ }
      try { recRef.current?.stop?.(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          CC{usingScribe ? "+" : ""}
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
