import { useRef } from "react";
import { Maximize2, Minimize2, ChevronUp, ChevronDown, X } from "lucide-react";
import type { StudioSource, FreeformLayout } from "@/hooks/useStudio";

type Props = {
  sources: StudioSource[];
  layouts: Record<string, FreeformLayout>;
  expandedId: string | null;
  onLayoutChange: (id: string, patch: Partial<FreeformLayout>) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onExpand: (id: string) => void;
  onRemove: (id: string) => void;
};

export function FreeformOverlay({
  sources, layouts, expandedId,
  onLayoutChange, onBringToFront, onSendToBack, onExpand, onRemove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  function startDrag(
    e: React.PointerEvent,
    id: string,
    mode: "move" | "resize",
  ) {
    e.preventDefault(); e.stopPropagation();
    const container = containerRef.current; if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const start = layouts[id]; if (!start) return;
    onBringToFront(id);

    (e.target as Element).setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
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
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // While a source is "expanded", the canvas shows it fullscreen — overlay hidden.
  if (expandedId) {
    const s = sources.find((x) => x.id === expandedId);
    return (
      <div ref={containerRef} className="pointer-events-none absolute inset-0">
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
    <div ref={containerRef} className="absolute inset-0">
      {ordered.map((s) => {
        const l = layouts[s.id]!;
        return (
          <div
            key={s.id}
            className="absolute rounded-md border-2 border-primary/70 bg-primary/5 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{
              left: `${l.x * 100}%`,
              top: `${l.y * 100}%`,
              width: `${l.w * 100}%`,
              height: `${l.h * 100}%`,
              touchAction: "none",
            }}
          >
            {/* Drag handle (whole tile) */}
            <div
              onPointerDown={(e) => startDrag(e, s.id, "move")}
              className="absolute inset-0 cursor-move"
            />
            {/* Top toolbar */}
            <div className="absolute left-1 right-1 top-1 flex items-center justify-between gap-1">
              <div className="truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {s.label}
              </div>
              <div className="flex gap-0.5 rounded-md bg-black/70 p-0.5 text-white">
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
                  title="Expand"
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
            {/* Resize handle (bottom-right) */}
            <div
              onPointerDown={(e) => startDrag(e, s.id, "resize")}
              className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize rounded-sm border-2 border-primary bg-background shadow-md"
              title="Drag to resize"
            />
          </div>
        );
      })}
    </div>
  );
}
