/**
 * useAuthGate — global guest-action gate.
 *
 * Wrap the app in <AuthGateProvider />. From any component, call:
 *   const { requireAuth } = useAuthGate();
 *   if (!requireAuth("bid")) return;        // pops modal, halts action
 *
 * Returns `true` when the user is signed in (caller proceeds), `false`
 * when guest (modal opens, caller aborts). The modal preserves the current
 * URL so OAuth / email signin returns the user to the exact page they were
 * on (live stream, listing, profile, etc.).
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AuthGateModal } from "@/components/AuthGateModal";

type Ctx = {
  /** Returns true if signed in. Otherwise opens the modal and returns false. */
  requireAuth: (action?: string) => boolean;
  /** Imperatively open the modal (e.g. for explicit "Sign in" buttons). */
  openAuthGate: (action?: string) => void;
  closeAuthGate: () => void;
};

const AuthGateContext = createContext<Ctx | null>(null);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  const requireAuth = useCallback(
    (a?: string) => {
      if (user) return true;
      setAction(a ?? null);
      setOpen(true);
      return false;
    },
    [user],
  );

  const openAuthGate = useCallback((a?: string) => {
    setAction(a ?? null);
    setOpen(true);
  }, []);

  const closeAuthGate = useCallback(() => setOpen(false), []);

  return (
    <AuthGateContext.Provider value={{ requireAuth, openAuthGate, closeAuthGate }}>
      {children}
      <AuthGateModal open={open} onClose={closeAuthGate} action={action} />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate(): Ctx {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    // Safe fallback so components don't crash if provider isn't mounted yet.
    return {
      requireAuth: () => true,
      openAuthGate: () => {},
      closeAuthGate: () => {},
    };
  }
  return ctx;
}
