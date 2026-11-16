# Shopify draft-only review — November 16, 2026

No database, inventory, price, supplier settings, payment settings or publication changes were performed.

## Inventory access

The current importer uses a private Storefront API token, not an Admin API token. Required additional scope: `unauthenticated_read_product_inventory`, for `ProductVariant.quantityAvailable`. Retain `unauthenticated_read_product_listings`. Admin API `read_inventory` is not a substitute for this Storefront permission.

Update the Shopify app/Headless storefront that issued the private Storefront token already configured for the Bazaar importer. The exact display name cannot be established from this code or product responses; the internal supplier label “Shopify” is not proof of the issuing app's name. Ask the owner for the app name or a permissions screenshot with all credentials hidden.

For a Dev Dashboard app, add the scope in a new app version, release that version in Shopify and approve the updated access on the store. For CLI-managed apps, amend the app's access_scopes configuration and deploy the Shopify app configuration, then approve access on the store. These are Shopify configuration actions, not authorization to publish PullBid Live. If Headless issued the token, manage the appropriate storefront's Storefront API permissions there instead. Never copy tokens into chat.

Sources: https://shopify.dev/docs/api/usage/access-scopes and https://shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes

## Read-only pricing preview

Database checks: 1,362 products, 7,211 variants, all drafts, all inactive, all quantity zero. All 7,211 have Shopify supplier links.

Configured default card fees: 2.90% plus $0.30. There is no Shopify-specific pricing rule. Use these configured fees, not the default rule's unrelated 40% markup: Shopify markup remains 15%.

In cents: proposed = max(ceil(cost × 1.15), ceil((cost + fixed_fee + 200) / (1 - fee_percent / 100))). Contribution after card fees = proposed × (1 - fee_percent / 100) - cost - fixed_fee. This uses the unrounded percentage fee conservatively, then rounds the selling price upward to a cent. It is not net profit and excludes shipping, tax, refunds, currency conversion and other fulfillment costs.

758 variants need increases, 6,453 stay unchanged. Every proposed variant clears 200 cents; for every floor-raised variant, one cent less fails the floor. The complete owner-only CSV is delivered separately; nothing has been applied.

## Test status and remaining gates

- Four isolated pricing tests pass; all 7,211 preview rows checked with decimal arithmetic.
- Twenty-five existing Shopify import / Bazaar inventory and checkout unit tests pass. These are not real stock-sync or paid-order tests.
- Inventory sync is not implemented: the current importer assigns zero rather than reading quantityAvailable. Permission approval is required before a real small-sample sync.
- Checkout currently rejects Shopify: drafts/inactive options fail the catalog gate, and supplier validation only accepts CJ. Supplier adapter types also do not include Shopify. Do not route Shopify orders through CJ.
- Fulfillment routing has not been exercised with a Shopify order. No payment or supplier submission was made.

After scope approval, first read 3–5 complete variant groups and validate numeric quantityAvailable including zero, positive stock, null/unverified and availableForSale mismatches. Do not infer numeric stock from availableForSale. In an isolated draft, exercise positive → zero → restored stock, failed/stale sync, unchanged product draft status, inactive variants and CJ before/after fingerprints. Do not synchronize the full catalog until these pass.

Prepare Shopify checkout/fulfillment support under separate payment/database authorization as needed. Use sandbox-only private fixtures, never publish imported drafts to test checkout. Verify mixed CJ/Shopify orders retain supplier ID and product/variant references per line, split fulfillment correctly, and require manual approval without supplier spending. Real stock synchronization, sandbox paid checkout and source routing remain blockers to release.