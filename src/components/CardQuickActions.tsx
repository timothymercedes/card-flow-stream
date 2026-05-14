/**
 * CardQuickActions — hover (desktop) / long-press (mobile) overlay with quick
 * actions (Follow · Bookmark · Share · Preview) on a feed/live/market card.
 *
 * Wrap any card body inside <CardQuickActions ...><Card /></CardQuickActions>.
 * The wrapper handles activation; an absolutely-positioned overlay renders on
 * top with the action buttons. All callbacks/props are optional — only the
 * ones provided are rendered. Touch users get a 450ms long-press (no
 * navigation triggered while the overlay is up) and tap-outside dismisses.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Bookmark, Eye, Share2, UserPlus } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { BookmarkButton } from "@/components/BookmarkButton";

export function CardQuickActions({
  children,
  sellerId,
  sellerUsername,
  showId,
  onShare,
  previewHref,
  className = "",
}: {
  children: ReactNode;
  sellerId?: string;
  sellerUsername?: string;
  showId?: string;
  onShare?: () => void;
  previewHref?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);

  // Tap outside to dismiss
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  function startPress() {
    moved.current = false;
    pressTimer.current = setTimeout(() => {
      setOpen(true);
      // Haptic if supported
      if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
        try { (navigator as any).vibrate(15); } catch {}
      }
    }, 450);
  }
  function endPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  // Block child link/button activation while overlay is up
  function blockIfOpen(e: React.MouseEvent) {
    if (open) { e.preventDefault(); e.stopPropagation(); }
  }

  return (
    <div
      ref={wrapRef}
      className={`group relative ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={() => { moved.current = true; endPress(); }}
      onTouchCancel={endPress}
      onClickCapture={blockIfOpen}
    >
      {children}

      {/* Overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm transition-opacity duration-150 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div
          className={`pointer-events-auto flex items-center gap-1.5 rounded-full bg-card/95 p-1.5 shadow-2xl ring-1 ring-border ${
            open ? "scale-100" : "scale-90"
          } transition-transform duration-150`}
          onClick={(e) => e.stopPropagation()}
        >
          {sellerId && (
            <div className="flex items-center">
              <FollowButton sellerId={sellerId} variant="icon" />
            </div>
          )}
          {showId && (
            <div className="flex items-center">
              <BookmarkButton showId={showId} compact />
            </div>
          )}
          {onShare && (
            <button
              type="button"
              onClick={() => { onShare(); setOpen(false); }}
              aria-label="Share"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground hover:bg-primary hover:text-primary-foreground"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
          {previewHref && (
            <a
              href={previewHref}
              aria-label="Preview"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
            >
              <Eye className="h-3.5 w-3.5" />
            </a>
          )}
          {sellerUsername && (
            <a
              href={`/seller/${sellerUsername}`}
              aria-label={`@${sellerUsername}`}
              onClick={() => setOpen(false)}
              className="flex h-8 items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] font-bold hover:bg-primary hover:text-primary-foreground"
            >
              <UserPlus className="h-3 w-3" />@{sellerUsername}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
