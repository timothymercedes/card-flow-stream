import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Mic, MicOff, Video, VideoOff, X, UserX, Move, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import type { RemoteCohost } from "@/hooks/useCloudflareCalls";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live stage with three operating modes:
 *
 *  - "host-broadcast": Host arranges tiles; positions persist to
 *    `live_stage_layouts` and are broadcast in real time so viewers + co-hosts
 *    see the exact framing the host picks.
 *  - "viewer": Read-only. Subscribes to `live_stage_layouts` for this stream
 *    and renders the host's authoritative layout. No drag handles.
 *  - "local-only" (default): Local-only personal arrangement (localStorage).
 *    Used by co-host guests so they can rearrange their personal view without
 *    affecting what viewers see.
 *
 * Coords are stored as normalized 0..1 fractions of the stage container, so the
 * layout scales correctly on mobile.
 */
type RectN = { x: number; y: number; w: number; h: number; z?: number; fit: "cover" | "contain"; zoom: number; hidden?: boolean };

type StageMode = "host-broadcast" | "viewer" | "local-only";

const LOCAL_PREFIX = "cohost-tile-rectN:";
const LOCAL_SELF_KEY = "cohost-local-rectN-self";

const DEFAULT_RECT: RectN = { x: 0.72, y: 0.05, w: 0.25, h: 0.22, fit: "cover", zoom: 1 };

function loadLocal(key: string): RectN | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...DEFAULT_RECT, ...JSON.parse(raw) };
  } catch {}
  return null;
}
function saveLocal(key: string, r: RectN) {
  try { localStorage.setItem(key, JSON.stringify(r)); } catch {}
}

function defaultRectFor(i: number): RectN {
  // Cascade tiles down the right edge by default
  const w = 0.24;
  const h = 0.2;
  const y = 0.05 + i * (h + 0.02);
  return { ...DEFAULT_RECT, x: 0.74, y: Math.min(0.78, y), w, h };
}

function rectFromLayoutRow(row: any): RectN {
  return {
    x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h),
    z: Number(row.z) || 1,
    fit: row.object_fit === "contain" ? "contain" : "cover",
    zoom: Number(row.zoom) || 1,
    hidden: !!row.hidden,
  };
}

function writeLayoutAliases(target: Record<string, RectN>, row: any, rect: RectN) {
  const sourceKey = row.source_key || row.tile_user_id;
  if (sourceKey) target[sourceKey] = rect;
  // Remote media is discovered by user id, while the host studio stores rows by
  // source_key. Keep tile_user_id as an alias so viewer/co-host tiles adopt the
  // host-authored layout instead of falling back to local defaults.
  if (row.tile_user_id) target[row.tile_user_id] = rect;
}

export function CoHostStage({
  localStream, localUsername, remotes, audioOn, videoOn,
  onToggleAudio, onToggleVideo, onLeave, readOnly = false,
  onKickRemote, showLocal = true,
  streamId, mode = "local-only", userId,
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
  /** Render the local preview tile. Set false when host is the main feed elsewhere. */
  showLocal?: boolean;
  /** Stream id — required for host-broadcast / viewer modes. */
  streamId?: string;
  mode?: StageMode;
  /** Local user id — required for host-broadcast (used as tile_user_id for the local tile). */
  userId?: string;
}) {
  const uniqueRemotes = useMemo(
    () => Array.from(new Map(remotes.map((r) => [r.userId, r])).values()),
    [remotes],
  );

  // ───── Stage container measurement ─────
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setStageSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ───── Remote layout (host-broadcast → DB → viewer) ─────
  const [remoteLayouts, setRemoteLayouts] = useState<Record<string, RectN>>({});
  useEffect(() => {
    if (!streamId || mode === "local-only") return;
    let cancelled = false;
    supabase
      .from("live_stage_layouts")
      .select("source_key,tile_user_id,x,y,w,h,z,object_fit,zoom,hidden")
      .eq("stream_id", streamId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, RectN> = {};
        for (const row of data as any[]) {
          const key = row.source_key || row.tile_user_id;
          next[key] = {
            x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h),
            z: Number(row.z) || 1,
            fit: row.object_fit === "contain" ? "contain" : "cover",
            zoom: Number(row.zoom) || 1,
            hidden: !!row.hidden,
          };
        }
        setRemoteLayouts(next);
      });
    const ch = supabase
      .channel(`stage-layout-${streamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_stage_layouts", filter: `stream_id=eq.${streamId}` },
        (p: any) => {
          const row = (p.new || p.old) as any;
          if (!row?.tile_user_id) return;
          const key = row.source_key || row.tile_user_id;
          if (p.eventType === "DELETE") {
            setRemoteLayouts((m) => {
              const { [key]: _drop, ...rest } = m;
              return rest;
            });
          } else {
            setRemoteLayouts((m) => ({
              ...m,
              [key]: {
                x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h),
                z: Number(row.z) || 1,
                fit: row.object_fit === "contain" ? "contain" : "cover",
                zoom: Number(row.zoom) || 1,
                hidden: !!row.hidden,
              },
            }));
          }
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [streamId, mode]);

  // Persist layout — host-broadcast writes to DB, debounced.
  const writeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persistRect = useCallback((tileUserId: string, r: RectN) => {
    if (mode === "host-broadcast" && streamId) {
      clearTimeout(writeTimers.current[tileUserId]);
      writeTimers.current[tileUserId] = setTimeout(() => {
        supabase.from("live_stage_layouts").upsert({
          stream_id: streamId,
          source_key: tileUserId,
          tile_user_id: tileUserId,
          source_type: tileUserId === userId ? "host" : "cohost",
          x: r.x, y: r.y, w: r.w, h: r.h,
          z: r.z ?? 1,
          object_fit: r.fit, zoom: r.zoom, hidden: !!r.hidden,
          updated_at: new Date().toISOString(),
          updated_by: userId ?? null,
        } as any, { onConflict: "stream_id,source_key" }).then(() => {});
      }, 120);
    } else if (mode === "local-only") {
      saveLocal(`${LOCAL_PREFIX}${tileUserId}`, r);
    }
  }, [mode, streamId, userId]);

  const draggable = mode === "host-broadcast" || (mode === "local-only" && !readOnly);

  const localKey = userId || "self";
  const total = (localStream && showLocal ? 1 : 0) + uniqueRemotes.length;
  if (total === 0) return null;

  return (
    <div ref={stageRef} className="pointer-events-none absolute inset-0 z-30">
      {stageSize.w > 0 && localStream && showLocal && (
        <FloatingTile
          stageW={stageSize.w}
          stageH={stageSize.h}
          tileUserId={localKey}
          mode={mode}
          remoteRect={remoteLayouts[localKey]}
          localFallback={loadLocal(LOCAL_SELF_KEY) ?? defaultRectFor(0)}
          draggable={draggable}
          stream={localStream}
          label={`@${localUsername} (you)`}
          muted
          videoOn={videoOn}
          audioOn={audioOn}
          onPersist={(r) => {
            if (mode === "local-only") saveLocal(LOCAL_SELF_KEY, r);
            else persistRect(localKey, r);
          }}
          controls={!readOnly ? {
            audioOn, videoOn,
            onToggleAudio, onToggleVideo, onLeave,
          } : undefined}
        />
      )}
      {stageSize.w > 0 && uniqueRemotes.map((r, i) => (
        <FloatingTile
          key={r.userId}
          stageW={stageSize.w}
          stageH={stageSize.h}
          tileUserId={r.userId}
          mode={mode}
          remoteRect={remoteLayouts[r.userId]}
          localFallback={loadLocal(`${LOCAL_PREFIX}${r.userId}`) ?? defaultRectFor(i + (localStream && showLocal ? 1 : 0))}
          draggable={draggable}
          stream={r.stream}
          label={`@${r.username}`}
          muted={false}
          videoOn={r.videoEnabled}
          audioOn={r.audioEnabled}
          onPersist={(rect) => persistRect(r.userId, rect)}
          onKick={onKickRemote ? () => onKickRemote(r.userId, r.username) : undefined}
        />
      ))}
    </div>
  );
}

function FloatingTile({
  stageW, stageH, tileUserId, mode, remoteRect, localFallback,
  draggable, stream, label, muted, videoOn, audioOn, onKick, controls, onPersist,
}: {
  stageW: number;
  stageH: number;
  tileUserId: string;
  mode: StageMode;
  remoteRect?: RectN;
  localFallback: RectN;
  draggable: boolean;
  stream: MediaStream;
  label: string;
  muted: boolean;
  videoOn: boolean;
  audioOn: boolean;
  onKick?: () => void;
  onPersist: (r: RectN) => void;
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

  // Source of truth: viewer + host-broadcast = remoteRect (fallback to local default);
  // local-only = internal state seeded from localStorage.
  const [localRect, setLocalRect] = useState<RectN>(() =>
    mode === "viewer" ? (remoteRect ?? localFallback) :
    mode === "host-broadcast" ? (remoteRect ?? localFallback) :
    localFallback,
  );

  // For host-broadcast/viewer, when DB pushes an update we adopt it (unless host is mid-drag).
  const draggingRef = useRef(false);
  useEffect(() => {
    if (mode === "local-only") return;
    if (!remoteRect) return;
    if (draggingRef.current) return;
    setLocalRect(remoteRect);
  }, [remoteRect, mode]);

  if (remoteRect?.hidden && mode === "viewer") return null;

  const rect = localRect;

  // Convert normalized rect → pixel coordinates.
  const px = {
    left: rect.x * stageW,
    top: rect.y * stageH,
    width: Math.max(80, rect.w * stageW),
    height: Math.max(60, rect.h * stageH),
  };

  const dragRef = useRef<{ mode: "move" | "resize"; sx: number; sy: number; orig: RectN } | null>(null);

  const update = useCallback((next: RectN) => {
    setLocalRect(next);
    onPersist(next);
  }, [onPersist]);

  const onPointerDown = useCallback((e: React.PointerEvent, kind: "move" | "resize") => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    dragRef.current = { mode: kind, sx: e.clientX, sy: e.clientY, orig: rect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [draggable, rect]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || stageW === 0) return;
    const dxN = (e.clientX - d.sx) / stageW;
    const dyN = (e.clientY - d.sy) / stageH;
    if (d.mode === "move") {
      const next: RectN = {
        ...d.orig,
        x: Math.max(0, Math.min(1 - d.orig.w, d.orig.x + dxN)),
        y: Math.max(0, Math.min(1 - d.orig.h, d.orig.y + dyN)),
      };
      update(next);
    } else {
      const next: RectN = {
        ...d.orig,
        w: Math.max(0.08, Math.min(1 - d.orig.x, d.orig.w + dxN)),
        h: Math.max(0.08, Math.min(1 - d.orig.y, d.orig.h + dyN)),
      };
      update(next);
    }
  }, [stageW, stageH, update]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
      draggingRef.current = false;
    }
  }, []);

  const toggleFit = () => update({ ...rect, fit: rect.fit === "cover" ? "contain" : "cover" });
  const bumpZoom = (delta: number) =>
    update({ ...rect, zoom: Math.max(0.5, Math.min(2.5, +(rect.zoom + delta).toFixed(2))) });

  return (
    <div
      className="pointer-events-auto absolute overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-white/15"
      style={{ left: px.left, top: px.top, width: px.width, height: px.height }}
    >
      <div className="relative h-full w-full overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full bg-black ${videoOn ? "" : "hidden"}`}
          style={{
            objectFit: rect.fit,
            transform: rect.zoom !== 1 ? `scale(${rect.zoom})` : undefined,
            transformOrigin: "center center",
          }}
        />
      </div>
      {!videoOn && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">
          Camera off
        </div>
      )}

      {/* Drag handle */}
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

      {/* Kick (host only, remote tiles) */}
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

      {/* Framing controls — only when draggable (host-broadcast or local host) */}
      {draggable && (
        <div className="absolute left-1 bottom-6 z-10 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 ring-1 ring-white/15">
          <button onClick={toggleFit} title={rect.fit === "cover" ? "Switch to fit" : "Switch to fill"} className="text-white/85 hover:text-white">
            {rect.fit === "cover" ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button onClick={() => bumpZoom(-0.1)} title="Zoom out" className="text-white/85 hover:text-white">
            <ZoomOut className="h-3 w-3" />
          </button>
          <button onClick={() => bumpZoom(0.1)} title="Zoom in" className="text-white/85 hover:text-white">
            <ZoomIn className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Label + mic */}
      <div className="absolute bottom-1 left-1 right-1 z-10 flex items-center justify-between gap-1">
        <span className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
        {!audioOn && <MicOff className="h-3 w-3 rounded bg-black/60 p-0.5 text-white" />}
      </div>

      {/* Cohost local controls */}
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

      {/* Resize handle */}
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
