# PullBid Live — Additive multi-category marketplace

## Approval scope
Expand the existing Marketplace without redesigning the website. This is a proposal only: no application, database, Stripe or production payment changes have been made for this request.

## Current website review
- The homepage and Marketplace were inspected in the running preview. Preserve the existing dark styling, teal accents, homepage sections, navigation, listing tiles and quick-view experience.
- Marketplace already has a search box, category dropdown, listing-type filters and sorting. Its categories are currently collectible-focused, and search matches titles, descriptions, sets and card numbers.
- The header search currently opens Discover. Discover already searches people/storefronts, live shows and listing titles. Keep that destination and layout; extend only its product matching through the shared search implementation.
- Listings already share quantity, seller, price, offer and auction fields. Product details are card-oriented; dedicated vehicle, electronics and tool attributes are missing.
- Seller creation currently requires front/back card photos; inventory editing is also card-oriented. Make these requirements department-aware, and persist existing set/year fields reliably so collectible filters have real data.
- The inspected guest Marketplace has no active listings. Empty-state rendering is visible, but meaningful result tests will need isolated test listings.

## Proposed visible changes
### 1. Marketplace department tabs
Add one horizontally scrollable row beneath the existing Marketplace search controls:

All · Automotive · Electronics · Tools & Equipment · Trading Cards & Collectibles · Fashion · Home & Furniture · Sports & Outdoors · Gaming · Business & Industrial · Music & Entertainment

- All is selected by default.
- Selecting a tab filters the existing listing grid without navigating to a new department page.
- Reuse the existing category dropdown for subcategories within a department, rather than adding a second competing department selector.
- Pokémon, One Piece, Magic, Yu-Gi-Oh!, sports cards and other existing collectibles keep their current stored categories and appear under Trading Cards & Collectibles. Sports & Outdoors is for equipment, not sports cards.
- Keep the current listing tiles, quick view, listing-type controls and sort controls.

### 2. Universal product search
- Extend the existing Marketplace search to match product names, descriptions, brands, category names and public seller storefront names/usernames.
- Keep the existing header search and Discover layout/navigation. Reuse the same product-search logic for Discover's product results while preserving its people and live-show searches.
- Search must work across every department when All is selected; a selected department narrows results.
- Preserve search, selected department, filters and sorting when opening a product and returning or reloading the page.
- Do not expose seller addresses, contact details, payment information, private inventory or protected community data.

### 3. Relevant filters
Extend the existing filter control; do not create a new search page or sidebar layout.

| Department | Relevant product filters |
|---|---|
| Automotive | Make, model, year, mileage, price range, public item location |
| Electronics | Brand, model, condition, price range |
| Trading Cards & Collectibles | Game/subcategory, set, card number, grading company/grade, condition, price range |
| Tools & Equipment | Brand, tool type, condition, price range |
| Other departments | Brand, general product condition, price range; add department-specific fields only where supported |

- All shows common filters. A selected department shows its relevant filters; a search wholly matching one department may surface its filters without silently excluding other results.
- Switching departments clears incompatible filters while retaining the search and common filters.
- Missing metadata is not invented. Active attribute filters match only listings with matching recorded details.
- Provide clear/reset controls and useful empty results.

### 4. Seller listing details on the same system
- Extend the existing listing form, not a separate department-specific inventory or order system.
- Extend the existing inventory edit form with the same details so sellers can update products after creation. General goods need product photos, not a mandatory card-back photo; retain existing card photo requirements for collectibles.
- Let sellers select the department/subcategory and enter the relevant searchable details.
- Keep card fields and scanner/Vault behavior for collectible listings; general products use general condition choices rather than card-only NM/LP/MP labels.
- Keep existing fixed-price, Buy Now, offer and eligible auction settings. Do not broaden vehicle/industrial payment eligibility or shipping capabilities as part of this work; existing compliance and payment restrictions remain in force.

## Technical approach
- Preserve `src/routes/index.tsx`, homepage visuals, AppShell navigation, Live and streaming behavior. Reuse existing design-system controls and tokens; no global style redesign.
- Add a shared department-to-category mapping around `src/lib/listingCategories.ts`. Never rename or repurpose legacy category values used by scanner, Vault, Arena, live shows or seller tools.
- Extend the existing `listings` structure additively with optional department/general product details (brand/model, product condition, public item location and validated department attributes). Keep card fields and the card condition enum unchanged; derive legacy listing departments without overwriting card data.
- Reuse the current listing/inventory/order relationships and public listing visibility rules. Search returns only approved public listing fields and public storefront identifiers, never a full seller profile.
- Share a paginated, parameter-safe product search across Marketplace and Discover instead of filtering an unbounded download of all listings. Add targeted search indexes if needed; keep public versus owner reads distinct.
- Use optional validated URL filters so existing links remain valid. Keep search/department/filter state synchronized with navigation.
- Update only Marketplace-specific description/search wording and page metadata for its broader products. Do not change the homepage wording or visual identity.
- Any database additions receive explicit grants, existing owner-write protections and public visibility checks. No destructive migrations, payment schema modifications or deployment are included.

## Implementation sequence after approval
1. Add shared department mapping and additive product-detail support; preserve existing listings and category keys.
2. Extend the current seller creation and inventory edit forms for department-relevant details without touching payment/settlement logic. Verify deployed fields/policies before any additive database change.
3. Add the Marketplace tabs and relevant filters using its existing controls and listing grid.
4. Extend shared product search and reuse it in the existing Marketplace and Discover product results.
5. Verify permissions, navigation, legacy card compatibility and mobile/desktop presentation.

## Verification before completion
- Unit tests: exact department mapping, sports cards versus sports equipment, brand/category/storefront matching, each department's attribute filters, price ranges and clearing incompatible filters.
- Permission checks: guests see only public listings; drafts/private items and private seller data never appear; seller/admin permissions remain intact.
- Browser checks with isolated fixtures: search cars/phones/computers/tools/cards/furniture/clothing/gaming equipment, choose each department, open quick view/product, return/reload and clear filters.
- Mobile: tabs scroll without page overflow; search, filters and current listing tiles remain usable. Desktop: existing layout preserved.
- Regression checks: existing card creation/search, scanner/Vault handoff, Discover people/live-show results and read-only visitor auction queue. Run existing payment-safety tests without initiating real charges or transfers.
- Remove only this work's temporary fixtures; report any unverified external integration separately.

## Explicitly unchanged
Homepage layout/colors/styling; site navigation; Live/streaming; Discover layout; existing card visuals; scanner; Vault; seller accounts/history; checkout; Stripe connections/settings; production payments; auction charging and settlement; the separately pending Model A security/ledger proposals.

Approve this plan before implementation. No production deployment is included.