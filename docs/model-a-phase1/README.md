# PullBid Live — Phase 1 preparation package

**Review only. No production payment, live Stripe setting, balance, transfer, payout or database changes.** All SQL proposals live outside migration directories and were not submitted to any migration/deployment tool.

## Prioritized implementation checklist

**November 12 scope update:** PullBid Live is a multi-category physical-goods hybrid marketplace, not a card-only business. See `marketplace-compliance.md`, `security-completion-spec.md`, and `ledger-implementation-spec.md` for the updated business description, complete coupled implementation scope and acceptance gates. These are review specifications, not implemented or runtime-tested patches; existing SQL drafts remain incomplete and must not be applied alone.

### P0 — authorization and evidence
- [x] Inventory all 261 public functions, including all 204 SECURITY DEFINER definitions, grants and hashes; identify 25 high-priority financial/delivery cases.
- [x] Prepare bounded grant/authorization SQL proposal and companion table/caller hardening requirements.
- [x] Verify managed and legacy live credentials belong to the same platform.
- [x] Enumerate complete current live charge/transfer/refund/payout/balance histories; document $9.50 request as unverified, never complete or release it.
- [ ] Apply nothing until explicit review approval; then finish coupled table/caller patches and run an isolated database test gate. Current SQL candidate is not a standalone production-ready release.

### P1 — platform prerequisites
- [x] Identify existing test platform and manual Connect signup steps.
- [ ] Stripe owner activates Connect in the existing test environment; account-specific wizard remains unobservable here.
- [ ] Stripe confirms reserve duration, below-threshold release, inactivity/closure and delivery-count policy. No reserve activation before confirmation.
- [ ] Verify actual Shippo HMAC provisioning and deployed legacy endpoint inventory; repository source is not deployment proof.

### P2 — additive accounting design
- [x] Prepare environment-isolated schema candidate: accounts, payment groups/order allocations, event inbox, delivery receipts, balanced immutable journals/entries, transfer jobs/allocations/attempts, losses and bank-payout records.
- [ ] Approve schema semantics, shipment-vs-order delivery count, reserve deadlines and service posting/reservation functions.
- [ ] Isolated migration and transactional posting tests, then shadow accounting from verified evidence only. No backfill from unsupported paid flags.

### P3 — behavior and regression
- [x] Confirm saved-payment automatic auctions can retain off-session charging while platform owns charges and transfer occurs later.
- [x] Run existing payment safety/confirmation tests: 12/12 passed; local SQL parsing passed. No new Stripe actions performed.
- [ ] Approve test-only onboarding and fake-money transfer/payout tests once test Connect and dedicated test records exist.
- [ ] Separately approve live event subscriptions and new-charge cutover only after all gates pass. Legacy destination charges must never receive another seller transfer.

## Important verified results

- Managed and legacy live platform: same account. Existing default saved card/customer attached to that platform; no cross-account move needed for this verified method.
- Stripe histories: four charges (two failed, one fully refunded sale, one successful $2 tip), two destination transfers (one fully reversed), one seller bank payout **$1.80**, no platform bank payouts, no $9.50 transfer/payout.
- Platform available **-$3.74** reconciles exactly to Stripe processing/Connect costs. Seller available/pending $0; application balance remains $0.
- Local refunded total differs from Stripe by **$1.58**. Local $10 paid/cancelled break order has no verified charge. Do not assume its arithmetic $9.50 net funds the request.
- Break reservation RPC itself stamps nonzero orders paid without Stripe. Other findings include public payout completion/recovery/eligibility RPCs, NULL ownership checks, anonymous auction rearming, and AI-authorized delivered timestamps.

## Files

- `marketplace-compliance.md`: eight-category Stripe business description, restrictions and fulfillment/tax review.
- `security-completion-spec.md`: coupled function, table and server-caller implementation specification.
- `ledger-implementation-spec.md`: additive implementation contracts and multi-category accounting extensions.

- `security-inventory.md`: exhaustive definer inventory and categorized findings.
- `function-definitions.json`: full public-function evidence and ACL/definition hashes; no credentials.
- `security-hardening.review.sql`: undeployed grant/function patch candidate.
- `security-patch-proposal.md`: companion write gates, caller impact, rollout/rollback constraints.
- `accounting-schema.review.sql`: undeployed additive schema candidate.
- `accounting-design.md`: ledger posting, eligibility and automatic-auction design.
- `reconciliation.md`: verified account/transaction/request/cash evidence.
- `manual-stripe-steps.md`: test activation, reserve review and carrier prerequisites.
- `test-plan.md`: security, schema, accounting and isolated Stripe regression gates.

Approval requested: review preparation artifacts only; implementing/deploying any security/database change, test-account creation, test transfer/payout or live cutover each requires the explicit next authorization. The current task does not authorize those actions.
