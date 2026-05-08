import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SELLER_AGREEMENT_VERSION } from "@/lib/legal";
import { useSellerAgreementStatus } from "@/hooks/useSellerAgreementStatus";
import { useTutorialMode } from "@/lib/tutorialMode";

/**
 * Blocks seller / host features (sell, payouts, go live, hosting, Flex)
 * until the user accepts the latest Seller / Host Agreement.
 * Renders nothing for buyers / unverified users.
 */
export function SellerAgreementGate({ children }: { children: React.ReactNode }) {
  const { loading, needsAcceptance, isSellerOrHost, refresh } = useSellerAgreementStatus();
  const tutorial = useTutorialMode();
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  if (tutorial) return <>{children}</>;
  if (loading) return null;
  if (!isSellerOrHost || !needsAcceptance) return <>{children}</>;

  async function accept() {
    setSaving(true);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
    const { error } = await (supabase.rpc as any)("accept_seller_agreement", {
      _version: SELLER_AGREEMENT_VERSION,
      _user_agent: ua,
    });
    if (error) {
      toast.error("Couldn't save agreement. Please try again.");
      setSaving(false);
      return;
    }
    await refresh();
    toast.success("Thanks — you're cleared to host & sell.");
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[290] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-card border border-border shadow-2xl max-h-[95vh]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid h-10 w-10 place-content-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold">Seller & Live Host Agreement</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Required before selling, going live, hosting auctions, or receiving payouts.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-muted-foreground">
            Please review and accept the Seller & Live Host Agreement. This covers shipping,
            prohibited items & counterfeits, scam/fraud rules, livestream conduct,
            AI moderation & recording disclosure, payouts, chargebacks, and suspension policy.
          </p>

          <div className="mt-3">
            <Link
              to="/legal/seller-host-agreement"
              target="_blank"
              className="inline-block rounded-full border border-border px-3 py-1.5 text-xs text-primary underline"
            >
              Read the full Seller & Host Agreement →
            </Link>
          </div>

          <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span className="text-sm">
              I have read and agree to the{" "}
              <Link to="/legal/seller-host-agreement" target="_blank" className="text-primary underline">
                Seller & Host Agreement
              </Link>
              , including livestream conduct rules, AI moderation & recording, and payout/dispute policies.
            </span>
          </label>
        </div>

        <div className="space-y-2 border-t border-border px-5 py-4">
          <button
            disabled={!agree || saving}
            onClick={accept}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {saving ? "Saving…" : "Accept & Continue"}
          </button>
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
