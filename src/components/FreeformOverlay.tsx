import { useRef, useState } from "react";
import { Maximize2, Minimize2, ChevronUp, ChevronDown, X, Lock, Unlock, Pencil, Eye, EyeOff } from "lucide-react";
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

export function FreeformOverlay({
  sources, layouts, expandedId,
  onInteractionStart, onLayoutChange, onBringToFront, onSendToBack, onExpand, onRemove,
  onToggleLock, onToggleVisible, onRename,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);

  function startDrag(
    e: React.PointerEvent,
    id: string,
    mode: "move" | "resize",
  ) {
    const src = sources.find((s) => s.id === id);
    if (src?.locked) return;
    e.preventDefault(); e.stopPropagation();
    const container = containerRef.current; if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const start = layouts[id]; if (!start) return;
    onInteractionStart?.();
    onBringToFront(id);

    const target = e.currentTarget as Element;
    target.setPointerCapture?.(e.pointerId);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      if (mode === "move") {
        onLayoutChange(id, { x: start.x + dx, y: start.y + dy });
      } else {
        onLayoutChange(id, {
          w: Math.max(0.1, start.w + dx),
          h: Math.max(0.1, start.h + dy),
        });
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
      <div ref={containerRef} className="pointer-events-none absolute inset-0 z-20">
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
    <div ref={containerRef} className="absolute inset-0 z-40 touch-none" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
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
            <div className="pointer-events-none absolute left-1 right-1 top-1 flex items-center justify-between gap-1">
              {editing === s.id && onRename ? (
                <input
                  autoFocus
                  defaultValue={s.label}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { onRename(s.id, e.currentTarget.value); setEditing(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onRename(s.id, (e.target as HTMLInputElement).value); setEditing(null); }
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
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onToggleLock(s.id)} className="rounded p-1 hover:bg-white/15" title={locked ? "Unlock" : "Lock"}>
                    {locked ? <Lock className="h-3 w-3 text-amber-400" /> : <Unlock className="h-3 w-3" />}
                  </button>
                )}
                {onToggleVisible && (
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onToggleVisible(s.id)} className="rounded p-1 hover:bg-white/15" title="Hide">
                    <Eye className="h-3 w-3" />
                  </button>
                )}
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onSendToBack(s.id)} className="rounded p-1 hover:bg-white/15" title="Send to back">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onBringToFront(s.id)} className="rounded p-1 hover:bg-white/15" title="Bring to front">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onExpand(s.id)} className="rounded p-1 hover:bg-white/15" title="Fullscreen">
                  <Maximize2 className="h-3 w-3" />
                </button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemove(s.id)} className="rounded p-1 hover:bg-destructive/40" title="Remove">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            {!locked && (
              <div
                onPointerDown={(e) => startDrag(e, s.id, "resize")}
                className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize rounded-sm border-2 border-primary bg-background shadow-md"
                title="Drag to resize"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
