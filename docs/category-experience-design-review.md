# PullBid Live category experience — design approval

## Scope and status
Design concepts only, November 14, 2026. No application, shared database, authentication, checkout, supplier-ordering or deployment changes. The second uploaded brief refines the first: collectibles is the signature department, not one equal tile among eleven.

## Proposed screens
1. **Desktop Categories menu:** dedicated main-navigation tab, full-screen overlay with visible close control and department search. Signature Trading Cards & Collectibles photo band leads; ten photographic department cards follow in a five-column grid, reducing to three/two columns at narrower widths. PB Store and PB Bazaar remain separate labeled destinations. Keep existing Live, Vault, Feed and Chat access; responsive header layout, not removal of working links, resolves crowding.
2. **Mobile Categories:** same full-screen experience, fixed header and close button, signature department first, horizontal quick-browse rail plus two-column photographic cards. One vertical scrolling region; no horizontal page overflow. Long labels wrap. Cards have at least 44px touch targets. All eleven departments remain available.
3. **Optional interests:** multi-select photographs with real checkboxes, zero selections initially, optional Skip, Save interests and settings access. The three selected interests in the illustration demonstrate a state, not defaults. On phones use two columns and a bottom action area that does not cover the last row. Skipping never prevents browsing or registration.

Concept images are generated approval illustrations, not live products or inventory. They are not production category assets. Keep the existing actual logo; generated logos, branded objects, card text and example subcategory labels in the illustrations are not approved assets or implementation specifications. Use rights-cleared category imagery, optimized AVIF/WebP and responsive sizes for implementation.

## Existing destinations to preserve
| Display department | Existing Marketplace URL |
|---|---|
| Trading Cards & Collectibles | /marketplace/collectibles |
| Automotive | /marketplace/automotive |
| Electronics | /marketplace/electronics |
| Fashion | /marketplace/fashion |
| Home & Living | /marketplace/home |
| Gaming | /marketplace/gaming |
| Tools & Equipment | /marketplace/tools |
| Sports & Outdoors | /marketplace/sports-outdoors |
| Business & Industrial | /marketplace/business-industrial |
| Music & Entertainment | /marketplace/music-entertainment |
| Garden & Outdoors | /marketplace/garden-outdoors |

Home & Living is proposed display wording for existing Home & Furniture, not a new department or URL. All Marketplace remains /market; PB Store remains /shop; PB Bazaar remains /bazaar. Category cards navigate Marketplace departments. Bazaar entry stays explicit and uses Bazaar's separate catalog: never silently replace Marketplace results with Bazaar inventory.

## Department pages and missing subcategories
Reuse the existing department page, search, URL-synchronized filters, shared public listing projection and collectible category keys. Show photographic subcategory navigation above genuine results; selected filters remain removable. Empty departments get an honest empty state, not demo products.

Existing configuration has eleven department pages. Garden browsing exists but seller listing support remains blocked on a database constraint approval. Category redesign does not solve expired inventory or create live listings.

Suggested additions for later review, not automatic new departments: Electronics → Wearables / Smart Home; Fashion → Watches / Jewelry; Automotive → Maintenance / Car Care; Home → Kitchen / Lighting; Gaming → PC Gaming; Garden → Seeds / Pots / Irrigation; Collectibles → supplies / protection within the appropriate existing taxonomy. Keep sports cards under Collectibles, sports equipment under Sports & Outdoors, and garden living distinct from recreation. Retain current valid filter values until compatible mapping is reviewed; never introduce decorative chips that return incorrect results. No additional top-level department is necessary for this design phase.

## Featured, popular and personalization
- Collectibles remains a featured signature destination even for customers with other interests.
- Optional interests reorder relevant homepage category discovery and available public products without hiding other departments.
- Product recommendations initially use selected categories and existing public stock, not an unapproved AI or tracking system.
- Popular categories require a real activity source and defined time window. If unavailable, omit Popular or use accurately labeled editorial Featured categories; no invented ranks or counts.
- Review existing onboarding/settings preferences first. If appropriate storage does not exist, provide a separately approved permission/persistence plan before adding account data. Guests browse normally; signed-out persistence and account merge require scoped review, not assumed authorization.
- Keep Marketplace, PB Store and Bazaar recommendation groups labeled and their inventory, cart and payments separate.

## Interaction, accessibility and loading
Menu opens without leaving the current page; close/Escape restores focus to Categories. Trap focus while open, use dialog semantics, lock background scrolling, expose meaningful link names, and preserve browser navigation on department clicks. No hover-only subcategory controls. Check keyboard operation, screen readers, contrast and reduced motion. Use subtle photo-scale transitions only with reduced-motion fallback. Load menu photography on opening, lazy-load below-fold images, reserve aspect ratios and provide sensible text/error fallbacks. Check desktop and mobile at real viewport sizes before approval to deploy.

## Approval stages
1. Approve or revise these visual concepts.
2. Build only the approved category presentation in preview, preserving existing routes and filters; test all eleven links and separate shopping divisions.
3. Review and separately scope interest storage and personalization. No automatic database authorization.
4. Review actual screenshots, keyboard/mobile checks and search regressions before separate publication approval.

The prior public production audit remains separate: inventory, scanner navigation, guest counts, Garden seller support and metadata issues require explicitly scoped fixes. This design request does not authorize those changes.