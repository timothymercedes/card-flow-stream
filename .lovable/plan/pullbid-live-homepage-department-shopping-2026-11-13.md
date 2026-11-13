# PullBid Live — Homepage department shopping

## Scope and safeguards

Add category shopping to the **existing homepage**, not just the Marketplace filters. Preserve the current header, homepage imagery, colors, navigation, Stories, Live/Flex, Marketplace, community and Vault sections.

This stage is **review only**. After approval, implement in preview without publishing. No Stripe, checkout, balances, payouts, auction settlement, existing seller accounts or transaction-history changes. Preview shares the production database, so no shared schema or permission changes are included without separate approval; if a missing data capability needs one, identify it before proceeding.

## Proposed homepage placement

Place a compact **Shop by category** strip directly below the existing site header and above the current homepage introduction. This makes it visible immediately to signed-in and signed-out visitors without replacing or rearranging the existing content.

```text
EXISTING HEADER
Logo · Home · Live · Marketplace · existing navigation/actions
----------------------------------------------------------
Shop by category
All | Automotive | Electronics | Trading Cards & Collectibles →
----------------------------------------------------------
EXISTING HOMEPAGE INTRODUCTION / IMAGE / BUTTONS / STATS
EXISTING STORIES
EXISTING LIVE / FLEX
EXISTING MARKETPLACE, COMMUNITY AND VAULT SECTIONS
```

- Use existing text, icons, borders and accent styling, not a new visual theme.
- One horizontal row; swipe on mobile, scroll/arrow controls on desktop. Long labels stay intact without widening the page.
- **All** opens the existing `/market`. Each department opens its dedicated shopping page.
- Display departments in your requested order:
  All; Automotive; Electronics; Trading Cards & Collectibles; Fashion; Tools & Equipment; Home & Furniture; Sports & Outdoors; Gaming; Business & Industrial; Music & Entertainment; Garden & Outdoors.

## Dedicated pages and addresses

| Department | Address |
|---|---|
| Automotive | `/marketplace/automotive` |
| Electronics | `/marketplace/electronics` |
| Trading Cards & Collectibles | `/marketplace/collectibles` |
| Fashion | `/marketplace/fashion` |
| Tools & Equipment | `/marketplace/tools` |
| Home & Furniture | `/marketplace/home` |
| Sports & Outdoors | `/marketplace/sports-outdoors` |
| Gaming | `/marketplace/gaming` |
| Business & Industrial | `/marketplace/business-industrial` |
| Music & Entertainment | `/marketplace/music-entertainment` |
| Garden & Outdoors | `/marketplace/garden-outdoors` |

Existing `/market` and individual listing addresses remain unchanged.

## Proposed category-page structure

All pages keep the existing site navigation and listing-card appearance. Category identity comes from its title, icon, relevant product photos and subcategories, using the existing palette.

```text
EXISTING HEADER + CATEGORY STRIP (selected department highlighted)
Home / Marketplace / Automotive
AUTOMOTIVE
Vehicles, parts and accessories
[ Search Automotive…                         ] [Global search]
Vehicles · Parts · Accessories · Tires & Wheels

TRENDING SEARCHES                 (real activity only)
FEATURED LISTINGS                 [Browse all]
[existing listing cards]
TRENDING PRODUCTS / POPULAR ITEMS (real activity only)
FEATURED DEALS                    (verified discounts only)
POPULAR BRANDS                   (real inventory/activity)
LIVE AUCTIONS & SHOPPING SHOWS    (public, category-relevant)
RECENTLY ADDED
[existing listing cards]

ALL AUTOMOTIVE LISTINGS
Search · filters · sort · result count
[existing listing grid + pagination]
```

- Mobile: single-column sections, horizontally scrollable product rails and a filters drawer.
- Desktop: wider product grids and a side filter panel for all listings.
- Search, subcategory, filters, sort and pagination survive reload/back navigation.
- Search stays within the department. **Global search** explicitly carries the query to the existing Marketplace across all departments.
- Subcategory and brand links filter the selected department, never unrelated inventory.
- Empty departments show a truthful empty state, not sample products. Missing activity shows an empty section or omits the rail; do not substitute fake trending searches or counts.

## Category content and filters

All departments support price, condition and listing type, plus applicable product details:

| Department | Subcategories | Relevant filters |
|---|---|---|
| Automotive | Vehicles, parts, accessories, tires & wheels | Make, model, year, maximum mileage, condition, location |
| Electronics | Phones, computers, TVs, cameras, audio, accessories | Brand, model, device type, condition |
| Collectibles | Existing card categories and supported collectibles | Existing set, card number, grading company, grade, condition |
| Fashion | Clothing, sneakers, shoes, bags, accessories | Brand, size, item type, condition |
| Tools | Hand tools, power tools, construction equipment, accessories | Brand, tool/equipment type, condition |
| Home | Furniture, decor, appliances, household goods | Brand, item type, material, condition |
| Sports & Outdoors | Sports equipment, camping, cycling, outdoor recreation | Brand, sport/activity, size, condition |
| Gaming | Consoles, games, accessories, gaming equipment | Platform, brand, item type, condition |
| Business & Industrial | Industrial machinery, office equipment, commercial supplies | Brand, equipment type, condition |
| Music & Entertainment | Instruments, audio equipment, music media, entertainment items | Brand, instrument/media type, condition |
| Garden & Outdoors | Gardening tools, plants, outdoor furniture, outdoor living | Brand, item type, material, condition |

These are browse/filter choices, not claims that inventory currently exists. Only offer attribute filters backed by supported listing details; missing attributes are not inferred from titles. Keep sports cards in Collectibles and garden/outdoor living distinct from outdoor recreation.

Collectibles retains scanner entry points, grading, card details and all current collector features.

## Real inventory and activity

- Reuse the existing public marketplace search and shared listings. Published seller listings appear based on their stored department, including newly created listings; never copy inventory into category-specific stores.
- Featured listings require existing editorial/promotion evidence; a random selection must not be labeled featured. Deal labels require genuine discount information.
- Recently added uses publication/creation timestamps for eligible listings.
- Trending/popular products use verified marketplace signals such as bid activity or other available aggregate engagement, with honest labels and no private buyer/seller details.
- Popular brands come from actual department inventory/aggregate activity, never an invented ranking.
- Trending searches require real aggregated search activity. There is no confirmed search-trend source in the current marketplace helper; inspect available telemetry before implementation. If unavailable, leave this section empty rather than fabricate it or add shared tracking without approval.
- Live sections show only public relevant shows and published auction items using existing safe public access. No guest bidding, giveaways, spins or private seller/community exposure.

## Technical approach

- Add a shared department-navigation component and a shared category-shopping view. Dedicated addresses can use one validated dynamic leaf route with per-department title, description and social metadata; unknown departments return not found.
- Map public URL slugs to existing department keys (for example `sports-outdoors` to `sports_outdoors`); preserve legacy collectible category keys.
- Extend the existing department configuration with Garden & Outdoors and category browsing metadata. Keep data in shared listing attributes, not separate category inventories.
- New initial reads use route loaders with TanStack Query cache priming/subscriptions and existing safe public projections. Keep URL search state optional and shared across browsing controls.
- Reuse listing cards, quick view, seller display and existing permissions; do not widen base-table access. Reuse existing search rather than creating a second search engine.
- Record implementation architecture in `AGENTS.md` when implementation is approved; no application code or shared database changes during this review.

## Implementation checklist after approval

1. Add the homepage category strip in the proposed location.
2. Configure eleven departments, public page addresses, subcategories and supported filters.
3. Build shared category pages, scoped search, global-search handoff and browse-all controls.
4. Connect real featured/recent/activity/deal/brand sections with truthful unavailable states.
5. Connect category-relevant public live shows/auction items without modifying auction behavior.
6. Preserve collectible tools and update seller category selection for Garden using shared inventory.
7. Test desktop/mobile, signed-out/signed-in and existing browsing/creation/edit flows; leave payment functions untouched.

## Acceptance checks

- Every homepage category opens its correct address; All opens the existing Marketplace.
- Department search and subcategories never return another department; global search deliberately does.
- Published listings appear in the correct category; private/draft/unpublished listings never appear to visitors.
- Seller creation/edit retains existing attributes, photos and collectibles behavior; newly published listings appear without inventory duplication.
- Sort/filter/reload/back/pagination work; category pages handle empty results and errors.
- No fabricated products, popularity, deals or trending searches.
- Public live links work; bid attempts still prompt sign-in; moderator/seller/admin permissions remain unchanged.
- Desktop and mobile layouts do not overflow, and existing Home/Marketplace/Discover/Live/Vault/Seller Hub/scanner navigation still works.
- No publication, production database mutation or payment/settlement behavior change.