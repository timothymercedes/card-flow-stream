# Pre-B (Pre-Bid) System & Scheduled Shows

Replaces the viewer-facing "Queue" button with a full Pre-Bid experience and adds scheduled show support with viewer bookmarks. Internal seller queue logic stays intact behind the scenes.

## 1. Database changes (migration)

Extend `auction_queue` (already used as the internal queue) and add new tables:

- `auction_queue` — add columns:
  - `image_url text` (host-uploaded item photo)
  - `prebid_enabled boolean default true`
  - `position int` (manual ordering; falls back to created_at)
- `prebids` — viewer pre-bids placed before item goes live
  - `id, queue_item_id (fk), bidder_id, amount numeric, created_at`
  - RLS: viewers insert their own; everyone reads for the item; host can see all
- `scheduled_shows` — future live shows
  - `id, host_id, title, description, banner_url, categories text[], scheduled_at timestamptz, stream_id (nullable, links once live), created_at, updated_at`
  - RLS: public read; host manages own
- `show_bookmarks` — viewer bookmarks + reminder opt-in
  - `id, show_id (fk), user_id, remind boolean default true, created_at`
  - Unique (show_id, user_id). RLS: user manages own; host can count via view
- `show_bookmark_counts` view — aggregate count per show (public read)
- Realtime: enable on `auction_queue`, `prebids`, `scheduled_shows`, `show_bookmarks`

## 2. Components

- `src/components/PreBidPanel.tsx` — viewer-facing panel
  - List of upcoming items (image, title, starting bid, buy-now, timer, current pre-bid leader)
  - "Place Pre-Bid" input per item (when `prebid_enabled`)
  - Bookmark/watch icon per item
  - Realtime subscription so bids/items update live
- `src/components/PreBidHostPanel.tsx` — host management (extends existing AuctionQueuePanel logic)
  - Add/remove/reorder (drag handles up/down)
  - Edit start price, sec, buy-now, quantity, image upload
  - Toggle `prebid_enabled` per item
  - "Import from Vault/Marketplace" picker (lists host's listings)
  - View pre-bids placed on each item
- `src/components/ScheduledShowForm.tsx` — host create/edit show
  - Title, description, banner upload, categories, datetime
- `src/components/ScheduledShowCard.tsx` — viewer card with bookmark button + bookmark count

## 3. Routes

- `src/routes/shows.tsx` — public list of upcoming scheduled shows
- `src/routes/shows.$id.tsx` — show detail: banner, info, pre-bid items, bookmark button
- `src/routes/profile.tsx` — add "My Bookmarked Shows" section (or new tab)
- `src/routes/seller-hub.tsx` (or equivalent) — add "Scheduled Shows" management section
- `src/routes/live.$id.tsx`:
  - Rename viewer button "📋 Queue" → "🔖 Pre-B"
  - Show "Pre-B Available" badge in header when `auction_queue` has upcoming items with `prebid_enabled`
  - Replace viewer `AuctionQueuePanel` mount with `PreBidPanel`
  - Host keeps `AuctionQueuePanel` (rebranded internally as PreBidHostPanel) with new fields

## 4. Notifications

When a bookmarked item/show goes live:
- Server fn `notifyBookmarkers` triggered when:
  - host starts a queue item (called from existing `start` flow)
  - scheduled show's stream_id is set / show goes live
- Inserts into existing `notifications` table (if present) for users who bookmarked with `remind=true`
- If no notifications table, create minimal one in same migration

## 5. Realtime

Subscribe in `PreBidPanel`, `ScheduledShowCard`, and `live.$id` to:
- `auction_queue` changes (item add/remove/reorder/start)
- `prebids` inserts (live leader update)
- `show_bookmarks` (live bookmark counts for host)

## 6. Files touched

Created:
- `src/components/PreBidPanel.tsx`
- `src/components/PreBidHostPanel.tsx` (or extend AuctionQueuePanel)
- `src/components/ScheduledShowForm.tsx`
- `src/components/ScheduledShowCard.tsx`
- `src/routes/shows.tsx`
- `src/routes/shows.$id.tsx`
- migration SQL

Edited:
- `src/routes/live.$id.tsx` (button rename, badge, swap panel)
- `src/routes/profile.tsx` (bookmarked shows section)
- `src/routes/seller-hub.tsx` (scheduled shows manager)
- `src/components/AuctionQueuePanel.tsx` (image upload, prebid toggle, reorder, vault import)

## Open questions before I start

1. **Image upload storage**: reuse the existing `listings` storage bucket for queue item photos and show banners, or create new `prebid-images` / `show-banners` buckets?
2. **Notifications**: is there an existing `notifications` table I should write into, or should I create one as part of this migration?
3. **Where do hosts manage scheduled shows today?** I'll add a "Scheduled Shows" section to `seller-hub.tsx` unless you point me elsewhere.
4. **Pre-bids on live items**: should pre-bids automatically convert to opening bids when the item starts (highest pre-bid becomes the first bid), or just be informational for the host?
