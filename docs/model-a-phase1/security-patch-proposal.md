# Security hardening proposal — review only

**Nothing applied.** The SQL candidate is outside migration folders. SQL syntax was parsed locally; all PL/pgSQL declarations parsed, but privileges, table resolution and marketplace compatibility have NOT been verified against an isolated database. Do not apply it alone.

## Priority 0 — prevent unauthorised authority

1. Restrict exposed financial mutation RPCs by exact inspected signature, revoking PUBLIC/anon/authenticated EXECUTE where the operation is service-only. Preserve service_role and existing ownership. Save exact definition/ACL snapshots and recheck hashes before any approved application.
2. Add explicit service authorization at externally callable financial endpoints using trusted request role, not execution-owner current_user or missing auth.uid. Maintenance sessions must be specifically trusted. Local test runners must not be granted a production bypass.
3. Internal definer helpers such as lock/release/recalculate/logging run from both trusted triggers and authorized admin wrappers. Revoke public entry but **do not blanket-add service-JWT checks inside every nested helper**: that would break authenticated order/admin trigger chains. Harden root callers and table mutation gates together.
4. Fix NULL authorization comparisons in packed/ready/scans/finalize/rearm/dispute messages with explicit sign-in and null-safe ownership checks. Remove anonymous execute from legitimate authenticated RPCs, preserving authenticated scope.
5. Nonzero break-slot reservations must create awaiting_payment orders, not “paid” without Stripe. Coordinate checkout/UI behavior; never convert existing rows in this patch. Zero-price giveaways remain nonpayable and must be excluded from monetary ledger/delivery reputation counts unless the counting policy explicitly permits them.
6. AI/manual shipping inputs update preparation evidence only. Never set carrier first_scan_at, shipped_at/delivered_at or payout eligibility based on a supplied image/status. Verified carrier receipt pipeline is separate.

## Companion table protections (required before deployment)

- `orders`: service-only financial/status fields, but keep buyer creation and address changes working. On ordinary INSERT require buyer_id=auth.uid(), awaiting_payment, no Stripe/refund/payout fields or fabricated commission, server/validated inventory price. Legitimate zero-value giveaway RPC is a narrowly authenticated trusted definer operation, not an arbitrary caller bypass.
- On ordinary UPDATE allow buyer address edits before payment and seller preparation/tracking edits only; forbid payment_status, paid_at, amount, commission/payout fields, eligibility, carrier delivery authority and insurance payout state. Authorized service handlers can still perform verified financial changes. Fix the existing definer trigger's current_user bypass; do not merely extend its blacklist.
- `profiles`: keep ordinary profile and preference updates; block balance_cents, payout_hold, Stripe verification, risk/restriction and protected identity fields. Existing definer request/acceptance/achievement operations need audited scoped entry points. A blanket “no JWT means service” rule is forbidden.
- Authoritative tables (`stripe_accounts`, `seller_trust`, financial ledgers, payout allocation/completion) should not permit ordinary caller financial writes. Staff hold tools and owner platform requests currently use authenticated direct operations: migrate those to explicit server-authorized operations **in the same approved deployment** before revoking their writes.
- `disputes`: participants can file disputes/send evidence/messages; Stripe amount/status/reconciliation fields service-only. Nullable participant comparisons must be fail-closed.
- `payout_requests`: queueing and reservations must use one transaction/lock across RPC and server INSERT paths. Completion cannot trust a supplied transfer ID; compare environment, destination, accepted transfer amount and source evidence first. Legacy request remains unchanged.

## Exact candidate and rollout scope

`security-hardening.review.sql` contains bounded grant changes and complete candidate function replacements for service entry guards, prep/scans, auction authorization, unpaid break reservation and fail-closed payout/dispute checks. It intentionally does not change old delivery eligibility math, balances, existing orders or Stripe routing. The security gate must be shipped before Model A but after review/tests.

Remaining required candidate work before applying: implement/verify companion table gates above; introduce a service-only shipping-adjustment function with seller derived from order and provider transaction evidence; adapt existing reissue calls (they use admin client but old RPC demands auth.uid); preserve cron/admin nested call chains; verify zero-value giveaway and break-checkout UI semantics. The review SQL alone is **not a complete release-ready migration**.

`function-definitions.json` includes all 261 inspected functions, execution flags, complete definitions, hashes and ACL snapshots. `security-inventory.md` lists all 204 definers and 25 high-priority cases, plus related reward-credit authority risks. Definer presence/public execute alone is not proof of vulnerability; trigger functions cannot be invoked as ordinary RPCs.

## Rollout gate and rollback

After explicit approval, prepare an isolated schema clone and run role/session tests, then coordinate server callers + reviewed migrations. No automatic live setting/event changes. Recheck live hashes/ACLs to detect drift. Rollback restores saved function definitions/ACLs only after impact review; never deletes data, restores public exploit access casually, or undoes accepted Stripe transactions. Preserve existing marketplace until all compatibility tests pass.
