# PullBid Live — Phase 1 stabilization

## Scope
Plan A01–A07 only. No implementation, production deployment, expiry bypass, demo deletion, private collector exposure, checkout, payouts or supplier ordering until separately authorized.

## Proposed changes
1. **A02 — Unavailable listings:** finish loading with a neutral unavailable state; handle failures and stale requests without revealing hidden item details.
2. **A03 — Real live activity:** exclude demo records from real counts/rails, label retained demo pages, and verify existing broadcast-state evidence before claiming liveness.
3. **A07 — Scanner entry:** separate Vault and Scan a card, open the existing scanner with optional validated intent, retain safe sign-in return and require explicit camera permission.
4. **A01 — Expiry and renewal:** honest empty states, owner inventory confirmation and atomic eligible 30-day fixed-price renewal; reject unsafe auction/sold/transaction-linked renewals. Never bulk extend old inventory.
5. **A04 — Collector count:** count-only public aggregate with a defined public discovery scope; unavailable is not zero. Never grant full-profile guest reads.
6. **A05 — Public Vault:** bounded safe projection honoring vault-wide privacy, preserving existing conservative card filtering pending review, owner/friend access and private defaults; separately inspect media visibility.
7. **A06 — Garden:** consistent eleven-department keys/filter/forms/pages, with seller writes enabled only after an approved compatible constraint/search update.

## Technical review and approval gates
- Detailed candidate filenames, per-issue database implications, permissions, tests and rollback are documented in the Phase 1 review.
- Separate database approval required for atomic renewal enforcement, public count/Vault functions and grants, Garden constraints/search validation, and any media permission change.
- No executable migrations or account/listing changes in this planning phase. Verify deployed policy/grant definitions read-only before implementation.
- Preserve Marketplace, PB Store and Bazaar inventory, carts, orders, approvals and payments separately.

## Tests and rollback
- Each issue gets unit regressions plus signed-out/signed-in desktop and phone checks; use legitimate beta access.
- Renewal/Garden/privacy fixtures require isolated test data; no shared production seeding. Do not certify scanner capture or real streaming from navigation/demo tests.
- Revert individual code changes and revoke newly added function execution where necessary; never delete history or restore incompatible constraints over newly valid rows.
- Show actual preview results before separate publication approval.

## Later phases
The previously approved category design is already in preview, not production; Phase 2 reconciles it with stabilization and returns desktop/mobile proposals without rebuilding completed work. Bazaar discovery is Phase 3, not part of these seven fixes.

**Approval requested:** Phase 1 code scope, with explicit approval or deferral for each database item. Nothing is implemented by approving this review unless the execution scope is clearly authorized.