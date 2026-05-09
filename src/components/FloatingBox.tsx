import { useRef, type Dispatch, type PointerEvent, type ReactNode, type SetStateAction } from "react";

export type FloatingBoxRect = { x: number; y: number; w: number; h: number };

type FloatingBoxProps = {
  box: FloatingBoxRect;
  onChange: Dispatch<SetStateAction<FloatingBoxRect>>;
  children: (controls: { dragHandleProps: { onPointerDown: (e: PointerEvent<HTMLElement>) => void } }) => ReactNode;
  className?: string;
  minW?: number;
  minH?: number;
  resize?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function FloatingBox({
  box,
  onChange,
  children,
  className = "",
  minW = 96,
  minH = 32,
  resize = false,
}: FloatingBoxProps) {
  const didDragRef = useRef(false);

  const startPointer = (e: PointerEvent<HTMLElement>, mode: "move" | "resize") => {
    e.stopPropagation();

    const target = e.currentTarget;
    const panel = target.closest("[data-floating-box]") as HTMLElement | null;
    const rect = panel?.getBoundingClientRect();
    const start = {
      x: box.x,
      y: box.y,
      w: rect?.width || box.w,
      h: rect?.height || box.h || minH,
    };
    const startX = e.clientX;
    const startY = e.clientY;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    target.setPointerCapture?.(e.pointerId);

    const onMove = (ev: globalThis.PointerEvent) => {
      ev.preventDefault();
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) didDragRef.current = true;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (mode === "move") {
        onChange((cur) => ({
          ...cur,
          x: clamp(start.x + dx, 4, vw - Math.max(minW, start.w) - 4),
          y: clamp(start.y + dy, 4, vh - Math.max(minH, start.h) - 4),
        }));
        return;
      }

      onChange((cur) => ({
        ...cur,
        w: clamp(start.w + dx, minW, vw - start.x - 4),
        h: clamp(start.h + dy, minH, vh - start.y - 4),
      }));
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
  };

  return (
    <div
      data-floating-box
      className={`fixed touch-none ${className}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h > 0 ? box.h : undefined }}
      onClickCapture={(e) => {
        if (!didDragRef.current) return;
        didDragRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children({ dragHandleProps: { onPointerDown: (e) => startPointer(e, "move") } })}
      {resize && (
        <div
          onPointerDown={(e) => startPointer(e, "resize")}
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize bg-primary/70 hover:bg-primary"
          style={{ clipPath: "polygon(100% 100%, 0 100%, 100% 0)" }}
          title="Drag to resize"
        />
      )}
    </div>
  );
}