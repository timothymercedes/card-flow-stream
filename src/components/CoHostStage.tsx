import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, X, UserX, Move } from "lucide-react";
import type { RemoteCohost } from "@/hooks/useCloudflareCalls";

/**
 * Floating multi-guest stage.
 *
 * Layout philosophy:
 *  - Host camera is the main/featured feed elsewhere (studio canvas / main video).
 *    This overlay only renders the LOCAL preview when the host has no main feed
 *    representation (non-compositor mode) AND for cohost guests so they see
 *    themselves.
 *  - Each co-host appears as its OWN floating tile that the host can drag and
 *    resize independently. Positions persist per-userId in localStorage.
 *  - Read-only viewers see the same tiles but cannot move them.
 */
type Rect = { x: number; y: number; w: number; h: number };

const TILE_STORAGE_PREFIX = "cohost-tile-rect:";
const LOCAL_STORAGE_KEY = "cohost-local-rect";

function loadRect(key: string): Rect | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
function saveRect(key: string, r: Rect) {
  try { localStorage.setItem(key, JSON.stringify(r)); } catch {}
}

function defaultRectFor(index: number): Rect {
  // Cascade tiles from top-right downward
  const w = 180;
  const h = 130;
  const padding = 12;
  const top = 80 + index * (h + padding);
  const right = padding;
  const x = typeof window !== "undefined" ? Math.max(0, window.innerWidth - w - right) : 16;
  return { x, y: top, w, h };
}

export function CoHostStage({
  localStream, localUsername, remotes, audioOn, videoOn,
  onToggleAudio, onToggleVideo, onLeave, readOnly = false,
  onKickRemote, showLocal = true,
}: {
  localStream: MediaStream | null;
  localUsername: string;
  remotes: RemoteCohost[];
  audioOn: boolean;
  videoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  readOnly?: boolean;
  onKickRemote?: (userId: string, username: string) => void;
  /** Render the local preview tile. Set false when the host is the main feed elsewhere. */
  showLocal?: boolean;
}) {
  const uniqueRemotes = Array.from(new Map(remotes.map((r) => [r.userId, r])).values());
  const isHost = !!onKickRemote;
  const draggable = isHost && !readOnly;
  const total = (localStream && showLocal ? 1 : 0) + uniqueRemotes.length;
  if (total === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {localStream && showLocal && (
        <FloatingTile
          storageKey={LOCAL_STORAGE_KEY}
          defaultRect={defaultRectFor(0)}
          draggable={draggable}
          stream={localStream}
          label={`@${localUsername} (you)`}
          muted
          videoOn={videoOn}
          audioOn={audioOn}
          controls={!readOnly ? {
            audioOn, videoOn,
            onToggleAudio, onToggleVideo, onLeave,
          } : undefined}
        />
      )}
      {uniqueRemotes.map((r, i) => (
        <FloatingTile
          key={r.userId}
          storageKey={`${TILE_STORAGE_PREFIX}${r.userId}`}
          defaultRect={defaultRectFor(i + (localStream && showLocal ? 1 : 0))}
          draggable={draggable}
          stream={r.stream}
          label={`@${r.username}`}
          muted={false}
          videoOn={r.videoEnabled}
          audioOn={r.audioEnabled}
          onKick={onKickRemote ? () => onKickRemote(r.userId, r.username) : undefined}
        />
      ))}
    </div>
  );
}

function FloatingTile({
  storageKey, defaultRect, draggable, stream, label, muted, videoOn, audioOn, onKick, controls,
}: {
  storageKey: string;
  defaultRect: Rect;
  draggable: boolean;
  stream: MediaStream;
  label: string;
  muted: boolean;
  videoOn: boolean;
  audioOn: boolean;
  onKick?: () => void;
  controls?: {
    audioOn: boolean;
    videoOn: boolean;
    onToggleAudio: () => void;
    onToggleVideo: () => void;
    onLeave: () => void;
  };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);

  const [rect, setRect] = useState<Rect>(() => loadRect(storageKey) ?? defaultRect);
  useEffect(() => { saveRect(storageKey, rect); }, [storageKey, rect]);

  const dragRef = useRef<{ mode: "move" | "resize"; sx: number; sy: number; orig: Rect } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent, mode: "move" | "resize") => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, orig: rect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [draggable, rect]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.mode === "move") {
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
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
        w: Math.max(120, Math.min(window.innerWidth - d.orig.x, d.orig.w + dx)),
        h: Math.max(90, Math.min(window.innerHeight - d.orig.y, d.orig.h + dy)),
      });
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
    }
  }, []);

  return (
    <div
      className="pointer-events-auto absolute overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-white/15"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full bg-black object-contain ${videoOn ? "" : "hidden"}`}
      />
      {!videoOn && (
        <div className="flex h-full w-full items-center justify-center text-xs text-white/60">
          Camera off
        </div>
      )}

      {/* Drag handle (host only) */}
      {draggable && (
        <button
          onPointerDown={(e) => onPointerDown(e, "move")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute left-1 top-1 z-10 cursor-move touch-none rounded-full bg-white/90 p-1 shadow ring-1 ring-black/10"
          title="Drag to move"
          aria-label="Drag to move"
        >
          <Move className="h-3 w-3 text-black" />
        </button>
      )}

      {/* Kick button (host only, remote tiles only) */}
      {onKick && (
        <button
          onClick={onKick}
          className="absolute right-1 top-1 z-10 rounded-full bg-destructive/85 p-1 text-destructive-foreground shadow ring-1 ring-white/20 hover:bg-destructive"
          title="Remove from collab"
          aria-label="Remove co-host"
        >
          <UserX className="h-3 w-3" />
        </button>
      )}

      {/* Label + mic indicator */}
      <div className="absolute bottom-1 left-1 right-1 z-10 flex items-center justify-between gap-1">
        <span className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
        {!audioOn && <MicOff className="h-3 w-3 rounded bg-black/60 p-0.5 text-white" />}
      </div>

      {/* Local controls bar (cohost guest's own tile) */}
      {controls && (
        <div className="absolute left-1/2 top-1 z-10 flex -translate-x-1/2 items-center gap-1">
          <button
            onClick={controls.onToggleAudio}
            className={`rounded-full p-1.5 ${controls.audioOn ? "bg-white/15" : "bg-destructive/80"}`}
            title={controls.audioOn ? "Mute" : "Unmute"}
          >
            {controls.audioOn ? <Mic className="h-3 w-3 text-white" /> : <MicOff className="h-3 w-3 text-white" />}
          </button>
          <button
            onClick={controls.onToggleVideo}
            className={`rounded-full p-1.5 ${controls.videoOn ? "bg-white/15" : "bg-destructive/80"}`}
            title={controls.videoOn ? "Camera off" : "Camera on"}
          >
            {controls.videoOn ? <Video className="h-3 w-3 text-white" /> : <VideoOff className="h-3 w-3 text-white" />}
          </button>
          <button
            onClick={controls.onLeave}
            className="rounded-full bg-destructive p-1.5 text-destructive-foreground"
            title="Leave call"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Resize handle (host only) */}
      {draggable && (
        <div
          onPointerDown={(e) => onPointerDown(e, "resize")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize touch-none"
          title="Drag to resize"
          style={{
            background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.9) 50%)",
            borderBottomRightRadius: "0.75rem",
          }}
        />
      )}
    </div>
  );
}
