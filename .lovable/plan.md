# Profile, Reviews & Buyer/Seller Trust Overhaul

A large, multi-area upgrade. I'll deliver it in 4 phased migrations + UI so each piece ships safely.

## Phase 1 — Reviews schema + responses + reports

DB migration:
- `reviews` table additions (if missing): `shipping_rating`, `communication_rating`, `accuracy_rating` (1-5), `verified_purchase bool`, `verified_live_auction bool`, `order_id`, `stream_id`. Backfill `verified_purchase` from existing order link.
- `review_responses` table — `review_id`, `author_id` (buyer or seller), `body`, timestamps. RLS: anyone can read, only review's seller OR review's author can insert their own response (one per author per review). Edit/delete own.
- `review_reports` table — `review_id`, `reporter_id`, `reason`, `status` (open/dismissed/actioned). RLS: insert by auth, sellers can report reviews about them, admins read all.
- `get_seller_stats` RPC: extend to return `avg_shipping`, `avg_communication`, `avg_accuracy`, `response_rate`, `avg_response_hours`, `recent_reviews` count, plus existing fields. (Backwards compatible.)
- `get_seller_recent_reviews(_seller_id, _limit)` RPC returning latest reviews with response and reporter-eligibility flag.

## Phase 2 — Seller response badges + buyer reputation

DB migration:
- `buyer_reputation` view/function `get_buyer_reputation(_user_id)` returning:
  - completed_purchases, payment_success_rate, avg_payment_minutes, cancellation_rate, chargeback_count, unpaid_wins, unresolved_payments, account_age_days, last_active_at.
- `buyer_trust_badges(_user_id)` returns array of earned positive badges (`trusted_buyer`, `fast_payer`, `verified_buyer`, `repeat_customer`, `auction_veteran`, `supportive_buyer`).
- `seller_response_badges(_seller_id)` returns `responds_fast`, `active_seller`, `top_rated`.
- Indexes for fast lookup.

## Phase 3 — Failed payment enforcement

DB migration:
- `profiles.bid_restricted_until timestamptz`, `profiles.bid_restricted_reason text`, `profiles.unpaid_strikes int default 0`.
- `record_unpaid_auction_win(_order_id)` — called by `reconcile_stale_payments`, increments strikes. At 10 across 10 distinct streams with no resolved payment, sets `bid_restricted_until = now() + 30 days`, inserts row in admin review queue (`buyer_review_queue` table), notifies buyer + admins.
- Update `place_live_bid` + `place_listing_bid` to reject if `bid_restricted_until > now()`.
- Admin RPCs: `admin_waive_buyer_restriction`, `admin_extend_buyer_restriction`, `admin_ban_buyer`.

## Phase 4 — UI

New components:
- `SellerReviewsPanel.tsx` — full reviews list with star breakdown, filter, response thread, report button (sellers), reply (sellers/buyers). Used in `/seller/$username?tab=reviews` and `/profile`.
- `ReviewCard.tsx` — single review with timestamp, verified-purchase / live-auction badge, response thread, report.
- `BuyerTrustBadges.tsx` — public positive badges only.
- `BuyerInsightsPanel.tsx` — private metrics (visible only to the seller of an active order, mods, admins).
- `ProfileActionBar.tsx` — refactor existing action area: View Reviews · Join Live (if live) · Message · Follow · Share · Report. Cleaner mobile spacing.
- `SellerStatsQuickView.tsx` — popover triggered from "View Reviews" in store/seller pages.

Edits:
- `src/routes/seller.$username.tsx` — wire new ProfileActionBar, embed SellerReviewsPanel under reviews tab, surface response badges next to seller name, show shipping/comm/accuracy averages, embed live ring/banner (already present), order metrics row.
- `src/routes/profile.tsx` — "My Reviews" section using SellerReviewsPanel for self; "My Buyer Trust" panel using BuyerTrustBadges + private breakdown; quick links to followers/live history/listings/shipping perf.
- `src/components/SellerTrustBadges.tsx` — extend with response badges.
- `src/components/UsernamePopover.tsx` — show buyer trust badges when target isn't a seller; show response badges when seller.
- New admin tab in `src/routes/admin.tsx`: "Buyer Review Queue" — waive/extend/ban actions.

Realtime:
- `useRealtimeTable` on `reviews`, `review_responses` for live updates on the active profile.
- `useRealtimeTable` on `buyer_review_queue` for admins.

## Out of scope for this pass
- Redesigning review submission flow (already exists).
- Moderating responses with AI — manual report flow only for now.

## Technical notes
- All new RPCs `SECURITY DEFINER` with `REVOKE EXECUTE FROM anon`.
- Public profile visibility: only positive badges exposed via `get_buyer_public_badges`. Private metrics behind `get_buyer_private_insights` gated by has_role(admin/owner/moderator) OR existence of an order between caller and target.
- All mutations validated with zod on client AND DB triggers.
- Mobile-first: action bar uses flex-wrap with min-w-0, tap targets ≥40px.
