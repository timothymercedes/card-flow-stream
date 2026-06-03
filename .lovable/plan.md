# PullBid Live — Build Plan

I've saved your full master vision as the canonical project roadmap so every future build stays aligned with it. The ecosystem is large and most subsystems already exist in some form (vault, marketplace, live, communities-adjacent feed, quests, achievements, arena prototype). Rather than rebuild everything at once, I'll follow **your stated dev order** and ship one solid subsystem at a time.

This plan covers **Priority 1: the Trade System** — the biggest missing piece. Once you approve and it's live, I'll move to Collection Tracking, then Wishlist, etc.

## Scope of this build (Trade System)

```text
Your Vault ─┐
            ├─> Trade Builder ─> Offer (cards + cash) ─> Lifecycle ─> Reputation
Their Vault ┘
```

### 1. Database (single migration)
- `trades` — challenger/recipient ids, optional `cash_amount` + `cash_direction` (who pays), `status` (pending, countered, accepted, shipped, delivered, completed, cancelled), `message`, parent trade id for counters.
- `trade_items` — trade_id, owner side, `vault_card_id` snapshot (name/image/value at offer time so changes/sales don't corrupt history).
- `trade_ratings` — rater/ratee, trade_id, stars (1–5), comment. Derived "Trusted/Elite Trader" badge computed from count + average.
- Add a per-card availability column set on `vault_cards` (`accept_trades`, `trade_plus_cash`, `accept_offers`, `collection_only`) so cards can be flagged tradeable. RLS + GRANTs on all new tables. Realtime on `trades` for live status.

### 2. Server functions (`src/lib/trades.functions.ts`)
- `createTrade` (validate both users own the listed cards, cards are tradeable, anti-abuse limits)
- `respondToTrade` (accept / counter / cancel — server-enforced state machine)
- `advanceTradeShipping` (shipped → delivered → completed)
- `listMyTrades`, `getTrade`
- `rateTrade` + reputation aggregation
- On `completed`: award XP via existing progression and fire achievement checks (First Trade, Trade Master).

### 3. UI
- New `/trades` route (Trade Center): Incoming, Outgoing, History tabs with status badges and action buttons.
- Trade Builder modal: two-column card picker (my vault / their vault) + cash slider + message.
- "Propose Trade" entry points: other users' vaults and profiles; tradeable badge on cards.
- Trade rating dialog after completion; reputation shown on profiles.
- Add **Trade Center** to the bottom More menu (platform features).

### 4. Out of scope for this build (later priorities)
Collection Books, Wishlist notifications, Communities trade boards, and feed trade surfacing — I'll wire trade surfacing into those when each subsystem is built. Hooks/fields are included now so they slot in cleanly.

## Notes
- Real cards are never escrowed digitally; trades coordinate physical shipping like orders, with status tracking and reputation — matching how the existing order system works.
- Reuses existing XP/achievement infrastructure rather than duplicating it.

Approve this and I'll start with the migration, then server functions, then UI.
