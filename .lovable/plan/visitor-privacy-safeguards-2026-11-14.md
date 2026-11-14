# Visitor privacy safeguards

## Confirmed gaps
- Post reads currently allow everyone regardless of audience or moderation status.
- Comments and reactions can be read independently of access to their parent post; writes do not verify parent access.
- Public profile lookup ignores blocking and returns unnecessary verification fields.
- Vault access checks the collection setting but not each card's visibility; Vault images are publicly downloadable.
- The user's captured preview activity comes from the embedded Lovable host and matches the seller storefront (`PublicStore`), not the personal Profile. A preview-only **Open PREVIEW DESIGN** link now connects the owner storefront to `/profile` without replacing either experience.

## Build
1. Establish one caller-bound visibility rule for public, followers, close-friends and owner-only content; unknown audiences fail closed. Blocking in either direction denies visitor access. Preserve owner management and separately authorized staff moderation.
2. Enforce post audience and moderation rules in database read policies, including child comments/reactions. Require authorized parent access for interactions, honor comments-disabled state, and prevent authors from approving their own moderated posts.
3. Add a narrow personal-profile projection that returns only authorized social identity fields; keep account details private and seller storefront information separate. Do not reuse the unrestricted storefront projection for social profiles.
4. Require both collection-level and card-level authorization for Vault showcases. Replace public private-content media delivery with authorized, short-lived signed URLs across every affected reader before changing bucket privacy. Existing public URLs and cached/downloaded copies cannot be retroactively revoked.
5. Enable real visitor profile destinations only after these checks pass. Keep private identity drafts, account tools and composer controls owner-only; unavailable access never falls back to another person's data.

## Verification
- Test signed-out visitors, unrelated signed-in users, followers, close friends, owners, blocked users and staff with explicitly authorized isolated fixtures.
- Check direct database reads/writes, parent-child access, private media links, audience changes and stale requests—not just hidden buttons.
- Browser-check authorized profile navigation and unauthorized exclusion at desktop/mobile sizes; preserve Feed, storefront, Vault and account functionality.
- Recheck the user's embedded preview after they open the new storefront link and supply fresh browser telemetry; local screenshots alone do not verify their session.

## Approval boundary
Approval authorizes scoped shared-database policies/functions and necessary storage privacy changes, which affect the live backend immediately even without publishing. No payments, orders, roles, existing accounts or unrelated policies will be changed. App changes stay in preview; publishing remains separately prohibited.

## Technical details
Use caller-scoped permissions and a bounded safe-column projection. Implement schema/policy changes with a versioned migration and documented rollback; never grant anonymous access to base profile rows or depend on browser-only privacy checks. Audit existing media readers before changing storage settings. Keep permission tests beside existing tests and run the affected suites.