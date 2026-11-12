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

## Findings: what needs to change

- **Wrong charge model:** marketplace Checkout uses `transfer_data.destination` and `application_fee_amount`, so sellers receive destination transfers immediately. Delivery holds only affect local balances. Auctions and tips also use destination charges. New marketplace/auction charges need platform-only collection and later transfers; tip scope remains separate.
- **Two Stripe clients:** managed Checkout uses gateway/dahlia; onboarding, auctions, tips, refunds, shipping charges and reconciliation retain a legacy secret/acacia client. Reconcile account identities and old objects before standardizing server-only, explicit-environment access.
- **Onboarding:** hosted Express onboarding exists, but mappings have no environment and allow only one account per seller. Add test/live mappings, capability/requirements checks, race-safe creation and allowlisted return links.
- **Accounting:** commission/order amounts, profile balances, balance audit, revenue, locks and holds exist, but no single authoritative seller earnings ledger. Add append-only balanced journals with cents, currency, environment, charge/order allocations and pending/delivered/unlocked/reserved/transferred/reversed buckets. Snapshot order fees; grouped Checkout can disagree with order-specific commission rates.
- **Eligibility conflicts:** first carrier scan releases all remaining funds after 24 hours; delivery releases immediately. The available-balance view ignores milestones. Another function releases 100% of delivered earnings, some undelivered earnings, and gives owner/admin exceptions. Replace these with one atomic eligibility/reservation calculation.
- **Current thresholds differ:** under 26 deliveries 10%; 26–50 25%; 51–75 40%; 76–100 50%; 101–199 75%; 200+ 100%.
- **No seller executor found:** app/retained edge source has no explicit seller transfer or bank-payout executor. One $9.50 request has been processing since May 22 with no transfer ID; do not complete it without Stripe evidence.
- **Retry risk:** event/revenue IDs and Checkout idempotency exist, but webhooks mark events processed before completing work, suppress failed retries, and continue after some dedupe errors. Payout requests lack unique transfer constraints. Add durable inbox/outbox states, transactional journals and unique business-action/idempotency keys.
- **Refund/dispute gaps:** destination-charge reversal flags are incompatible with the new model. Cancelling one grouped order can refund the whole PaymentIntent; refund events copy the aggregate to each order. Disputes affect only the first order and won cases remain disputed. Add allocation-specific refunds, explicit reversals, pending/failed states and debt recovery.
- **Shippo mismatch:** fail-closed verification uses incorrect headers/body-only HMAC. Current Shippo uses `Shippo-Auth-Signature`, `t=...,v1=...` and `timestamp.body`. Add freshness, schema checks, tracking/carrier binding, event dedupe/order checks, environment isolation and retry on database errors. Seller edits and AI photo scans must never be delivery authority.

### Security blockers found during inspection

**Treat these as potential vulnerabilities requiring a separately approved hardening step before rollout, not intentional linter advisories.**

- Database grants allow anonymous and authenticated callers to execute privileged `SECURITY DEFINER` functions including `set_order_shipping_status`, `complete_payout`, `allocate_payout_to_orders`, and `log_platform_revenue`. Their inspected bodies lack caller authorization. This can permit fabricated delivery, payout completion/allocation or revenue records despite table RLS.
- Order/profile protection triggers use `current_user` bypass checks inside privileged functions; execution-owner identity can bypass the protection. Seller update policies also permit delivery-like state changes. Lock financial/verified-delivery fields to trusted service operations, with explicit JWT-role checks where needed.
- Balance calculations diverge; payout insertion checks do not atomically reserve against simultaneous requests, in-flight requests and all locks. One calculation also omits previously completed payout deductions.
- Trust recalculation references dispute/insurance enum labels absent from the reported schema; validate and correct these before using it in payout decisions.

No financial writes or exploit probes were performed to demonstrate these issues.

## Stripe account and provider limitations

- **Live:** US platform has active cards/transfers and enabled payments/payouts. Express seller timothymercedes has active transfers, enabled payouts and no currently due requirements. Seller bank payouts are daily; platform payouts are manual. This supports a US-first design, not approval of the reserve policy.
- **Test:** no sellers, empty capabilities and incomplete setup. Prior creation failed because Connect signup is required; this review made no creation attempt. Activate existing test Connect before isolated transfer tests. Never substitute live accounts.
- **Missing live events:** app endpoint subscribes only to subscription created/updated/deleted, Checkout completed and invoice payment failed. Add payment failures, async settlement, refunds, disputes, account updates and documented transfer/payout lifecycle events after consumers are ready. The separate Lovable analytics endpoint does not feed app code; retain both endpoints.
- **API versions:** live events use basil; managed requests use dahlia; legacy requests use acacia. Audit payload compatibility, do not blindly upgrade.
- Platform pays Stripe fees, refunds and chargebacks. Reversals can fail on insufficient seller balances; model recovery debt. US is supported, but cross-border transfers have region/currency/capability restrictions.
- **Reserve approval required:** Stripe is not escrow. A milestone-only indefinite hold is not automatically allowed. Connected manual-payout limits (US two years, most countries 90 days) are not permission for indefinite platform holding. Confirm reserve duration, below-25 treatment, inactivity/closure and release deadlines with Stripe and appropriate legal advice.
- Normal platform cash is not segregated seller cash. Stripe funds segregation is private preview; accounting alone cannot protect seller liabilities from platform spending.
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
