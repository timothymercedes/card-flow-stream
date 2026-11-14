# PB Bazaar — revised design review

**Approval boundary: design refinement only. No database execution or application activation is authorized.**

The complete schema dictionary, permission matrix, migration/rollback procedures and test plan are in [the revised design](../docs/bazaar-schema-review.md). This plan replaces the previous short review, not the working product pages or browser cart.

## Revised design

- Preserve the existing guest browser cart. Future signed-in transfer uses an optional, server-validated, once-only merge receipt; failures preserve guest items, account switches cannot leak carts, and concurrent edits are retained.
- Revalidate identity, prices, currency, inventory, variant/product/store relationships, publication, approval, destination eligibility and quote expiry on the server before any order creation.
- Create parent/store orders and all holds in one transaction or none. Lock stock and publication/approval rows; reserve, expire, release and commit exactly once. Cart additions never hold stock.
- Handle supplier rejection, uncertain acceptance, delays, partial cancellations and shipment allocations per purchased line. Durable commands prevent duplicate submissions; ambiguous provider outcomes require reconciliation, not blind retries.
- Separate private delivery details, supplier costs/commands and financial references from safe customer/store history. Customers see their orders; store owner/admin/fulfillment sees only its store portion; catalog/viewer sees no customer order information; suppliers have no direct database access.
- Account for partial cancellations/returns using immutable minor-unit allocations and append-only adjustments. Request approval is not proof of cash refund; payment/refund execution remains separately gated.

## Technical schema

20 proposed tables, with explicit columns, keys, unique constraints, indexes, grants, RLS and service-only operations documented in the revised design:

1. Account carts, cart items and idempotent import receipts.
2. Customer orders, store orders, immutable order lines and private per-store delivery details.
3. Approved suppliers and private supplier/product mappings.
4. Inventory controls and expiring reservations.
5. Fulfillments, line allocations, shipments and shipment-line allocations.
6. Cancellation/return requests and append-only financial adjustments.
7. Supplier event history, durable supplier commands and order audit events.

All new-table relationships include environment/scope protections, explicit delete restrictions and referencing indexes. No managed-auth FK, new profile table, Marketplace/PB Store order reuse or public access to these tables. Existing variant prices have no currency field: server currency configuration must be reviewed before account/order enablement.

## Proposed defaults needing review

- Reservation expiry: 15 minutes; no client-controlled indefinite renewal.
- Supplier acceptance deadline: 24 hours unless the verified supplier contract specifies otherwise.
- Signed-in order creation only; no substitutions without a separately designed customer-consent process.
- Return windows, shipping/tax refundability, currency configuration and data retention remain undecided release gates.

## Migration plan — not authorized now

1. Verify an isolated test database/auth/storage and target permission; inspect current hosted schema drift and recovery availability.
2. Prepare complete additive SQL candidates outside migration/application directories for review.
3. Install/test account cart schema, then order/private/accounting schema, then coupled inventory controls, then supplier/logistics/history schema **only after separate explicit execution authorization**.
4. Verify installed constraints/grants/RLS, atomicity, safe projections and existing-app compatibility with all new actions disabled.
5. Request independent approvals for account enablement, orders/reservations, supplier activation, payments/refunds, production database changes and deployment.

No schema destruction, live fixtures, copied legacy financial records, existing media/team/approval policy changes or live provider calls.

## Rollback plan

- No database/runtime rollback needed for this document-only revision.
- Failed future batches roll back transactionally; inspect actual state before retry.
- Keep successfully added schema inert; disable/revoke only new operations rather than deleting history.
- Future active holds/unknown supplier commands must be reconciled before removing stock protections or pausing processing; do not blindly undo external orders or restore old stock.
- Shared-backend restoration is not a safe local rollback and would require independent authorization.

## Test plan

Use physically isolated test auth/database/media, deterministic supplier adapters and run-owned fixtures; flags alone do not isolate the shared live backend. No test/live secrets or event crossover.

Verify guest merge retries/concurrency/account switches; server tampering and publication races; two buyers/one unit, expiry/commit and once-only stock release; every role against every table and private projection; partial acceptance/dispatch/cancellation; exact rounding/refund caps and duplicate events; install/failure/recovery; real guest/signed-in shopping, approval/team/media and unchanged Marketplace/PB Store/payment behavior. Prove fixture cleanup and no live mutations.

**All proposed-schema tests remain planned, not passed.** Existing shopping fixture checks are not populated hosted-data verification.

## Requested review

Review the 20-table design, access boundaries, proposed defaults and staged recovery/tests. Approval of this plan remains **design approval only**; wait for separate explicit database authorization before executing any changes. Checkout, payments, Stripe, payouts, supplier ordering and production deployment are not activated.