import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, X, UserX, Move } from "lucide-react";
import type { RemoteCohost } from "@/hooks/useCloudflareCalls";

/**
 * Floating multi-guest stage. Renders the local preview + every remote co-host.
 * Up to 4 tiles, auto-grids by count. Host can drag to move and resize.
 */
export function CoHostStage({
  localStream, localUsername, remotes, audioOn, videoOn,
  onToggleAudio, onToggleVideo, onLeave, readOnly = false,
  onKickRemote,
}: {
  localStream: MediaStream | null;
  localUsername: string;
  remotes: RemoteCohost[];
  audioOn: boolean;
  videoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  /** Hide mute/cam/leave controls (used for read-only viewer overlay). */
  readOnly?: boolean;
  /** When provided (host only), shows a kick button on each remote tile and enables drag/resize. */
  onKickRemote?: (userId: string, username: string) => void;
}) {
  const total = (localStream ? 1 : 0) + remotes.length;
  const isHost = !!onKickRemote;

  // Persisted position + size for host
  const STORAGE_KEY = "cohost-stage-rect";
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });

  useEffect(() => {
    if (rect && typeof window !== "undefined") {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rect)); } catch {}
    }
  }, [rect]);

  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent, mode: "move" | "resize") => {
    if (!isHost) return;
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest("[data-stage-root]") as HTMLElement | null;
    const bounds = el?.getBoundingClientRect();
    const init = rect ?? (bounds ? { x: bounds.left, y: bounds.top, w: bounds.width, h: bounds.height } : { x: 16, y: 80, w: 360, h: 220 });
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: init };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [isHost, rect]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "move") {
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 80;
      setRect({
        x: Math.max(0, Math.min(maxX, d.orig.x + dx)),
        y: Math.max(0, Math.min(maxY, d.orig.y + dy)),
        w: d.orig.w,
        h: d.orig.h,
      });
    } else {
      setRect({
        x: d.orig.x,
        y: d.orig.y,
        w: Math.max(200, Math.min(window.innerWidth - d.orig.x, d.orig.w + dx)),
        h: Math.max(140, Math.min(window.innerHeight - d.orig.y, d.orig.h + dy)),
      });
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
    }
  }, []);

  if (total === 0) return null;

  const cols = total <= 1 ? 1 : 2;

  // Host with custom rect: free-floating
  if (isHost && rect) {
    return (
      <div
        data-stage-root
        className="pointer-events-auto absolute z-30 rounded-2xl bg-black/60 p-2 backdrop-blur-md ring-1 ring-white/10"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      >
        <DragHandle onPointerDown={(e) => onPointerDown(e, "move")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        <StageContent
          localStream={localStream} localUsername={localUsername} remotes={remotes}
          audioOn={audioOn} videoOn={videoOn} onToggleAudio={onToggleAudio} onToggleVideo={onToggleVideo}
          onLeave={onLeave} readOnly={readOnly} onKickRemote={onKickRemote} cols={cols}
          fillHeight
        />
        <ResizeHandle onPointerDown={(e) => onPointerDown(e, "resize")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        <button
          onClick={() => { setRect(null); try { localStorage.removeItem(STORAGE_KEY); } catch {} }}
          className="absolute -top-2 -left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-black shadow ring-1 ring-black/10"
          title="Reset position"
        >Reset</button>
      </div>
    );
  }

  return (
    <div data-stage-root className="pointer-events-none absolute inset-x-2 top-16 z-30 flex justify-center sm:top-20">
      <div className="pointer-events-auto relative w-full max-w-md rounded-2xl bg-black/60 p-2 backdrop-blur-md ring-1 ring-white/10">
        {isHost && <DragHandle onPointerDown={(e) => onPointerDown(e, "move")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />}
        <StageContent
          localStream={localStream} localUsername={localUsername} remotes={remotes}
          audioOn={audioOn} videoOn={videoOn} onToggleAudio={onToggleAudio} onToggleVideo={onToggleVideo}
          onLeave={onLeave} readOnly={readOnly} onKickRemote={onKickRemote} cols={cols}
        />
      </div>
    </div>
  );
}

function DragHandle({ onPointerDown, onPointerMove, onPointerUp }: { onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void }) {
  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute -top-2 -right-2 z-10 cursor-move rounded-full bg-white/90 p-1 shadow ring-1 ring-black/10 touch-none"
      title="Drag to move"
      aria-label="Drag to move"
    >
      <Move className="h-3 w-3 text-black" />
    </button>
  );
}

function ResizeHandle({ onPointerDown, onPointerMove, onPointerUp }: { onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize touch-none"
      title="Drag to resize"
      style={{
        background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.9) 50%)",
        borderBottomRightRadius: "1rem",
      }}
    />
  );
}

function StageContent({
  localStream, localUsername, remotes, audioOn, videoOn,
  onToggleAudio, onToggleVideo, onLeave, readOnly, onKickRemote, cols, fillHeight,
}: {
  localStream: MediaStream | null;
  localUsername: string;
  remotes: RemoteCohost[];
  audioOn: boolean;
  videoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  readOnly: boolean;
  onKickRemote?: (userId: string, username: string) => void;
  cols: number;
  fillHeight?: boolean;
}) {
  return (
    <div className={fillHeight ? "flex h-full flex-col" : ""}>
      <div className={`grid gap-2 ${fillHeight ? "flex-1 min-h-0" : ""}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {localStream && (
          <Tile stream={localStream} label={`@${localUsername} (you)`} muted videoOn={videoOn} audioOn={audioOn} fillHeight={fillHeight} />
        )}
        {remotes.map((r) => (
          <Tile
            key={r.userId}
            stream={r.stream}
            label={`@${r.username}`}
            muted={false}
            videoOn={r.videoEnabled}
            audioOn={r.audioEnabled}
            onKick={onKickRemote ? () => onKickRemote(r.userId, r.username) : undefined}
            fillHeight={fillHeight}
          />
        ))}
      </div>
      {!readOnly && (
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
      )}
    </div>
  );
}

function Tile({ stream, label, muted, videoOn, audioOn, onKick, fillHeight }: { stream: MediaStream; label: string; muted: boolean; videoOn: boolean; audioOn: boolean; onKick?: () => void; fillHeight?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className={`relative overflow-hidden rounded-xl bg-black ${fillHeight ? "h-full min-h-0" : "aspect-video"}`}>
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${videoOn ? "" : "hidden"}`} />
      {!videoOn && (
        <div className="flex h-full w-full items-center justify-center text-white/60 text-xs">Camera off</div>
      )}
      {onKick && (
        <button
          onClick={onKick}
          className="absolute right-1 top-1 rounded-full bg-destructive/85 p-1 text-destructive-foreground shadow ring-1 ring-white/20 hover:bg-destructive"
          title="Remove from collab"
          aria-label="Remove co-host"
        >
          <UserX className="h-3 w-3" />
        </button>
      )}
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
        <span className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
        {!audioOn && <MicOff className="h-3 w-3 rounded bg-black/60 p-0.5 text-white" />}
      </div>
    </div>
  );
}
