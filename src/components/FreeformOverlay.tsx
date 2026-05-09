import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  X,
  Lock,
  Unlock,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import type { StudioSource, FreeformLayout } from "@/hooks/useStudio";

type Props = {
  sources: StudioSource[];
  layouts: Record<string, FreeformLayout>;
  expandedId: string | null;
  onInteractionStart?: () => void;
  onLayoutChange: (id: string, patch: Partial<FreeformLayout>) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onExpand: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleLock?: (id: string) => void;
  onToggleVisible?: (id: string) => void;
  onRename?: (id: string, label: string) => void;
};

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const STAGE_ASPECT = 16 / 9;

function getVisibleStageRect(width: number, height: number) {
  if (!width || !height) return { left: 0, top: 0, width, height };
  const boxAspect = width / height;
  if (boxAspect > STAGE_ASPECT) {
    const containedWidth = height * STAGE_ASPECT;
    return { left: (width - containedWidth) / 2, top: 0, width: containedWidth, height };
  }
  const containedHeight = width / STAGE_ASPECT;
  return { left: 0, top: (height - containedHeight) / 2, width, height: containedHeight };
}

export function FreeformOverlay({
  sources,
  layouts,
  expandedId,
  onInteractionStart,
  onLayoutChange,
  onBringToFront,
  onSendToBack,
  onExpand,
  onRemove,
  onToggleLock,
  onToggleVisible,
  onRename,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [surface, setSurface] = useState(() => getVisibleStageRect(0, 0));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSurface(getVisibleStageRect(rect.width, rect.height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  function startDrag(
    e: React.PointerEvent,
    id: string,
    mode: "move" | "resize",
    handle: ResizeHandle = "se",
  ) {
    const src = sources.find((s) => s.id === id);
    if (src?.locked) return;
    e.preventDefault();
    e.stopPropagation();
    const surfaceEl = surfaceRef.current;
    if (!surfaceEl) return;
    const rect = surfaceEl.getBoundingClientRect();
    const startX = e.clientX,
      startY = e.clientY;
    const start = layouts[id];
    if (!start) return;
    onInteractionStart?.();
    onBringToFront(id);

    const target = e.currentTarget as Element;
    if (target.hasPointerCapture?.(e.pointerId) === false) {
      target.setPointerCapture?.(e.pointerId);
    }
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      if (mode === "move") {
        onLayoutChange(id, {
          x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
          y: Math.min(1 - start.h, Math.max(0, start.y + dy)),
        });
      } else {
        const patch: Partial<FreeformLayout> = {};
        if (handle.includes("e")) patch.w = Math.max(0.1, start.w + dx);
        if (handle.includes("s")) patch.h = Math.max(0.1, start.h + dy);
        if (handle.includes("w")) {
          const nextW = Math.max(0.1, start.w - dx);
          patch.x = start.x + start.w - nextW;
          patch.w = nextW;
        }
        if (handle.includes("n")) {
          const nextH = Math.max(0.1, start.h - dy);
          patch.y = start.y + start.h - nextH;
          patch.h = nextH;
        }
        onLayoutChange(id, patch);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = previousUserSelect;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  if (expandedId) {
    const s = sources.find((x) => x.id === expandedId);
    return (
      <div ref={containerRef} className="pointer-events-none absolute inset-0 z-40">
        <div className="pointer-events-auto absolute right-2 top-2 flex gap-1 rounded-lg bg-black/70 p-1 text-white shadow-lg">
          <button
            onClick={() => onExpand(expandedId)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold hover:bg-white/15"
            title="Restore layout"
          >
            <Minimize2 className="h-3 w-3" /> Restore
          </button>
        </div>
        {s && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
            Expanded · {s.label}
          </div>
        )}
      </div>
    );
  }

  const ordered = [...sources]
    .filter((s) => s.visible && layouts[s.id])
    .sort((a, b) => (layouts[a.id]?.z ?? 0) - (layouts[b.id]?.z ?? 0));

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 touch-none overflow-hidden"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div
        ref={surfaceRef}
        className="absolute touch-none"
        style={{
          left: surface.left,
          top: surface.top,
          width: surface.width,
          height: surface.height,
        }}
      >
        {ordered.map((s) => {
          const l = layouts[s.id]!;
          const locked = s.locked;
          return (
            <div
              key={s.id}
              onPointerDown={(e) => startDrag(e, s.id, "move")}
              className={`absolute rounded-md border-2 ${locked ? "border-amber-400/70 cursor-not-allowed" : "border-primary/70 cursor-move"} bg-primary/5 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]`}
              style={{
                left: `${l.x * 100}%`,
                top: `${l.y * 100}%`,
                width: `${l.w * 100}%`,
                height: `${l.h * 100}%`,
                zIndex: l.z,
                touchAction: "none",
              }}
            >
              {!locked && (
                <>
                  <div
                    onPointerDown={(e) => startDrag(e, s.id, "resize", "n")}
                    className="absolute -top-3 left-6 right-6 h-6 cursor-ns-resize"
                    title="Drag to resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, s.id, "resize", "s")}
                    className="absolute -bottom-3 left-6 right-6 h-6 cursor-ns-resize"
                    title="Drag to resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, s.id, "resize", "w")}
                    className="absolute -left-3 bottom-6 top-6 w-6 cursor-ew-resize"
                    title="Drag to resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, s.id, "resize", "e")}
                    className="absolute -right-3 bottom-6 top-6 w-6 cursor-ew-resize"
                    title="Drag to resize"
                  />
                </>
              )}
              <div className="pointer-events-none absolute left-1 right-1 top-1 flex items-center justify-between gap-1">
                {editing === s.id && onRename ? (
                  <input
                    autoFocus
                    defaultValue={s.label}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      onRename(s.id, e.currentTarget.value);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onRename(s.id, (e.target as HTMLInputElement).value);
                        setEditing(null);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="pointer-events-auto truncate rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white outline-none ring-1 ring-primary"
                  />
                ) : (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onRename && setEditing(s.id)}
                    className="pointer-events-auto flex items-center gap-1 truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-black/85"
                    title="Rename"
                  >
                    <span className="truncate max-w-[8rem]">{s.label}</span>
                    {onRename && <Pencil className="h-2.5 w-2.5 opacity-60" />}
                  </button>
                )}
                <div className="pointer-events-auto flex gap-0.5 rounded-md bg-black/70 p-0.5 text-white">
                  {onToggleLock && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onToggleLock(s.id)}
                      className="rounded p-1 hover:bg-white/15"
                      title={locked ? "Unlock" : "Lock"}
                    >
                      {locked ? (
                        <Lock className="h-3 w-3 text-amber-400" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                    </button>
                  )}
                  {onToggleVisible && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onToggleVisible(s.id)}
                      className="rounded p-1 hover:bg-white/15"
                      title="Hide"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onSendToBack(s.id)}
                    className="rounded p-1 hover:bg-white/15"
                    title="Send to back"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onBringToFront(s.id)}
                    className="rounded p-1 hover:bg-white/15"
                    title="Bring to front"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onExpand(s.id)}
                    className="rounded p-1 hover:bg-white/15"
                    title="Fullscreen"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onRemove(s.id)}
                    className="rounded p-1 hover:bg-destructive/40"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {!locked && (
                <div
                  onPointerDown={(e) => startDrag(e, s.id, "resize", "se")}
                  className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize rounded-sm border-2 border-primary bg-background shadow-md"
                  title="Drag to resize"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
