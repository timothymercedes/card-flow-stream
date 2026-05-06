import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, X } from "lucide-react";
import type { RemoteCohost } from "@/hooks/useCloudflareCalls";

/**
 * Floating multi-guest stage. Renders the local preview + every remote co-host.
 * Up to 4 tiles, auto-grids by count.
 */
export function CoHostStage({
  localStream, localUsername, remotes, audioOn, videoOn,
  onToggleAudio, onToggleVideo, onLeave,
}: {
  localStream: MediaStream | null;
  localUsername: string;
  remotes: RemoteCohost[];
  audioOn: boolean;
  videoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
}) {
  const total = (localStream ? 1 : 0) + remotes.length;
  if (total === 0) return null;

  const cols = total <= 1 ? 1 : 2;
  return (
    <div className="pointer-events-none absolute inset-x-2 top-16 z-30 flex justify-center sm:top-20">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-black/60 p-2 backdrop-blur-md ring-1 ring-white/10">
        <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {localStream && (
            <Tile stream={localStream} label={`@${localUsername} (you)`} muted videoOn={videoOn} audioOn={audioOn} />
          )}
          {remotes.map((r) => (
            <Tile key={r.userId} stream={r.stream} label={`@${r.username}`} muted={false} videoOn={r.videoEnabled} audioOn={r.audioEnabled} />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <button onClick={onToggleAudio} className={`rounded-full p-2 ${audioOn ? "bg-white/10" : "bg-destructive/80"}`} title={audioOn ? "Mute" : "Unmute"}>
            {audioOn ? <Mic className="h-4 w-4 text-white" /> : <MicOff className="h-4 w-4 text-white" />}
          </button>
          <button onClick={onToggleVideo} className={`rounded-full p-2 ${videoOn ? "bg-white/10" : "bg-destructive/80"}`} title={videoOn ? "Camera off" : "Camera on"}>
            {videoOn ? <Video className="h-4 w-4 text-white" /> : <VideoOff className="h-4 w-4 text-white" />}
          </button>
          <button onClick={onLeave} className="rounded-full bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground" title="Leave call">
            <X className="inline h-3 w-3" /> Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ stream, label, muted, videoOn, audioOn }: { stream: MediaStream; label: string; muted: boolean; videoOn: boolean; audioOn: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${videoOn ? "" : "hidden"}`} />
      {!videoOn && (
        <div className="flex h-full w-full items-center justify-center text-white/60 text-xs">Camera off</div>
      )}
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
        <span className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
        {!audioOn && <MicOff className="h-3 w-3 rounded bg-black/60 p-0.5 text-white" />}
      </div>
    </div>
  );
}
