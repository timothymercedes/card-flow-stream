# PullBid Live — Model A Stripe Connect review and migration plan

## Scope and confirmed decisions

Read-only review completed November 12, 2026: source, database schemas/policies/functions, Stripe capabilities and live subscriptions. No production code, database, Stripe configuration or funds changed. Deployed legacy edge inventory and carrier provisioning remain unverified.

Target: Separate Charges and Transfers; Embedded Checkout for marketplace; preserve automatic saved-payment auctions; hosted Express onboarding. Unlock only verified-delivered earnings. Reserve release terms await Stripe review; do not activate until approved. Preserve existing 5% commission/order-specific rates and fees unless separately approved; reserve is not commission.

## Inspection findings and required changes

- **Current destination charges:** marketplace Checkout, automatic auctions and tips use `transfer_data.destination` plus `application_fee_amount`. Sellers receive transfers immediately, before local delivery holds. New marketplace/auction charges must collect on the platform with later transfers. Keep promotions platform-only; decide tip scope separately.
- **Split Stripe access:** managed Checkout uses gateway/dahlia; onboarding, auctions, tips, refunds, shipping charges and reconciliation retain legacy secret/acacia access. Verify both account identities and old objects before consolidation. Hosted Express onboarding exists, but account mapping lacks test/live separation. Add environment mappings, capability checks, race-safe creation and allowlisted onboarding URLs.
- **Incomplete accounting:** order commissions, profile balances, audit/revenue records and holds exist, but no authoritative seller earnings ledger. Add balanced append-only journals and per-order cents allocations; grouped Checkout can disagree with order-specific rates. Keep actual processing fees, taxes, shipping, insurance, commission and reserve separately traceable.
- **Conflicting eligibility:** first scan currently releases all remaining funds after 24 hours; delivery releases immediately. The balance view ignores milestones. Another function releases all delivered earnings, early undelivered earnings and owner/admin exceptions. Current trust schedule is under 26:10%, 26–50:25%, 51–75:40%, 76–100:50%, 101–199:75%, 200+:100%. Replace with one eligibility/reservation calculation and no role-based reserve bypass.
- **Missing executor:** no explicit seller transfer/bank-payout executor found in app or retained edge source. A $9.50 request has been processing since May 22 without a transfer ID; resolve from evidence, not a manual completion flag.
- **Retry/duplication risk:** Checkout and event/revenue uniqueness exist, but events are marked processed before work succeeds, failures can suppress retries, and some dedupe errors allow continued processing. Payout requests lack unique transfer constraints. Add durable event/job states, transactional journals and stable business-action/Stripe keys.
- **Refund/dispute gaps:** current destination reversal flags cannot implement the new model. One-order cancellation can refund a whole grouped PaymentIntent; events copy aggregate refunds to every order. Disputes affect only the first order and won cases remain disputed. Add order-specific allocations, explicit reversals, pending/failed states and recovery debt.
- **Incorrect Shippo verification:** current body-only HMAC/headers differ from documented `Shippo-Auth-Signature` with `t=...,v1=...` over `timestamp.body`. Add freshness, tracking/carrier binding, validation, event dedupe/order checks, environment isolation and retry on persistence failures. Seller edits/AI photos cannot authorize delivery releases.

### Security blockers — not intentional advisories

- Anonymous/authenticated grants permit privileged `SECURITY DEFINER` RPCs (`set_order_shipping_status`, `complete_payout`, `allocate_payout_to_orders`, `log_platform_revenue`) whose inspected bodies lack caller authorization. Potential fabricated delivery, payout/accounting writes bypass table RLS. Restrict to service operations or explicit authorized wrappers before rollout.
- Protection triggers use execution-owner `current_user` bypasses inside privileged functions; seller update policies permit delivery-like state edits. Lock financial and verified-delivery fields to trusted operations.
- Request checks do not atomically reserve against concurrent requests, locks and in-flight amounts. Payable calculations diverge and one omits completed payout deductions.
- Trust recalculation references dispute/insurance enum labels absent from reported schema; correct and test before relying on it.

No exploit probes or financial writes were performed; urgent hardening needs a separately approved controlled change.

### Verified Stripe limitations

- **Live:** US platform cards/transfers active, payments/payouts enabled. Express seller timothymercedes has active transfers, enabled payouts and no currently due requirements. Seller payouts daily; platform payouts manual. This is not reserve-policy approval.
- **Test:** no sellers, empty platform capabilities, incomplete setup. Earlier creation failed because Connect signup is required; no creation attempt in this review. Test Connect activation remains a prerequisite.
- **Events:** live app subscribes only to subscription created/updated/deleted, Checkout completed and invoice payment failed. Missing payment failure, async settlement, refunds, disputes, account and transfer/payout events. Lovable's separate analytics endpoint does not feed app code; keep both endpoints. Event payloads use basil vs dahlia/acacia clients; audit compatibility.
- Platform is liable for fees, refunds and chargebacks; reversals can fail on insufficient connected balance. US is supported; international flows require country/region/currency checks.
- **Stripe is not escrow:** approve reserve duration, below-25 treatment, inactivity/closure and release deadlines before activation. Connected manual-payout limits (US two years, most countries 90 days) do not authorize indefinite platform holding. Normal balances are not segregated seller cash; funds segregation is private preview.
- Physical cards cannot use full digital-product compliance handling. Existing state-table tax calculation does not establish filing/remittance compliance; validate facilitator obligations separately.

## Delivery policy to implement after approval

| Verified completed deliveries | Unlocked share of net delivered earnings |
|---:|---:|
| 0–24 | Proposed 0%; requires approval of below-threshold/time-based release terms |
| 25–49 | 10% |
| 50–74 | 30% |
| 75–99 | 70% |
| 100+ | 95% |

Proposed basis: net seller earnings after the existing commission and approved seller-borne costs, excluding platform fees/taxes. Apply the current tier cumulatively to verified-delivered earnings; subtract prior transfers, active reservations, refunds/reversals, locks and debt exactly once. Tier increases release the incremental difference, not the same earnings twice. At the top tier, retain 5% as seller reserve liability, not platform revenue. Before the top tier, distinguish milestone-held earnings from the 5% reserve. Confirm grouping/count semantics and reserve deadlines before implementation.

## Phased migration

1. **Prerequisites:** activate test Connect; reconcile legacy account/object ownership; confirm US-first scope, commission basis, delivery counting, below-25 treatment and Stripe-approved reserve deadlines. Verify deployed legacy endpoints/carrier setup. Separately approve urgent RPC hardening.
2. **Additive schema, no switch:** environment-scoped accounts, payment/order allocations, seller journals, verified delivery receipts, transfer jobs/attempts/allocations, refunds/reversals and event inbox/outbox. Explicit grants/RLS, service-only writes, unique keys, integer cents/currency invariants. Keep old schema.
3. **Shadow reconciliation:** rebuild from verified Stripe/delivery evidence only; quarantine missing charge links (one paid order, zero charge-linked orders currently). Tag legacy destination charges/transfers; never transfer them again. Resolve the $9.50 request from evidence.
4. **Isolated tests:** retain production preview guards; dedicated test records, platform Checkout/automatic-auction charges, hosted test onboarding and verified-delivery accounting. Existing regression must still show shared production orders unpaid/unchanged.
5. **Executor:** atomically reserve eligibility; link transfers via `source_transaction` to settled charges and `transfer_group` to payment groups. Split cross-charge requests. Stable keys, ambiguous-failure reconciliation. Track transfers separately from bank payouts using documented events; do not assume `transfer.failed` exists.
6. **Loss lifecycle:** freeze new transfers; allocation-specific refunds/reversals; debt recovery and won-dispute reinstatement. Handle async failures, bank failures and disabled capabilities without duplicate credits.
7. **Regression gate:** success/decline/auth/async settlement; boundaries 24/25/49/50/74/75/99/100; commission vs reserve; duplicate/out-of-order events; concurrency; crash after Stripe acceptance; grouped partial refunds; disputes won/lost; bank failure and insufficient-balance reversals. Isolated test funds only.
8. **Separate live approval:** publish consumers before adding events; disabled-by-default Model A flag for new charges only, reviewed pilot. Preserve legacy refunds/reconciliation and both managed endpoints. Daily charge/journal/transfer/cash reconciliation. Rollback stops new jobs/routing; never deletes/resends accepted transactions.

## Sources

- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/hosted-onboarding
- https://docs.stripe.com/connect/manual-payouts
- https://docs.goshippo.com/docs/tracking/webhooksecurity/

Approval covers phased work only; reserve activation and live cutover remain blocked until the named prerequisites are satisfied.
