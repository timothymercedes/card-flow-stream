# Plan: Fix listing image errors + Vault→Listing flow

## Problem
1. Listings can be submitted with missing/invalid image URLs (data URI strings, blank values, or vault visualization images), producing the `image_url` validation error.
2. The current "Sell from Vault" flow reuses the **vault photo** as the marketplace photo — your requirement says vault/AI images must never be used as the sale photo.
3. After scanning a card with "Sell Item" checked, the user is dropped on the vault list with no automatic listing modal.
4. The `sell.tsx` and `vault.tsx` listing forms don't share a single prefill path, so vault metadata (set, number, rarity, language, grading, year) isn't carried into a richer listing form.

## Scope of changes

### 1. Image validation hardening (fixes the reported error)
- Add a single `validateListingImage(url)` helper in `src/lib/listingDisplay.ts`:
  - Reject empty / null
  - Reject `data:` URIs (force uploaded URL from Storage)
  - Reject obvious AI/visualization markers (e.g. `/ai-generated/`, `placeholder`)
  - Require `http(s)://` URL
- Call it in **all** listing insert paths:
  - `src/routes/sell.tsx` before `createListing`
  - `src/routes/vault.tsx` → `listForSale`
  - `src/routes/my-listings.tsx` → `saveEdit`
- Replace generic `toast.error(error.message)` with user-friendly mapped messages: *"Please upload a real photo of the card you're selling — vault/AI images can't be used as sale photos."*
- Tighten `ListingImageUpload` to only return uploaded Storage URLs (never raw base64).

### 2. Vault → Listing modal rebuild
Rewrite the `SellModal` inside `src/routes/vault.tsx`:
- **Always require fresh front + back photo uploads** (file inputs go straight to Storage via existing upload helper). Vault image is shown only as a *reference thumbnail* labeled "Vault reference — not used for sale".
- Prefill (read-only chips, editable on tap): title, set, number, year, condition/grading, language, category, description seed.
- Fields the seller fills: sale photos (front+back), description override, price, listing type (Buy Now / Auction / Offer), shipping (uses seller's default), auction length, reserve.
- Submit → insert into `listings` with `vault_card_id` linkage column.

### 3. Auto-open listing modal after scan/save
- In `src/routes/vault.tsx`, the scan/add flow already has a "Sell Item" intent (checkbox in add form). After `saveCard` resolves successfully and `sellAfterSave` is true, automatically `setSelling(newCard)` to open the rebuilt SellModal.
- Same hook for the scanner path.

### 4. Data integrity (DB migration)
New migration:
- `listings.vault_card_id uuid references vault_cards(id) on delete set null` (nullable, indexed).
- `vault_cards.listed_listing_id uuid` (nullable, set when listed; cleared when listing expires/cancelled).
- Unique partial index to prevent duplicate active listings from the same vault card:
  `create unique index on listings (vault_card_id) where vault_card_id is not null and auction_status = 'active';`
- Trigger on `listings` after insert: stamp `vault_cards.listed_listing_id`.
- Trigger on `listings` after update (status → sold/cancelled/expired): clear `vault_cards.listed_listing_id` and mark vault row `is_sold = true` when status = sold.

### 5. UX polish
- Replace blocking alerts with inline error rows under each field.
- Modal is mobile-first (bottom sheet on <640px, centered card on desktop) — already the pattern; keep.
- Show progress states on photo upload (spinner overlay).

## Files touched
- `src/lib/listingDisplay.ts` (helper)
- `src/components/ListingImageUpload.tsx` (block base64 return)
- `src/routes/vault.tsx` (SellModal rewrite, auto-open, prefill, linkage)
- `src/routes/sell.tsx` (validation guard)
- `src/routes/my-listings.tsx` (validation guard on edit)
- `supabase/migrations/<new>.sql` (vault_card_id, dedupe index, triggers)

## Out of scope (call out if you want them too)
- Editing a vault item should sync to its active listing (one-way push) — easy to add later if you confirm.
- Bulk-list multiple vault cards in one flow.
- Background job to expire stale `vault_cards.listed_listing_id` when a listing naturally expires (covered by the trigger above for explicit status changes only).

Approve and I'll implement in this order: migration → image helper + guards → SellModal rewrite → auto-open hook → my-listings guard.
