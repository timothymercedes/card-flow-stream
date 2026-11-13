import { Link } from '@tanstack/react-router';
import { ImageIcon } from 'lucide-react';
import type { ShoppingListing } from '@/lib/categoryShoppingData';
import { getListingPriceDisplay } from '@/lib/listingDisplay';

export function CategoryListingCard({ listing }: { listing: ShoppingListing }) {
  const display = getListingPriceDisplay(listing, true);
  return <Link to="/market/$id" params={{ id: listing.id }} className="group min-w-0 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)] ring-1 ring-border/60 transition hover:ring-primary/50">
    <div className="relative aspect-square overflow-hidden bg-muted">
      {listing.image_url ? <img src={listing.image_url} alt={listing.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105"/> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground"/></div>}
      {listing.is_auction && <span className="absolute bottom-2 right-2 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">AUCTION</span>}
    </div>
    <div className="p-2.5">
      <p className="line-clamp-2 min-h-10 text-sm font-semibold">{listing.title}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{listing.storefront_name || listing.storefront_username || 'Seller'}</p>
      <p className="mt-1 text-sm font-bold text-primary">{display.label} {display.suffix}</p>
      {listing.product_details?.condition && <p className="mt-1 text-[10px] text-muted-foreground">{listing.product_details.condition}</p>}
    </div>
  </Link>;
}