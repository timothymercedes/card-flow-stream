import { useEffect, useState } from "react";
import { Sparkles, X, Minus, Maximize2, ZoomIn, GripVertical } from "lucide-react";
import { FloatingBox, type FloatingBoxRect } from "@/components/FloatingBox";

export type SpotlightCard = {
  id: string;
  name: string;
  category: string;
  set_guess?: string;
  rarity_vibe?: string;
  image: string;
  hype_lines?: string[];
};

type Props = {
  card: SpotlightCard;
  isHost: boolean;
  onClose: () => void;
};

function defaultBox(): FloatingBoxRect {
  if (typeof window === "undefined") return { x: 16, y: 96, w: 260, h: 0 };
  const w = Math.min(280, window.innerWidth - 32);
  // Bottom-right by default so it doesn't overlay the auction item / center of stream
  return {
    x: Math.max(8, window.innerWidth - w - 16),
    y: Math.max(80, Math.min(window.innerHeight - 360, window.innerHeight * 0.35)),
    w,
    h: 0,
  };
}

export function CardSpotlight({ card, isHost, onClose }: Props) {
  const [box, setBox] = useState<FloatingBoxRect>(() => defaultBox());
  const [collapsed, setCollapsed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);

  const lines = (card.hype_lines || []).filter(Boolean);

  // Cycle hype lines every 3.5s
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setInterval(() => setLineIdx((i) => (i + 1) % lines.length), 3500);
    return () => clearInterval(t);
  }, [lines.length]);

  // Reset on new card
  useEffect(() => {
    setLineIdx(0);
    setCollapsed(false);
  }, [card.id]);

  return (
    <>
      <FloatingBox
        box={box}
        onChange={setBox}
        minW={180}
        minH={48}
        resize={isHost}
        className="z-40"
      >
        {({ dragHandleProps }) => (
          <div className="overflow-hidden rounded-2xl border border-primary/50 bg-black/85 shadow-2xl backdrop-blur">
            {/* Header / drag handle */}
            <div className="flex items-center gap-1 border-b border-white/10 bg-gradient-to-r from-primary/30 to-accent/20 px-2 py-1.5">
              <button
                {...(isHost ? dragHandleProps : {})}
                className={`flex flex-1 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white ${isHost ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                title={isHost ? "Drag to move" : "Card spotlight"}
              >
                {isHost && <GripVertical className="h-3 w-3 opacity-70" />}
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="truncate">AI Spotlight</span>
              </button>
              {!isHost && (
                <button
                  onClick={() => setZoom(true)}
                  className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
                title={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              </button>
              {isHost && (
                <button
                  onClick={onClose}
                  className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
                  title="Close spotlight"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Collapsed pill */}
            {collapsed ? (
              <button
                onClick={() => !isHost && setZoom(true)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
              >
                <img
                  src={card.image}
                  alt={card.name}
                  className="h-8 w-6 shrink-0 rounded object-cover"
                />
                <span className="truncate text-xs font-bold text-white">{card.name}</span>
              </button>
            ) : (
              <div className="flex gap-2 p-2">
                <button
                  onClick={() => !isHost && setZoom(true)}
                  className="shrink-0"
                  title={!isHost ? "Tap to zoom" : undefined}
                >
                  <img
                    src={card.image}
                    alt={card.name}
                    className="h-28 w-20 rounded-lg object-cover ring-1 ring-white/10"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  {(() => {
                    // Title may arrive combined as "Name · Set · Number". Split into 3 rows.
                    const parts = String(card.name || "")
                      .split(/\s·\s/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const name = parts[0] || card.name;
                    const setLine = parts[1] || card.set_guess || "";
                    const num = parts[2] || "";
                    return (
                      <>
                        <p className="truncate text-sm font-extrabold text-white">{name}</p>
                        {setLine && (
                          <p className="truncate text-[11px] text-white/80">{setLine}</p>
                        )}
                        {num && (
                          <p className="truncate text-[11px] text-white/60">#{num.replace(/^#/, "")}</p>
                        )}
                      </>
                    );
                  })()}
                  {card.rarity_vibe && (
                    <span className="mt-1 inline-block rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                      {card.rarity_vibe}
                    </span>
                  )}
                  {lines.length > 0 && (
                    <div className="mt-1.5 min-h-[2.5rem] rounded-md bg-white/5 p-1.5">
                      <p className="text-[11px] leading-tight text-white animate-in fade-in" key={lineIdx}>
                        {lines[lineIdx]}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </FloatingBox>

      {/* Viewer zoom modal */}
      {zoom && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95 p-4"
          onClick={() => setZoom(false)}
        >
          <button
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={card.image}
            alt={card.name}
            className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-3 text-center">
            {(() => {
              const parts = String(card.name || "")
                .split(/\s·\s/)
                .map((s) => s.trim())
                .filter(Boolean);
              const name = parts[0] || card.name;
              const setLine = parts[1] || card.set_guess || "";
              const num = parts[2] || "";
              return (
                <>
                  <p className="text-lg font-extrabold text-white">{name}</p>
                  {setLine && <p className="text-xs text-white/80">{setLine}</p>}
                  {num && <p className="text-xs text-white/60">#{num.replace(/^#/, "")}</p>}
                </>
              );
            })()}
            {card.rarity_vibe && (
              <span className="mt-1 inline-block rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                {card.rarity_vibe}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
