# PullBid Live — Model A Stripe Connect review and migration plan

## Scope and status

Read-only inspection completed on November 12, 2026: current payment code, database columns, policies, function grants, triggers, balance calculations, retained edge-function source, Stripe platform/connected-account capabilities, and live webhook subscriptions.

**No production payment code, database schema/data, Stripe configuration, accounts, or funds were changed.** Only planning documents and standing requirements were updated. Repository code is not proof of the currently published deployment; deployed legacy edge-function inventory and actual carrier webhook provisioning still require verification.

## Decisions confirmed

- Use **Separate Charges and Transfers**: buyers pay the platform; sellers receive separately scheduled transfers after eligibility checks.
- Use Stripe Embedded Checkout for marketplace purchases. Preserve saved-payment automatic charging for live auctions, but migrate its fund routing too.
- Only verified-delivered earnings qualify. No early release from undelivered orders.
- Seller onboarding remains Stripe-hosted Express onboarding.
- Reserve release terms are deferred until Stripe review; do not activate the reserve-based payout policy until approved.
- Existing commission is 5% in code; preserve existing order-specific rates and fee rules unless separately approved. Commission and reserve are distinct.

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

1. **Prerequisites:** activate test Connect; confirm account identity for legacy objects, US-first scope, commission basis, delivery count/group semantics, below-25 treatment and Stripe-approved reserve deadlines. Verify deployed legacy endpoints and carrier provisioning. Review urgent RPC hardening as a separately controlled change.
2. **Additive schema, no switch:** environment-scoped seller accounts, payment groups/order allocations, seller journals, verified delivery receipts, transfer jobs/attempts/allocations, refunds/reversals and event inbox/outbox. Explicit grants/RLS, service-only mutations, uniqueness and integer-cent/currency invariants. Keep old columns/tables.
3. **Shadow reconciliation:** rebuild only from verified Stripe/delivery evidence; quarantine missing charge links. Current database has one paid order and no charge-linked orders. Tag legacy destination charges/transfers and never transfer them again. Resolve the $9.50 request from evidence.
4. **Isolated test implementation:** keep production preview guards; use dedicated test records, platform Checkout/automatic-auction charges, hosted test onboarding, verified delivery and eligibility. Existing regression keeps asserting shared production orders stay unpaid/unchanged.
5. **Transfer executor:** atomically reserve eligibility; link each transfer via `source_transaction` to settled source charges and `transfer_group` to payment groups. Split multi-charge requests; use stable keys and reconcile ambiguous failures. Transfer acceptance is not bank payout completion; track those separately using documented events, not an assumed `transfer.failed` event.
6. **Loss lifecycle:** freeze new transfers on refunds/disputes; refund only relevant allocations; explicitly reverse transferred sums; journal recovery debt and won-dispute reinstatement; handle async failure, bank failure and disabled capabilities without double credits.
7. **Regression gate:** success/decline/authentication/async settlement; boundaries 24/25/49/50/74/75/99/100; reserve distinct from commission; duplicate/out-of-order events; simultaneous requests; crash after Stripe acceptance; grouped partial refunds; disputes won/lost; bank failure; insufficient balances/reversal failure. Test money and isolated records only.
8. **Separate live cutover approval:** publish verified consumers before adding events. Disabled-by-default feature flag enables Model A for new charges only through a reviewed pilot. Preserve per-model legacy refunds/reconciliation and both managed endpoints. Reconcile charges, journals, transfers and cash daily. Rollback stops new jobs/routing; never delete or resend accepted transactions.

## Sources

- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/hosted-onboarding
- https://docs.stripe.com/connect/manual-payouts
- https://docs.goshippo.com/docs/tracking/webhooksecurity/

Approval covers phased work only; reserve activation and live cutover remain blocked until the named prerequisites are satisfied.
