# Verified Stripe/accounting evidence — November 12, 2026

All reads; no charge, refund, transfer, payout or balance mutations. API lists used limit=100 and returned has_more=false for live charges, transfers, refunds, platform/seller payouts and balance transactions. This is complete for the inspected platform/seller API scopes, not proof about other Stripe accounts.

## Accounts and saved payments

| Role | Verified account | Evidence |
|---|---|---|
| PullBid Live managed live platform | acct_1TTpKjEFKvOVcKUh | GET account: US, payments/payouts enabled, transfers active |
| Legacy server credential account | acct_1TTpKjEFKvOVcKUh | Read-only authenticated account lookup; matches managed platform exactly, keys never emitted |
| PullBid Live managed test platform | acct_1TTHMDCqPFhfPudT | GET account: empty capabilities/incomplete setup; GET accounts empty |
| Seller timothymercedes | acct_1TTurbCuR0S9rlav | Application mapping; connected seller transfer/payout records; verified in prior review |

Default saved method pm_1TZI6UEFKvOVcKUhedGqza4m belongs to customer cus_UYOuiYHbZEc8Aw on the same live platform. Customer metadata.user_id matches its database owner. Four stored methods, one owner/customer; only default was retrieved individually. Marketplace customer lookup instead uses metadata.userId: plan a same-account normalization/search fallback to avoid duplicate customers, not a provider-account migration.

## Charges and transfers

| UTC date | Charge / intent | Amount | Verified outcome |
|---|---|---:|---|
| May 20 21:58:37 | ch_3TZI8PEFKvOVcKUh1YzpfsXZ / pi_3TZI8PEFKvOVcKUh1fUZF6YX | $3.23 | Failed; no transfer; metadata links PB-001001 |
| May 22 05:43:21 | ch_3TZlrhEFKvOVcKUh0zKzg6FV / pi_3TZlrhEFKvOVcKUh030qoRhu | $35.56 | Succeeded then fully refunded; metadata links PB-001002 |
| May 22 08:12:17 | ch_3TZoBoEFKvOVcKUh0izrBBFn / pi_3TZoBoEFKvOVcKUh0xSo5mVu | $3.08 | Failed/insufficient funds; no transfer; metadata links PB-001003 |
| May 22 08:20:22 | ch_3TZoJMEFKvOVcKUh0DoMFrr7 / pi_3TZoJMEFKvOVcKUh0n0vYut4 | $2.00 | Successful tip; $0.20 application fee, $1.80 seller net |

- PB-001002: gross destination transfer tr_3TZlrhEFKvOVcKUh05vpXx7P=$35.56, fee=$4.22, seller net=$31.34. Refund re_3TZlrhEFKvOVcKUh0onZtUIs=$35.56 succeeded May 22 06:47:44. Transfer reversal trr_1TZms0EFKvOVcKUhLVbTURfY=$35.56 and fee refund=$4.22 both verified. Seller net from this sale is now zero; never transfer it again.
- Tip: gross destination transfer tr_3TZoJMEFKvOVcKUh0RnodW3K=$2.00, seller fee=$0.20, seller net=$1.80. Bank payout po_1TcEsyCuR0S9rlavOhtIY8se=$1.80, automatic, paid, created May 29 01:06:52 UTC. Gross transfer is NOT seller net; account fee records must be included.
- Platform bank payouts: none. No transfer or bank payout of $9.50 in complete inspected histories.

## The unresolved $9.50 request

Application request ID 67caf393-0e56-4006-9ac3-a152c0497c58, seller timothymercedes, created May 22 05:56:01.400179 UTC, processing, no Stripe transfer ID/completion/failure fields. Balance audit says payout_requested, delta -950, before=0 and after=0: a request/history entry, not bank-settlement evidence. Its timestamp is after the refunded sale's creation and before its refund, but no order allocation/source ID proves a relationship. Do not infer entitlement or mark complete/cancel.

Application PB-001000 “Mystery Break — 1 character” is $10, payment_status=paid, status=cancelled, no PI/charge/commission/seller-net/payout evidence. $10 minus 5%=$9.50 is an arithmetic coincidence, **not a verified funding link**. `claim_break_slots` currently creates paid nonzero orders without charging, which can explain such an unsupported ledger state, but historical causation is not proven.

PB-001002 local refunded_amount=$33.98 while Stripe refunded $35.56: **$1.58 mismatch**. Existing order has PI link but no charge ID and missing commission/net snapshots. Recover charge evidence into a proposed reconciliation record only after approval; do not edit legacy amounts in this phase.

Other existing orders have no verified Stripe source. Quarantine unverified money/allocations in a future additive ledger; do not grant seller credit from local “paid” alone.

## Cash reconciliation

Live platform available balance **-$3.74**, pending $0; seller available/pending **$0**. Profile balance_cents remains 0. All 11 platform balance transactions sum to -374 cents:
- Refunded sale: original processing cost $1.33 remains; gross charge/transfer/reversal/refund and $4.22 application fee/refund otherwise cancel.
- Tip: $0.20 platform fee minus $0.36 processing = -$0.16.
- Verified Connect fees: $2.00 active-account billing + $0.25 payout fee.
- Total: -$1.33 -$0.16 -$2.25 = **-$3.74**.

All five seller balance transactions sum to zero: $31.34 sale net reversed to zero, $1.80 tip net paid to bank. Connect/processing costs must be included in platform accounting; platform_revenue is currently empty. No real funding/top-up is requested or performed.

## Read evidence sources

GET /v1/account (managed live/test and existing legacy account read), /v1/charges, /v1/transfers, /v1/refunds, /v1/application_fees, /v1/balance_transactions, /v1/payouts, /v1/balance; seller reads scoped by Stripe-Account. Database SELECT on orders/accounts/requests/audit/revenue and saved-method ownership. Full sensitive Stripe payloads were not copied into this package (no bank details, card details or receipt links).
