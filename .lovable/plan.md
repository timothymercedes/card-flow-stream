# Owner Financial Dashboard

Builds a dedicated, owner-only dashboard at `/admin/finance` with strict accounting separation between platform revenue and the owner's personal seller activity, plus two independent payout flows.

## What already exists (reuse, don't rebuild)

- `platform_revenue` table (kinds: `marketplace_commission`, `intl_processing_fee`, `tip_fee`, `promotion`, `shipping_adjustment_fee`, `refund_loss`, `dispute_loss`, `stripe_processing_fee`, `adjustment`) — owner/admin RLS, append-only.
- `payout_requests` — seller payout queue (user-scoped; will be used for owner's *personal* seller payouts).
- `orders` — full per-order fee/commission/shipping fields.
- `getPlatformRevenueSummaryFn`, `listPlatformRevenueFn`, `getSellerPayableFn`, `requestPayoutFn`, `recordShippingAdjustmentFn`.
- Existing `PlatformRevenueAdmin` tab in `/admin` (will keep as a quick summary; full dashboard moves to `/admin/finance`).

## What's missing → what we'll add

1. **Platform-payout ledger** (new) — distinct from `payout_requests`, which is seller-scoped. Owner withdraws platform commissions to a separate destination without touching seller-side accounting.
2. **Per-stream revenue rollup** — query layer over `orders` + `platform_revenue` joined by `stream_id`.
3. **Owner personal seller view** — reuses `getSellerPayableFn` and `orders where seller_id = owner.id`, rendered in its own tab so it never mixes with platform totals.
4. **Granular breakdowns** — buyer fees, shipping margin (charged − label cost), seller commissions collected, refunds/disputes, stream analytics — all derived from existing tables.
5. **Time filters** — day / week / month / year / custom range, plus per-stream and per-seller drilldowns.

## Database changes

```sql
-- New: platform-level payouts (independent of seller payout_requests)
CREATE TABLE public.platform_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,             -- owner user_id
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  status payout_status NOT NULL DEFAULT 'requested',
  destination text NOT NULL,              -- 'platform_bank' | 'owner_personal'
  stripe_payout_id text,
  notes text,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: owner-only SELECT/INSERT; no UPDATE/DELETE from client.

-- Helper RPCs (security definer, owner-gated):
--   admin_revenue_by_period(_bucket, _since, _until)  → time-series buckets
--   admin_revenue_by_stream(_since, _until, _limit)   → per-stream rollup
--   admin_revenue_by_seller(_since, _until, _limit)   → per-seller rollup
--   admin_shipping_margin(_since, _until)             → charged - label
--   request_platform_payout(_amount_cents, _destination, _notes)
```

`platform_revenue` already carries the source of truth for commissions/fees; the new RPCs are pure read-aggregations plus one write for `request_platform_payout`.

## Server functions (new, in `src/lib/owner-finance.functions.ts`)

All gated by an `assertOwner` middleware (role = `owner` only — admin is *not* sufficient for payout withdrawal).

- `getOwnerFinanceOverviewFn({ range })` — totals: platform commissions, buyer fees, shipping margin, refunds/disputes, net profit, Stripe balance.
- `getRevenueByPeriodFn({ bucket: 'day'|'week'|'month'|'year', range })`
- `getRevenueByStreamFn({ range, limit })`
- `getRevenueBySellerFn({ range, limit })`
- `getOwnerPersonalSalesFn({ range })` — `orders WHERE seller_id = owner.id` aggregations.
- `listPlatformPayoutsFn`, `requestPlatformPayoutFn({ amountCents, destination })`
- `listOwnerPersonalPayoutsFn` — filter of `payout_requests WHERE user_id = owner.id`.
- `requestOwnerPersonalPayoutFn` — wraps existing `request_payout` RPC.

## UI

New route `src/routes/admin.finance.tsx` (owner-only; redirect non-owners). `AppShell` layout, mobile-first.

Tabs:
1. **Overview** — KPI grid, period filter (D/W/M/Y/custom), revenue trend chart, two clearly separated cards: "Platform Earnings" and "My Personal Sales".
2. **Platform Commissions** — full `platform_revenue` ledger with kind filter, totals, Stripe balance, **Withdraw Platform Commission** button.
3. **Personal Sales** — owner-as-seller orders, payable balance, **Withdraw Personal Earnings** button (separate balance, separate destination).
4. **Payouts** — split view: Platform Payouts history | Personal Payouts history (two columns, never mixed).
5. **Per Stream** — table sorted by gross, drilldown to stream details.
6. **Per Seller** — top sellers by commission contributed.
7. **Shipping** — charged vs label cost, margin %, adjustments.
8. **Refunds / Disputes** — losses table.
9. **Transactions** — unified searchable ledger (orders + revenue events).

Realtime: subscribe to `platform_revenue`, `orders`, `payout_requests`, `platform_payouts` and call `queryClient.invalidateQueries` on insert.

A new sidebar entry "Finance" in `/admin` (owner-only) links to `/admin/finance`. The existing `revenue` tab inside `/admin` stays for quick access but its CTA points to the full dashboard.

## Accounting separation guarantees

- Platform balances derive from `platform_revenue` only — never from `orders.seller_payout_amount`.
- Personal seller balance derives from `compute_seller_payable(owner_id)` — never from `platform_revenue`.
- Two distinct payout tables (`platform_payouts` vs `payout_requests`) so reconciliation can't cross streams.
- UI uses two color tokens (primary for platform, accent for personal) and the two balances are never summed in any view.

## Out of scope (call out, don't build)

- Actual Stripe payout execution for `platform_payouts` is queued as `requested`; an existing/follow-up admin worker will move them to `paid`. Same model as today's `payout_requests`.
- Tax form generation (1099s) — separate workstream.

## Approval needed

This touches payment flows, adds a new payout table, and exposes withdrawal endpoints. Confirm to proceed and I'll ship the migration + code in one pass.
