
# Whatnot-Style In-Stream Payments & Moderation

Rolled out in 6 phases. Each phase is independently shippable and tested against a live stream before moving to the next. Existing bidding, live UI, and shipping queue stay functional throughout.

---

## Phase 1 — Cancel-unblock bug fix (ship first, today)

**Problem:** When host cancels an unpaid order, the buyer stays blocked in `live_bid_blocks` until manual cleanup. The auto-block effect in `HostPaymentLog` only unblocks on `paid`/`resolved`, not on order cancellation.

**Fix:**
- DB trigger on `orders`: when `status` transitions to `cancelled` (or `payment_status` set to `cancelled`/`refunded`), delete the matching `live_bid_blocks` row **only if** no other unpaid/failed order from that buyer remains in that stream.
- Frontend (`HostPaymentLog.tsx`): include `cancelled` orders in the auto-unblock sweep effect.
- Add "Cancel order" action to failed-order rows that calls a server fn `cancelUnpaidOrder` (sets status, refunds if charged, notifies buyer, unblocks).

**Verify:** Place test bid → fail payment → confirm block → host cancels → confirm bid works instantly.

---

## Phase 2 — Card-on-file requirement (foundation for auto-charge)

**DB:**
- `buyer_payment_methods` table: `user_id`, `stripe_customer_id`, `stripe_payment_method_id`, `brand`, `last4`, `exp_month`, `exp_year`, `is_default`. RLS: owner only.

**Server fns** (`src/lib/buyerPayments.functions.ts`):
- `createSetupIntent` — returns clientSecret for SetupIntent (off_session usage).
- `listMyPaymentMethods`, `setDefaultPaymentMethod`, `removePaymentMethod`.

**UI:**
- New `<SavePaymentMethodModal>` using Stripe Elements (PaymentElement, NOT redirect) — mounts inline.
- `useRequireCardOnFile()` hook used by bid buttons in `live.$id.tsx` and `PreBidPanel.tsx`. If no PM exists, opens modal before allowing bid submit.
- Settings page: "Payment methods" section to manage cards.

**Verify:** New account joins live → tries to bid → modal appears → adds card → bid works.

---

## Phase 3 — Auto-charge on win (core flow)

**Replace** existing post-win checkout-page redirect with off-session PaymentIntent confirmation.

**Server fn** `chargeAuctionWinner({ orderId })`:
- Loads order + buyer's default PM.
- Creates PaymentIntent with `confirm: true`, `off_session: true`, `customer`, `payment_method`, `application_fee_amount` (see Phase 4 fees), `transfer_data.destination` (seller's connected acct).
- On success: `orders.payment_status = 'paid'`, `paid_at = now()`, broadcast realtime event.
- On `requires_action` or failure: `payment_status = 'failed'`, `last_payment_error`, insert `live_bid_blocks`, broadcast `payment_failed` realtime event with `client_secret` for SCA.

**Called from:** the existing auction-sold flow (currently triggers checkout). Replace the redirect with this call.

**In-stream Fix Payment modal** (`<FixPaymentModal>`):
- Subscribes to realtime `payment_failed` events scoped to current `buyer_id`.
- Renders inside `live.$id.tsx` overlay (does NOT navigate).
- Shows: failed item, amount, reason, [Retry with same card] [Use different card] [Add new card].
- On success, calls `confirmPaymentRetry` server fn → unblocks via Phase 1 trigger → toast.

**Verify:** Win auction → instant charge → no redirect → if card declined, modal pops in-stream → fix → resume bidding.

---

## Phase 4 — Fee restructure (1.5% processing + 5% commission)

**`src/lib/stripe.server.ts`:**
```ts
export const PROCESSING_FEE_RATE = 0.015;  // buyer-side, scales with subtotal
export const COMMISSION_RATE = 0.05;       // seller-side, platform revenue
// Remove BUYER_PLATFORM_FEE_CENTS
```

**New `calculateFees(subtotalCents, { isInternational })`:**
- `processingFee = round(subtotal * 0.015)` (no minimum)
- `commission = round(subtotal * 0.05)` (deducted from seller payout)
- `intlFee = isInternational ? round(subtotal * 0.04) : 0`
- `buyerTotal = subtotal + processingFee + intlFee`
- `applicationFee = processingFee + commission + intlFee` (sent via Connect)
- `sellerPayout = subtotal - commission`

**UI surfaces** (transparent breakdown):
- Pre-bid panel: show "Subtotal + 1.5% processing"
- Order confirmation toast & receipt
- Seller Hub analytics: add `total_deductions`, `processing_costs`, `commission_paid`, `net_payout` rollups
- Stream pre-start summary card

**Migration:** Keep old field names readable; add new columns to `orders`: `commission_cents`, `processing_fee_cents`, `seller_payout_cents`. Backfill nullable.

**Verify:** Existing live auctions still process. New orders show 1.5% + 5% split correctly.

---

## Phase 5 — Shipping configuration gate

**Rule:** A seller cannot start a stream or publish a listing unless shipping is configured.

**DB:** Reuse `seller_shipping_settings` (or add if missing): `user_id`, `domestic_enabled`, `international_enabled`, `default_package_preset`, `flat_rate_cents` OR `use_calculated`, `handling_days`.

**Server fn** `assertSellerShippingReady(userId)`:
- Throws if no row, or no domestic config.

**Gates:**
- `start_live_stream` RPC / server fn calls assert first.
- `create_listing` server fn calls assert first.
- Studio "Go Live" button disabled with tooltip + link to shipping setup if not ready.
- Sell flow shows "Set up shipping" step before publish.

**Buyer-side:**
- Auction card shows estimated shipping (use existing `shippingEstimate.ts`) before bid.
- Pre-bid panel includes "Ships from X · ~$Y shipping" line.

**Verify:** New seller account → tries to go live → blocked with clear CTA → configures shipping → can go live.

---

## Phase 6 — Restrictions, moderation, real-time host statuses

**Cross-stream restrictions:**
- New `user_payment_restrictions` table: `user_id`, `type` ('cross_stream_suspend' | 'admin_warning' | 'admin_suspend' | 'admin_ban'), `reason`, `expires_at`, `created_by`.
- Trigger on `live_bid_blocks` insert: if a buyer has ≥2 active blocks across distinct streams, auto-insert a 24h `cross_stream_suspend`.
- `place_live_bid` RPC checks `user_payment_restrictions` first; rejects with clear message.

**Stream-end reset:**
- Trigger on `live_streams.status → 'ended'`: delete `live_bid_blocks` rows for that stream (per your spec: ending the stream resets the restriction for future streams; the current order is settled separately).

**Admin moderation (`/admin` → Buyer Moderation tab):**
- List of users with active restrictions or repeated failed payments.
- Actions: Warn (notification), Temp suspend (24h/7d/30d), Permanent ban, Clear restriction, Note.
- Uses `has_role(uid, 'admin')` gate.

**Host real-time payment status:**
- `HostPaymentLog.tsx` already has tabs. Add: realtime status pill per order (`processing` / `paid` / `failed` / `pending_fix`) driven by `payment_status` column.
- Add toast pings on status transitions (already partial).

**Buyer warnings:**
- After 1st failed payment: toast + persistent banner "Unpaid auctions may temporarily restrict your bidding."
- After 2nd: stronger banner with link to payment methods.

---

## Files (new)
- `src/lib/buyerPayments.functions.ts`
- `src/lib/auctionCharge.functions.ts`
- `src/lib/feeCalculations.ts` (shared client/server fee math)
- `src/components/SavePaymentMethodModal.tsx`
- `src/components/FixPaymentModal.tsx`
- `src/components/BuyerPaymentRestrictionBanner.tsx`
- `src/components/admin/BuyerModerationPanel.tsx`
- `src/hooks/useRequireCardOnFile.tsx`
- Migrations: `buyer_payment_methods`, `user_payment_restrictions`, `orders` fee columns, triggers for cancel-unblock + cross-stream auto-suspend + stream-end reset.

## Files (edited)
- `src/routes/live.$id.tsx` (replace post-win redirect, mount FixPaymentModal, restriction banner)
- `src/components/HostPaymentLog.tsx` (cancel action, include `cancelled` in unblock sweep, status pills)
- `src/components/PreBidPanel.tsx` (require card, show fee + shipping)
- `src/lib/stripe.server.ts` (new fee structure)
- `src/components/SellerEarningsHub.tsx` (new deduction columns)
- `src/routes/studio.$id.tsx` (shipping gate)
- `src/routes/sell.tsx` (shipping gate)
- `src/routes/admin.tsx` (moderation tab)
- `src/routes/settings.tsx` (payment methods section)

## Rollout discipline
- Each phase: migration → server fn → UI → manual smoke test on `/live/...` → commit.
- Live auctions stay functional throughout — old checkout-page flow remains as fallback until Phase 3 ships and is verified.
- No phase is merged if it breaks `place_live_bid` or the shipping queue.

---

**Ready to start with Phase 1 (cancel-unblock bug) as soon as you approve.**
