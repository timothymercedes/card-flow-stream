import { Link } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { FINAL_SALE_NOTICE_TEXT, FINAL_SALE_POLICY_VERSION } from "@/lib/policy";

interface Props {
  variant?: "full" | "compact" | "inline";
  context?: "checkout" | "bid" | "instant_win" | "offer" | "payment" | "receipt";
  className?: string;
}

const CTX_VERB: Record<NonNullable<Props["context"]>, string> = {
  checkout: "completing this purchase",
  bid: "placing this bid",
  instant_win: "claiming this instant win",
  offer: "accepting this offer",
  payment: "submitting payment",
  receipt: "completing this transaction",
};

export function FinalSaleNotice({ variant = "full", context = "checkout", className = "" }: Props) {
  if (variant === "inline") {
    return (
      <p className={`text-[10px] leading-snug text-muted-foreground ${className}`}>
        By {CTX_VERB[context]}, you agree to our{" "}
        <Link to="/legal/important-notice" className="font-semibold text-primary underline-offset-2 hover:underline">
          Final Sale &amp; Buyer Protection policy
        </Link>
        . All sales are final unless approved by the seller or platform admins.
      </p>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300 ${className}`}
      >
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-bold">All sales final.</span> By {CTX_VERB[context]} you accept the{" "}
          <Link to="/legal/important-notice" className="underline underline-offset-2">
            Buyer Protection policy
          </Link>
          .
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 ${className}`}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1.5">
          <p className="font-bold">Final Sale &amp; Buyer Protection</p>
          <p className="leading-snug">{FINAL_SALE_NOTICE_TEXT}</p>
          <ul className="ml-4 list-disc space-y-0.5 leading-snug">
            <li>Cancellation requests require seller approval or admin intervention.</li>
            <li>Unauthorized chargebacks may result in account penalties.</li>
            <li>Buyer Protection claims are reviewed case-by-case.</li>
            <li>Shipping insurance does not guarantee an automatic refund.</li>
          </ul>
          <p className="text-[10px] opacity-80">
            By {CTX_VERB[context]} you acknowledge and agree to these terms (policy v{FINAL_SALE_POLICY_VERSION}).{" "}
            <Link to="/legal/important-notice" className="font-semibold underline underline-offset-2">
              Read full policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export function BuyerProtectionBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 ${className}`}
    >
      <ShieldCheck className="h-3 w-3" /> Buyer Protection
    </span>
  );
}
