/**
 * Sound-effects scaffold.
 *
 * Drop MP3/WAV files into `public/sounds/` and they'll be picked up automatically:
 *   public/sounds/bid.mp3
 *   public/sounds/sold.mp3
 *   public/sounds/promote.mp3
 *   public/sounds/shoutout.mp3
 *   public/sounds/join.mp3
 *
 * Until those files exist, calls to `playSfx()` are silent no-ops (the Audio
 * element 404s and we swallow the error). A user-controlled mute is persisted
 * in localStorage under `pbl:sfx-muted`.
 */

export type SfxName = "bid" | "sold" | "promote" | "shoutout" | "join";

const MUTE_KEY = "pbl:sfx-muted";
const cache = new Map<SfxName, HTMLAudioElement>();
const missing = new Set<SfxName>();

function isMutedSync(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isSfxMuted(): boolean {
  return isMutedSync();
}

export function setSfxMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    window.dispatchEvent(new CustomEvent("pbl:sfx-mute", { detail: muted }));
  } catch {}
}

export function playSfx(name: SfxName, volume = 0.6) {
  if (typeof window === "undefined") return;
  if (isMutedSync()) return;
  if (missing.has(name)) return;
  let el = cache.get(name);
  if (!el) {
    el = new Audio(`/sounds/${name}.mp3`);
    el.preload = "auto";
    el.addEventListener("error", () => {
      // File doesn't exist yet — remember and stay silent.
      missing.add(name);
    });
    cache.set(name, el);
  }
  try {
    el.volume = Math.max(0, Math.min(1, volume));
    el.currentTime = 0;
    el.play().catch(() => { /* autoplay blocked or 404 — silent */ });
  } catch { /* noop */ }
}
