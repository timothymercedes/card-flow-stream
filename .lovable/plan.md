# PullBid Pricing Intelligence — Long-Term Roadmap

Goal: gradually evolve from external-provider-dependent pricing to a **hybrid
intelligence layer** that aggregates external sources AND learns from PullBid's
own marketplace/vault/live-sale data. Modular, multi-category from day one
(sports cards = first-class, not a TCG add-on).

---

## Phase 1 — Aggregate + Canonicalize (NOW)

External providers stay primary, but every result is **normalized into an
internal canonical identity** and **cached locally** so we own the data.

**Canonical identity (`card_identities` table)** — one row per unique
card/variant across ALL categories:

| Field            | Notes                                                   |
|------------------|----------------------------------------------------------|
| `id`             | uuid                                                     |
| `category`       | pokemon / mtg / yugioh / onepiece / lorcana / sports / … |
| `name`           | normalized                                               |
| `set_name`       | e.g. "Topps Chrome 2018" / "Base Set"                    |
| `set_code`       | provider-agnostic                                        |
| `number`         | collector number / card number                           |
| `year`           | int (sports especially)                                  |
| `manufacturer`   | Topps / Panini / WotC / Konami / Bandai                  |
| `variant`        | holo / reverse / 1st ed / refractor / prizm / parallel   |
| `is_rookie`      | bool (sports)                                            |
| `player`         | sports only                                              |
| `team`           | sports only                                              |
| `grade`          | Raw / PSA 10 / BGS 9.5 / SGC 10 / …                      |
| `grading_company`| PSA / BGS / SGC / CGC                                    |
| `image_url`      | best official image                                      |
| `image_source`   | scryfall / pokemontcg / pricecharting / user_upload      |
| `external_ids`   | jsonb: `{ scryfall, tcgplayer, pricecharting, ebay_epid }` |
| `fingerprint`    | deterministic hash of identity fields (dedup key)        |

**Provider adapters** stay where they are (`_shared/cards/providers.ts`,
`_shared/cards/sources/*`). Each adapter, on every successful lookup:
1. Maps result → `card_identities` (insert-or-fetch by `fingerprint`)
2. Writes its price into `price_observations` (history, not overwrite)
3. Records its image into `card_images` (multi-source)

## Phase 2 — Internal Observation Tables (NOW)

Start logging EVERY pricing signal we touch so the dataset compounds.

- `price_observations` — `(identity_id, source, price_cents, currency, observed_at, sample_size, notes)`
- `sold_comps` — actual sales we observe (eBay sold scrape, PullBid marketplace sales, PullBid live-auction hammer prices, accepted offers)
- `card_images` — `(identity_id, url, source, quality_score, uploaded_by)`
- `vault_valuations` — snapshot of vault values over time, by user + total
- `offer_history` — every offer made/accepted/rejected, joined to identity
- `live_sale_events` — hammer price, viewer count, time of day, host, hype score
- `scan_events` — every scan we run (match score, confirmed_by, time, OCR quality)

All keyed off `card_identities.id`. RLS: user-scoped reads where appropriate,
admin-only on aggregate tables.

## Phase 3 — PullBid Internal Pricing API (LATER)

Once Phase 2 has 60-90 days of data, layer our own intelligence ON TOP of
external sources:

- `pullbid_market_price(identity_id, grade)` — weighted blend of:
  - PullBid sold comps (highest weight: actual platform sales)
  - PullBid accepted offers
  - External sold comps (eBay)
  - External provider listings (TCGplayer, PriceCharting, Scryfall)
- Confidence per category:
  - Sports: needs ≥5 sold comps in 90d to be "verified"
  - TCG: external providers usually sufficient
- Trending detection: hype score from live-sale spikes
- Player/set valuation models (sports): roll-up of all cards for a player
- Adversarial check: PullBid prices that deviate >30% from external get flagged

Expose as internal serverFn `getPullBidPrice({identityId, grade})` consumed
by scanner, vault, marketplace, offers.

---

## Architecture Principles

1. **Modular per-category adapters.** Adding "Star Wars Unlimited" or
   "Riftbound" = one adapter file + one entry in `GAMES` registry. Sports is
   already first-class (not a TCG subtype).
2. **Hybrid forever.** Internal data ENHANCES external; never the sole source
   until coverage + confidence are proven per-category.
3. **Provider-agnostic identity.** `card_identities.fingerprint` is the join
   key — providers come and go, identity persists.
4. **Audit trail.** Every observation timestamped + source-tagged so we can
   rebuild aggregates if a provider's data is later proven bad.
5. **Tiered pricing stays.** Verified / Estimated / Unavailable rules apply
   to PullBid internal price the same way as external.

---

## Files & ownership

- `supabase/functions/_shared/cards/identity.ts` (new) — fingerprint + upsert
- `supabase/functions/_shared/cards/observations.ts` (new) — log helpers
- `supabase/functions/_shared/cards/providers.ts` — existing; each provider
  calls `recordObservation()` after a successful quote
- `supabase/functions/card-price/index.ts` — after aggregation, write to
  `price_observations` and update `card_identities`
- `src/routes/vault.tsx` — on save, link to `card_identities.id` (already
  partially in place via `card_identity_id` column)

## Out of scope for this phase

- Replacing any external provider
- Building the internal pricing API itself (Phase 3)
- ML/model training (after Phase 2 has data)

---

## Status

- [x] Tiered pricing system (Verified / Estimated / Unavailable)
- [x] Game-routing aggregator with weighted median + outlier drop
- [x] Vault audit columns (`card_identity_id`, `image_source`, `match_score`, `confirmed_by`, `price_tier`)
- [] **Phase 1 schema: `card_identities` table + fingerprint helpers** ← starting now
- [ ] **Phase 2 schema: observation tables** ← starting now
- [ ] Wire providers to write observations on every quote
- [ ] Wire marketplace sales / live hammer / offers to `sold_comps`
- [ ] Backfill from existing `tcg_prices` cache
- [ ] (Future) Phase 3 internal pricing serverFn
