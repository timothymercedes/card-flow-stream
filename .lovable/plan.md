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

| Area | Inspected state | Required change |
|---|---|---|
| Charge model | Live marketplace Checkout uses `transfer_data.destination` and `application_fee_amount`: destination charges, not separate transfers. Automatic auctions and tips also use destination charges. | New marketplace/auction charges stay on the platform, with `transfer_group`, no destination transfer or application-fee parameter. Determine tip scope separately; promotions remain platform-only. |
| Stripe access | Marketplace Checkout uses managed gateway Stripe access, API version `2026-03-25.dahlia`. Onboarding, auctions, tips, refunds, shipping adjustments and reconciliation still use a separate legacy secret/client with an older API version. | Standardize on environment-explicit, server-only gateway access after reconciling both account identities. Never assume old charges/customers are portable between accounts. |
| Seller setup | Hosted Express account creation exists; its account mapping has no environment and only one row per seller. Preview rejects live setup. | Environment-scoped account mappings and hosted links with allowlisted return/refresh URLs, race-safe account creation and current capability/requirement checks. For platform charges, transfer readiness—not seller direct-charge readiness—is central. |
| Commission | Order commission amounts and platform revenue entries already exist. Fees mix decimals and integer cents; fixed-price grouped Checkout can calculate a group commission differently from order-specific commission rates. | Snapshot versioned per-order cents allocations and reconcile their sum to the charge, including shipping, insurance, taxes and actual Stripe fees. |
| Earnings | Orders, profile balances, `balance_audit_log`, revenue entries, holds, locks and payout requests exist, but do not form one authoritative seller earnings ledger. | Append-only, balanced accounting linked to charge/order/seller/currency/environment, with pending, delivered, unlocked, reserved, transferred and reversed states. Seller read-only access; service-only mutations. |
| Eligibility | Carrier first scan currently releases all remaining order funds after 24 hours; delivery releases immediately. The available-balance view ignores the requested milestones. Another payable function gives 100% to delivered earnings, early access to undelivered earnings and owner/admin exceptions. | One authoritative eligibility calculation and atomic reservation used by both UI and executor. Only verified-delivered earnings, no owner/admin reserve bypass. Remove the first-scan payout-release rule at approved cutover. |
| Existing milestones | Current trust schedule: under 26 deliveries 10%; 26–50 25%; 51–75 40%; 76–100 50%; 101–199 75%; 200+ 100%. | Replace with the confirmed 25/50/75/100 thresholds and retain risk freezes independently. |
| Executor | No explicit seller `transfers.create`/bank-payout executor found in app or retained edge source. One $9.50 request has been processing since May 22, with no transfer ID. | Reviewed transfer worker with reservations, reconciliation, recoverable failures and separate bank-payout status. Do not mark the old request completed without Stripe evidence. |
| Duplicate protection | Checkout has idempotency; webhook IDs and revenue event IDs are unique. Payout requests have no unique Stripe transfer constraint. Webhooks insert “processed” before work, skip retries after downstream failure, and continue after some dedupe failures. | Durable event inbox/outbox with processing states, transactional accounting, retryable jobs, unique business-action keys and Stripe idempotency keys. Deduplicate accounting by charge/order/action, not just event ID. |
| Refunds/disputes | Refund helper uses destination-charge reversal flags and can refund an entire grouped PaymentIntent when cancelling one order. Refund webhook copies aggregate refunded amount to every grouped order. Disputes use only the first linked order and leave won cases marked disputed. | Order-specific refunds; explicit transfer reversals; proportional allocations; pending/failed refund states; dispute fund withdrawals/reinstatements; recovery debt when reversals cannot succeed. |
| Delivery webhook | Shippo handler fails closed, but checks non-documented signature headers and HMAC over body alone. Current Shippo HMAC uses `Shippo-Auth-Signature`, `t=...,v1=...`, and `timestamp.body`. Handler lacks event dedupe/order checks and acknowledges database errors. | Provider-correct authentication, freshness validation, schema validation, tracking/carrier binding, environment isolation, chronological/idempotent transitions and retry on failed persistence. AI photos/seller edits are evidence only, never delivery authority. |

### Security blockers found during inspection

**Treat these as potential vulnerabilities requiring a separately approved hardening step before rollout, not intentional linter advisories.**

- Database grants allow anonymous and authenticated callers to execute privileged `SECURITY DEFINER` functions including `set_order_shipping_status`, `complete_payout`, `allocate_payout_to_orders`, and `log_platform_revenue`. Their inspected bodies lack caller authorization. This can permit fabricated delivery, payout completion/allocation or revenue records despite table RLS.
- Order/profile protection triggers use `current_user` bypass checks inside privileged functions; execution-owner identity can bypass the protection. Seller update policies also permit delivery-like state changes. Lock financial/verified-delivery fields to trusted service operations, with explicit JWT-role checks where needed.
- Balance calculations diverge; payout insertion checks do not atomically reserve against simultaneous requests, in-flight requests and all locks. One calculation also omits previously completed payout deductions.
- Trust recalculation references dispute/insurance enum labels absent from the reported schema; validate and correct these before using it in payout decisions.

No financial writes or exploit probes were performed to demonstrate these issues.

## Stripe account and provider limitations

- **Live:** US platform has active card-payment and transfer capabilities; charges and payouts are enabled. One Express seller, timothymercedes, has active transfers, enabled payouts and no currently due requirements. Its bank payout schedule is daily; the platform schedule is manual. This supports a US-first design, but is not approval for the proposed reserve policy.
- **Test:** no connected sellers; platform capabilities are empty and setup details incomplete. Prior approved account creation failed because Connect platform signup is required. This review made no new creation attempt. Activate Connect on the existing test platform before transfer testing; never substitute live accounts.
- **Live event coverage:** app endpoint currently subscribes only to subscription created/updated/deleted, Checkout completed, and invoice payment failed. It is missing marketplace payment-failure, async settlement, refunds, disputes, account updates and transfer/payout lifecycle events. The separate Lovable analytics endpoint does not deliver those events to app code; retain both endpoints.
- **Version mismatch:** live webhook payloads are `2025-03-31.basil`, while managed requests use dahlia and legacy client uses acacia. Audit payload compatibility; do not blindly upgrade event versions.
- Separate charges make the platform responsible for Stripe fees, refunds and chargebacks. Reversals can fail if the connected balance is insufficient; retain an explicit recovery/negative-balance policy.
- US is supported; international transfers are restricted by region/country/currency and account capability. Start US/USD; expand only after Stripe confirms supported flows.
- Stripe does not provide escrow. A milestone-only indefinite hold is not automatically permissible. Published manual-payout limits concern connected balances (US: two years; most other countries: 90 days), **not blanket permission to keep buyer funds on the platform**. Confirm reserve duration, below-25 treatment, seller inactivity/closure and required release deadlines with Stripe and appropriate legal advice.
- Ordinary platform balances are not segregated seller accounts. Stripe funds segregation is private preview; ledger accounting alone does not safeguard cash from unrelated platform spending.
- Physical cards are not eligible for full digital-product compliance handling. Current tax calculation is a state-rate table, not verified filing/remittance compliance; leave unchanged during this review and separately validate facilitator obligations.

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

1. **Prerequisites and approval:** activate test Connect; confirm account ownership for every legacy object, US-first scope, commission/fee basis, delivery counting, below-25 release, and Stripe-approved reserve deadlines. Inventory deployed legacy endpoints and provider subscriptions. Review urgent RPC hardening as a separate controlled change.
2. **Additive schema, no flow switch:** add environment-scoped account mappings, payment groups/order allocations, seller ledger journals, verified delivery receipts, transfer jobs/attempts/order allocations, reversals/refunds and retryable event inbox/outbox. Add explicit GRANTs/RLS, service-only writes, uniqueness and integer-cent/currency invariants. Do not drop old columns/tables.
3. **Shadow reconciliation:** rebuild historical accounting only from verified Stripe objects and delivery evidence; quarantine records lacking charge links. Current database has one paid order but no charge-linked orders. Tag legacy destination charges and existing automatic transfers; never transfer those proceeds again. Resolve the $9.50 request manually from evidence.
4. **Isolated test implementation:** preserve production preview guards. Use dedicated environment-scoped test records, platform Checkout and automatic-auction charges, hosted test seller onboarding, authenticated delivery verification and eligibility accounting. Existing checkout smoke tests must continue asserting production orders remain unpaid/unchanged.
5. **Transfer execution:** atomically reserve eligible cents; create transfers linked by `source_transaction` to settled source charges and `transfer_group` to payment groups. Split cross-charge requests into allocations. Use stable idempotency keys and retry reconciliation after ambiguous failures. Stripe acceptance is not bank payout completion. Use connected-account lifecycle events for bank success/failure; select only documented events—do not assume a `transfer.failed` event exists.
6. **Refund/dispute lifecycle:** block new transfers immediately, refund only the relevant allocation, reverse eligible transferred sums, journal losses/recoveries and restore funds after won disputes. Handle asynchronous payment failures and capability/bank restrictions without crediting money twice.
7. **Regression gate:** test success, decline, authentication and async settlement; milestones at 24/25/49/50/74/75/99/100; commission separate from reserve; duplicate/out-of-order events; concurrent requests; crash after transfer acceptance; partial grouped refunds; disputes won/lost; bank payout failure; insufficient balance and reversal failure. Test transfers/payouts only after isolated Connect setup is available. No live funds or production earnings mutations.
8. **Separate production cutover approval:** publish verified consumers before adding live events. Enable Model A for new charges only via a disabled-by-default feature flag and reviewed pilot. Keep legacy reconciliation/refund handling per charge model. Preserve both managed endpoints. Monitor daily charge/ledger/transfer/cash reconciliations. Rollback stops new jobs and reverts new-charge routing; never retransfers or deletes accepted transactions.

## Sources

- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/hosted-onboarding
- https://docs.stripe.com/connect/manual-payouts
- https://docs.goshippo.com/docs/tracking/webhooksecurity/

Approval covers phased work only; reserve activation and live cutover remain blocked until the named prerequisites are satisfied.
