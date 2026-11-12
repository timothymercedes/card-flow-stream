# PullBid Live — updated multi-category Model A Phase 1 plan

## Scope and safety

Prepare a complete, coordinated security and additive accounting release for review. PullBid Live is a hybrid physical-goods marketplace with fixed-price listings and live/automatic auctions—not a trading-card-only business.

**No deployment or operational change is authorized:** keep production charge routing, seller balances/accounts, saved-payment auctions and transaction history unchanged. Do not apply either SQL draft, execute schema/backfills, create sellers, transfer/payout money, change live Stripe settings or publish. Approval of this plan authorizes preparation and isolated validation only; deployment, test-money actions and live cutover each need separate approval.

## Proposed Stripe business description

PullBid Live connects independent sellers and buyers through fixed-price listings and live/automatic auctions across automotive/vehicles, tools/construction equipment, electronics/computers, trading cards/collectibles, fashion/sneakers, furniture/home goods, sports/outdoor equipment, and business/industrial equipment. Buyers pay the platform through Stripe Checkout; auction winners may use authorized saved-payment charging. Sellers complete Stripe-hosted Connect onboarding. The proposed future model uses platform-owned charges, separately recorded commission and delayed seller transfers after verified fulfillment and eligibility. The platform handles payment fees, refunds, disputes and marketplace compliance. Reserve terms await Stripe review; the service is not escrow.

Do not submit this description or alter Stripe settings yet. Disclose real expected volume, average/max transaction size, seller countries and relevant licenses when requesting review; these values are not currently supplied.

## Prioritized Phase 1 implementation checklist

### P0 — complete security patch before any rollout

- Recheck all 261 inventoried functions / 204 definers, grants, policies and definitions for drift; map each of 25 high-priority cases to an exact patch, affected caller, role test and rollback.
- Complete protections for orders, profiles, Stripe account mappings, seller trust, holds/recoveries, payouts/allocations/revenue, disputes/insurance and shipping authority. Browser edits must never authorize financial or verified-delivery changes.
- Fix null-identity ownership checks and execution-owner trigger bypasses. Restrict service-only operations by exact signature; preserve authorized nested trigger/admin/cron paths.
- Prepare affected server and browser callers together: break checkout/giveaways, shipping labels/adjustments, admin holds, owner requests, seller payout requests, refunds, auction finalize/rearm and provider callbacks. Authenticate and authorize before privileged access; derive seller, totals and evidence server-side.
- New nonzero break reservations await verified payment; preserve old rows. AI/manual shipping evidence remains preparation only. Verify Shippo timestamp/body signature, freshness, shipment binding and durable replay handling.
- Produce a single reviewed SQL/server diff with isolated role, direct-write, cross-user, concurrency and marketplace compatibility tests. **Existing SQL alone must not be deployed.**

### P1 — Stripe and category prerequisites

- Owner selects the existing Stripe test environment, opens Connect setup and completes the marketplace platform profile without changing live settings or replacing the connection.
- If setup is unavailable, ask Stripe to enable connected-account creation for that existing test platform. Previous account creation returned Connect-signup-required; no test seller exists in the earlier verified snapshot.
- Request written review of the expanded marketplace, titled vehicles/high-ticket equipment, permitted payment methods, countries/limits, fulfillment evidence and platform loss liability. Do not treat existing live capability as approval for the expansion.
- Obtain reserve/holding approval: 25/50/75/100 completed deliveries unlock 10/30/70/95% of verified-delivered net earnings; remaining 5% remains seller liability, not commission. Decide below-25 behavior, seller-wide cross-category counting, maximum hold duration, release aging and closure/inactivity rules. No indefinite holding or escrow claims.
- Confirm physical-goods tax/facilitator, seller reporting, product safety, sanctions, authenticity and licensing obligations. Digital-product full compliance handling is not eligible for these tangible goods.

### P2 — complete additive ledger implementation

- Finalize the 12-table baseline plus category/fulfillment/tax/approval snapshots, full platform/environment/currency/account isolation, unique completion counts, sealed immutable journals, original-transfer loss links and payout reconciliation.
- Prepare service-only transactional settlement/posting, verified fulfillment, entitlement recomputation, reservation/outbox, transfer ambiguity reconciliation, refund/dispute/reversal and cash/payout reconciliation operations.
- Preserve existing seller mappings/history. Import only verified Stripe evidence into future shadow accounting; flag legacy destination charges so they can never receive another seller transfer.
- Keep Model A routing/executor disabled by default. Automatic auction charging retains saved method ownership, off-session consent, decline/SCA recovery and current production behavior. Future approved charges remove immediate destination routing, collect on platform and transfer later.

### P3 — isolated validation and acceptance package

- Execute schema/security changes only in a disposable isolated database after approval; never test exploits on shared production.
- Run role/table/caller regression, journal/currency/mode invariants, all milestone boundaries, concurrency, duplicate/out-of-order notifications, grouped partial refunds, disputes/reversals and crash-after-acceptance cases.
- Test category/method gates and parcel/freight evidence. Unapproved pickup/vehicle handover must remain ineligible; seller edits or AI photos cannot prove delivery.
- After separate test-action approval and Connect activation, create/onboard a test-only seller using test identity/bank fixtures; run Checkout success/decline/SCA and saved-payment auction tests. Fake transfers/payouts require their own approval.
- Preserve existing regression: shared production orders remain unpaid/unchanged, balances untouched, no seller transfer. Dedicated isolated test ledger records may show verified fake settlement; they must not touch production orders.
- Return exact patch/schema/server diff, tests and rollback/no-go checklist for deployment review. Live event subscriptions, reserve activation and new-charge pilot require separate explicit authorization.

## Category-specific restrictions and review gates

| Category | Required assessment before enabling expanded payments |
|---|---|
| Automotive/vehicles | Written review recommended for titled/high-ticket vehicle sales, deposits, title/lien/ownership proof and handover. Affirm explicitly excludes titled motor vehicles/auto loans; this is not a blanket Stripe-card vehicle ban. No financing added. |
| Tools/construction | Equipment ownership, high-ticket exposure, hazardous/controlled components; prohibited explosives/weapons excluded. Sales of tools differ from contractor services and their financing restrictions. |
| Electronics/computers | Counterfeit/stolen/locked or recalled goods, battery safety, data removal and export/surveillance restrictions. |
| Cards/collectibles | Authenticity; assess chance-based breaks/raffles/gambling and precious-metal/investment-like subtypes separately. Ordinary auctions are not automatically gambling. |
| Fashion/sneakers | Counterfeit/infringing goods excluded; authentication, returns and regulated material/jewelry screening. |
| Furniture/home | Product safety/recalls, freight/pickup proof and hazardous goods. |
| Sports/outdoor | Prohibited firearms/ammunition/explosives/weapons excluded; regulated accessories and wildlife products reviewed by product/country. |
| Business/industrial | B2B/high-ticket and export/dual-use/regulated goods review. Affirm does not support B2B; do not automatically offer it. |

Ordinary lawful goods are not automatically restricted merely by these category labels. Restricted subtypes need applicable Stripe review; prohibited goods cannot be approved through a wording change. Confirm country and payment-method overlays for actual listings. Sources: [Stripe policy](https://stripe.com/legal/restricted-businesses), [Affirm eligibility](https://docs.stripe.com/payments/affirm), [Separate Charges and Transfers](https://docs.stripe.com/connect/separate-charges-and-transfers). Full restricted-policy page extraction was unavailable; no account-specific category approval has been verified.

## Preserved reconciliation evidence and blockers

Earlier November 12 evidence remains unchanged, not freshly re-queried: no $9.50 Stripe transfer/payout match; that request remains unverified. $1.58 local refund discrepancy and unsupported $10 paid break order require evidence-only quarantine/reconciliation, never balance edits. Verified $1.80 seller payout was from a tip. Existing live seller account and all history remain intact.

Blocking release: test Connect activation, category/limit acceptance, reserve/evidence/counting terms, complete executable coupled security patch and isolated tests. **The updated package contains complete implementation specifications, not a finished or runtime-validated patch/ledger.** Those deliverables will be prepared under the approved next stage, without production deployment.

## Technical details

Use TanStack server handlers and gateway Stripe access with explicit environment selection; secrets stay server-side. Signed test events update isolated test accounting only. Explicit grants/RLS protect additive tables; seller projections exclude private provider data.

Updated specifications are in `docs/model-a-phase1/`. Both SQL drafts remain untouched/unexecuted. Previous Files exports remain the original snapshot; this plan is the updated proposal.