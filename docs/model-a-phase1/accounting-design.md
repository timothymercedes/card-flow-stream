# Additive ledger and auction architecture proposal

Candidate SQL creates 12 new model_a_* tables, no alteration/deletion of existing structures. No runtime handlers or feature flags are enabled. Service-only writes; seller reads only their own entries/allocations/jobs. Bank payout records are service-only until a narrow seller-safe projection is approved; provider inbox/attempts/journals remain browser-inaccessible. Each public table has explicit grants then RLS. No FK to auth.users. No new profile table.

## Posting contract (requires implementation and tests before use)

A service-only function posts a full journal and all lines in one transaction. Currency/environment composite keys and deferred balancing enforce debit=credit, at least two entries, append-only history. Add the following transaction validations—not time-dependent CHECKs:
- Allocation totals equal the settled Stripe charge; one seller/account/mode/currency per allocation; actual balance-transaction fees separate from estimates.
- Charge ownership/livemode/amount/customer and event signature verified before settlement; duplicate business keys return the same journal and conflicting payload hashes reject.
- Refund/dispute cumulative allocations cannot exceed original economics; reversal cannot exceed transferred-minus-reversed amount.
- Funds unavailable, unverifiable delivery, active holds, unpaid/refunded/disputed orders and quarantined/legacy destination allocations cannot be reserved.
- Same seller/currency lock protects posting, recomputation and reservation. Durable outbox transfer job committed with its reservation; worker claim uses lease/row locking. Source charge/destination/amount verified again before Stripe call.
- Stripe request can succeed while DB fails: reconcile transfer by stable business key before retry; Stripe's idempotency retention is finite, so never blindly resend an old ambiguous request.

## Ledger examples

For an approved $100 item with 5% commission, no extra costs: debit Stripe cash $100; credit seller_pending $95 and platform_commission $5. Separately debit processing expense/credit Stripe cash for the actual Stripe fee. Delivery moves only seller liability between pending/delivered-held buckets; unlock/reserve moves are reclassifications, not additional revenue.

At 25 verified deliveries, 10% of net delivered basis unlocks. At 50, 30%; 75, 70%; 100+, 95%. Incremental release subtracts amounts already released/transferred/reserved once. If net delivered basis=$95, tier 100 cap=$90.25, retained seller reserve=$4.75; commission=$5 remains distinct. Proposed 0–24 behavior and all aging/release deadlines await Stripe confirmation. Below-threshold milestone holds are not all permanent “reserve”.

Do not multiply a smaller post-refund or post-transfer balance again by the tier; use stable cumulative entitlement and track adjustments/reclassifications. Transferred earnings debit seller payable/credit Stripe cash once. Bank payout of the same funds is not another seller earnings debit. Won dispute reinstates journaled losses; previously withheld funds and amounts already paid stay traceable.

Delivery counting must be approved: one completed order vs one shipment/package; grouped/bundled delivery receipts require one stable count key, no double count from webhook replay. Gifts, nonzero breaks wrongly marked paid, unsupported local records and self-dealing cannot create monetary eligibility.

## Automatic auctions remain possible

Verified saved default method/customer are on the existing live platform. Keep `customer`, `payment_method`, `off_session:true`, `confirm:true` in the existing auction UX; remove destination/application-fee parameters only behind approved new-charge routing. Create platform-owned PaymentIntent with immutable order/group metadata and transfer_group, authoritative amount/commission allocations and stable idempotency.

Settlement records seller earnings as pending, **not transferred**. Stripe Checkout remains marketplace UI; auction winners are charged saved payment methods unless authentication is required. In requires_action/decline paths give a secure recovery flow; never mark paid from client flags. Revoked methods, consent, SCA and buyer restrictions remain enforced. Existing saving code uses metadata.user_id, Checkout metadata.userId: same-account resolution must support legacy metadata and normalize without duplicates.

Later transfer uses destination connected account, source_transaction=settled Charge and transfer_group; no application_fee_amount, commission retained through smaller transfer amount. Transfer accepted is not bank payout paid. Existing seller daily bank payouts may remain unchanged because eligibility controls **when a transfer is created**, not when an already-transferred balance becomes eligible. No live settings change authorized now.

## Missing pieces before candidate schema is release-ready

Transactional posting/reservation functions; delivery-count uniqueness policy; provider scope/account ownership on transfer attempt records; loss-to-original-transfer/reversal linkage; payout-to-transfers reconciliation (many-to-many); immutable delivery correction journals; reserved aging/release policy; seller-safe bank status projection; admin read wrappers; retention/redaction for provider payloads; isolated SQL execution and privilege tests. SQL parser validation does not validate any of these runtime semantics.
