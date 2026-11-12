# Test plan and approval gates

## Already performed — read-only/local

- Full public function/grant/definition inventory; provider-account and complete scoped Stripe lists; default saved method attachment read; cash transaction sums.
- Existing Vitest payment safety and confirmation suites: **12 tests passed**.
- Candidate SQL parsed locally: security proposal 107 statements; additive schema 66 statements. All 24 security and two ledger PL/pgSQL declarations also parsed locally. Not executed on any database; parsing does not verify table resolution, grants, business semantics or runtime compatibility.
- No checkout purchases, test seller creation, transfer/payout, exploit probes, production writes or new webhooks in this phase.

## Isolated database security gate — after explicit approval

Use a disposable database with application schema copied safely, not shared production. Test anonymous, seller A, seller B, buyer, admin, owner, support, trusted service and no-JWT maintenance contexts.

1. Every service-only function denies anonymous/authenticated direct access; no role can spoof service via input or NULL uid. Internal audited helpers remain callable only through authorized root wrappers/triggers.
2. Cross-seller balance, holds, complete/fail/allocate payouts, fabricated revenue and shipping status mutation rejected. Authorized admin hold management works through reviewed server operation. Fake transfer IDs cannot mark complete.
3. Packed/ready/scans deny signed-out/unrelated callers. AI/manual scans never create carrier delivery authority. Nullable dispute participant must not grant outsider access.
4. Ordinary order INSERT cannot claim paid/commission/payout/Stripe linkage; seller UPDATE cannot change carrier-delivered status or finances; buyer edits only permitted unpaid addresses. Legitimate break checkout, zero-price giveaway, inventory sale, shipping labels and profile updates continue working.
5. Auction rearm/finalize reject anonymous/outside callers and premature expiry; seller/winner after expiry, audited admin force and verified cron paths work. Revoking raw reconcilers must not break scheduled jobs.
6. Profile balance/Stripe/risk fields cannot be edited directly. Approved identity/acceptance/notification/XP paths continue; separately audit redeemable credit authority.
7. Service actor scopes are checked before admin-client access in server functions. No private key in browser modules/logs. Failure surfaces provider error safely, not generic apparent success.

## Additive ledger gate

- Every new table GRANT/RLS correct; own-seller reads only; no browser journal/inbox/payout payload access. Cross-environment/currency/seller FK combinations rejected.
- Unbalanced journals, empty journals, journal/entry UPDATE/DELETE rejected. Compensating journal succeeds atomically.
- $100 item / $5 commission / $95 seller net; top-tier unlocked=$90.25, reserve=$4.75. Commission never includes reserve.
- Milestone boundaries: 24 unresolved/no activation; 25=10%, 49=10%, 50=30%, 74=30%, 75=70%, 99=70%, 100=95%, over100 capped95. Undelivered earnings always zero eligible.
- Prior transfers/reservations/refunds/holds/debt counted exactly once; duplicate receipts and grouped delivery count once. Legacy destination/quarantined data cannot schedule another transfer.
- Concurrent withdrawal requests cannot reserve more than entitlement. Lease expiry, crash before/after Stripe response and ambiguous network retry reconcile to one transfer action.
- Full/partial grouped refunds, refund-pending/failure, disputes withdrawal/won/lost, async payment failure, reversal-insufficient balance and bank failure preserve original economics.

## Stripe fake-money end-to-end gate — separate approval required

Prerequisites: existing test Connect activated, test-only Express seller hosted onboarding, fake bank fixtures and dedicated environment-scoped orders/ledger. No shared production order or balance can be mutated.

- Embedded marketplace Checkout success/decline plus SCA; automatic auction success/decline/requires_action on test saved method.
- Retrieve test PI/charge: account/livemode, paid evidence, database amount, no transfer_data/application_fee_amount; seller transfer absent before verified delivery/eligibility.
- Signed test webhook receipt/retry/out-of-order state updates isolated test ledger only. Live-signature/test-env mismatch rejects. Shippo signed fake delivery binds actual test shipment and freshness.
- Approve test transfer after eligibility; verify source charge, destination, amount, stable key; retries produce one accepted Stripe transfer. Approve fake bank payout separately; verify paid/failed states distinct from transfer accepted.
- Existing scripts/marketplace-payment-e2e.py stays available but is **not run in this read-only phase** because it creates/deletes fixtures and fake charges. Re-run after approval, still proving shared production orders remain unpaid/unchanged, no live transfer/payout, clean up only owned fixtures.

## Production gate — not approved

Expanded marketplace gate: test all eight category snapshots, mixed-seller/mixed-category allocations, physical-product tax classification and prohibited/review-pending category rejection. Reject Affirm for titled vehicles and B2B purchases; verify actual enabled-method country/category/amount restrictions before launch. Verify parcel/freight proof, and that unapproved pickup/vehicle handover cannot unlock earnings. Reject spoofed seller classification, category-changing-after-charge and cross-platform account mappings. Sealed journals reject late appended lines. New tests are specified here, not run or claimed passing.

All security/caller/schema tests passed; reserve/holding terms confirmed; evidence shadow reconciliation balanced; account capability checks current; Stripe event consumers deployed before subscriptions; separate live pilot/cutover approval. No existing payment routing replaced, no old charge retransferred, no automatic release of $9.50 request. Marketplace smoke flow must pass before any deployment.
