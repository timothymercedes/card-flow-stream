## AI Card Scanner — Hybrid Rebuild Plan

This is a large feature spanning vault, sell, and live. Splitting into shippable phases so we can verify each piece before stacking the next. The current `CardScanner.tsx` (641 lines) + `scan-card` / `identify-card` edge functions stay as the AI base — we extend, not replace.

---

### Phase A — Core scanner UX upgrade *(start here)*

Goal: instant full-screen camera, auto-detect, auto-crop, confidence score, top‑N matches.

- Full-screen camera (mobile-first, dark, one-handed), live green detection box.
- Card edge detection on-device (canvas edge filter → quadrilateral) with auto-crop preview.
- Update `scan-card` edge function to return:
  - `name, set, number, rarity, image_url, market_value`
  - `confidence` (0–1) + `match_label` ("95% Match" / "Possible Match")
  - `alternatives[]` (top 3 with image, set, number, price)
- New "Did you mean…?" sheet shown when confidence < 0.85.
- Buttons after identify: **Add to Inventory · List for Sale · Start Auction · Save Draft**, auto-fill listing fields.

### Phase B — Manual card finder (fallback)

Goal: "Find correct card" in <3 taps when AI is wrong.

- New `src/routes/cards.search.tsx` + `<ManualCardFinder>` modal usable from scanner.
- New `pokemon_cards` reference table (id, name, set, number, rarity, year, holo, image_url, tcgplayer_price, last_sold, trend) — seeded from Pokémon TCG API on demand via edge function.
- Filters: name, set, card #, rarity, year, holo/reverse holo, PSA/raw.
- Live search suggestions, recent searches (localStorage), popular cards.
- "Use this card" replaces the scan result and re-runs auto-fill.

### Phase C — Bulk scan mode

- Toggle inside scanner: scan N cards in a row, AI queues identifications.
- Review screen: swipe right = confirm, left = open manual finder for that card.
- Batch action: Add all to Inventory / Create listings / Stage for live auction.

### Phase D — Live auction integration

- When host scans during a Flex/Auction live, scanned card appears in stream overlay (image, name, market value).
- Host can **Pin** to keep on screen; **Unpin** to clear.
- Stored on `live_streams.pinned_card_jsonb` + realtime broadcast; viewers see overlay.

### Phase E — Price data

- Edge function `card-prices` aggregates: TCGPlayer (via Pokémon TCG API), recent sales, 30-day trend.
- Cached in `pokemon_cards` row with `prices_updated_at`; refresh if stale > 24h.
- Display Market / Last Sold / Recent Sales / Trend sparkline on result card and finder.

---

### Technical notes

- Camera: existing `usePhoneCamera` hook + new `useCardDetector` (canvas + simple Sobel/contour). Heavy CV libs (OpenCV.js) avoided — keep bundle small; we approximate borders, then send the cropped image to AI for the real identification.
- AI: keep Lovable AI Gateway via `scan-card` edge function (image → JSON with confidence + alternatives via tool calling).
- Reference data: Pokémon TCG API (free, no key needed for read). Cache in `pokemon_cards`.
- Storage: scan photos already go to existing bucket; no new bucket needed for Phase A.
- DB changes (Phase B/D/E):
  - new table `pokemon_cards` (read-public, write service-role only)
  - new column `live_streams.pinned_card` jsonb nullable
  - new table `scan_history` per user (optional, powers "recent")
- All new tables get RLS; roles unchanged.

### What I need from you

Approve and I'll start with **Phase A** (scanner UX + confidence + alternatives + auto-fill). It's the highest-impact piece and doesn't need DB migrations — safe to land first. Then I'll come back for Phase B's migration approval before building the finder.
