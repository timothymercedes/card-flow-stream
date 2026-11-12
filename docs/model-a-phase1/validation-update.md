# Approved preparation results — November 12, 2026

## Prepared and checked

- Read-only database definition drift check: all 261 baseline function MD5 hashes match current definitions. Current policy/trigger evidence inspected; 314 source caller references indexed (includes reads and writes, not 314 verified mutations).
- New undeployed `security-companion-tables.review.sql`: field allowlists and trusted order creation, fail-closed profile/order gates, financial table write grant restrictions. This is a **candidate**, not a standalone release. It deliberately blocks protected writes from authenticated definer roots too; these roots must be replaced/adapted with server authorization before deployment.
- New `ledger-posting.review.sql`: service-only transactional full-batch posting, durable journal sealing, late-line rejection and conflicting replay detection. Structural service authority does not substitute for verified settlement evidence.
- New pure policy candidate: 25/50/75/100 → 10/30/70/95%, unapproved/below-25 policy fails closed, prior transfers/reservations/debt deducted once, legacy destination allocations blocked. **15 policy tests passed**; **12 existing payment tests passed**.
- Existing 12-table accounting draft plus posting/sealing extension executed in a disposable local PostgreSQL database with synthetic auth helpers, not on Lovable Cloud/project data. Local tests passed for identical replay/no duplicate lines, late-line rejection, conflicting request and cross-platform replay rejection, browser EXECUTE denial and unbalanced transaction rollback.
- Local execution found an actual shared balance-trigger record-field error missed by prior syntax parsing. Corrected `accounting-schema.review.sql` to read id/journal_id through JSON record projection; local test rerun passed. No project database function was modified.

## Not completed / not deployment-ready

- Complete application caller patch, all authenticated definer root replacements, exact column grants/RLS compatibility and full isolated application schema/trigger chain execution are still outstanding. Current companion table candidate would break protected legal/reward/admin/order creators unless shipped with these adaptations.
- Settlement/reservation/executor/refund/dispute/fulfillment adapters and full additive cross-platform/category schema semantics remain specified, not implemented end-to-end. Sealed posting is a validated structural foundation only.
- Stripe test Connect activation, category underwriting, reserve aging/below-25/counting terms and Shippo provisioning still require manual/provider decisions. No test seller, fake charge, transfer or payout created in this preparation.
- Local synthetic auth tests are not proof of actual hosted RLS/cron/caller compatibility. No security finding marked resolved from these tests.

## Safety confirmation

Production source/charge routing, seller balances, saved-payment auctions, accounts/history, live Stripe settings and project database remain unchanged. Only review documents/candidate files and architecture guidance changed. No security or accounting migration applied. No deployment, publish or live/test Stripe mutation occurred.