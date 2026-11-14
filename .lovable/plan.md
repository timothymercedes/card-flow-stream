# PullBid Live premium category experience

## Design proposed for approval
- Add a dedicated **Categories** tab opening a full-screen photographic menu, led by **Trading Cards & Collectibles**.
- Desktop: signature department band and ten department cards in a responsive grid; visible search and close control.
- Mobile: signature department first, horizontal quick-browse rail and two-column photo cards, with every department available.
- Optional interests: multi-select photo cards, Skip and Save, accessible again in account settings; no interests selected by default.
- Retain the current real logo and emerald/red brand accents. Generated illustrations demonstrate layouts only, not final product photography or exact logo artwork.

## Keep shopping divisions distinct
All eleven Marketplace department cards retain their existing URLs and inventory. **Home & Living** is display wording for the existing Home department, not a new URL. **PB Store** stays TCG/collectibles at `/shop`; **PB Bazaar** stays separate general retail at `/bazaar`. Preserve Live, Vault, Feed, Chat and other working navigation.

## After visual approval
1. Implement approved category presentation in preview using optimized, rights-cleared images, existing department pages, subcategories, search and filters.
2. Verify every department destination, filter/reload behavior, honest empty states, desktop/mobile layout, keyboard access and reduced motion.
3. Review existing onboarding/settings interest support; propose separately scoped account storage if required. Personalization must keep every department accessible and all shopping divisions clearly labeled.
4. Show actual preview screens and results before separately approved publishing.

## Technical boundaries
- Reuse `categoryShoppingConfig` and existing public Marketplace projections; no duplicate inventory or taxonomy replacement.
- Keep concept materials outside application imports; do not use generated mockup screenshots as website UI.
- Popularity must come from genuine activity; omit it if no suitable source exists.
- Optional interest persistence, permissions and account merge need their own scoped review before shared-backend changes.
- Garden seller support, expired inventory, scanner navigation and other audit fixes remain separate work.

## Not authorized
No application implementation before design approval. No shared database changes, payment/checkout changes, supplier ordering or production deployment under this design proposal.