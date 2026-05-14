# Pre-B v2: Editable Shows, Trigger Words, Buy Now → Ship

## 1. Sell button menu (quick win)
Replace single "Sell" CTA with a popover containing three actions:
- **Go Live** → `/live/new` (or existing live entry)
- **List Item** → `/sell`
- **Schedule Show** → opens `ScheduledShowForm` modal

Touched: `src/components/AppShell.tsx` (or wherever the Sell button lives — will grep).

## 2. Database changes (one migration)
Extend `auction_queue` so each item is more than just an auction line:
- `sale_type text default 'prebid'` — one of `'prebid' | 'buynow' | 'offer'`
- `buy_now_price numeric` — required when sale_type='buynow' or as BIN on prebid
- `trigger_word text` — host-chosen phrase that activates the item live
- `scheduled_show_id` already exists (good)
- `sold_to uuid`, `sold_at timestamptz`, `order_id uuid` — tracks Buy Now sale

Add `offers` table for "Make Offer" items:
- `id, queue_item_id fk, buyer_id, amount, status (pending/accepted/declined), created_at`
- RLS: buyer inserts/reads own; host (queue_item.host) reads/updates all on their items

Realtime on `offers` + extended `auction_queue`.

## 3. Unified Pre-B Host Manager (`PreBHostManager.tsx`)
One component used in TWO places:
- inside `live.$id.tsx` (host view, replaces current AuctionQueuePanel host UI)
- inside `ScheduledShowEditor` (pre-stream editing)

Per-item editor row:
- image upload (existing ListingImageUpload)
- title, description, qty
- **Sale type selector**: Pre-Bid / Buy Now / Make Offer (radio chips)
- conditional fields: starting bid + duration (prebid), price (buynow), min offer (offer)
- **Trigger word** input ("say this on stream to start")
- reorder ↑/↓, delete
- "Import from Vault/Marketplace" (already exists)

## 4. Trigger word activation
- During live stream, host has a "Start next item" button AND can type/say the trigger word.
- Add a small input above the queue: "Type trigger word to start item" → matches against `trigger_word`, calls existing `start` flow on match.
- (Voice/transcript matching can hook into existing ElevenLabs caption stream if present — Phase 2; keyboard match ships now.)

## 5. Viewer Pre-B panel updates
Extend existing `PreBidPanel.tsx`:
- Render different action per `sale_type`:
  - **prebid** → existing pre-bid input
  - **buynow** → "Buy Now $X" button → creates order → item marked sold
  - **offer** → "Make Offer" input → inserts into `offers` table
- Hide items where `sold_to is not null`
- Show "SOLD" badge briefly before removal

## 6. Buy Now → Items to Ship
On Buy Now click:
- server fn `buyNowQueueItem({ queueItemId })`:
  - locks row, verifies not sold
  - creates `orders` row (reuse existing orders table) with seller=host, buyer=user, amount=buy_now_price
  - sets `auction_queue.sold_to`, `sold_at`, `order_id`
  - returns order id → client redirects to checkout (existing Stripe flow) OR adds to cart
- Item disappears from viewer Pre-B (realtime)
- Appears in seller's existing "Items to Ship" / orders dashboard automatically (no new UI)

## 7. Scheduled Shows: editable + visible
- Profile tab "Scheduled Shows" — lists shows (host's own at top if they host any, then bookmarked)
- New route `shows.$id.edit.tsx` (host only) — opens `ScheduledShowEditor` with:
  - show form fields (existing `ScheduledShowForm`)
  - embedded `PreBHostManager` scoped to `scheduled_show_id`
- Public `shows.$id.tsx` — viewer view with bookmarks + viewer Pre-B preview

## 8. Files

Created:
- `src/components/PreBHostManager.tsx` (unified host editor — replaces inline AuctionQueuePanel host blocks)
- `src/components/SellMenu.tsx` (3-option popover)
- `src/components/ScheduledShowEditor.tsx` (combines form + PreBHostManager)
- `src/routes/shows.$id.edit.tsx`
- `src/lib/queueActions.functions.ts` (`buyNowQueueItem`, `makeOffer`, `acceptOffer`)
- migration SQL

Edited:
- `src/components/AppShell.tsx` (Sell → SellMenu)
- `src/components/AuctionQueuePanel.tsx` (add sale_type / trigger_word / buy_now_price fields, or delegate to PreBHostManager)
- `src/components/PreBidPanel.tsx` (per-item action by sale_type, hide sold)
- `src/routes/live.$id.tsx` (trigger-word input, Pre-B button opens host manager when host)
- `src/routes/profile.tsx` (Scheduled Shows tab)
- `src/routes/shows.$id.tsx` (already exists per plan? will create if missing)

## Open questions before I start

1. **Buy Now flow**: instant Stripe checkout redirect, or add to cart so they can checkout multiple items together? (Cart matches your existing single-checkout flow — leaning cart.)
2. **Make Offer**: should accepted offers auto-charge the buyer (saved card required), or just notify buyer to confirm and pay? (Notify+confirm is safer; auto-charge needs saved payment method on file.)
3. **Trigger word voice match**: ship keyboard-only now (host types it), add voice match later via existing transcript stream — OK?
4. **Where is the "Sell" button today?** I'll grep `AppShell.tsx` and bottom nav. Confirm the FAB / bottom-nav "Sell" entry is the right one to convert.

No files changed yet — awaiting your green light + answers to the 4 questions (defaults in parens are fine if you just say "go").
