
# Shipping & Payout Protection Overhaul

Your project already has scaffolding for most of this (`orders.prep_status`, `payout_held`, `shipping_due_at`, `is_late_shipment`, `account_holds`, `fraud_flags`, `payout_requests`). This plan upgrades those into a coherent lifecycle with carrier-scan gating, payout protection, fraud detection, and analytics.

## 1. Shipping lifecycle (orders.shipping_status)

New enum `shipping_status`:
```
pending_shipment → label_created → shipped (= first carrier scan)
  → in_transit → delivered
  ↘ delivery_failed | returned | lost_package
```

- Add `orders.shipping_status` column + backfill from existing `prep_status` / `status` / `delivered_at`.
- **Stop auto-setting `shipped` on label purchase.** Label buy sets `label_created` + `label_purchased_at`. Today's code in `src/server/shipping.functions.ts` flips status to "shipped" the moment Shippo returns a label — that's the core bug.
- New column `first_scan_at`. When carrier webhook reports first acceptance scan → set `first_scan_at = now()`, `shipping_status = shipped`, `shipped_at = now()`.

## 2. Carrier tracking webhook

New public route `src/routes/api/public/hooks/shippo-tracking.ts`:
- Verifies Shippo webhook signature (HMAC).
- Maps Shippo `tracking_status` → our `shipping_status`:
  - `TRANSIT` first time → `shipped` (+ release payout hold step 4)
  - `TRANSIT` subsequent → `in_transit`
  - `DELIVERED` → `delivered` + `delivered_at`
  - `FAILURE` → `delivery_failed`
  - `RETURNED` → `returned`
  - `UNKNOWN` >14d after label → `lost_package` (via cron, see step 6)
- Writes to new `shipment_events` table (audit trail: order_id, status, raw payload, occurred_at).
- Registers tracking with Shippo at label-buy time (currently we just save the label URL).

## 3. Shipment deadlines & reminders

- `shipping_due_at` already exists. Standardize: **3 business days** from `paid_at` (configurable per seller later).
- New cron `/api/public/hooks/shipping-reminders` (runs hourly via pg_cron):
  - 24h before due → reminder notification + email
  - At due → 2nd reminder
  - 24h past due → mark `is_late_shipment = true`, fraud_flag `late_shipment`, notify admin
  - 72h past due → auto-cancel + refund buyer + seller strike
- New view `seller_shipping_stats` (late rate, avg fulfillment time, on-time %).

## 4. Payout protection

Today `payout_held` is a boolean with no enforcement on payout requests. Upgrade:

- New column `orders.payout_eligible_at` (timestamp, null until releaseable).
- Released by ANY of:
  - **(a)** First carrier scan (`first_scan_at` set) → eligible after a 24h hold (anti-spoof grace).
  - **(b)** `delivered` → eligible immediately.
  - **(c)** Admin manual release (`admin_release_payout` server fn).
- New view `v_seller_available_balance`: sums `seller_payout_amount` for orders where `payout_eligible_at <= now()` AND no active refund/dispute, MINUS already-paid-out amounts.
- `payout_requests` insert trigger checks `v_seller_available_balance` — rejects if requested > available.
- Default to **delayed release**: payouts use `payout_eligible_at`, not "instant after charge".

## 5. Anti-fraud

New cron `/api/public/hooks/fraud-sweep` (every 6h):
- Labels created >48h ago with no `first_scan_at` → `fraud_flags` row (`label_never_scanned`, severity escalates with count).
- Sellers with >3 such orders in 30d → auto `account_holds` row, freeze payouts.
- Sellers with late-rate >25% over 10+ orders → `suspicious_seller` flag for admin review.
- Block `payout_requests` insert if seller has any order in `label_created` for >5 days without scan.

## 6. Shipping analytics

- Materialized view `mv_seller_shipping_analytics` refreshed nightly:
  - avg time paid→label, label→scan, scan→delivered
  - delivery success rate, lost %, late %, dispute rate
- New seller-hub page `/seller/shipping-analytics` (read-only dashboard).
- Admin page `/admin/shipping-health` lists flagged sellers + platform-wide metrics.

## 7. Refunds, disputes, cancellations

Audit existing flows to make sure they:
- Reverse `payout_eligible_at` (set null + add `payout_reversal` ledger row) when refund issued.
- On Stripe `charge.dispute.created` webhook → freeze that order's payout + add seller hold for the disputed amount.
- On cancel before `label_created` → no payout ever becomes eligible; full refund; no fee.
- On cancel after `shipped` → buyer-return flow required before refund.

Stripe Connect application fee already handles the 5% routing — keep as-is. Add reconciliation cron that compares `orders.seller_payout_amount` sums vs Stripe Connect balance.

---

## Technical details

**Migrations (one big migration):**
- Create enum `shipping_status`
- `orders`: add `shipping_status`, `first_scan_at`, `label_purchased_at`, `payout_eligible_at`, `lost_marked_at`
- New table `shipment_events` (order_id, status, source, raw jsonb, occurred_at)
- New view `v_seller_available_balance`
- New materialized view `mv_seller_shipping_analytics`
- Trigger `trg_orders_release_payout` on `shipping_status` change → set `payout_eligible_at`
- Update `trg_orders_protect_payouts` to honor `payout_eligible_at`
- Backfill `shipping_status` from existing data

**Code changes:**
- `src/server/shipping.functions.ts` — `buyShippingLabel` no longer sets status=shipped; sets `label_created` + registers tracking webhook
- New `src/routes/api/public/hooks/shippo-tracking.ts`
- New `src/routes/api/public/hooks/shipping-reminders.ts`
- New `src/routes/api/public/hooks/fraud-sweep.ts`
- `src/server/payouts.functions.ts` — gate on `v_seller_available_balance`
- New `src/server/admin-shipping.functions.ts` — manual release, force lost, override
- New pages: `src/routes/_authenticated/seller/shipping-analytics.tsx`, `src/routes/_authenticated/admin/shipping-health.tsx`
- Update existing seller dashboard order rows to show new statuses + tracking timeline
- Update buyer order detail page to show timeline (Pending → Label → Shipped → In Transit → Delivered)

**Secrets needed:**
- `SHIPPO_WEBHOOK_SECRET` — for verifying tracking webhooks (I'll ask for this when wiring step 2)

**Scope of build:** ~1 large migration, ~12 file edits/creates, 3 new cron hooks. Estimated 15–25 min of build time.

---

## Open questions before I build

1. **Shipment deadline = 3 business days** — OK or do you want different (e.g. 2 / 5)?
2. **Payout hold after first scan = 24h** — OK or instant on scan / wait for delivery?
3. **Auto-cancel at 72h past due** — OK or just flag and let admin decide?
4. **Lost package threshold = 14 days no scan after label** — OK?

Answer these (even just "all defaults") and I'll execute the whole plan in one pass.
