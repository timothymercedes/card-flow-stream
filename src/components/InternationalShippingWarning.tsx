import { useState } from "react";
import { AlertTriangle, Globe2, X } from "lucide-react";
import { INTL_WARNING_BULLETS, hasIntlAck, setIntlAck } from "@/lib/internationalShipping";

interface InlineProps {
  buyerCountry?: string | null;
  sellerCountry?: string | null;
  variant?: "compact" | "full";
  className?: string;
}

/** Inline always-visible warning banner shown next to bid/buy/offer controls. */
export function IntlWarningBanner({ buyerCountry, sellerCountry, variant = "compact", className = "" }: InlineProps) {
  const buyer = (buyerCountry || "US").toUpperCase();
  const seller = (sellerCountry || "US").toUpperCase();
  if (buyer === seller) return null;
  return (
    <div className={`rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 ${className}`}>
      <div className="flex items-start gap-2">
        <Globe2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">International order ({seller} → {buyer})</p>
          {variant === "compact" ? (
            <p className="text-amber-200/90">
              Customs duties, VAT, tariffs, or import fees may apply and are not charged by PullBid Live. Delivery may take longer.
            </p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-4 text-amber-200/90">
              {INTL_WARNING_BULLETS.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onAcknowledge: () => void;
  buyerCountry?: string | null;
  sellerCountry?: string | null;
  actionLabel?: string;
}

/** Acknowledgment modal — required before bid/checkout/offer when international. */
export function IntlShippingAckModal({ open, onClose, onAcknowledge, buyerCountry, sellerCountry, actionLabel = "I understand, continue" }: ModalProps) {
  const [checked, setChecked] = useState(false);
  if (!open) return null;
  const buyer = (buyerCountry || "US").toUpperCase();
  const seller = (sellerCountry || "US").toUpperCase();
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-bold">International order</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          This order ships from <b>{seller}</b> to <b>{buyer}</b>. Please review before continuing:
        </p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-foreground/90 mb-4">
          {INTL_WARNING_BULLETS.map((b) => <li key={b}>{b}</li>)}
        </ul>
        <label className="flex items-start gap-2 text-xs text-foreground/90 mb-4 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            I understand I'm responsible for any customs duties, VAT, tariffs, or import fees required by my country, and that delivery may take longer than domestic shipping.
          </span>
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={!checked}
            onClick={() => { onAcknowledge(); onClose(); }}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wrap an action handler so an international acknowledgment modal pops up first.
 * Remembers ack per-scope (e.g. listing id) so users aren't re-prompted on every bid.
 */
export function useIntlAck(scope: string, buyerCountry?: string | null, sellerCountry?: string | null) {
  const buyer = (buyerCountry || "US").toUpperCase();
  const seller = (sellerCountry || "US").toUpperCase();
  const isIntl = buyer !== seller;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);

  function gate(action: () => void) {
    if (!isIntl || hasIntlAck(scope)) { action(); return; }
    setPending(() => action);
    setOpen(true);
  }
  function acknowledge() {
    setIntlAck(scope);
    pending?.();
    setPending(null);
  }
  return {
    isIntl,
    gate,
    modal: (
      <IntlShippingAckModal
        open={open}
        onClose={() => { setOpen(false); setPending(null); }}
        onAcknowledge={acknowledge}
        buyerCountry={buyer}
        sellerCountry={seller}
      />
    ),
  };
}
