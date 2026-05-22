/**
 * MarketQuickView — quick-view popup for a marketplace listing.
 * Opens on card click so buyers don't need to fully navigate to read details,
 * and surfaces a "Follow" suggestion next to the seller name/store (hidden
 * automatically if the viewer already follows).
 */
import { Link } from "@tanstack/react-router";
import { Clock, Flame, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { SellerBadge } from "@/components/SellerBadge";
import { FollowSuggestion } from "@/components/FollowSuggestion";
import { getListingPriceDisplay } from "@/lib/listingDisplay";
import { categoryEmoji, categoryLabel } from "@/lib/listingCategories";

function fmtRemain(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

export function MarketQuickView({
  listing,
  open,
  onOpenChange,
}: {
  listing: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!listing) return null;
  const display = getListingPriceDisplay(listing);
  const remain = fmtRemain(listing.is_auction ? listing.auction_ends_at : listing.expires_at);
  const hot = listing.is_auction && (listing.current_bid || 0) > (listing.starting_bid || 0);
  const soldOut = !listing.is_auction && Number(listing.sold_count ?? 0) >= Number(listing.quantity ?? 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0 max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">{listing.title}</DialogTitle>
        <div className="overflow-y-auto overscroll-contain">
        <div className="relative aspect-square w-full overflow-hidden bg-muted">

          {listing.image_url ? (
            <img src={listing.image_url} alt={listing.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />
          )}
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {hot && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                <Flame className="h-3 w-3" /> Hot
              </span>
            )}
            {listing.is_auction && (
              <span className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-primary-foreground">AUCTION</span>
            )}
          </div>
          {listing.category && (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              {categoryEmoji(listing.category)} {categoryLabel(listing.category)}
            </span>
          )}
          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="rounded-full bg-destructive px-4 py-1.5 text-sm font-extrabold text-white">SOLD OUT</span>
            </div>
          )}
        </div>

        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-lg font-bold leading-tight">{listing.title}</h2>
            {listing.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{listing.description}</p>
            )}
          </div>

          {/* Seller row with Follow suggestion */}
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 ring-1 ring-border/60">
            <SellerBadge sellerId={listing.seller_id} size="md" />
            <FollowSuggestion userId={listing.seller_id} size="sm" />
          </div>

          <div className="flex items-center justify-between gap-2">
            {display.kind === "price" ? (
              <p className="text-xl font-bold text-primary">
                {display.label}
                {display.suffix && <span className="ml-1 text-xs font-normal text-muted-foreground">{display.suffix}</span>}
              </p>
            ) : display.kind === "offer" ? (
              <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">Accepts Offers</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {listing.condition && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{listing.condition}</span>
            )}
          </div>

          {remain && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> {remain}
            </p>
          )}

          <Link
            to="/market/$id"
            params={{ id: listing.id }}
            onClick={() => onOpenChange(false)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-90"
          >
            View full listing <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
