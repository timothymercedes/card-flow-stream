## Seller Trust-Based Payout Release System

Adds tiered instant-release based on completed deliveries, hardens all payout/balance logic server-side, and surfaces trust progress in the Seller Hub. The combined earnings total is already shipped — this builds on top.

### 1. Database (single migration)

**`seller_trust` table** (1 row per user)
- `user_id` (PK, FK profiles)
- `completed_deliveries` int
- `tier` enum: `new`, `bronze`(25), `silver`(50), `gold`(75), `platinum`(100)
- `instant_release_pct` int (0/10/30/70/95)
- `pending_release_pct` int (100/90/70/30/5)
- `manual_override_pct` int nullable (admin can force lower)
- `risk_flags` jsonb (refund_rate, chargeback_rate, payout_failures, sales_spike)
- `dispute_rate_30d`, `chargeback_rate_30d` numeric
- `frozen` bool (admin kill-switch)

**`payout_locks` table** — tracks order-level fund locks
- `order_id`, `user_id`, `amount_cents`, `reason` (dispute|refund_pending|fraud_review|delivery_unconfirmed|chargeback)
- `released_at` nullable

**`balance_audit_log` table** — immutable, append-only
- `user_id`, `event_type`, `delta_cents`, `balance_before`, `balance_after`, `reference_table`, `reference_id`, `metadata` jsonb, `created_at`
- Trigger: block UPDATE/DELETE

**`fraud_flags` table** — `user_id`, `flag_type`, `severity`, `auto_action`, `resolved_at`

**RPCs (SECURITY DEFINER, server-side only):**
- `recalc_seller_trust(_user_id)` — recounts delivered orders excluding refunded/disputed/cancelled, updates tier
- `compute_available_balance(_user_id)` — single source of truth: sum of (delivered_net × instant_pct) + (pending_net for matured orders) − active locks − hold_owed − in-flight payouts
- `lock_order_funds(_order_id, _reason)` / `release_order_funds(_order_id)`
- `request_payout(_amount_cents)` — REPLACES existing: re-validates server-side via `compute_available_balance`, advisory lock per user to prevent races, idempotency key
- `apply_balance_change(_user_id, _delta, _event_type, _ref)` — only path that mutates `profiles.balance_cents`, writes audit log

**Triggers:**
- `orders` AFTER UPDATE on `status`/`payment_status`/`refunded_amount` → calls `recalc_seller_trust` + lock/release
- `disputes` INSERT → `lock_order_funds(... 'dispute')`
- `disputes` resolved → `release_order_funds`

### 2. Server Functions (`src/lib/payouts.functions.ts`)
- Update `requestPayoutFn` to surface server-validated payable
- Add `getSellerTrustFn` — returns tier, pct, progress to next tier, risk flags
- Add `adminOverrideTrustFn` (admin-gated) — logs every override

### 3. Admin (`src/components/admin/HoldsAdmin.tsx`)
- New "Trust & Risk" tab: list sellers with tier, dispute rate, manual override slider, freeze toggle
- All actions write to `audit_logs` with `actor_id`

### 4. Seller Hub UI (`src/components/SellerEarningsHub.tsx`)
- New `TrustTierCard` at top: tier badge, "Instant release: X% · Pending: Y%", progress bar to next tier ("17 / 25 deliveries to Bronze"), risk warnings
- Per-order breakdown shows split: "$X instant · $Y pending until delivery"
- Locked orders show 🔒 with reason
- Available balance pulls from `compute_available_balance` RPC (not client math)

### 5. Realtime
- Subscribe to `seller_trust`, `payout_locks`, `balance_audit_log` on the user's row → re-fetch via RPC

### Technical notes
- Frontend computes display totals only; the **payout button amount comes from `compute_available_balance` RPC** at click time — client-side math is decorative
- Advisory lock `pg_advisory_xact_lock(hashtext('payout:'||user_id))` inside `request_payout` prevents double-withdrawal across tabs
- All percentage thresholds stored in a `trust_tiers` config table so they can be tuned without code changes
- `balance_audit_log` REVOKE update/delete from authenticated; trigger raises exception on tamper attempt

### Files
- New migration: trust tables, locks, audit log, RPCs, triggers
- New: `src/components/TrustTierCard.tsx`
- Edit: `src/components/SellerEarningsHub.tsx`, `src/lib/payouts.functions.ts`, `src/components/admin/HoldsAdmin.tsx`

Approve to proceed.
