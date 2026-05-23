import { useEffect, useRef, useState } from "react";

export type VoiceCommand = {
  /** keyword(s) to match (lowercase, simple substring). Provide aliases via `|`. */
  phrase: string;
  /** action to fire when phrase is heard */
  action: () => void | Promise<void>;
  /** Cooldown ms before this command can re-fire. Default 1500ms. */
  cooldownMs?: number;
};

export type VoiceCommandOpts = {
  enabled: boolean;
  commands: VoiceCommand[];
  /** Custom wake-word filter — if set, only matches inside utterances containing this. */
  wakeWord?: string;
  lang?: string;
};

function normalizeVoiceText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAlias(transcript: string, alias: string) {
  if (!alias) return false;
  if (transcript.includes(alias)) return true;
  const words = alias.split(" ").filter((word) => word.length > 1);
  return words.length >= 2 && words.every((word) => transcript.includes(word));
}

/**
 * Hybrid voice-command hook.
 * - Uses the browser's Web Speech API (SpeechRecognition) for ~200ms local keyword spotting.
 *   Works in Chrome/Edge/Android Chrome (covers most host setups).
 * - On Safari/iOS where Web Speech API is unavailable, returns `supported = false` so the host
 *   can fall back to manual buttons. (Cloud STT fallback is a future addition.)
 *
 * The hook is intentionally lightweight — no audio is streamed to a server, so there's
 * minimal CPU and zero stream lag.
 */
export function useVoiceCommands({ enabled, commands, wakeWord, lang = "en-US" }: VoiceCommandOpts) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [lastHeard, setLastHeard] = useState<string>("");
  const recRef = useRef<any>(null);
  const lastFiredRef = useRef<Record<string, number>>({});
  const recentTranscriptRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  // keep latest commands in a ref so we don't recreate the SR session on every render
  const commandsRef = useRef(commands);
  useEffect(() => { commandsRef.current = commands; }, [commands]);

  useEffect(() => {
    if (!enabled) return;
    const SR: any = (typeof window !== "undefined") && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) { setSupported(false); return; }
    setSupported(true);

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true; // faster trigger latency (~200-400ms vs ~1s for finals only)
    rec.lang = lang;

    rec.onresult = (ev: any) => {
      const fresh = Array.from(ev.results)
        .slice(ev.resultIndex)
        .map((result: any) => String(result?.[0]?.transcript || ""))
        .join(" ");
      const t = normalizeVoiceText(fresh);
      if (!t) return;
      const now = Date.now();
      const previous = now - recentTranscriptRef.current.at < 1800 ? recentTranscriptRef.current.text : "";
      const rolling = normalizeVoiceText(`${previous} ${t}`.split(" ").slice(-16).join(" "));
      recentTranscriptRef.current = { text: rolling, at: now };
      setLastHeard(rolling);
      if (wakeWord && !rolling.includes(normalizeVoiceText(wakeWord))) return;
        for (const cmd of commandsRef.current) {
          const aliases = cmd.phrase.split("|").map(normalizeVoiceText).filter(Boolean);
          const hit = aliases.some((p) => matchesAlias(rolling, p));
          if (!hit) continue;
          const cd = cmd.cooldownMs ?? 1500;
          const last = lastFiredRef.current[cmd.phrase] || 0;
          if (now - last < cd) continue;
          lastFiredRef.current[cmd.phrase] = now;
          try { Promise.resolve(cmd.action()).catch(() => {}); } catch {/* swallow */}
          break; // one command per utterance
        }
    };
    rec.onerror = () => { /* will auto-restart via onend */ };
    rec.onend = () => {
      // Browsers stop SR after periods of silence — restart while host is live.
      try { rec.start(); } catch {/* race */}
    };

    try { rec.start(); setListening(true); } catch {/* already started */}
    recRef.current = rec;
    return () => {
      setListening(false);
      try { rec.onend = null; rec.stop(); } catch {}
      recRef.current = null;
    };
  }, [enabled, lang, wakeWord]);

  return { listening, supported, lastHeard };
}
