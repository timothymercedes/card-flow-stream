import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Zap, Users, Radio } from "lucide-react";
import type { KODestination } from "./KOModal";

const ALERT_MS = 3000;
const AUTOPICK_MS = 5000;

type DestWithMeta = KODestination & { title?: string | null; category?: string | null; viewers?: number };

export function KOViewerOverlay({
  active,
  hostUsername,
  hostAvatar,
  message,
  destinations,
  isHost,
}: {
  active: boolean;
  hostUsername: string;
  hostAvatar: string | null;
  message: string | null;
  destinations: DestWithMeta[];
  isHost: boolean;
}) {
  const nav = useNavigate();
  const [phase, setPhase] = useState<"alert" | "pick" | "done">("alert");
  const [countdown, setCountdown] = useState(Math.ceil(AUTOPICK_MS / 1000));

  useEffect(() => {
    if (!active) { setPhase("alert"); return; }
    setPhase("alert");
    const t = setTimeout(() => {
      if (isHost) { setPhase("done"); return; }
      if (destinations.length <= 1) {
        const d = destinations[0];
        if (d) nav({ to: "/live/$id", params: { id: d.stream_id } });
        setPhase("done");
      } else {
        setPhase("pick");
      }
    }, ALERT_MS);
    return () => clearTimeout(t);
  }, [active, isHost, destinations.length]);

  // 5-second autopick to featured (first) host when 2-3 destinations
  useEffect(() => {
    if (phase !== "pick" || destinations.length < 2) return;
    setCountdown(Math.ceil(AUTOPICK_MS / 1000));
    const start = Date.now();
    const i = setInterval(() => {
      const left = Math.max(0, AUTOPICK_MS - (Date.now() - start));
      setCountdown(Math.ceil(left / 1000));
    }, 200);
    const t = setTimeout(() => {
      const d = destinations[0];
      if (d) nav({ to: "/live/$id", params: { id: d.stream_id } });
    }, AUTOPICK_MS);
    return () => { clearInterval(i); clearTimeout(t); };
  }, [phase, destinations.length]);

  if (!active || phase === "done") return null;

  return (
    <div className="absolute inset-0 z-[55] flex flex-col items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-500">
      {phase === "alert" && (
        <div className="flex flex-col items-center px-6 text-center animate-in zoom-in-50 fade-in duration-700">
          <div className="relative mb-4">
            <div className="absolute inset-0 animate-ping rounded-full bg-purple-500/30" />
            <div className="relative h-24 w-24 overflow-hidden rounded-full bg-gradient-to-br from-purple-500 to-blue-500 p-1 shadow-[0_0_60px_rgba(168,85,247,0.7)]">
              <div className="h-full w-full overflow-hidden rounded-full bg-black">
                {hostAvatar ? <img src={hostAvatar} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-white">{hostUsername[0]?.toUpperCase()}</div>}
              </div>
            </div>
            <div className="absolute -right-2 -top-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 p-1.5 shadow-[0_0_20px_rgba(168,85,247,0.8)]">
              <Zap className="h-4 w-4 text-white" />
            </div>
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-purple-300">K.O.</p>
          <p className="mb-2 text-2xl font-extrabold text-white">@{hostUsername}</p>
          {message && <p className="max-w-xs text-sm text-zinc-200">"{message}"</p>}
          {!isHost && destinations.length > 0 && (
            <p className="mt-4 text-[11px] text-zinc-400">Sending you to {destinations.length === 1 ? "the next show" : "pick your next show"}…</p>
          )}
          {isHost && (
            <p className="mt-4 text-[11px] text-zinc-400">Transferring viewers…</p>
          )}
        </div>
      )}

      {phase === "pick" && !isHost && (
        <div className="w-full max-w-md px-4 animate-in fade-in duration-300">
          <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-purple-300">Pick your next show</p>
          <p className="mb-4 text-center text-[11px] text-zinc-400">Auto-redirecting in {countdown}s…</p>

          {destinations.length === 2 && (
            <div className="grid grid-cols-2 gap-2">
              {destinations.map((d) => <DestCard key={d.stream_id} d={d} onPick={() => nav({ to: "/live/$id", params: { id: d.stream_id } })} />)}
            </div>
          )}
          {destinations.length >= 3 && (
            <div className="space-y-2">
              <DestCard d={destinations[0]} featured onPick={() => nav({ to: "/live/$id", params: { id: destinations[0].stream_id } })} />
              <div className="grid grid-cols-2 gap-2">
                {destinations.slice(1, 3).map((d) => <DestCard key={d.stream_id} d={d} onPick={() => nav({ to: "/live/$id", params: { id: d.stream_id } })} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DestCard({ d, onPick, featured }: { d: DestWithMeta; onPick: () => void; featured?: boolean }) {
  return (
    <button onClick={onPick}
      className={`group relative w-full overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-zinc-900 to-black p-3 text-left shadow-[0_0_30px_-10px_rgba(168,85,247,0.4)] transition-transform hover:scale-[1.02] active:scale-[0.98] ${featured ? "" : ""}`}>
      <div className="flex items-center gap-2">
        <div className={`overflow-hidden rounded-full bg-zinc-800 ${featured ? "h-14 w-14" : "h-10 w-10"}`}>
          {d.avatar_url ? <img src={d.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center font-bold text-zinc-400">{d.username[0]?.toUpperCase()}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-extrabold text-white ${featured ? "text-base" : "text-xs"}`}>@{d.username}</p>
          {d.title && <p className="truncate text-[10px] text-zinc-400">{d.title}</p>}
          <div className="mt-1 flex items-center gap-1.5">
            <span className="flex items-center gap-0.5 rounded-full bg-red-500/20 px-1.5 py-0 text-[8px] font-bold text-red-400"><Radio className="h-2 w-2" />LIVE</span>
            {typeof d.viewers === "number" && <span className="flex items-center gap-0.5 text-[10px] text-zinc-400"><Users className="h-2.5 w-2.5" />{d.viewers}</span>}
          </div>
        </div>
      </div>
      {featured && <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-purple-300">⭐ Featured</p>}
    </button>
  );
}
