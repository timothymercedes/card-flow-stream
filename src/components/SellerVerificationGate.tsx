import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, ExternalLink, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useTutorialMode } from "@/lib/tutorialMode";
import {
  createConnectOnboardingLink,
  syncConnectAccountStatus,
} from "@/lib/stripe-connect.functions";
import { toast } from "sonner";

/**
 * Blocks seller features (sell, payouts, go live) until Stripe Connect
 * identity verification (KYC) is complete — i.e. the seller's Stripe
 * Connect account has charges_enabled, payouts_enabled, and
 * details_submitted all true.
 *
 * Pairs with SellerAgreementGate (legal acceptance).
 */
export function SellerVerificationGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const tutorial = useTutorialMode();
  const [checking, setChecking] = useState(true);
  const [verified, setVerified] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const createLink = useServerFn(createConnectOnboardingLink);
  const sync = useServerFn(syncConnectAccountStatus);

  useEffect(() => {
    if (tutorial) {
      setVerified(true);
      setChecking(false);
      return;
    }
    if (loading) return;
    if (!user) {
      setChecking(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("stripe_accounts" as any)
        .select("charges_enabled, payouts_enabled, details_submitted")
        .eq("seller_id", user.id)
        .maybeSingle();
      const sa = (data as any) ?? {};
      setVerified(!!(sa.charges_enabled && sa.payouts_enabled && sa.details_submitted));
      setSubmitted(!!sa.details_submitted);
      setChecking(false);
    })();
  }, [user, loading, tutorial]);

  if (tutorial) return <>{children}</>;
  if (loading || checking) return null;
  if (!user) return <>{children}</>;
  if (verified) return <>{children}</>;

  async function startOnboarding() {
    setBusy(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const path = typeof window !== "undefined" ? window.location.pathname : "/sell";
      const res = await createLink({
        data: {
          returnUrl: `${origin}${path}?connect=return`,
          refreshUrl: `${origin}${path}?connect=refresh`,
        },
      });
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e?.message || "Couldn't start verification");
      setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    try {
      const res: any = await sync({ data: undefined as any });
      if (res?.charges_enabled && res?.payouts_enabled && res?.details_submitted) {
        setVerified(true);
        toast.success("Verification confirmed");
      } else {
        toast.message("Stripe still needs more info to verify you");
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't refresh status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-card border border-border shadow-2xl max-h-[95vh]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid h-10 w-10 place-content-center rounded-full bg-primary/15 text-primary">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold">Identity verification required</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Verify your identity with Stripe to start selling, going live, and receiving payouts.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm space-y-3">
          <p className="text-muted-foreground">
            All sellers must complete Stripe identity verification (KYC) before:
          </p>
          <ul className="space-y-1.5 text-xs">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Listing items for sale</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Starting a live stream or hosting auctions</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Receiving payouts</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            This protects buyers, sellers, and the platform from fraud, chargebacks, and payout abuse. Takes ~2 minutes.
          </p>
          {submitted && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              You've submitted info to Stripe. They may still be reviewing — tap <strong>Refresh status</strong> after a minute.
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-border px-5 py-4">
          <button
            disabled={busy}
            onClick={startOnboarding}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {busy ? "Opening Stripe…" : submitted ? "Continue verification" : "Verify with Stripe"}
          </button>
          {submitted && (
            <button
              disabled={busy}
              onClick={refreshStatus}
              className="w-full rounded-xl border border-border py-2 text-xs font-semibold text-foreground disabled:opacity-50"
            >
              Refresh status
            </button>
          )}
          <Link
            to="/"
            className="block w-full rounded-xl border border-border py-2 text-center text-xs text-muted-foreground hover:bg-muted"
          >
            Not now — back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
