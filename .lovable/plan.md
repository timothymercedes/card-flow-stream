## Launch Polish + Workflow Improvements

This is a large scope (10 major areas, ~40 sub-features). I'll break it into sequenced phases so each ships verifiable and we don't destabilize launch. Each phase = one approval cycle.

---

### Phase 1 — Trust, Safety & Moderation Foundation
**Why first:** unblocks Stories fixes, public-facing trust, AI moderation hooks.

- Fix story/post reaction buttons + publish bug (audit `StoryRail`, `posts` flow)
- Stories/posts:
  - Username header, clickable → seller profile
  - Public/Private visibility toggle (column already exists on `posts`; add to stories)
  - Reactions on stories (reuse `post_reactions` pattern → `story_reactions`)
  - Profile route shows that user's stories + posts
- AI moderation pipeline (server fn calling existing `moderate-image` + Lovable AI text moderation) on:
  - new posts, stories, story/post images, listing images
  - flag NSFW / scam / abuse / spam → `moderation_status='flagged'` + admin queue row

### Phase 2 — Seller Store Identity + Public Trust Surfaces
**Why:** every later surface (vault, marketplace, live, orders) depends on store name being claimed.

- Add `shop_name` uniqueness + claim flow (already nullable on `profiles`)
- Gate listing creation + going live on `shop_name IS NOT NULL` for approved sellers
- New `/store/$handle` route (or extend existing `seller.$username`) showing storefront + listings
- Reusable `<SellerBadge>` component (avatar + username + store name, both clickable) used on:
  - listing cards (market index + detail)
  - vault cards
  - live stream header
  - order rows
  - auction overlays

### Phase 3 — Buyer Onboarding + Notifications
- Post-signup onboarding modal (steps: shipping address → payment method → notifications)
  - Reuses existing `onboarding_completed` + Stripe Connect/Customer flows
- Notification permission prompt component (browser push + PWA) shown after sign-in if `Notification.permission === 'default'`
- Wire to existing `src/lib/push.ts`

### Phase 4 — Admin / Moderator Alert Center
- New `/admin/alerts` route + bottom-tab entry conditionally rendered only when `has_role(admin|moderator)`
- Aggregates: reports, verification requests, disputes, flagged moderation, scam flags
- Realtime badge using Supabase channel on `disputes`, `moderation_queue`, `verification_requests`

### Phase 5 — Auction Payment Failure Flow
- New columns on `orders`: `payment_failure_count`, `payment_failed_at`, `payment_retry_deadline`
- Stripe webhook: on `payment_intent.payment_failed` → mark order, fire notification to buyer + host (in-stream toast + chat system msg)
- New table `live_bid_blocks(user_id, stream_id, expires_at)` — seller bid policy checks it before accepting bids
- Auto-clear when: payment succeeds (webhook) OR host starts new stream (trigger on `live_streams` insert clears blocks for that seller)

### Phase 6 — Order Cancellation + Admin Escalation
- New table `order_cancellations(order_id, requested_by, reason, status, messages jsonb[], admin_id, ...)`
- Seller Hub: cancel button → modal with reason
- Buyer orders: request-cancellation button
- Threaded messages between buyer/seller (reuse `direct_messages`-style)
- "Escalate to admin" button → flips `admin_requested=true`, surfaces in Alert Center
- Notifications on every state change

### Phase 7 — Live Inactivity Auto-End (tighten existing)
- Existing `apply_live_stream_safety` already does warn/auto-end based on `creator_stream_tiers`
- Tighten: hard-coded 30min warn → 10min grace as per spec by adding new `tier='launch_default'` row OR override in function
- Improve warning UX: in-stream banner + host chat system message + push notification
- Verify activity touches fire on: voice (mic level), chat from host, auction actions

### Phase 8 — Marketplace + Vault Polish
- Marketplace: shuffle order on initial load (deterministic per-session seed), keep sort options
- Vault: alphabetical sort default
- Vault offer-only items: hide `$0.00`, exclude from marketplace query
- Apply `<SellerBadge>` to every vault card / listing card

---

### Sequencing recommendation
Ship in this order, with my approval check between phases. Phases 1–2 are foundational; 3–4 are quick wins; 5–6 are the riskiest (payment + cancel flows) and need careful testing; 7–8 are polish.

### What I need from you
1. Approve plan and **the order**
2. Confirm: should the bottom-tab Alert Center **replace** an existing tab for admins or **add a 6th tab** (only for admins)?
3. For inactivity: keep your existing per-tier system or override with hard 30/10 rule?
4. Any phase you want to skip or push post-launch?

Once you say "go", I'll start with Phase 1.
