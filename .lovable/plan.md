# Scanner v2 — Accuracy, Confirmation UX, Pricing Reliability, Vault Image Integrity

Focused, incremental improvements on top of the dynamic game-routing pipeline already shipped. No rewrite of the core scanner workflow — these slot into the existing `enrichNonPokemon` + `card-price` flow.

## 1. Identity matching (backend: `_shared/cards/sources.ts`, `card-price/index.ts`)

- Extend `scoreCard` with weighted signals:
  - normalized name (40), set code/name (20), collector number (20), year (10), variant/parallel keywords (10)
  - penalty when OCR detected "holo/reverse/1st ed/refractor/prizm/rookie" but candidate lacks the matching tag
- Return top 3 candidates (not just best) with per-field score breakdown.
- New `variantTokens()` helper: extracts parallel/variant/rookie/1st-ed tokens from OCR + candidate names.
- Sports: add player/manufacturer/year/set/parallel signals to the score.

## 2. Pricing aggregation (backend: `card-price/index.ts`, `_shared/cards/providers.ts`)

- Provider registry per game with `{ id, weight, ttlSec, fetch() }`.
- Run providers in parallel with `Promise.allSettled`, then:
  - weighted median across successful results
  - drop outliers > 2× median
  - confidence = coverage × agreement × freshness
- Cached pricing protection: serve cache if all live providers fail; mark `stale: true` when `age > ttl`.
- Retry: 1 retry with 250ms backoff for transient (5xx / network) failures only.

## 3. Manual confirmation UX (frontend: new `ScanConfirmDialog.tsx`, edit `CardScanner.tsx`)

When `matchScore < 70` OR `candidates.length > 1` OR `market === 0`:
- Open a confirm dialog instead of silently failing.
- Show top 3 candidates as image cards (official art, set, number, variant, price).
- Quick refinement: inline search box (name/set/number) re-queries `card-price` with hints.
- "None of these" → manual entry (name, set, number, variant) → re-score.
- User picks → that candidate's identity + official image are bound to the save.

## 4. Vault image integrity (frontend: `CardScanner.tsx` save path; backend: `card-price` response)

- `card-price` response always includes `official_image_url` and `image_source` (e.g. scryfall, ygoprodeck, tcg_prices, pricecharting).
- Vault save uses `confirmed.official_image_url` — never the raw camera frame or any AI-generated thumbnail when an official image exists.
- Fallback rules:
  1. Official provider image (matched identity)
  2. Cached reference image from `tcg_prices` row
  3. Camera frame **only if** the user explicitly chose "save without official image" (warning shown)
- Autosave blocked unless: `matchScore ≥ 80` AND `market > 0` AND `official_image_url` present.
- Vault row stores `card_identity_id`, `image_source`, `match_score`, `confirmed_by` (`auto` | `manual`) for audit + future re-matching.

## 5. Performance

- OCR + provider fetch run in parallel (currently sequential after OCR).
- Cache identity lookups for 60s in-memory per session to avoid duplicate calls on retake.
- Downscale capture to max 1024px on the long edge before OCR (mobile speedup).

## 6. Future-proofing

- New `GameAdapter` interface in `_shared/cards/games.ts`:
  ```
  { id, detect(ocr), search(query), score(candidate, ocr), priceProviders }
  ```
- Adding a new ecosystem = register one adapter; no changes to `CardScanner.tsx` or `card-price` core.

## Files

- edit `supabase/functions/_shared/cards/sources.ts` — scoring + variant tokens + top-N
- edit `supabase/functions/_shared/cards/providers.ts` — registry + weighted aggregation + retry/cache
- edit `supabase/functions/card-price/index.ts` — return candidates + official_image_url + confidence + stale flag
- edit `supabase/functions/_shared/cards/games.ts` — `GameAdapter` interface
- new `src/components/ScanConfirmDialog.tsx`
- edit `src/components/CardScanner.tsx` — open dialog on low confidence, bind official image to vault save, parallelize OCR/pricing
- migration: add `card_identity_id`, `image_source`, `match_score`, `confirmed_by` to vault table

## Out of scope (call out separately)

- Glare/low-light: requires a dedicated image-preprocessing pass (CLAHE/white-balance) — recommend a follow-up after this lands, since it touches the capture pipeline.
- New OCR model swap — keeping current OCR; accuracy gains here come from scoring + UX.

Approve and I'll ship steps 1–6 in this order.
