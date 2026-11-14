# Guest Browsing & Sign-In Prompts — Plan

## What I found (signed-out check on 15 pages)
- **Already open to guests:** Home, Market, PB Store, Bazaar, Live, seller storefronts, Feed and Search all load.
- **Already locked:** Vault, Orders, Messages, Seller Hub and Sell show a sign-in message. Wallet sends guests to the sign-in page instead, which is inconsistent.
- **A sign-in prompt already exists:** it opens when a guest taps Bid, Follow, Comment, Like, Offer, Bookmark or Share, and it returns people to the same page after sign-in. It's used on live shows, listings, feed and shows, but not everywhere yet.
- **The database already refuses most guest actions:** bids, orders, messages and posts require a signed-in account, even if someone calls the database directly.
- **Gaps:**
  - The top bar has **no Sign In / Create Account buttons** for guests.
  - Some buttons (chat box, cart, giveaways, stories, reactions) don't open the prompt, so a guest gets an error instead.
  - The sign-in page shows a leftover technical "AUTH PATH (DIAGNOSTIC)" box.
- **Personal profiles (/@username):** guests are blocked because visitor access is still switched off. This plan does **not** turn it on; that remains your separate decision.
- **Beta password:** the site still asks guests for the beta password first. This plan keeps it unless you say otherwise.

## What I'll change (reusing what exists)
1. **Top bar for guests:** "Sign In" and "Create Account" buttons replace the account menu. Private links (orders, wallet, Seller Hub) are hidden. Same design on desktop and phone.
2. **One "Join PullBid Live" prompt:** your wording, with Create Account / Sign In / Continue Browsing. Guests return to the exact page, product, profile or show after signing in. On live shows it appears as a small panel at the bottom, so the video keeps playing and stays visible.
3. **Every participation button goes through that prompt:** buy, add to cart, bid, offer, live chat, comments, likes and reactions, follow, save, share, giveaways, stories, posts, uploads and messages. Guests can still read live chat.
4. **Private pages behave the same way:** Vault, Orders, Wallet, Messages, Notifications, Settings, Seller Hub, Sell and Go Live all show the same prompt and return guests afterwards. No more mixed redirects.
5. **Remove the diagnostic box** from the sign-in page.

## Server-side safety check (no changes unless a hole is found)
- I'll try each guest action directly against the database, without the app: bid, chat, message, comment, like, follow, cart, order, offer, giveaway entry, post and story. I'll also try reading private records: orders, wallet, messages, private Vault items and private photos.
- If any of these succeeds for a guest, I'll stop and ask before fixing it, because the fix would change the shared database.

## Guest analytics
- **Already available, no changes needed:** your built-in site analytics covers page, product, storefront and live-show visits.
- **Needs a small new database table (separate approval):** prompt impressions, sign-ups and which page they came from. No personal data, only an anonymous session ID.

## Testing (desktop + phone, signed out and signed in)
- Every page in your list, live viewing with read-only chat, and the prompt on each blocked action
- Returning to the same page after sign-in
- Private profiles and Vault stay hidden, direct links and direct database calls
- Signed-in users keep everything, including your full selling permissions

## Technical details
- Reuse `useAuthGate().requireAuth` + `AuthGateModal` (add a `compact` bottom-sheet variant for `live.$id`), plus the `/auth?returnTo=` and `safeReturnTo`.
- New `GuestGate` wrapper for private pages, replacing ad-hoc messages and the `/payouts` redirect.
- Guest controls in `AppShell.tsx` desktop and mobile headers.
- Sweep the components that write through `supabase.from(...).insert/upsert/rpc` (about 26) to route through `requireAuth`.
- Remove the diagnostic panel render in `auth.tsx`.
- Anonymous-key probe script under `/tmp`. No migrations in this plan.
