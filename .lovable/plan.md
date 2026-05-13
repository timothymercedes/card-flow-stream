# Multi-Source Card Intelligence System

Upgrade the scanner + pricing pipeline from a single-API setup into a modular, multi-source service with fallback, caching, and a path to an owned card database.

## What you'll get

1. **Unified card catalog** — PokémonTCG API (primary) + TCGdex (fallback), normalized into one Supabase schema so the rest of the app never cares which source answered.
2. **Aggregated pricing** — TCGplayer (via existing data + TCGCSV sync) primary, PriceCharting fallback, with outlier removal, caching, and graceful degradation when any source is down.
3. **Smarter AI scanner** — current Lovable AI Gateway vision pipeline kept, but the matching layer now queries the unified catalog (multi-source) and returns confidence + candidate suggestions when unsure.
4. **Graded card scaffolding** — schema + service stubs ready for PSA / CGC / BGS cert lookups (no live calls until you supply keys).
5. **Owned data layer** — every scan, price snapshot, and match decision is logged so over time the app can answer from its own DB instead of third parties.

## Architecture

```text
                 ┌────────────────────────────┐
   Photo ──▶     │  scan-card (vision OCR)    │
                 └─────────────┬──────────────┘
                               ▼
                 ┌────────────────────────────┐
                 │  card-identify (matcher)   │  ← unified catalog
                 │  • PokémonTCG  (primary)   │
                 │  • TCGdex      (fallback)  │
                 │  • local cache (pokemon_cards)
                 └─────────────┬──────────────┘
                               ▼
                 ┌────────────────────────────┐
                 │  card-price (aggregator)   │
                 │  • TCGplayer (primary)     │
                 │  • PriceCharting (fallback)│
                 │  • outlier filter + cache  │
                 └─────────────┬──────────────┘
                               ▼
                 ┌────────────────────────────┐
                 │  vault_cards / scan_log    │
                 │  (owned historical data)   │
                 └────────────────────────────┘

   (future) cert# ─▶ grading-lookup ─▶ PSA / CGC / BGS
```

Each block is a separate edge function with its own retries, timeouts, and cache TTLs, so failures in one source never break the chain.

## Database changes

- Extend `pokemon_cards` with: `source` (`tcg_api` | `tcgdex` | `manual`), `source_ids jsonb` (cross-IDs), `last_seen_at`.
- New `card_price_history` (card_id, source, market, low, mid, high, captured_at) — feeds your owned trend data.
- New `card_price_cache` (card_id, payload jsonb, expires_at) — short TTL aggregator cache.
- New `graded_cards` (vault_card_id, grader, cert_number, grade, pop_data jsonb, verified_at) — ready for PSA/CGC/BGS.
- Extend `card_scans` with `match_candidates jsonb`, `chosen_source`, `price_sources jsonb` for full audit trail (debug report you already asked for plugs straight in).

## Edge functions (new / refactored)

- `card-catalog` — unified lookup. Tries local cache → PokémonTCG → TCGdex. Normalizes to one shape.
- `card-price` — aggregator. Pulls TCGplayer (already synced via `sync-tcgcsv`) + PriceCharting, drops outliers (>2σ), returns merged price + per-source breakdown, caches 6 h.
- `grading-lookup` — stub with PSA/CGC/BGS adapters; returns `not_configured` until keys are added. Wired into vault UI behind a feature flag.
- Refactor `refresh-prices` to call `card-price` so single source of truth.
- Refactor `scan-card` enrichment step to call `card-catalog` instead of inline Pokémon API call.

## Frontend changes

- `CardScanner` + `ManualCardFinder` switch to the new `card-catalog` endpoint; UI shows source badge ("via TCGdex") and per-source price breakdown in the existing debug panel.
- Vault card detail gets a "Pricing sources" expander (TCGplayer $X, PriceCharting $Y, aggregated $Z).
- Hidden "Add grading" action on each vault card — opens a form that will hit `grading-lookup` once keys exist.

## Resilience & rate limits

- Per-source circuit breaker in each edge function (skip a source for 5 min after 3 failures).
- All third-party calls wrapped with 8 s timeout + 2 retries (exp. backoff).
- Cache layer (`card_price_cache`) prevents hot cards from hitting external APIs more than once per 6 h.
- Background cron (existing `sync-tcgcsv` pattern) keeps top-traded cards warm.

## Secrets I'll need from you

- `PRICECHARTING_API_KEY` (optional — feature degrades gracefully without it)
- `PSA_API_TOKEN`, `CGC_API_KEY` (only when you want grading live; not required to ship phase 1)

PokémonTCG and TCGdex don't require keys for read access. TCGplayer data flows through your existing TCGCSV sync.

## Rollout

1. **Phase 1 (this PR)**: schema migration, `card-catalog` + `card-price` + cache, refactor scanner/refresh to use them, source badges in UI.
2. **Phase 2**: PriceCharting adapter live (after key), price history charting in vault.
3. **Phase 3**: `grading-lookup` adapters live (after keys), graded card UI.
4. **Phase 4**: Switch reads to prefer local DB once history is dense enough — third-party calls become refresh-only.

Approve and I'll start with Phase 1 (migration + new edge functions + scanner/vault wiring).
