import { validateListingImage } from "@/lib/listingDisplay";

/** Sale/trade listings need real photos: at least 2, at most 10. */
export const MIN_LISTING_PHOTOS = 2;
export const MAX_LISTING_PHOTOS = 10;

export function validateListingPhotos(photos: string[]): string | null {
  if (photos.length < MIN_LISTING_PHOTOS) return `Add at least ${MIN_LISTING_PHOTOS} real photos of the item.`;
  if (photos.length > MAX_LISTING_PHOTOS) return `Use at most ${MAX_LISTING_PHOTOS} photos per item.`;
  for (let i = 0; i < photos.length; i++) {
    const err = validateListingImage(photos[i], { field: `Photo ${i + 1}` });
    if (err) return err;
  }
  return null;
}

export function movePhoto(photos: string[], from: number, to: number): string[] {
  if (from < 0 || from >= photos.length || to < 0 || to >= photos.length) return photos;
  const next = [...photos];
  const [p] = next.splice(from, 1);
  next.splice(to, 0, p!);
  return next;
}

/** Make the chosen photo the cover (first position). */
export function makeCover(photos: string[], index: number): string[] {
  return movePhoto(photos, index, 0);
}

/** Read a listing's gallery: stored photos, falling back to front/back images. */
export function listingGallery(l: { image_url?: string | null; back_image_url?: string | null; product_details?: unknown }): string[] {
  const pd = l.product_details as { photos?: unknown } | null | undefined;
  const stored = Array.isArray(pd?.photos) ? (pd!.photos as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)) : [];
  if (stored.length) return stored.slice(0, MAX_LISTING_PHOTOS);
  return [l.image_url, l.back_image_url].filter((u): u is string => !!u);
}
