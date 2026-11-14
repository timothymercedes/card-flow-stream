# PullBid Live — Phase 1 stabilization implementation plan

**Prepared:** November 14, 2026. **Status:** review only; no application, database, payment or deployment changes in this request.

## Approval scope
This plan covers **A01–A07 only**, not all 24 audit findings. It preserves expiry, privacy, auctions, demo history and the three separate shopping divisions. No checkout, payments, payouts or supplier ordering will be enabled or exercised.

The earlier approved category design already exists in preview and signed-in interest saving has been checked. It has not been published. Your new brief does not authorize publishing it or rebuilding it. Phase 2 will reconcile that preview with the stabilization results and return desktop/mobile proposals for review; Phase 3 Bazaar discovery remains separate.

The production audit is the baseline, not a fresh inventory census: its 23 expired listings, four demo live records and protected guest reads were measured on November 14. Recheck those conditions read-only before implementation.

## Execution order
1. **A02:** finish unavailable/error item pages without exposing hidden rows.
2. **A03:** stop counting demo records as real activity, preserve history.
3. **A07:** repair scanner entry and sign-in return using the existing scanner.
4. **A01:** honest empty states and controlled seller renewal; no automatic renewal.
5. **A04/A05:** narrowly scoped public aggregate and public Vault projection, after database approval.
6. **A06:** department consistency, with Garden seller support enabled only after its constraint change is approved and applied.

Each group gets its own reviewable change set and tests. Do not bundle financial changes or broader Discover/Bazaar redesign into this release.

## A01 — Expired listings and seller renewal
**Current:** Marketplace correctly excludes expired listings. Seller Repost currently updates expiry to browser time plus 30 days and sets auction status active on the same row. Soft removal uses expiry plus cancelled status; it must not be confused with safe auction renewal.

**Build:** distinguish catalog-empty from filtered-no-results and read failure. Seller expired listings remain visible to their owner. Require explicit confirmation of stock, price and photos before renewal. Preserve the existing 30-day duration for eligible fixed-price listings; compute expiry on the server, not the browser. Renew only owner-controlled, unsold, permitted listings with no conflicting order/reservation. Never reactivate old auctions with bids, winners or settlement records; keep them closed and require a separately verified safe relist workflow. Revalidate in an atomic database operation to prevent sale/renew races. Do not bulk extend the 23 audit listings.

**Exact candidate files:** `src/routes/my-listings.tsx`, `src/routes/market.index.tsx`, `src/routes/index.tsx`, `src/components/PublicLanding.tsx`, `src/lib/listingDisplay.ts`; add `src/lib/listingLifecycle.ts`, `src/lib/listingLifecycle.test.ts`, `src/lib/listingRenewal.functions.ts`. Inspect seller storefront reads in `src/routes/seller.$username.tsx` and recommendations in `src/components/MoreFromSeller.tsx` for the same expiry assumption; edit only affected paths.

**Database:** separately reviewed atomic renewal function plus narrow execution grants; no new table expected. Verify existing UPDATE policies/triggers cannot bypass its critical eligibility rules. If they can, ship a companion enforcement change with the caller rather than adding a bypassable function. No migration or stored-record renewal in this planning phase. Automatic reminder scheduling is deferred; owner dashboard expiry indicators provide the first release notification.

**Security:** authenticated owner derived from session; no client-supplied owner authority, no demo renewal, no mutation of order/bid/settlement history. Existing payment and auction handlers unchanged.

**Tests:** desktop/mobile owner sees expired rows and confirmation; guest cannot renew. Concrete tests for 30 days, boundary expiry, sold and foreign-owner rejection, repeated/concurrent requests, active bids/winners blocked, empty catalog versus no matches. Use an isolated database for mutations; existing production listings stay untouched.

**Rollback:** revert UI/caller; revoke new function execution if needed. Preserve any legitimately renewed record and history. Do not blindly restore timestamps if subsequent bids/orders exist; any row correction needs explicit review.

## A02 — Expired detail pages stuck loading
**Current:** `load()` may return no listing, but the null state still renders Loading.

**Build:** explicit pending, success, unavailable and error states; reset state on ID change and discard stale responses. A successful empty read finishes with “Listing unavailable” and Marketplace navigation. Public expired, missing and private IDs share a neutral response; never fetch privileged hidden details merely to label expiry. An authorized owner may see their own expired record with no customer purchase actions. Retry appears only on actual read failures.

**Exact candidate files:** `src/routes/market.$id.tsx`; add a small state helper/test alongside `src/lib/listingLifecycle.ts` if shared. Reuse existing authorized reads and safe seller projection.

**Database:** none expected. If current owner SELECT does not cover expired rows, document that missing path and seek a separately scoped policy approval; do not widen guest access.

**Tests:** expired/nonexistent/private guest links finish loading and disclose no title, photos or seller; active authorized item still renders; owner expired state is read-only for buying. Test network error/retry, rapid ID navigation and desktop/mobile layout. Do not execute Buy/Bid/Checkout.

**Rollback:** revert this route/state helper only; no data rollback.

## A03 — Demo streams represented as live activity
**Build:** exclude `is_demo` from real counts, homepage rails and live discovery. Apply consistent rules to auction and Flex display paths without changing stream history. Where existing reliable session/heartbeat data exists, use it to distinguish a currently broadcasting show from an old `status=live` row; do not make an unverified provider call or treat viewer presence as broadcaster proof. If current evidence is insufficient, label scheduled/live-status records accurately and leave verified playback as an explicit test limit. Existing demo detail URLs remain accessible under their current permissions with a clear Demo label and no claim of real activity.

**Exact candidate files:** `src/routes/index.tsx`, `src/components/PublicLanding.tsx`, `src/routes/live.index.tsx`, `src/routes/showoff.tsx`, `src/routes/live.$id.tsx`, `src/components/HeaderSearch.tsx`, `src/lib/categoryShoppingData.ts`; add `src/lib/publicLiveActivity.ts` and `src/lib/publicLiveActivity.test.ts`. Inspect current Cloudflare session fields before choosing a liveness criterion.

**Database:** none expected for demo filtering. Any new heartbeat/grant requirement is a separate proposal, not implicit permission to change broadcast infrastructure.

**Security/tests:** guest and signed-in rails exclude demo/private streams; demo-only dataset gives zero real shows and an honest empty state. Owner/moderator history remains readable. Desktop/mobile preview checks plus isolated active/stale fixtures; real broadcast requires a willing authorized host and is not certified from demo playback. No bidding or provider credential changes.

**Rollback:** revert discovery filter/copy; no demo deletion or provider state change.

## A04 — Guest collector count
**Build:** replace guest full-profile counting with a scalar public aggregate. Proposed definition: number of explicitly public collector profiles eligible for public discovery, excluding accounts with existing verified demo/test markers. If no trustworthy account marker exists, do not infer one from names/emails; return a clearly defined public-profile total or omit the statistic pending review. Failed reads display an unavailable/hidden statistic, never fabricated zero. No arbitrary filters or user lookup parameters in the count endpoint.

**Exact candidate files:** `src/routes/index.tsx`, `src/components/PublicLanding.tsx`; add `src/lib/publicDiscovery.functions.ts`, `src/lib/publicDiscoveryData.ts`, `src/lib/publicDiscovery.test.ts`.

**Database:** separately approved count-only function with fixed predicates, fixed search path and explicit EXECUTE grants. A SECURITY DEFINER function, if necessary to traverse protected rows, exposes only this bounded aggregate; no anonymous SELECT grant on full profiles. Reuse existing public-profile helpers where equivalent. Aggregate-only cache may be public; session-dependent data must never use shared caching.

**Tests:** guest gets the approved scalar, no profile IDs/email/address/roles; private/test exclusions follow verified fields. Error does not become zero. Guest and signed-in counters agree for the same public scope. Desktop/mobile label fits.

**Rollback:** hide count or display unavailable; revoke new public execution. Do not restore full-profile guest reads.

## A05 — Public Vault guest visibility
**Build:** replace protected profile joins with one bounded safe projection that checks both owner Vault privacy and card visibility. Missing owner settings default private. Owner authenticated views retain full permitted data; followers/friends continue to use their existing authenticated access paths and never become guest-public. Public gallery returns approved card identity/display fields, safe public owner name/avatar and only media actually permitted for public viewing. Exclude valuations, purchase cost, personal notes, addresses, emails, roles, supplier data and hidden cards. Never expose vault settings themselves.

**Exact candidate files:** `src/routes/index.tsx`, `src/routes/seller.$username.tsx`, `src/lib/publicDiscovery.functions.ts`, `src/lib/publicDiscoveryData.ts`, `src/lib/publicDiscovery.test.ts`. Inspect `src/routes/vault.tsx` and existing media reads for owner/friend behavior; modify only if the projection integration requires it.

**Database:** separately approved public projection function, narrow EXECUTE grants, fixed search path and bounded pagination. Keep base-table policies and owner SELECT intact. Inspect current `can_view_vault`/visibility policies and media permissions before writing SQL; do not substitute an admin unrestricted row dump. Any protected-photo signing must first verify public eligibility and use existing media rules.

**Tests:** public-owner/public-card visible; private-owner/public-card hidden; public-owner/private-card hidden; missing settings hidden; friends/followers inaccessible to guests; authorized owner/friend paths preserved. Direct full-table and private-file requests remain denied. Gallery, seller tab and failure/empty states tested on desktop/mobile with isolated privacy fixtures.

**Rollback:** disconnect projection and show honest unavailable state; revoke new execution. Never relax old privacy rules to restore a gallery.

## A06 — Garden & Outdoors consistency
**Build:** make eleven departments consistent across navigation, Marketplace filters, department pages and seller creation/edit. Preserve existing keys and URLs, sports-card taxonomy and scanner compatibility. Remove the synthetic Garden fallback from shopping configuration once the shared configuration includes it. “Home & Living” stays display wording for the existing Home key. Garden remains gardening/outdoor living, distinct from sports recreation.

**Exact candidate files:** `src/lib/marketplaceDepartments.ts`, `src/lib/categoryShoppingConfig.ts`, `src/routes/market.index.tsx`, `src/routes/sell.tsx`, `src/routes/my-listings.tsx`, `src/lib/marketplaceSearch.ts`, `src/lib/categoryShopping.test.ts`, `src/lib/marketplaceSearch.test.ts` if present. Reuse `src/components/DepartmentNavigation.tsx`/`src/components/CategoryMenu.tsx`; no duplicate taxonomy.

**Database:** explicit separate approval to expand `listings_department_valid` from migration `0006` with `garden_outdoors`, preserving every existing value. Inspect `search_marketplace` validation for an allowlist requiring the same addition. Stage front-end browsing support first; enable Garden seller writes only after approved database compatibility is verified. No table drops, row deletions or legacy key replacement.

**Tests:** concrete eleven-key enumeration; Garden filter submits/reloads/back-forward; owner creates/edits a Garden listing in isolation and reads it back; Sports & Outdoors unaffected; existing collectible scanner keys unchanged. Desktop/mobile filters fit; old valid data remains accepted.

**Rollback:** disable Garden seller writes first; retain browsing/old URLs. If any Garden rows exist, do not restore the old restrictive constraint until a separately approved data plan exists. Leave the backward-compatible expanded constraint in place rather than destroying rows.

## A07 — Scanner navigation
**Build:** split “Vault” and “Scan a card.” Use an optional validated scanner intent on `/vault` to open its existing `CardScanner` after session hydration. A guest sees “Sign in to scan a card” and the sanitized same-origin return preserves scanner intent through password and OAuth. Scanner intent is not an authorization bypass. Opening and cancelling clears the intent to prevent repeated automatic opening on unrelated navigation. Do not create a duplicate scanner engine or silently change card processing.

**Exact candidate files:** `src/routes/marketplace.$department.tsx`, `src/routes/vault.tsx`, `src/routes/auth.tsx` only where return propagation is missing, `src/lib/authFlow.ts`, `src/lib/authFlow.test.ts`; add focused scanner-intent helper/test if needed. Review existing header/account scanner call sites, rather than inventing `/scanner` as an unimplemented link.

**Database:** none. Existing scanner storage, pricing and identity calls stay unchanged.

**Tests:** guest CTA retains `/vault` plus scanner intent, signed-in click opens scanner, ordinary Vault link does not; cancellation/back/reload do not loop. Unsafe external return URLs rejected. Desktop file selection and mobile camera permission denied/allowed states; physical camera checks require a device/operator. Do not claim OCR/provider success from merely opening the scanner.

**Rollback:** revert optional search intent and link labels; preserve Vault and scanner internals. Previously shared optional intent URLs still open Vault safely.

## Shared test and release gates
- Before edits, snapshot relevant current read-only schemas, policies, grants and public counts; record files and SQL definitions for rollback.
- Unit tests assert real rules, not copy/snapshots. Run existing Marketplace search, privacy, category, auth-return and payment-safety unit regressions; no payment E2E charges in this phase.
- Use an isolated test database for renewal, stock, privacy, media and Garden write fixtures. If unavailable, report mutation checks blocked; never silently seed shared production.
- Restore the requesting user's managed session, enter beta through the legitimate existing form, and verify authorized reads/actions. No beta storage forgery or privacy bypass.
- Browser checks at desktop 1331×892 and 1280×1800, phones 390×844 and 360×800. Check keyboard focus, loading termination, tap targets, long labels, image errors, search/reload and no page-level overflow.
- Compare before/after guest network responses for forbidden fields and direct private-table/media denial. Preserve owner/moderator access.
- Confirm no shared demo history, payment/order/ledger/bid history, supplier catalog or Bazaar approval changed outside explicit test-owned fixtures.
- Review actual preview screenshots and failures before publication; production deployment needs its own explicit approval.

## Database and permissions approval checklist
| Item | Proposed change | Approval needed before execution |
|---|---|---|
| A01 | Atomic owner renewal and companion eligibility enforcement if needed | Separate SQL/permission review and isolated mutation tests |
| A02 | Normally none; owner read only if shown missing | Separate scoped policy approval if needed |
| A03 | Query filters only; no deletion | Code approval; any new liveness schema separately scoped |
| A04 | Scalar public count execution | Separate function/grant approval |
| A05 | Public-safe Vault/media projection | Separate function/grant/media approval |
| A06 | Backward-compatible Garden constraint/search validation | Separate database approval |
| A07 | Optional scanner intent/navigation | Code approval only |

New function names are proposals, not applied SQL. Actual migration filenames are assigned only after approval; do not create executable migration candidates now. No new tables planned. If any become necessary, return the table/column/grant/policy specification for review first.

**Next decision:** approve this Phase 1 code scope, and explicitly approve or defer each database item above. Until then, only this planning document and task roadmap change.