# Phases 2–4: Pickup, Official PB Store, Fulfillment Rules

These phases change the live database, checkout and orders. Your rules say I must show the plan before any of that, so nothing is built until you approve. Every database change goes into a test copy first, then to the live site only after you approve it separately.

## Phase 2 — Local pickup on Marketplace
- Sellers choose a delivery method for each listing: **Shipping only**, **Local pickup only**, or **Both**. New listings start as Shipping only.
- Only verified sellers in good standing can offer pickup. They set a general pickup area (city or ZIP code, never a street address).
- Buyers pick Shipping or Pickup in the cart. Pickup skips shipping cost and the address step.
- **Safe handoff:** the buyer gets a 6-digit code. The seller enters it at the meetup to mark the order complete. Shoppers see safety tips, including a suggestion to meet in a public place.
- Seller payout release counts a confirmed handoff as a delivery, the same way it counts a shipped delivery today.

## Phase 3 — Official PB Store
- PB Store gets its own catalog, kept separate from Marketplace and PB Bazaar.
- Only you (owner) and admins can add, price or publish products. Each product stores a cost, a regular price and a stock count.
- /shop changes from "Coming Soon" to a real catalog. Products appear only after admin publishing.
- Checkout uses PB Store's own sandbox (test payment) mode until you approve going live.

## Phase 4 — Fulfillment rules enforced
- **Marketplace:** shipping, pickup, or both, as the seller sets.
- **PB Store:** shipping only.
- **PB Bazaar:** partner shipping only.
- These rules are checked at three points: when a product is saved, in the cart, and again at checkout on the server. Someone editing the page cannot get around them.
- Tests cover each rule, for example "Bazaar rejects pickup".

## Order of work
1. Phase 2 in the test copy. You review it, then approve the live database change.
2. Phase 3 in the test copy. You review it, then approve.
3. Phase 4 enforcement, added alongside Phases 2 and 3.
Nothing is published without your approval.

## Technical details
- `listings`: add `fulfillment_type` (shipping|pickup|both, default shipping) and `pickup_area`. `orders`: add `fulfillment_method` plus a hashed handoff code and its `confirmed_at` time. Add a database trigger that rejects pickup on ineligible sellers.
- New `pb_store_products` and `pb_store_variants` tables, writable only by the admin/owner role (checked through `has_role`), with a public projection showing safe columns only.
- Server-side validation lives in shared pure helpers in `src/lib/fulfillmentRules.ts`, with vitest coverage.
- Existing orders and destination charges stay as they are, and all existing orders default to shipping.
