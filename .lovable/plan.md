
# Master Card Vault Architecture

The database already contains the right tables — they just aren't wired into one coherent flow. This plan turns `card_identities` into the true source of truth and makes pricing belong to the card, not the user.

## What already exists (reuse, don't rebuild)
- `card_identities` — master record (name, set, number, variant, rarity, year, **language**, image_url, fingerprint, external_ids/product IDs).
- `card_images` — multiple images per identity (official + uploads).
- `price_observations` + `card_price_history` — historical pricing.
- `vault_cards.card_identity_id` — the link from a user's card to the master record.
- `refresh-vault-values` cron hook + `card-price` edge function — pricing engine.

## The gaps causing the "no workflow / no linkage" complaints
1. Scans don't reliably resolve to (or create) a master `card_identities` row, so the same card gets rediscovered and `card_identity_id` stays empty.
2. Daily sync iterates `vault_cards` per-user instead of per-identity → duplicate API calls, and one user's refresh doesn't update other owners.
3. Charts read user-scoped history keys instead of the identity's shared history.
4. Master record has no `market_value`, `last_price_sync`, or `verification_status` columns, so there's no canonical stored price.

## Plan

### 1. Extend the master table (migration)
Add to `card_identities`: `market_value_cents int`, `price_currency text default 'USD'`, `price_source text`, `last_price_sync timestamptz`, `verification_status text default 'unverified'` (verified / estimated / unverified), `ai_reference_image_url text`. Keep `external_ids` for product IDs. Index `last_price_sync`.

### 2. Identity-first scanner workflow
Create a single resolver server fn `resolveCardIdentity` (used by scan apply + manual correction):
```text
AI identifies language, set, number, variant, name (AI never prices)
        → build fingerprint (canonical key, includes language)
        → SELECT card_identities WHERE fingerprint = ?
   exists → reuse identity: image, language, market_value, history
   missing → card-catalog lookup → INSERT card_identities (+ card_images)
        → return identity_id
vault_cards.card_identity_id = identity_id   (always linked)
```
Language is part of the fingerprint, so JP/CN/EN are separate identities with their own image + price. The vault renders `card_images`/identity image, never an English image for a foreign card.

### 3. Pricing belongs to the card
- `card-price` keyed by `identity_id`. On refresh it writes `market_value_cents`/`last_price_sync`/`verification_status` on the identity and appends `price_observations` + `card_price_history`.
- After an identity's price updates, **propagate** to every `vault_cards` row with that `card_identity_id` (estimated_value, market_price, price_updated_at) in one update.

### 4. Daily global sync (one run, deduped)
Rewrite `refresh-vault-values` cron to iterate **distinct `card_identities` owned by at least one vault card** and not synced in 24h → refresh each once → propagate to all owners → snapshot vault values. Schedule 2:00 AM via pg_cron. No per-user duplication.

### 5. Manual refresh = card-level
"Refresh price" calls the identity refresh. If `last_price_sync` < a few minutes ago, return the stored value (no duplicate API hit). All owners get the update automatically. UI shows: `Market Value · Source: TCGPlayer · Last checked: 2h ago` + small "Prices update automatically every 24 hours."

### 6. Confidence display (always show a price)
- `verified` → `✓ Verified`.
- otherwise → `⚠ Price may be inaccurate. Verify with TCGPlayer.`
Never blank.

### 7. History-backed charts
`CardPriceChart` reads `card_price_history`/`price_observations` for the card's `identity_id` with ranges 7D/30D/90D/6M/1Y/All. `VaultGrowthChart` stays on `vault_value_snapshots`.

## Technical notes
- New migration for the `card_identities` columns + index.
- New `src/lib/cardIdentity.functions.ts` (`resolveCardIdentity`, `refreshIdentityPrice`) used by vault apply/correction/refresh paths.
- `card-price` edge function updated to accept/return `identity_id` and write identity price + history.
- `refresh-vault-values` hook rewritten to be identity-driven + propagating.
- Fingerprint helper must include language so languages stay distinct.

## Suggested build order
1. Migration (master columns).
2. Identity resolver + scan/correction linkage.
3. `card-price` identity write + propagation.
4. Daily cron rewrite + 2AM schedule.
5. Manual refresh (card-level) + confidence UI.
6. Charts on identity history.
