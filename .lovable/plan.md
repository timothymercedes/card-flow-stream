# Phase 3.2 — Stabilization Fixes

Three independent fixes addressing the issues you flagged.

## 1. Payment fix on "THIS IS MINE" tap

**Current**: If a buyer has an unpaid order, the bid button shows a toast ("Pay your pending order before bidding again") and routes them to `/orders` — they lose the livestream.

**New**: When a buyer taps **THIS IS MINE** (or any bid/buy/claim action) and has a failed/awaiting payment **for the current stream**, the **FixPaymentModal pops up inline**. They retry without leaving. The block stays scoped to *this stream only*; an unpaid order in a different stream no longer blocks bidding here.

**Files**:
- `src/routes/live.$id.tsx` — replace the three `unpaidOrders > 0 → nav("/orders")` branches with a "find this stream's failed/awaiting order → `setFailedOrder(...)`" call. Track per-stream unpaid count separately from global.

## 2. Mandatory per-stream shipping (Shippo tier + $7 USA cap)

**Current**: `live_streams.shipping_price` defaults to 0; nothing forces the host to pick a service. No cap logic exists.

**New**:
- Host **must** pick a Shippo service tier per stream before going live (USPS Ground Advantage / Priority / Priority Express / UPS Ground). Stored on `live_streams.shipping_service_tier` + `shipping_price` (rate auto-computed from Shippo guideline pricing for a 4 oz card-sized parcel; host can override).
- New `HostStreamShippingPicker` component shown in the studio "Go Live" pre-flight + as an "Adjust shipping" button in the live dashboard so the host can tweak mid-stream for the next won item.
- **$7 USA cap (per stream)**: when an order is created via `finalize_auction_round` (or buy-now / break claim), a trigger sums `shipping_amount` for that `buyer_id + stream_id` on already-paid orders. If buyer's `ship_country = 'US'` and prior shipping ≥ $7, the new order's `shipping_amount = 0`. Otherwise it = the stream's configured shipping_price (clamped so the *cumulative* per-stream shipping never exceeds $7 for US buyers).
- Buyer-facing UI shows "🇺🇸 Free shipping unlocked — you've hit the $7 stream cap" once triggered.

**Files**:
- Migration: add `live_streams.shipping_service_tier text`, NOT NULL check at `status='live'`; create `apply_stream_shipping_cap()` trigger on `orders` BEFORE INSERT.
- `src/lib/shippoRates.functions.ts` — server fn `getShippoGuidelineRate({ tier, fromZip, toCountry })` (uses existing Shippo API connector).
- `src/components/HostStreamShippingPicker.tsx` — new picker.
- `src/routes/studio.$id.tsx` — wire picker into pre-flight, block "Go Live" until set.
- `src/routes/live.$id.tsx` — dashboard "Shipping: USPS Priority · $5.50 · ✏️" chip → opens picker.

## 3. Clickable real-time host Dashboard

**Current**: The Buyers / Pending / Winners / Mods chips filter the watcher list but rows aren't clickable, and Pending shows generic "Order paid" activity entries.

**New**: Each chip drives a dedicated list with **clickable rows + a popup** that updates in real time over the existing `dash-${streamId}` channel.
- **Buyers** → users who have placed a paid order in this stream. Row: `@username · $total · N items`. Tap → popup with itemized order list + payment status (live).
- **Pending** → orders with `payment_status` in `awaiting_payment` / `processing` / `failed`. Row: `#bidNumber · item title · @username · 🔴 Payment failed | 🟡 Processing | ⏳ Awaiting`. The badge **flips to ✅ Paid in real time** when the buyer fixes their card — no refresh needed.
- **Winners** → most recent auction winners (paid or not). Tap → same order popup.
- All popups use `BuyerOrderPopover` (new) bound to a single `order_id` with a `postgres_changes` subscription so status changes propagate instantly.

**Files**:
- `src/components/LiveSellerDashboard.tsx` — render lists per chip, mount popover on click.
- `src/components/BuyerOrderPopover.tsx` — new component.

## Out of scope this turn
- Full Shippo label purchase flow (already exists in `src/server/shippo.functions.ts`).
- Changing the platform fee model (Phase 4 stays paused per your direction).
- Multi-package shipment consolidation across streams.

## Order of work
1. Migration + cap trigger (DB)
2. Bid-button fix (smallest, highest user pain)
3. Dashboard clickable popups
4. Shippo picker + host UI

I'll execute all four sequentially in this turn unless you want to split.
