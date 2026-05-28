/**
 * ShareButton — drop-in share trigger for any entity on PullBidLive.
 *
 * Usage:
 *   <ShareButton entity={{ kind: "listing", id: l.id, title: l.title, price: l.price, image: l.cover_url }} />
 *   <ShareButton entity={{ kind: "storefront", username: "tcg_pete" }} variant="icon" />
 */
import { useState, type ReactNode } from "react";
import { Share2 } from "lucide-react";
import { ShareSheet } from "@/components/ShareSheet";
import type { ShareEntity } from "@/lib/shareEntity";

type Variant = "icon" | "pill" | "ghost";

export function ShareButton({
  entity,
  variant = "icon",
  label = "Share",
  className = "",
  children,
}: {
  entity: ShareEntity;
  variant?: Variant;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const base =
    variant === "icon"
      ? "inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-foreground hover:bg-muted"
      : variant === "ghost"
      ? "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      : "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90";

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className={`${base} ${className}`}
      >
        {children ?? (
          <>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {variant !== "icon" && <span>{label}</span>}
          </>
        )}
      </button>
      <ShareSheet open={open} onClose={() => setOpen(false)} entity={entity} />
    </>
  );
}
