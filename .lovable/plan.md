# Offer System v2 — Binding Commitments

Convert `queue_offers` (currently a casual "message-style" offer) into a financial commitment backed by Stripe pre-auth, with strict cancellation rules, auto-expiration, anti-abuse tracking, and stricter market listing standards (condition + real photos).

## 1. Database changes (single migration)

**`queue_offers`** — add columns:
- `expires_at timestamptz not null default now() + interval '24 hours'`
- `payment_intent_id text` (Stripe PI in `manual` capture mode = pre-auth)
- `payment_status text not null default 'pending'` — `pending | authorized | captured | failed | released | voided`
- `auth_amount_cents int`
- `cancelled_at timestamptz`, `cancel_reason text`
- `captured_at timestamptz`, `voided_at timestamptz`
- `order_id uuid` (set when accepted → paid order created)
- Indexes on `(buyer_id, status)`, `(expires_at) where status='pending'`

**`listings`** — enforce standards:
- `condition text` constrained to `('MINT','NM','LP','MP','HP','DMG')` (nullable for legacy; required on new inserts via trigger)
- `description text` (require min 30 chars on insert/update via trigger for non-draft)
- `front_image_url text`, `back_image_url text` (required on publish via trigger)
- `ai_images_allowed boolean default false` (only true for vault listings)

**`offer_abuse_events`** (new table) — anti-abuse log:
- `user_id, event_type` (`unpaid_offer | cancel | auth_failed | spam`), `queue_item_id`, `metadata jsonb`, `created_at`
- View `seller_offer_risk` aggregating last-30-day counts per buyer

**`user_restrictions`** — add `offers_suspended_until timestamptz` (if column missing).

RLS: buyer reads own offers; seller reads offers on own queue items; admin full.

## 2. Server functions

**`src/lib/offers.functions.ts`** (new — replaces parts of `queueActions.functions.ts`):

| fn | role | flow |
|---|---|---|
| `createOffer` | buyer | check `offers_suspended_until`; require saved card; create Stripe `PaymentIntent` `capture_method=manual` `confirm=true off_session` → store `payment_intent_id`, `payment_status='authorized'`, `expires_at=now+24h`; insert `queue_offers` row |
| `cancelOffer` | buyer | only if `status='pending'` AND not expired AND `payment_status='authorized'`; call `stripe.paymentIntents.cancel(pi)`; mark `cancelled`, log abuse event for rate-tracking |
| `acceptOffer` | seller | atomically: re-check still authorized + not expired; `stripe.paymentIntents.capture(pi)`; on success → create `orders` row (status `paid`), mark queue item `sold`, decline siblings (releasing their PIs), kick off fulfillment. On capture fail → mark offer `voided`, notify seller, optionally relist |
| `declineOffer` | seller | release PI via cancel |
| `expireOffers` | cron | every 5 min — for `pending` + `expires_at < now()` → cancel PI, mark `expired`, release auth |

**`src/routes/api/public/hooks/expire-offers.ts`** — cron handler calling `expireOffers`.

Stripe access via `createStripeClient(env)` from `@/lib/stripe.server` (gateway pattern, never raw SDK). All offer money flows go through the same connector.

## 3. Frontend

- **`OfferDialog`** (new, used from market + live + queue):
  - Requires saved card (reuse `useRequireCardOnFile`)
  - Shows binding notice: *"Submitting an offer is a binding purchase commitment if accepted by the seller."*
  - Shows expiration timer (24h), final-sale policy badge, auth status pill
  - Records `policy_acceptance` (`context: 'offer'`) on submit
- **`MyOffers` panel** (buyer side, in `orders.tsx` or new tab): list with countdown, "Cancel offer" button (disabled if seller accepted / expired / captured), auth status
- **Seller offer inbox** (in seller hub / `shows.$id.tsx` queue panel): Accept / Decline with live capture state
- **`MarketQuickView`** + `market.$id.tsx`: show condition badge + front/back thumbnails; "Make Offer" button opens new `OfferDialog`

## 4. Listing standards enforcement

- **`sell.tsx`** form: require condition dropdown (MINT/NM/LP/MP/HP/DMG), description (≥30 chars), front + back photo uploads. Show notice: "AI-generated images are only allowed for vault/storage visualizations."
- Trigger on `listings` insert/update validates required fields when `status='live'`.
- `MarketCard` / `market.index.tsx` displays condition badge.

## 5. Admin

- **`admin.tsx` → Offers tab**:
  - Recent offer activity, abuse leaderboard (from `seller_offer_risk`)
  - Buttons: suspend offers (sets `offers_suspended_until`), force-cancel offer, manual void
- Audit log entry for every admin action via existing `audit.functions.ts`.

## 6. Cron

`pg_cron` job every 5 min → `POST /api/public/hooks/expire-offers` to release stale authorizations (Stripe auto-releases ~7d but we want clean state + buyer UI accuracy).

## 7. Out of scope (call out)

- Doesn't touch live-auction bidding flow (separate system).
- Doesn't rebuild seller_trust reserve logic (already shipped Phase prior).
- Existing offers (no PI) get `payment_status='legacy'` and are read-only — no migration of historic data.

## Technical notes

- Stripe `PaymentIntent` with `capture_method='manual'`, `confirm=true`, `off_session=true`, `customer=<saved>`, `payment_method=<default card>`. If `requires_action` (3DS), return `client_secret` to buyer UI to confirm — only mark `authorized` after PI status is `requires_capture`.
- Capture on acceptance: handle Stripe error codes `card_declined`, `expired_card`, `insufficient_funds` → mark `voided`, fire `offer_abuse_events.auth_failed`, push seller notification.
- Sibling offers on same `queue_item_id`: on accept, loop pending siblings → `stripe.paymentIntents.cancel` then mark `declined`. Use a Postgres advisory lock on `queue_item_id` to prevent double-accept.
- Idempotency keys on every Stripe call: `offer:<id>:create | capture | cancel`.

Ready to migrate the DB and implement once you approve.
