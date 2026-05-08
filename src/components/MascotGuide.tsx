import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X, Minimize2, Sparkles } from "lucide-react";
import { MASCOTS, TOURS, type Tour, type TourAudience } from "@/lib/tours";
import { useAuth } from "@/hooks/useAuth";
import { useTutorialMode } from "@/lib/tutorialMode";

const LS_PREFIX = "pbl_tour_v3_";
/** key per (user, tour) so it doesn't repeat across accounts/devices logged-in. */
function storageKey(uid: string | null | undefined, id: string) {
  return `${LS_PREFIX}${uid || "guest"}_${id}`;
}

type Ctx = {
  startTour: (id: keyof typeof TOURS, force?: boolean) => void;
  triggerOnce: (id: keyof typeof TOURS) => void;
  markSeen: (id: keyof typeof TOURS) => void;
  hasSeen: (id: keyof typeof TOURS) => boolean;
  /** Wipe all "don't show again" flags for current user — used by Replay menu. */
  resetAllSeen: () => void;
};

const TourCtx = createContext<Ctx>({} as Ctx);
export function useTour() { return useContext(TourCtx); }

/** Resolve the viewer's audience role for tour gating. */
function resolveAudience(profile: { is_seller?: boolean } | null): "buyer" | "seller" {
  return profile?.is_seller ? "seller" : "buyer";
}

function audienceMatches(tour: Tour, role: "buyer" | "seller"): boolean {
  if (tour.audience === "any") return true;
  return tour.audience === role;
}

export function MascotTourProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const tutorial = useTutorialMode();
  const role = resolveAudience(profile);
  const uid = user?.id;

  const [active, setActive] = useState<Tour | null>(null);
  const [step, setStep] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const hasSeen = useCallback((id: string) => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(storageKey(uid, id));
  }, [uid]);

  const markSeen = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey(uid, id), "1");
  }, [uid]);

  const startTour = useCallback((id: string, force = false) => {
    if (tutorial) return;
    const tour = TOURS[id]; if (!tour) return;
    // Audience gate: never show the wrong tour to the wrong user.
    if (!audienceMatches(tour, role)) return;
    if (!force && hasSeen(id)) return;
    setActive(tour); setStep(0); setMinimized(false);
  }, [hasSeen, role, tutorial]);

  const triggerOnce = useCallback((id: string) => {
    if (hasSeen(id)) return;
    startTour(id);
  }, [hasSeen, startTour]);

  const resetAllSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    const prefix = `${LS_PREFIX}${uid || "guest"}_`;
    Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
  }, [uid]);

  const close = useCallback((persist: boolean) => {
    if (persist && active) markSeen(active.id);
    setActive(null); setStep(0); setMinimized(false);
  }, [active, markSeen]);

  const value = useMemo<Ctx>(() => ({ startTour, triggerOnce, markSeen, hasSeen, resetAllSeen }),
    [startTour, triggerOnce, markSeen, hasSeen, resetAllSeen]);

  return (
    <TourCtx.Provider value={value}>
      {children}
      {!tutorial && active && (
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

/** Spotlight ring that follows the current step's target element. */
function useTargetRect(selector: string | undefined) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector || typeof window === "undefined") { setRect(null); return; }
    let raf = 0;
    const update = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      // Scroll into view once when newly targeted.
      try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch {}
      const r = el.getBoundingClientRect();
      setRect(r);
    };
    update();
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const interval = setInterval(update, 500); // re-poll for layout shifts
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, [selector]);
  return rect;
}

function MascotBubble({
  tour, step, minimized,
  onMinimize, onMaximize, onPrev, onNext, onSkipTemp, onDontShow,
}: {
  tour: Tour; step: number; minimized: boolean;
  onMinimize: () => void; onMaximize: () => void;
  onPrev: () => void; onNext: () => void;
  onSkipTemp: () => void; onDontShow: () => void;
}) {
  const m = MASCOTS[tour.mascot];
  const s = tour.steps[step];
  const isLast = step >= tour.steps.length - 1;
  const targetRect = useTargetRect(!minimized ? s.target : undefined);

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
    <>
      {/* Spotlight overlay — punches a hole over the target element */}
      <div className="pointer-events-none fixed inset-0 z-40">
        {targetRect ? (
          <>
            {/* Dim everything except the target rect */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
              style={{
                clipPath: `polygon(
                  0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                  ${targetRect.left - 8}px ${targetRect.top - 8}px,
                  ${targetRect.left - 8}px ${targetRect.bottom + 8}px,
                  ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
                  ${targetRect.right + 8}px ${targetRect.top - 8}px,
                  ${targetRect.left - 8}px ${targetRect.top - 8}px
                )`,
              }}
            />
            {/* Pulsing ring around the target */}
            <div
              className="absolute rounded-2xl ring-4 ring-fuchsia-400/80 shadow-[0_0_40px_rgba(236,72,153,0.6)] animate-pulse"
              style={{
                left: targetRect.left - 8,
                top: targetRect.top - 8,
                width: targetRect.width + 16,
                height: targetRect.height + 16,
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-24 pt-6 sm:items-center sm:pb-6 animate-fade-in" style={{ pointerEvents: "none" }}>
        <div className="relative w-full max-w-sm" style={{ pointerEvents: "auto" }}>
          <div className={`absolute -inset-1 rounded-3xl bg-gradient-to-br ${m.glow} opacity-60 blur-xl`} />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-border/50 bg-background/40 px-3 py-2 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                {m.name} · Tour
              </div>
              <div className="flex items-center gap-1">
                <button onClick={onMinimize} aria-label="Minimize" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={onSkipTemp} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="px-5 pb-4 pt-5">
              <div className="flex items-end gap-3">
                <div className={`relative flex-shrink-0 rounded-2xl bg-gradient-to-br ${m.glow} p-1`}>
                  <img
                    src={m.image} alt={m.name} width={120} height={120} loading="lazy"
                    className="h-28 w-28 object-contain drop-shadow-2xl"
                    style={{ animation: "mascot-float 3s ease-in-out infinite" }}
                  />
                </div>
                <div className="relative flex-1 rounded-2xl rounded-bl-sm border border-border bg-muted/60 p-3 text-sm">
                  <h3 className="text-sm font-bold leading-tight">{s.title}</h3>
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.body}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5">
                {tour.steps.map((_, i) => (
                  <div key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step ? `w-6 ${m.accent}` : i < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted"
                    }`} />
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button onClick={step === 0 ? onSkipTemp : onPrev}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">
                  {step === 0 ? "Skip for now" : (<><ChevronLeft className="h-3.5 w-3.5" /> Back</>)}
                </button>
                <button onClick={onNext}
                  className={`flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-bold shadow-lg ${m.accent}`}>
                  {isLast ? "Got it 🎉" : (<>Next <ChevronRight className="h-3.5 w-3.5" /></>)}
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{step + 1} / {tour.steps.length}</span>
                <button onClick={onDontShow} className="font-semibold underline-offset-2 hover:underline">
                  Don't show this again
                </button>
              </div>
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
    </>
  );
}

/** Helper: explicit no-op so other modules can typecheck imports if needed. */
export const __TourAudience: TourAudience | null = null;
