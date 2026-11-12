# Required manual Stripe steps

## Activate Connect in the existing TEST platform

1. Open Lovable Payments and the existing Stripe dashboard/claim link. Go-live was already completed; **do not redo live onboarding, replace the payment connection, create new API keys, or change live settings**.
2. Sign in as the Stripe account owner. In Stripe's account/environment switcher select the existing test/sandbox **acct_1TTHMDCqPFhfPudT**. Confirm the test/sandbox indicator and account identity; do not select the live platform or live seller.
3. Open **Connect** (or More → Connect / product settings) and choose the offered **Get started / Set up your platform** action. Complete the test platform profile: marketplace facilitating physical collectible sales, platform collects buyers and sends seller transfers, Stripe-hosted Express onboarding, platform responsible for fees/losses. Keep US/USD scope for initial tests. Exact labels vary by Dashboard version; this authenticated wizard was not observable through our tools.
4. If Connect is absent or Stripe requests a live platform alteration rather than test setup, stop. Stripe must confirm/enable **connected-account creation for this existing test platform**, without changing live payments. Existing sandbox charges can work while account capability metadata is empty; empty capabilities alone are not the proof—prior connected-account creation returned “Connect must be enabled”.
5. Confirm dashboard setup completion. After separate approval, retry one test-only Express account creation with transfers requested and test metadata through the existing managed test connection. Success criterion: a new test connected account ID returned by POST /v1/accounts, retrievable through the same test connection; not a live ID. Do not create a separate sandbox for a connected account—Stripe documents that platform/connected account sandboxes cannot simply be interconnected.
6. After approval, generate a hosted test onboarding link, use Stripe's documented test identity/bank fixtures, confirm test transfers capability and bank readiness. Do not use real bank/card data or manually accept seller terms on their behalf.
7. Only after environment-scoped test ledger/guards exist, approve fake-money transfers/payouts and regression execution. Activation alone does not authorize fund movement.

**Tool limitation:** available managed payment tools have no Connect-platform activation operation. This phase did not retry account creation or open/alter Stripe settings. Dashboard steps above are a verified provider workflow, not a claim that the inaccessible account-specific wizard was completed.

## Stripe review required before reserve policy activation

Submit the proposed business/funds flow to Stripe through the platform account's Connect review/contact channel, asking for written confirmation of:
- US platform selling physical collectibles via platform-owned charges and separate seller transfers, liability for fees/refunds/disputes, Express onboarding and eventual permitted countries/currencies.
- Unlock only verified-delivered net seller earnings: 25 deliveries=10%, 50=30%, 75=70%, 100=95%; no owner/admin financial exception. Commission stays distinct from the retained reserve.
- Below-25 funds handling and maximum time-based release even if seller never reaches a milestone; whether cumulative thresholds, order/package counting and related-party activity are acceptable.
- Reserve 5%: approved risk basis, holding location, maximum duration, aging/release schedule, account closure/inactivity release, dispute/reversal recovery, seller disclosures/consent and bookkeeping obligations.
- Whether funds segregation/protected holding is available/required. Ordinary Stripe platform balances are not segregated seller accounts; no escrow claims.
- Platform bank payout/cash safeguards so commissions can be withdrawn without spending seller liabilities. Current platform cash is -$3.74; resolve provider funding requirements separately, never from seller balances.

Stripe's published manual-payout holding limits apply to connected balances (US two years; most countries 90 days), not permission to keep buyer proceeds on the platform indefinitely. Legal/tax review of marketplace facilitator and seller reserve terms is separate from Stripe technical availability.

## Carrier prerequisite

Confirm Shippo HMAC is actually provisioned. Shippo documents signing under Shippo-Auth-Signature with timestamp.body and requires its solutions-team token exchange (can take up to 10 business days). No secret changes in this phase. Verify signed test events, freshness and carrier/tracking binding before trusting delivery for eligibility.

Sources: https://docs.stripe.com/connect/testing ; https://docs.stripe.com/sandboxes ; https://docs.stripe.com/connect/separate-charges-and-transfers ; https://docs.stripe.com/connect/manual-payouts ; https://docs.goshippo.com/docs/tracking/webhooksecurity/ .
