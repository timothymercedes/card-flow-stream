# Listing Boosts (Marketplace)

Sellers can boost a Marketplace listing so it appears in a limited "Sponsored" slot. Stream Hype stays separate and unchanged.

## What sellers get
- **Free weekly boost**: one every rolling 7 days, 4 hours, normal rotation.
- **Paid boosts** (one-time, test mode): $2 = 2h, $5 = 4h, $10 = 8h, $15 = 12h, plus Custom 1–24h priced by admin.
- "Boost" button on each of the seller's active listings and in Seller Hub, showing time left and free-boost reset date.
- Limits: 1 active boost per listing, max 2 active paid boosts per seller, no stacking, no renewals, no recurring charges.

## What shoppers see
- At most 1 boosted listing per 10 regular listings (10% cap, admin-adjustable but always enforced).
- Fair rotation among sellers; higher packages rotate more often; free boosts get normal weight.
- Never two boosted listings from the same seller back to back; category/interest matches preferred.
- Every boosted card labeled **Sponsored**.
- Boosts disappear exactly at their end time.

## Admin
- New Admin "Boosts" screen: package prices/durations, custom hourly price, feed %, per-seller limit, priority weights, list of active boosts with cancel.

## Technical details
- New tables: `listing_boost_settings` (single admin-editable row), `listing_boosts` (listing, seller, kind free/paid, package, hours, amount, starts_at, ends_at, status pending/active/expired/cancelled, payment ref). RLS: sellers read own; public reads only active rows through a safe projection RPC; writes only via service-only functions.
- DB function `start_listing_boost` enforces ownership, active listing, one boost per listing, 2-paid cap, rolling-7-day free allowance (all in one transaction with row locks).
- Paid flow: embedded Stripe sandbox checkout created server-side from DB prices; the signed payments webhook alone activates the boost. No subscription objects.
- Expiry: active status computed from `ends_at > now()` in every read, so expiry is exact without relying on a job; an hourly tidy job marks rows expired.
- Feed: pure helper `interleaveBoosts(organic, boosts, settings, interests)` applied in Marketplace/Discover lists; weighted fair rotation, no consecutive seller, cap enforced. Unit-tested.
- Tests: free allowance reset at 7 days, 2-paid cap, one-per-listing, exact expiry, 10% cap, no consecutive seller, webhook-only activation.
- Requires: one database change on the shared database and new test-mode boost products. Nothing published.
