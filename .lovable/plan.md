## Shipping Insurance System

Adds optional, provider-agnostic shipping insurance across checkout, post-purchase, claims, and payouts. Integrates with the shipping/payout protection system already shipped.

### 1. Data model (migration)

**`listings` additions**
- `insurance_default` enum: `off | optional | required` (seller-level preference per listing, default `optional`)
- `insurance_auto_add_by_seller` bool — seller auto-buys insurance and eats the cost
- `insurance_paid_by` enum: `buyer | seller` (who pays when buyer doesn't opt in)

**`orders` additions**
- `insurance_status` enum: `none | requested | active | claim_pending | claim_approved | claim_denied | reimbursed`
- `insurance_provider` enum: `shippo | shipsurance | usps | ups | fedex | none` (extensible)
- `insurance_coverage_cents` int — defaults to item sale value
- `insurance_fee_cents` int
- `insurance_paid_by` enum: `buyer | seller`
- `insurance_purchased_at` timestamptz
- `insurance_provider_ref` text (carrier/Shippo insurance id)
- `insurance_added_post_purchase` bool — true ⇒ fee deducted from seller payout regardless

**New `insurance_claims` table**
- `order_id`, `claimant_user_id` (seller usually), `reason` enum (`lost | damaged | stolen`)
- `claim_amount_cents`, `status` enum (`draft | submitted | under_review | approved | denied | paid`)
- `provider_claim_ref`, `admin_notes`, `decided_by`, `decided_at`, `reimbursed_cents`, `reimbursed_at`
- RLS: seller sees own; admin sees all

**New `insurance_claim_evidence` table**
- `claim_id`, `file_path` (storage), `kind` (`photo | tracking | document | other`), `notes`
- Storage bucket `insurance-evidence` (private; signed URLs)

**New `insurance_providers` table** (config/registry)
- `code`, `display_name`, `is_active`, `supports_lost`, `supports_damaged`, `supports_stolen`, `min_cents`, `max_cents`, `rate_bps`, `flat_cents`
- Seeded with shippo, shipsurance, usps, ups, fedex (only shippo active initially)

**Payout integration**
- Extend `v_seller_available_balance` to subtract `insurance_fee_cents` when `insurance_added_post_purchase = true` OR `insurance_paid_by = 'seller'`
- Add rule: if `insurance_status IN ('claim_pending','claim_approved')`, freeze that order's payout eligibility
- Reimbursements credit back to seller balance via new `payout_adjustments` rows (already used for refunds)

### 2. Provider abstraction

`src/server/insurance/providers/` — one file per provider implementing:
```ts
interface InsuranceProvider {
  code: string
  quote(args): Promise<{ feeCents; coverageCents; supportsReasons }>
  purchase(args): Promise<{ providerRef; feeCents }>
  fileClaim(args): Promise<{ providerClaimRef }>
  refreshClaim(providerRef): Promise<{ status; reimbursedCents? }>
}
```
- `shippo.ts` — real implementation (Shippo `parcel.extra.insurance`)
- `shipsurance.ts`, `usps.ts`, `ups.ts`, `fedex.ts` — stubs returning "not implemented"; registered so UI/admin can switch later
- Registry in `src/server/insurance/index.ts` picks provider from `insurance_providers`

### 3. Server functions

`src/server/insurance.functions.ts`
- `quoteInsurance({ orderId | listingId, coverageCents })` — public, used by checkout & post-purchase modal
- `attachInsuranceAtCheckout({ orderId, optIn, coverageCents })` — buyer toggle path
- `sellerAddInsurance({ orderId, coverageCents })` — post-purchase; forces `insurance_added_post_purchase=true`, fee → seller
- `submitClaim({ orderId, reason, amountCents, evidence: [{path, kind}] })`
- `getOrderInsurance({ orderId })`
- Admin: `adminListClaims({ filters })`, `adminDecideClaim({ claimId, decision, notes, reimbursedCents })`, `adminFlagSeller({ sellerId, reason })`

All gated by `requireSupabaseAuth` + role check via existing `has_role`.

### 4. Shippo wiring (existing `shippo.functions.ts`)
- `purchaseLabel` reads order's `insurance_*` fields; if active, sets `parcel.extra.insurance = { amount, currency, provider: 'UPS' | 'FEDEX' | 'CARRIER' }` per Shippo API
- After label buy, store `insurance_provider_ref` from rate response
- Shippo tracking webhook already advances status — extend `shippo-tracking.ts` to flip `insurance_status` to `claim_pending` automatically when status becomes `lost_package` or `returned`+damaged note

### 5. Cron / automation
- Add `insurance-poll.ts` hook (every 6h) — refreshes `claim_pending` claims via provider `refreshClaim`, advances status, writes reimbursement when paid
- On `reimbursed`: insert `payout_adjustments(seller, +amount, 'insurance_reimbursement')`

### 6. UI

**Checkout (buyer)**
- New `<InsuranceOption>` card showing: protected amount (= sale price, editable up to listing cap), insurance fee, what's covered (lost/damaged/stolen badges from provider), est. claim resolution timeline
- Toggle "Protect this shipment" — defaults to seller's listing default
- If seller pre-paid, show "Insurance included by seller" (read-only)

**Listing form (seller)**
- "Shipping insurance" section: default mode (off/optional/required), auto-add toggle, who pays when buyer skips

**Seller order detail**
- "Insured" badge + provider name + coverage
- "Add/upgrade insurance" button (only before label purchased) → calls `sellerAddInsurance`, warning that fee comes out of payout
- "File a claim" button when status is `delivery_failed | lost_package | returned` or buyer reports damage
- Claim form: reason, amount, evidence uploader (drag-drop multiple files → `insurance-evidence` bucket)
- Claim status timeline

**Admin** (new route `/admin/insurance-claims`)
- Queue of `submitted | under_review` claims with evidence preview
- Approve/Deny with notes + reimbursement amount
- Per-seller claim history with auto-flag if >3 claims/90d or >20% claim rate → reuses existing `fraud_flags`

### 7. Payout impact summary
| Scenario | Who pays insurance fee | Payout effect |
|---|---|---|
| Buyer opts in at checkout | Buyer (added to charge) | No deduction from seller |
| Seller marks listing "auto-add" | Seller | Deducted from payout |
| Seller adds after purchase | Seller (forced) | Deducted from payout |
| Required by listing, buyer pays | Buyer | No deduction |
| Claim approved + reimbursed | n/a | Credit added to seller balance |
| Claim pending | n/a | That order frozen from payout |

### 8. Open question
Default provider to enable now: **Shippo** (already integrated). Others scaffolded as inactive — toggle on later from admin without code change. OK to proceed with Shippo-only active?
