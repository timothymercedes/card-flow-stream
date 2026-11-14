# PB Shield preview review — November 14, 2026

## Scope and result
Reviewed the running preview only. No database/schema/role changes, production changes, publishing, payment actions or notification sends were performed. Existing legitimate beta access was used without weakening the gate.

## Verified
- Desktop 1280 × 1800 and phone 390 × 844: branded personnel login, email/password fields, password-recovery screen, PB Shield artwork, Authorized Personnel Only designation, overview and mobile menu. No horizontal overflow on the tested phone login/overview.
- Signed-out control-center access displays an access prompt and no operational data.
- The existing authenticated owner account enters the control center. All ten section destinations render, mobile Stores navigation closes the menu, and Identity Audit opens with PB Shield branding and an Overview return link.
- Protected overview reads check the caller's persisted owner/admin roles server-side before fetching operational data; reads use the caller's permissions, not privileged credentials.
- Six access unit tests verify owner/admin entry and rejection of customer/seller, moderator/support and empty roles. These are logic tests, not authenticated browser sessions for each role.
- Administration favicon switches to PB Shield; leaving for the public website restores `/logo.png`. Public logo remains unchanged.
- 29 focused administration, authentication-return, stabilization and payment-safety regression tests passed. Preview compilation succeeded; browser checks had no uncaught page errors.

## Preview-only fixes
- Wait for the current sign-in check before showing the personnel sign-in screen.
- Add confirmed Sign out on the signed-in personnel entry page and denied-access page, so an account without administration permission can switch accounts instead of repeatedly returning to denial.
- Scope the sign-out confirmation to the administration palette; public sign-out appearance stays unchanged.

## Incomplete or not certified
| Area | Current state / next requirement |
|---|---|
| Fresh credential login | Existing owner session and entry/navigation verified. No owner password was supplied or changed; fresh password submission, completed Google/Apple consent and hardware passkey sign-in were not certified in this review. Recovery screen was inspected without sending an email. |
| Other roles | Owner browser session and guest denial verified. Separate actual admin/customer/moderator/support browser sessions were not available or created. Server-role check and access unit tests passed; this is not a full multi-account access test. |
| Notification-email branding | **Not implemented.** No PB Shield administration template or verified-registration alert sender is registered. Existing email templates remain customer/account branded; no test email was sent. Requires separate notification/event/permission approval and delivered-email verification. |
| Notifications page | Shows the current account's existing notifications, including follows; it is not a dedicated verified-registration or administration-event inbox. |
| Administration tools | The branded portal links to existing protected tools. Dedicated searchable Members/Stores/Reports screens, unified moderation cases, assignments, appeals and permission groups are not completed in the new portal. Existing tools remain unchanged. |
| Metrics | Member figure is profile count, not verified registrations. Non-demo live-status count is not proof of playable broadcasting. Empty stores/listings reflect existing data, not a populated shopping certification. |
| Branding polish | Shield is a raster asset used for both logo and favicon, not a separate optimized small-size favicon or final vector package. Desktop sidebar and phone header carry the identity; desktop top bar uses a breadcrumb. |
| Mobile coverage | Login, overview and menu checked on a phone. Not every legacy tool, device, landscape orientation or physical mobile browser was certified. |
| SEO | Entry and portal have unique metadata and noindex/nofollow. Some legacy admin tools have unique metadata but lack that indexing directive; no private data should be treated as protected by noindex alone. |

## Remaining Phase 1 database approval gates
Nothing below has been executed.

| Finding | Proposed approved-scope change | What it would do / safeguards |
|---|---|---|
| **A01 — Eligible listing renewal** | Add an atomic owner-authorized renewal operation and matching database enforcement. | Allow explicit confirmation of still-available eligible fixed-price inventory and renew it for 30 days. Reject unsafe auction, sold, unavailable or transaction-linked inventory. Prevent concurrent requests bypassing eligibility; preserve orders/history and never bulk-extend expired listings. Existing Repost remains unchanged and uncertified. |
| **A04 — Public collector count** | Add a bounded count-only public function with narrowly scoped execution grants and a defined discovery eligibility rule. | Let the homepage show the count of publicly discoverable collectors without exposing complete profiles, emails or private account data. Keep unavailable distinct from zero and preserve owner/staff access. |
| **A05 — Public Vault projection and media** | Add a bounded safe-column read projection; approve any necessary grants or media-access changes separately. | Let visitors see only explicitly public eligible collection content, honoring Vault privacy and existing conservative card visibility. Preserve owner/friend/private access and review photos before exposing them. Do not grant broad guest reads of collection base tables. |
| **A06 — Garden seller support** | Add Garden to the compatible listing department constraint and align approved search/write validation. | Permit authorized sellers to create/edit Garden & Outdoors inventory while keeping all eleven browsing departments consistent. Preserve legacy collectible category keys, seller permissions, existing listings and orders. Rollback must not invalidate newly valid Garden rows. |

Each gate needs its own scoped database authorization, current permission/grant review, isolated positive/negative/concurrency tests and a compatible rollback plan. There is no request here to activate checkout, payouts or supplier ordering.

## Other Phase 1 verification limits
Genuine broadcast playback needs a real authorized broadcast; retained demos do not prove it. Populated inventory, renewal, purchasing and scanner image-recognition checks need separately approved isolated data and scope. Public presentation fixes do not replenish expired inventory.