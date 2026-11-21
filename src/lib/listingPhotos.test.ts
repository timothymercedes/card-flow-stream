import { describe, it, expect } from "vitest";
import { validateListingPhotos, makeCover, movePhoto, listingGallery } from "./listingPhotos";

const u = (n: number) => `https://x.supabase.co/storage/v1/object/public/listing-images/u/${n}.jpg`;

describe("listing photo rules", () => {
  it("requires at least 2 photos", () => {
    expect(validateListingPhotos([u(1)])).toMatch(/at least 2/);
    expect(validateListingPhotos([u(1), u(2)])).toBeNull();
  });
  it("allows up to 10 photos but not 11", () => {
    expect(validateListingPhotos(Array.from({ length: 10 }, (_, i) => u(i)))).toBeNull();
    expect(validateListingPhotos(Array.from({ length: 11 }, (_, i) => u(i)))).toMatch(/at most 10/);
  });
  it("rejects AI-generated images", () => {
    expect(validateListingPhotos([u(1), "https://x.co/ai-generated/card.png"])).toMatch(/AI/);
  });
  it("reorders and sets cover", () => {
    expect(makeCover([u(1), u(2), u(3)], 2)).toEqual([u(3), u(1), u(2)]);
    expect(movePhoto([u(1), u(2)], 0, 1)).toEqual([u(2), u(1)]);
  });
  it("reads stored gallery with front/back fallback", () => {
    expect(listingGallery({ product_details: { photos: [u(1), u(2), u(3)] } })).toHaveLength(3);
    expect(listingGallery({ image_url: u(1), back_image_url: u(2), product_details: {} })).toEqual([u(1), u(2)]);
  });
});
