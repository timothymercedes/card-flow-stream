# Three-part fix: live cockpit polish + shipping auto-rates

## 1. Camera button on live auction opens the panel

In `src/routes/live.$id.tsx`:

- The compositor-seller path already calls `openHostCameraControls()` but it can be hidden behind `showSettings`. Update the camera button handler to also call `setShowSettings(false)` and force `setHostCameraPanelCollapsed(false)` so the editor always becomes visible.
- For non-compositor sellers (WebRTC mode), make the same camera button additionally open the host studio drawer (`setShowHostCameraEditor(true)`) after `setCallJoined(true)`, so a single tap reliably reveals the camera UI in both modes.
- Verify the icon button at line ~3324 is rendered for Flex sellers too (currently gated by `usingCompositor ? isSeller : !callJoined`).

## 2. Queue button — fix overlay + add quantity

In `src/routes/live.$id.tsx`:
- The "📋 Queue" FAB at `bottom-32 left-2` collides with bid controls and the rail. Move it to a non-conflicting slot: anchor it to the right side, above the bottom action bar (`bottom-44 right-2`, slightly smaller chip), and make the open drawer slide from that corner so it doesn't cover the live video.

In `src/components/AuctionQueuePanel.tsx`:
- Add a `quantity` field (default 1) to `draft` state and the add-form grid (4 columns: Start $, Sec, Buy-now, Qty).
- Persist as `quantity` column on `auction_queue` row insert; render `· x{qty}` in both host list rows and the viewer "Up next" strip when `qty > 1`.
- Migration: `ALTER TABLE public.auction_queue ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999);`

## 3. Auto shipping rates from Shippo across the platform

### New estimate server fn (no order required)

Add `estimateShippoRates` in `src/server/shippo.functions.ts`:
- Inputs: `sellerId`, `buyerCountry` (default from auth profile), optional `buyerZip`, `presetKey` (`stamp | pwe | bubble | small_box`), optional weight/dimension overrides.
- Resolves seller address from `profiles`, expands preset → parcel via `SHIPPING_PRESETS`.
- For untracked flat-rate presets (`stamp`, `pwe`) returns the flat USD price directly without calling Shippo.
- Otherwise calls Shippo `/shipments/` with `async: false`, returns the cheapest domestic rate + cheapest international rate (separated), plus `recommendedRateId`. International detection = `buyerCountry !== sellerCountry`.
- Validates with Zod, requires auth, but does NOT require seller ownership (any signed-in buyer can quote a rate).

### New `<ShippingEstimator>` component

`src/components/ShippingEstimator.tsx`:
- Props: `sellerId`, `presetKey`, optional weight/dimensions, optional buyer country override.
- Calls `estimateShippoRates` via `useServerFn` + react-query, debounced.
- Renders: live "$X.XX via USPS Ground Advantage" with international/domestic badge and a small "Updated from carrier rates" note. Shows skeleton while fetching, friendly error if seller address missing.
- Used by sell preview, marketplace listing, cart per-seller group, and live auction info card.

### Seller-facing change in `src/routes/sell.tsx`

- Replace the manual `shipping_price` numeric input with:
  1. Package preset dropdown (already-defined `SHIPPING_PRESETS`).
  2. Estimated weight (oz) — auto-filled from preset, editable.
  3. Optional dimensions (collapsed under "Advanced override").
  4. Auto-quoted rate preview using `<ShippingEstimator>` with the seller's own country as the buyer (gives a sample US rate) plus a sample international (CA) rate side-by-side.
- `shipping_price` stored on the listing becomes the *flat-rate fallback* used only for untracked presets; tracked presets save `shipping_preset` + `weight_oz` + `dimensions` and resolve real rates at quote time.
- Migration: add `shipping_preset text`, `weight_oz numeric`, `length_in numeric`, `width_in numeric`, `height_in numeric` to `listings` (nullable, no default break).

### Buyer-facing wiring

- `src/routes/market.$id.tsx`: replace static "Shipping $X" line with `<ShippingEstimator sellerId={...} presetKey={listing.shipping_preset ?? 'bubble'} weightOz={listing.weight_oz} />`.
- `src/routes/cart.tsx`: per seller group, sum item weights and pick the largest preset, render `<ShippingEstimator>` and feed the cents into the existing total.
- `src/routes/live.$id.tsx`: in the live auction info / pinned card area, surface `<ShippingEstimator>` for the current item using the same lookup.
- `src/routes/store.tsx` and `vault` flows: same treatment where a seller-level shipping line currently shows.

### Backwards compatibility

- `estimateShippingAndImportFees` in `src/lib/shippingEstimate.ts` stays as the offline fallback when Shippo is unreachable or seller address is missing — `<ShippingEstimator>` falls back to it on error and labels the result "Estimated".

---

## Technical notes
- Shippo key already wired (`SHIPPO_API_KEY` used by `getShippoRates`). No new secrets.
- New server fn is read-only; reuses existing `requireSupabaseAuth` middleware.
- All buyer flows already detect international via `getIntlContext`; we re-use that and pass through to the estimator badge.
- No changes to checkout fee math — `calculateFees` and the 4% intl fee logic remain untouched.

