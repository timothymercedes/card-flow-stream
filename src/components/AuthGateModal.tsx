/**
 * AuthGateModal — guest-friendly signup/signin popup.
 *
 * Opened by useAuthGate().requireAuth(action) when a guest taps a restricted
 * action (bid, follow, comment, like, message, buy). Preserves the current
 * URL: OAuth redirect_uri = window.location.href, and the email path links
 * to /auth?returnTo=<currentURL> so signin returns to the same page/stream
 * the user was on.
 */
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Mail, X } from "lucide-react";
import logo from "@/assets/logo.png";
import { beginSocialSignIn } from "@/lib/socialAuthFlow";

export function AuthGateModal({
  open,
  onClose,
  action,
}: {
  open: boolean;
  onClose: () => void;
  action?: string | null;
}) {
  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const returnTo = typeof window !== "undefined" ? window.location.href : "/";

  async function oauth(provider: "google" | "apple") {
    try {
      const result = await beginSocialSignIn(provider, returnTo);
      if (result.status === "completed") onClose();
    } catch (e: any) {
      toast.error(e?.message || "Sign-in failed");
    }
  }

  const subtitle = action
    ? `Sign in to ${action}, follow collectors, and join live auctions.`
    : "Bid in live auctions, follow collectors, and save your favorite cards.";

  const authHref = `/auth?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="authgate-title"
      className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl border border-border bg-card p-6 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="h-10 w-10 object-contain" />
            <div>
              <p id="authgate-title" className="text-base font-black tracking-tight">
                Join PullBid Live
              </p>
              <p className="text-[11px] text-muted-foreground">It's free — takes 10 seconds.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">{subtitle}</p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => oauth("google")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-background py-3 text-sm font-bold ring-1 ring-border hover:bg-muted"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => oauth("apple")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-bold text-background hover:opacity-90"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>

          <Link
            to="/auth"
            search={{ returnTo } as any}
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Mail className="h-4 w-4" /> Sign up with email
          </Link>

          <Link
            to="/auth"
            search={{ returnTo, mode: "signin" } as any}
            onClick={onClose}
            className="block w-full pt-2 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Already have an account? <span className="font-semibold text-primary">Log in</span>
          </Link>
        </div>

        <button
          onClick={onClose}
          className="mt-4 block w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
        >
          Continue browsing as guest
        </button>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
          By continuing you agree to our{" "}
          <a href="/legal/tos" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Terms</a>
          {" "}and{" "}
          <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
