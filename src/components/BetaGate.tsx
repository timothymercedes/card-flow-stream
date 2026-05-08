import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTutorialMode } from "@/lib/tutorialMode";

const COOKIE = "pbl_beta";
const STORAGE_KEY = "pbl_beta_access";

export const BETA_MODE_ENABLED =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_BETA_MODE === "true") ||
  false;

function hasBetaAccess(): boolean {
  if (typeof document === "undefined") return false;
  const hasCookie = document.cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE}=1`));
  const hasStorage = window.localStorage.getItem(STORAGE_KEY) === "1";
  return hasCookie || hasStorage;
}

function persistBetaAccess() {
  if (typeof document === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "1");
  document.cookie = `${COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; Secure; SameSite=None`;
}

/**
 * Beta gate — shown only in beta mode for authenticated users without a beta cookie.
 * Public marketing pages (no logged-in user) remain accessible.
 */
export function BetaGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const tutorial = useTutorialMode();
  const [hasCookie, setHasCookie] = useState<boolean>(() => hasBetaAccess());
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHasCookie(hasBetaAccess());
  }, [user?.id]);

  if (!BETA_MODE_ENABLED) return <>{children}</>;
  if (loading) return <>{children}</>;
  // Public marketing — only logged-in app is gated
  if (!user) return <>{children}</>;
  // Tutorial mode (admin-only) bypasses the gate
  if (tutorial) return <>{children}</>;
  if (hasCookie) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password && !code) {
      setError("Enter the beta password or your invite code.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/public/beta-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.ok) {
        setError(json.error || "Invalid password or invite code");
        setSubmitting(false);
        return;
      }
      persistBetaAccess();
      setHasCookie(true);
      setSubmitting(false);
    } catch {
      setError("Network error — try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-500">
          ● Private Beta
        </div>
        <h1 className="mb-1 text-xl font-bold">Pull Bid Live — Beta Access</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          This environment is invite-only while we test. Enter your beta password or invite code to continue.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Beta password</label>
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </div>
          <div className="text-center text-[11px] uppercase text-muted-foreground">or</div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Invite code</label>
            <input
              type="text"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono tracking-wider"
              placeholder="ABCD-1234"
            />
          </div>
          {error ? <div className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Checking…" : "Enter beta"}
          </button>
          <button
            type="button"
            onClick={async () => {
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
