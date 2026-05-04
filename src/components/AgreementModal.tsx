import { ReactNode, useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Rendered inside a scroll container. Use plain JSX with prose-style elements. */
  children: ReactNode;
  /** Label on the agree checkbox. */
  agreeLabel: string;
  /** Primary CTA label, default "I Agree & Continue". */
  acceptLabel?: string;
  /** If true, modal cannot be dismissed without accepting (no X, no overlay-close). */
  required?: boolean;
  onAccept: () => void | Promise<void>;
  onDismiss?: () => void;
  loading?: boolean;
};

/**
 * Reusable in-app legal agreement modal.
 * Forces user to scroll to the bottom AND tick the checkbox before they can accept.
 */
export function AgreementModal({
  open, title, subtitle, children, agreeLabel,
  acceptLabel = "I Agree & Continue",
  required = false, onAccept, onDismiss, loading = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!open) { setScrolledToEnd(false); setChecked(false); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current; if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledToEnd(true);
    };
    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  if (!open) return null;
  const canAccept = scrolledToEnd && checked && !loading;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="flex w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl bg-card border border-border shadow-2xl max-h-[92vh]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {!required && onDismiss && (
            <button onClick={onDismiss} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-bold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_p]:my-2 [&_strong]:font-semibold"
        >
          {children}
          <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            {scrolledToEnd ? "✓ You've reached the end. Tick the box below to continue." : "Scroll to the bottom to enable acceptance."}
          </div>
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <label className={`flex items-start gap-2 text-xs ${scrolledToEnd ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              disabled={!scrolledToEnd}
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>{agreeLabel}</span>
          </label>
          <button
            disabled={!canAccept}
            onClick={() => onAccept()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {loading ? "Saving…" : acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
