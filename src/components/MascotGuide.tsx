import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X, Minimize2, Sparkles } from "lucide-react";
import { MASCOTS, TOURS, type Tour } from "@/lib/tours";

const LS_PREFIX = "pbl_tour_v2_";

type Ctx = {
  /** Start a tour. Pass `force` to re-show even if user has seen it. */
  startTour: (id: keyof typeof TOURS, force?: boolean) => void;
  /** Trigger a tour only the first time for this user. */
  triggerOnce: (id: keyof typeof TOURS) => void;
  /** Manually mark a tour as seen without showing it. */
  markSeen: (id: keyof typeof TOURS) => void;
  /** Has the user already completed/skipped this tour? */
  hasSeen: (id: keyof typeof TOURS) => boolean;
};

const TourCtx = createContext<Ctx>({} as Ctx);

export function useTour() {
  return useContext(TourCtx);
}

export function MascotTourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Tour | null>(null);
  const [step, setStep] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const hasSeen = useCallback((id: string) => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(LS_PREFIX + id);
  }, []);

  const markSeen = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LS_PREFIX + id, "1");
  }, []);

  const startTour = useCallback((id: string, force = false) => {
    const tour = TOURS[id];
    if (!tour) return;
    if (!force && hasSeen(id)) return;
    setActive(tour);
    setStep(0);
    setMinimized(false);
  }, [hasSeen]);

  const triggerOnce = useCallback((id: string) => {
    if (hasSeen(id)) return;
    startTour(id);
  }, [hasSeen, startTour]);

  const close = useCallback((persist: boolean) => {
    if (persist && active) markSeen(active.id);
    setActive(null);
    setStep(0);
    setMinimized(false);
  }, [active, markSeen]);

  const value = useMemo<Ctx>(() => ({ startTour, triggerOnce, markSeen, hasSeen }), [startTour, triggerOnce, markSeen, hasSeen]);

  return (
    <TourCtx.Provider value={value}>
      {children}
      {active && (
        <MascotBubble
          tour={active}
          step={step}
          minimized={minimized}
          onMinimize={() => setMinimized(true)}
          onMaximize={() => setMinimized(false)}
          onPrev={() => setStep((s) => Math.max(0, s - 1))}
          onNext={() => {
            if (step >= active.steps.length - 1) close(true);
            else setStep((s) => s + 1);
          }}
          onSkipTemp={() => close(false)}
          onDontShow={() => close(true)}
        />
      )}
    </TourCtx.Provider>
  );
}

function MascotBubble({
  tour, step, minimized,
  onMinimize, onMaximize, onPrev, onNext, onSkip,
}: {
  tour: Tour; step: number; minimized: boolean;
  onMinimize: () => void; onMaximize: () => void;
  onPrev: () => void; onNext: () => void; onSkip: () => void;
}) {
  const m = MASCOTS[tour.mascot];
  const s = tour.steps[step];
  const isLast = step >= tour.steps.length - 1;

  if (minimized) {
    return (
      <button
        onClick={onMaximize}
        aria-label={`Reopen ${m.name}'s tour`}
        className={`fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${m.glow} shadow-xl ring-2 ring-white/20 backdrop-blur transition hover:scale-110 animate-bounce`}
        style={{ animationDuration: "2.4s" }}
      >
        <img src={m.image} alt={m.name} width={56} height={56} loading="lazy" className="h-14 w-14 rounded-full object-contain drop-shadow-lg" />
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-fuchsia-500 text-[10px] font-bold text-white animate-pulse">
          {tour.steps.length - step}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-24 pt-6 backdrop-blur-sm sm:items-center sm:pb-6 animate-fade-in">
      <div className="relative w-full max-w-sm">
        {/* Holographic glow ring */}
        <div className={`absolute -inset-1 rounded-3xl bg-gradient-to-br ${m.glow} opacity-60 blur-xl`} />

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl animate-scale-in">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-border/50 bg-background/40 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              {m.name} · Tour
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onMinimize} aria-label="Minimize" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={onSkip} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mascot + dialogue */}
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-end gap-3">
              <div className={`relative flex-shrink-0 rounded-2xl bg-gradient-to-br ${m.glow} p-1`}>
                <img
                  src={m.image}
                  alt={m.name}
                  width={120}
                  height={120}
                  loading="lazy"
                  className="h-28 w-28 object-contain drop-shadow-2xl"
                  style={{ animation: "mascot-float 3s ease-in-out infinite" }}
                />
              </div>
              <div className="relative flex-1 rounded-2xl rounded-bl-sm border border-border bg-muted/60 p-3 text-sm">
                <h3 className="text-sm font-bold leading-tight">{s.title}</h3>
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.body}</p>
              </div>
            </div>

            {/* Progress dots */}
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {tour.steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? `w-6 ${m.accent}` : i < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                onClick={step === 0 ? onSkip : onPrev}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                {step === 0 ? "Skip · don't show again" : (<><ChevronLeft className="h-3.5 w-3.5" /> Back</>)}
              </button>
              <button
                onClick={onSkip}
                className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                title="Don't show this again"
              >
                {step + 1} / {tour.steps.length} · don't show again
              </button>
              <button
                onClick={onNext}
                className={`flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-bold shadow-lg ${m.accent}`}
              >
                {isLast ? "Got it 🎉" : (<>Next <ChevronRight className="h-3.5 w-3.5" /></>)}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mascot-float {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-6px) rotate(2deg); }
        }
      `}</style>
    </div>
  );
}
