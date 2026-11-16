import { useEffect, useRef } from "react";

/** Short synthesized blips — no audio files, respects a user mute preference. */
function blip(freq: number, ms = 90, vol = 0.08) {
  try {
    if (localStorage.getItem("pb-auction-sounds") === "off") return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = (blip as any).ctx ?? ((blip as any).ctx = new Ctx());
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* audio blocked until first tap — fine */ }
}

/** Last-5-seconds sniping ring + heartbeat ticks, and a ping on every new high bid. */
export function AuctionHype({ live, remainingMs, currentBid }: { live: boolean; remainingMs: number; currentBid: number }) {
  const lastSec = useRef<number | null>(null);
  const lastBid = useRef(currentBid);
  const secs = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (!live || secs > 5 || secs <= 0 || lastSec.current === secs) return;
    lastSec.current = secs;
    blip(secs <= 2 ? 880 : 660, 70);
  }, [live, secs]);
  useEffect(() => {
    if (currentBid > lastBid.current && live) blip(1046, 120, 0.1);
    lastBid.current = currentBid;
  }, [currentBid, live]);
  if (!live || secs > 5 || secs <= 0) return null;
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 animate-pulse ring-[10px] ring-inset ring-live/70" />
      <div key={secs} className="flex h-28 w-28 animate-[ping_1s_ease-out_1] items-center justify-center rounded-full bg-live/85 text-6xl font-black tabular-nums text-live-foreground shadow-2xl">
        {secs}
      </div>
      <span className="sr-only">{secs} seconds left — last chance to bid</span>
    </div>
  );
}
