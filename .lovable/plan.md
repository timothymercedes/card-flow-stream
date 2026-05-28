# Social, Sharing, Guest Access & Onboarding Overhaul

This is a large request. Shipping it as one change would break things and bury bugs. Below is a 5-phase plan, ordered by impact. Each phase is independently shippable — approve and I'll start with Phase 1, or tell me to re-order.

---

## Phase 1 — Sharing infrastructure (foundation)

Build one reusable share system used everywhere.

- New `<ShareButton entity={...} />` component with a sheet/popover containing:
  - **Copy Link** (with toast confirmation)
  - **SMS** (`sms:` deeplink)
  - **WhatsApp** (`https://wa.me/?text=`)
  - **Facebook** (`sharer.php`)
  - **X/Twitter** (`twitter.com/intent/tweet`)
  - **Discord** (copy formatted link — Discord has no web share intent)
  - **Instagram** (copy link — IG has no web intent)
  - Native `navigator.share()` first on mobile when available
- New helper `buildShareUrl(entity)` returning canonical `https://pullbidlive.com/...` URLs per entity type.
- Wire into: storefronts, profiles, market listings, live streams, auctions, clips, posts/stories, sold listings, upcoming events, vault showcases.

## Phase 2 — Public/guest access

Currently the site is gated and `robots.txt` blocks all crawlers. Open it up.

- Update `public/robots.txt` → `Allow: /` + sitemap reference.
- Audit route guards: allow guests on market, storefronts, profiles, live (view-only), streams, auctions (view-only), public posts/stories, shared links, search.
- Replace forced auth redirects with an **"Auth required" modal** triggered only on: bid, chat, buy, sell, follow, post, claim giveaway, create offer.
- New `useAuthGate()` wrapper for action handlers (project already has a stub — extend it).
- Sitemap: emit entries for public storefronts, listings, live streams, profiles.

## Phase 3 — SEO + OG previews

So shared links actually look good on FB/Discord/X/iMessage.

- Per-route `head()` with `title`, `description`, `og:*`, `twitter:*` on: listings, storefronts, profiles, live streams, posts, clips.
- Dynamic `og:image`: use listing/profile/stream cover image from loader data; fallback to a branded default.
- JSON-LD: `Product` for listings, `Person`/`Organization` for stores, `Event` for upcoming lives, `VideoObject` for clips.
- "Live now" badge in OG title when stream is live.

## Phase 4 — Onboarding fixes

- **Fix "Don't show again" bug**: persist dismissals to `profiles.tutorial_dismissed` (jsonb) instead of/in addition to localStorage so it survives device/browser changes. Migration + update `useTutorialMode` + tour components.
- Add **Settings → Reset tutorials** button.
- Rebuild onboarding content to cover current systems: storefronts, sharing, offers, shipping, payouts, live auctions, subscriptions, stories, vault listing flow, buyer protection.
- Remove dead walkthroughs referencing removed features.

## Phase 5 — Social & live-engagement features (scoped)

This list is large; I'll implement in this order and stop for re-prioritization after each group. Tell me which groups to keep/cut:

**5a — Social basics (small):**
- Repost/share-to-feed action
- Reactions on posts/clips
- Follow activity feed tab
- Trending/discover page enhancements

**5b — Stream interactivity (medium):**
- Live emoji reactions (floating)
- Viewer polls
- Hype meter
- Top supporter badges
- Countdown overlays
- Community goals bar

**5c — Creator/loyalty (medium):**
- Stream loyalty points/streaks
- Collectible achievements (extend existing XP/badge system)
- Pinned collections / profile showcases
- Featured clips section

**5d — Advanced (large, may defer):**
- Raid/host another streamer
- Giveaway wheel
- Animated milestone alerts
- Stories/status posts (if not already implemented)

---

## Open questions before I start

1. **Guest access scope**: confirm OK to fully unblock `robots.txt` and let search engines index the site now (you're in private beta per current robots.txt).
2. **Phase 5 priority**: which of 5a–5d matters most? I'd recommend 5a + 5b first.
3. **OG images**: OK to auto-generate branded fallback images, or do you want a designer-made template?

I'll start on **Phase 1 (Sharing) + Phase 2 (Guest access) + Phase 4 "Don't show again" bug** in the first pass since those unblock the most user-visible issues — confirm and I'll go.
