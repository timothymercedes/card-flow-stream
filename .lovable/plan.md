# Personal Profile real-account release candidate

## Locked visual reference
Keep the final approved Mosaic + Atelier + Signal layout, charcoal/mint colors, typography, three-panel collector cover, asymmetric timeline, post-card styling, navigation and six tabs unchanged.

## Completed preview review
The session-only demo now supports identity editing, bundled media selection, post creation/editing/pinning/removal, comments, reactions, public reposts, gallery viewing and simulated following. Fifteen automated checks and the central browser flows passed. Videos remain explicitly labeled storyboards. Production accounts and storage were not changed.

## Next implementation
1. Create a separate real-account release-candidate draft from the saved approved design. Verify isolation before any test-account, schema or media work; stop if isolation is unavailable.
2. Recover exact privacy migrations/source from the existing privacy drafts and reconcile against applied 0017. Inventory all affected profile, media and platform consumers before cutover work.
3. Reuse the approved presentation with safe real identity and owner reads; implement authoritative post/media/comment/reaction/activity operations, owner management and consistent social-profile/post links. Keep account settings, storefront, Vault, Marketplace, PB Store and PB Bazaar separate.
4. Complete private-media handling and audience/parent/reference safeguards in the isolated environment. Do not enable real visitor timelines where any prerequisite is incomplete.
5. Test guest, owner, follower, close friend, unrelated and blocked accounts, direct API/image access, revocation/cache behavior, media playback, owner readback, desktop/mobile and affected-platform regressions.
6. Present a real-account working release candidate and production-readiness report with exact migration/policy inventory, backup/restore, rollback, card-integrity checks and outstanding blockers.

## Technical safeguards
- Demo data and simulated viewer controls never ship on the real profile surface.
- Server operations validate callers and rely on scoped access; no browser-only privacy enforcement or privileged public profile readers.
- Private media uses canonical ownership/reference checks with no raw public-URL fallback; old public copies cannot be recalled.
- Existing 34-card privacy choices are preserved, never automatically made public.
- Shared production migrations, storage/permission changes, acceptance and deployment require separate authorization. Nothing is published as part of this plan.
- Stages 2–4 remain planning-only.

## Current blockers
Exact older privacy migration/source reconciliation, coordinated private-image consumer updates, authenticated integration/security testing and production backup/rollback rehearsal are incomplete. Passing demo tests is not production readiness.