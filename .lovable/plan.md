# Collection Books + Rewards Center — Master Build Plan

Building on what already exists (`card_sets`, `vault_cards`, `card_identities`, `user_progression`, `achievements`, `user_achievements`, `crate_rewards`, `user_rewards`, XP/quest RPCs), this adds dedicated Collection pages and a connected Rewards Center. Shipped in phases so each is testable and reversible-by-design.

## What exists vs. what's new
- **Reuse:** set-completion math in `collection.functions.ts`, TCG normalizer in `tcgCategory.ts`, XP/level RPCs (`award_xp`, `bump_quest_progress`), achievements catalog.
- **New:** a generic **rewards definition + ledger** system, set-completion + milestone rewards, a **PullBid Credits wallet**, a **Rewards Center** route, dedicated Collection sub-pages, and admin reward management.

---

## Phase 1 — Dedicated Collection Book pages
Break the in-place tabs into real routes (SSR-friendly, shareable, deep-linkable).
```text
/collection                  -> grid of all your Collection Books (per set, all TCGs)
/collection/$category/$set   -> a single Book: header stats + sub-tabs
   ├─ Overview   (count, %, completion reward CTA, progress)
   ├─ Checklist  (full set checklist, owned vs missing marked)
   └─ Missing    (missing list + Missing Card Finder)
```
- Add **Marvel / Wrestling / Star Wars** to `tcgCategory.ts` aliases + canonical keys (extensible for future TCGs).
- Completion stays strict: `owned DISTINCT numbers ÷ official total`; never 100% unless all unique cards owned. Variants/reverse holos/promos collapse by canonical number.

## Phase 2 — Missing Card Finder (expanded)
For each missing card, surface obtain-paths via one server fn aggregating:
- Marketplace listings, Trade listings, Active auctions, Live shows featuring the card, Users who own it, and Wishlist matching ("add to wishlist").
- Reuses existing `listings` / `trades` / `live_streams` / `wishlist_items` and links into `/market`, `/trades`, `/live`.

## Phase 3 — Rewards engine (data model)
New tables (all with GRANTs + RLS; service_role full):
- `reward_definitions` — admin-configurable catalog: `slug, type (set_completion|milestone|achievement|community|event), trigger_key, title, description, icon, credits, xp, badge_slug, title_slug, frame_slug, is_active, sort`.
- `reward_claims` — per-user workflow ledger: `user_id, reward_def_id, status (in_progress|unlocked|ready_to_claim|claimed|expired), progress, target, unlocked_at, claimed_at, expires_at`. Unique `(user_id, reward_def_id)`.
- `credit_wallets` + `credit_transactions` — PullBid Credits balance + immutable ledger (earn/spend, source-linked). Wallet read-only to owner; mutations only via SECURITY DEFINER RPC.
- SECURITY DEFINER RPCs: `evaluate_set_rewards()` (compute unlock state from collection), `claim_reward(_def_slug)` (idempotent, one-time, grants credits+XP+badge atomically), `award_credits(...)`.

## Phase 4 — Set completion + milestone rewards
- Seed `reward_definitions` with a per-set completion reward template + collector milestones (1/5/10/25/50/100 sets completed) with progressively better credits/XP/badges/titles.
- Collection Book Overview shows **CLAIM REWARD** when a set hits 100% (button appears once, claim-once enforced server-side).

## Phase 5 — Rewards Center route
```text
/rewards  (linked from More menu, Profile, Collection Books)
   ├─ Available   (ready-to-claim: set completion, achievement, community, event)
   ├─ In Progress (active progress w/ reward preview, e.g. Team Rocket 43/83 → badge+XP+credits)
   ├─ Redeemed    (full history: name, earned date, claimed date, details)
   └─ Achievements(completed / locked / progress)
   + Credits wallet balance header + Collector Milestones strip
```

## Phase 6 — Showcase / Profile integration
- Surface earned badges, set-completion titles, collector rank, total rewards, milestone trophies on `/profile` and public `seller.$username` showcase.

## Phase 7 — Admin controls
- `/admin` section to create/modify/disable rewards and change values/types **without code** (writes to `reward_definitions`). Gated by existing `user_roles` admin check.

---

## Technical notes
- All reward mutations go through SECURITY DEFINER RPCs (no client-side credit/claim writes) — prevents privilege/credit escalation. RLS: users read only their own claims/wallet; definitions are public-read, admin-write.
- Credits wallet is built now but kept "earn-only" until spending features ship; ledger architecture supports future spend (featured listings, promotions, trade protection).
- Reward evaluation is derived/idempotent so it can be re-run after vaulting/trading/buying without double-granting.
- Each new public table ships CREATE → GRANT → RLS → POLICY in one migration.

## Suggested delivery order
I'll start with **Phase 1 + 2** (dedicated pages + finder) since they're pure value with no payment surface, then do the **Phase 3 migration** (pause point — DB schema), then build Phases 4–7 on top. Confirm and I'll begin, or tell me to resequence.