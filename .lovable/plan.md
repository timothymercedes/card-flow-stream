# Seller Verification + Buyer Risk Monitoring

Two independent systems, shipped together. Sellers get hard gates on Stripe Connect KYC; buyers stay frictionless but get scored, flagged, and optionally restricted.

---

## Part 1 — Seller Stripe Connect KYC gating

The project already has `src/server/stripe-connect.functions.ts` and a Connect onboarding flow. We extend it with a status sync + gate, and enforce the gate in 4 places.

### DB (migration)
Add to `profiles`:
- `stripe_connect_verified BOOLEAN DEFAULT false`
- `stripe_connect_status TEXT` ('unstarted' | 'pending' | 'restricted' | 'verified')
- `stripe_connect_requirements JSONB` (currently_due / past_due snapshot)
- `stripe_connect_last_synced_at TIMESTAMPTZ`

Security-definer helper:
- `public.is_seller_verified(_user_id uuid) returns boolean` — reads `stripe_connect_verified`. Used by RLS + RPCs.

Update RLS / RPCs to refuse:
- `INSERT` on `listings` (sell) → block when `NOT is_seller_verified(auth.uid())`
- `INSERT` on `streams` / `live_shows` (go live, host) → block when not verified
- `request_payout` RPC → raise exception when not verified

### Server functions
Extend `src/server/stripe-connect.functions.ts`:
- `syncConnectAccountStatusFn` — already exists; ensure it writes the 4 new columns from `account.charges_enabled && payouts_enabled && details_submitted` → `verified`; else compute `pending` / `restricted` from `requirements`.
- `getMyConnectStatusFn` — returns the cached row + a "needs sync" hint.

### UI
- New component `src/components/SellerVerificationGate.tsx` — mirrors `SellerAgreementGate.tsx`. Blocks `/sell`, `/payouts`, `/seller/shipping`, and "Go Live" buttons with a CTA "Verify your identity to start selling" → opens Connect onboarding link.
- Mount inside the existing seller-only routes alongside `SellerAgreementGate`.
- `PayoutBreakdown` / `SellerEarningsHub` show a "Verification required" banner instead of payout buttons until verified.

---

## Part 2 — Buyer risk monitoring

### DB (same migration)

```text
buyer_risk_signals       — append-only log of every risk-relevant event
buyer_risk_scores        — one row per user, denormalized current score + flags
buyer_restrictions       — admin-applied restrictions (active/expired)
```

`buyer_risk_signals` columns: `user_id`, `kind`, `severity_weight`, `ref_table`, `ref_id`, `seller_id`, `metadata jsonb`, `created_at`.

`kind` enum: `payment_failed`, `checkout_abandoned_failed`, `order_cancelled_by_buyer`, `refund_requested`, `dispute_opened`, `chargeback`, `not_delivered_claim`, `bid_retracted`, `bid_no_pay`, `multi_seller_complaint`.

`buyer_risk_scores` columns: `user_id PK`, `score INT`, `tier TEXT` ('clean'|'watch'|'review'|'restricted'), `flagged_at`, `last_event_at`, `signals_30d JSONB` (kind→count), `under_review BOOLEAN`.

`buyer_restrictions` columns: `user_id`, `kind` ('purchase_block'|'bid_limit'|'require_verification'|'frozen'), `cents_limit INT NULL`, `reason`, `created_by`, `expires_at`, `active`.

### Scoring engine

`public.record_buyer_risk_signal(_user_id, _kind, _ref_table, _ref_id, _seller_id, _metadata)` — SECURITY DEFINER:
1. inserts into `buyer_risk_signals`
2. recomputes `score` = weighted sum of last-30-day signals (weights table inline in function)
3. updates `buyer_risk_scores` row + tier thresholds (e.g. ≥10 watch, ≥25 review, ≥50 restricted-auto)
4. when crossing into `review`, sets `under_review=true` and inserts into `admin_alerts` (existing table — fall back to a new `buyer_risk_alerts` if missing)

### Wire signal emission

Add `record_buyer_risk_signal` calls (best-effort, no throw on failure) at:
- `src/routes/api/public/stripe/webhook.ts` — on `payment_intent.payment_failed`, `charge.dispute.created`, `charge.refunded` (when buyer-initiated).
- `src/lib/order-actions.functions.ts` — on buyer-initiated cancel.
- `src/components/DisputeThread.tsx` server fn — on "not delivered" claim.
- Existing refund request flow.

### Admin queue UI

New route `src/routes/admin.buyer-risk.tsx` (and tab on `admin.tsx`):
- List of `buyer_risk_scores` where `under_review=true OR tier IN ('review','restricted')`
- Sort by score desc
- Row → drawer/modal showing:
  - Profile + signup date + total orders/spend
  - 30-day signal breakdown (counts by kind)
  - Recent orders (with seller, amount, status)
  - Payment failures, refunds, disputes
  - Affected sellers list (distinct from signals)
  - Action buttons: Apply restriction (purchase block / bid limit / require KYC / freeze), Clear review, Add note

Server fns in new `src/lib/buyer-risk.functions.ts`:
- `getBuyerRiskQueueFn` (admin only)
- `getBuyerRiskDetailFn(userId)` (admin only)
- `applyBuyerRestrictionFn({userId, kind, centsLimit?, expiresAt?, reason})`
- `clearBuyerRestrictionFn({restrictionId})`
- `clearBuyerReviewFn({userId, note})`

All gated with an `is_admin`/owner role check via existing `user_roles`.

### Enforcement of restrictions

Helper SQL fn `public.buyer_can_purchase(_user_id, _amount_cents) returns boolean` — checks active restrictions.

Wire into:
- `buyerPayments.functions.ts` / checkout server fn → raise on `frozen` or `purchase_block`, enforce `cents_limit`.
- `auctionCharge.functions.ts` / bid server fn → raise on `bid_limit` exceeded.
- Surface a small `BuyerRestrictionBanner` on `/cart` + checkout when restricted, with the reason.

`require_verification` restriction triggers a Stripe Identity check flow (out of scope for this PR — stub it as a banner "Admin requires identity verification" + a TODO).

---

## Technical notes

- All new tables: RLS on, only owner/admin can SELECT/INSERT/UPDATE via `has_role`. Users can SELECT their own `buyer_risk_scores` (for transparency) but NOT signals.
- Score recompute is cheap (last-30-day window, indexed on `(user_id, created_at)`).
- Signal emission is fire-and-forget — wrap in try/catch so risk logging never breaks a payment path.
- No buyer-facing friction unless restricted. Normal buyers never see any of this.

---

## Out of scope (follow-ups)

- Stripe Identity verification flow for the `require_verification` restriction
- ML-based scoring (this is rule-based weighted sums)
- Auto-expiry cron for restrictions (can run via existing pg_cron pattern)
- Buyer appeal flow

---

## Files

**New**
- `supabase/migrations/<ts>_seller_kyc_buyer_risk.sql`
- `src/components/SellerVerificationGate.tsx`
- `src/components/BuyerRestrictionBanner.tsx`
- `src/lib/buyer-risk.functions.ts`
- `src/routes/admin.buyer-risk.tsx`
- `src/components/admin/BuyerRiskQueue.tsx`

**Edited**
- `src/server/stripe-connect.functions.ts` (extend sync)
- `src/routes/api/public/stripe/webhook.ts` (emit signals)
- `src/lib/order-actions.functions.ts` (emit on cancel)
- `src/lib/buyerPayments.functions.ts` (enforce restrictions)
- `src/lib/auctionCharge.functions.ts` (enforce bid restrictions)
- `src/routes/sell.tsx`, `src/routes/payouts.tsx`, `src/routes/seller.shipping.tsx`, live host entry — mount `SellerVerificationGate`
- `src/routes/admin.tsx` — add Buyer Risk tab

Approve to proceed?
