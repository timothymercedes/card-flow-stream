# Plan — Three workstreams

This touches **payments logic**, so I'm pausing for approval before shipping.

---

## 1. Bundle-aware platform fee (live streams + cart)

Replace the flat $1.23 per item with a **per-buyer-per-session threshold model**.

### Rule
- Fee applies to **first 3 items** a buyer wins in the same live stream (or first 3 items in a cart bundle).
- Items 4+ in the same group → **buyer fee = $0**, seller absorbs equivalent fee (deducted from payout).
- "Session" = same `stream_id` for live wins, same `cart_id` for marketplace bundles.

### Numbers (proposed — confirm if different)
- Items 1–3: buyer pays `$1.23` per item (current rate, kept for continuity).
- Items 4+: buyer pays `$0`; seller payout reduced by `$0.75` per item (≈ Stripe processing cost).

### DB
- New SQL function `compute_buyer_fee(_buyer_id, _stream_id, _cart_id) → cents` — counts prior paid items in the group and returns 0 once threshold is crossed.
- New columns on `orders`: `fee_index` (1,2,3,4…), `fee_absorbed_by` (`'buyer' | 'seller'`).
- `finalize_auction_round` + cart checkout call `compute_buyer_fee` instead of using constant.

### Code
- `src/lib/stripe.server.ts` → `calculateBuyerFees()` takes `{ subtotalCents, buyerId, streamId?, cartId? }`, queries the RPC, returns dynamic `platformFee`.
- `src/lib/auctionCharge.functions.ts` + Stripe webhook → store `fee_index` + `fee_absorbed_by`, adjust `application_fee` on transfer accordingly.
- UI breakdown in `StripeCheckout.tsx` + live "I want this" panel in `live.$id.tsx`:
  - Items 1–3: `Platform fee: $1.23 ✓`
  - Items 4+: `Platform fee: $0.00 — bundle discount (seller covers)`
  - Show running counter "Item 2 of 3 before bundle savings".
- Seller earnings hub (`SellerEarningsHub.tsx`) → new line `Bundle fees absorbed: -$X.XX`.

---

## 2. Auto-end inactive streams from the stream screen

Wire the existing pieces (cron sweep + `HostInactivityCheckModal` + `confirm_live_stream_active` RPC) into `/live/$id`.

- Subscribe to `live_streams` row; when `now() - last_activity_at` crosses `tier.inactive_warning_minutes`, mount `HostInactivityCheckModal` for the host with a 5-min countdown to `inactive_auto_end_minutes`.
- "I'm still here" → `confirm_live_stream_active` RPC → resets timers.
- No response → existing `sweep_inactive_streams()` cron flips status to `ended` within 2 min. Viewers see "Stream ended (host inactive)" banner via existing realtime subscription.
- Host-side heartbeat from `useLivestreamSafety` already touches `last_activity_at` every 20s when mic/camera active — no change needed.

---

## 3. Scanner upgrade (speed + multilingual accuracy)

`supabase/functions/scan-card/index.ts` + `src/components/CardScanner.tsx`.

### Speed
- Already moved to `gemini-3.1-flash-lite-preview` last turn. Add: skip identity-fingerprint round-trip when confidence ≥ 0.9 — return cached catalog match immediately. Target p50 ≤ 4 s.

### Two-stage detection
1. **Stage 1 (fast, ~1 s)**: tiny prompt → `{ language, game, is_holo, is_reverse_holo }`. Detects language first.
2. **Stage 2**: language-scoped prompt asks for `{ name (in native script + romanized), set_name, set_code, collector_number, rarity, artwork_hash }`. Routes to language-specific catalog (`pokemon-jp`, `pokemon-kr`, `pokemon-zh-s`, `pokemon-zh-t`, `pokemon-es`, `pokemon-fr`, `pokemon-de`, `pokemon-en` default).

### Catalog
- `card-catalog` edge function gets `?lang=` param. Queries `card_identities` filtered by `language` column (add column + index if missing).
- Low-confidence (<0.7) → return top-5 alternates → existing "Did you mean?" grid in `CardScanner` already renders these.

### UX
- Debug panel already gated behind `localStorage.pbl_scanner_debug` — keep.
- User-facing errors: replace any `error.message` surface with friendly copy + "Try again" / "Search manually" buttons.

---

## Order of work

1. Migration: `compute_buyer_fee` function, `orders.fee_index/fee_absorbed_by`, `card_identities.language` column.
2. Backend: `stripe.server.ts`, `auctionCharge.functions.ts`, webhook.
3. UI: `StripeCheckout.tsx`, `live.$id.tsx` fee breakdown + inactivity modal wiring.
4. Scanner: two-stage detect + language-aware catalog.

**Reply "go" to ship all three, or tell me to adjust fee numbers / threshold first.**