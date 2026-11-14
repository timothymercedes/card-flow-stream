# Personal Profile release candidate — BLOCKED / NOT PRODUCTION READY

Review date: 2026-11-14. No publication, deployment, draft acceptance, production reads or production mutations in this work.

## Open the candidate
https://id-preview-3--c81c8301-d89c-4830-8ab7-06f678968bc1.lovable.app/preview/personal-profile-candidate
Route: src/routes/preview.personal-profile-candidate.tsx. Mounted component: PersonalProfileCandidate.
Sign in through this draft's own sign-in page; existing account/legal gates remain. This draft's accounts are separate from the app. No automatic demo identity in the candidate. The separate Avery demonstration remains /preview/personal-profile (PersonalProfilePreview).

## Implemented and checked
- Caller-authenticated owner identity (separate social name/username/bio), avatar/three-panel covers; no sensitive account columns or customer fallback.
- Persisted owner post create/read/edit/delete, pin, comment toggle, comment create/edit/delete and reactions. Editing updates the original ID rather than duplicating it.
- Private photo/video upload, authenticated binary downloads, playback, media removal and post/media lifecycle; byte-preserving uploads.
- Six tabs, approved charcoal/mint/editorial/collage styling. Empty real accounts intentionally have no fictional cover or stories. Owner must supply their own approved images. Account settings /profile untouched; commerce, Vault and shopping systems remain separate.
- Server guard refuses non-local backend and published domains. Caller RLS authorizes each data access. Visitor username requests return no identity/posts/media; no simulated viewer buttons in candidate.
- Owner-only tables and storage: guests, followers, close friends, unrelated and blocked accounts are all denied, including posts labeled Public. This is deliberate fail-closed behavior, NOT a completed audience-sharing feature.
- 71 real isolated API assertions: owner writes, non-owner base/child reads and inserts denied, direct authenticated media owner-only, public URLs denied, missing private identity columns, immutable comment parent, disabled comments denied, exact media binding revoked/orphan denied.
- 31 targeted unit tests and 29 payment/marketplace/Arena regressions passed. Local browser checked identity save, cover and story photo uploads, one-record edit readback, reactions/comments, video upload/play/delete, unrelated-profile denial, desktop/mobile overflow and zero runtime errors.
- Photos decoded at their real dimensions after fixing zero-byte multipart upload handling. Local screenshots are implementation diagnostics only, NOT proof of the user's accessible browser.

## Exact changes / provenance
Current draft has its own isolated database (drft_01m7db6e0vfp4bkk8c5sbx6xyz). Only additive candidate migrations recorded:
- drizzle/migrations/0018_personal_profile_owner_candidate.sql: five owner-only tables; exact owner/post binding trigger; authenticated/service grants; owner-folder private storage policies.
- drizzle/migrations/0019_personal_candidate_exact_media_binding.sql: restrictive exact registered-media SELECT, orphan denial and immutable comment parent/author trigger.
- Private personal-profile-media bucket, 20 MB; created only in this draft. It is distinct from existing vault-images. Storage configuration is NOT automatically represented by the SQL journal: requires explicit separate reviewed cutover.
Exact policy/grant lines in candidate-policy-inventory.txt; exact SQL lives in the paths above, checksums in sha256.txt. No sample INSERTs added to migrations or app load code. Disposable test accounts/content exist only in this draft, not a shipped fixture script.

Recovered originals 0018–0024 are byte-for-byte copies from origin/thr_an610w50dbuk commit 5548ba223135fb7f8e81d58d4f64b9454f93cfc3 in recovered/, with source-journal.json. They are NOT applied, not renumbered into the migration journal and not approved for release. These old numbers collide with this independent draft's 0018/0019; do not concatenate journals. 0017 remains unchanged (hash recorded).
Reconciliation finding: recovered 0022 drops/replaces 0017 post and Vault restrictions; 0020/0023 widen API grants; recovered 0019 replaces Vault media read policies and requires a private bucket. Therefore this series is not a compatible automatic append. A reviewed consolidated baseline-aware policy delta and full alias tests remain required. Recovery is complete; reconciliation/application is not.

## Remaining blockers
1. True Public/Followers/Close Friends/Only Me visitor authorization, relationship/block fixtures, shared-post collectible intersection and moderation transitions are NOT enabled or verified. All visitor access remains denied.
2. Existing public vault-images and raw consumers remain unchanged. No full canonical alias/orphan mapping or legacy direct URL cutover occurred. Candidate bucket security does not establish existing Vault-image security.
3. Historical evidence only: 34 cards, all private, fingerprint 36e136b4ad1ee8ea2d3c2a42fe6b3f1b. No fresh live read authorized/performed; intact count/privacy today is not independently verified. No card conversions occurred.
4. Real existing profile identity/post migration strategy remains incomplete: separate candidate data prevents private account overwrites, but does not import existing biographies/posts. Profile audience editor, rich activity aggregation/follow counts, complete media moderation/validation/quarantine, transactional upload rollback, and cross-platform notification/search/avatar linking remain incomplete.
5. Mobile floating Return-to-live badge can overlap existing prompts/content. No platform-wide layout change made. Local video checks do not establish mobile-device codec support.
6. Latest security scan returned 52 existing findings (27 info/25 warnings). Deep scan unavailable in this draft. Existing app-wide security and every consumer regression are NOT cleared by the candidate tests.
7. Historical signed/public URLs may have been cached/copied. Private cutover cannot recall prior downloads. Candidate uses no signed URL; downloaded blobs can remain until unmount/background or 60-second revalidation. Immediate revocation of already-delivered bytes is impossible. Cross-device cache/expiry tests remain outstanding.

## Consumer inventory — all require coordinated validation before cutover
See integration-inventory.csv. No legacy consumer was silently redirected to private URLs and financial behavior was not altered. All are blockers until updated/tested, not claims of compatibility.

## Backup / fail-closed rollback rehearsal instructions (not executed)
Before any approved release: encrypted full DB dump plus schema/grants/policy/trigger snapshot, migration journal/checksums, bucket settings/object manifests, and every card ID/owner/visibility/image alias hash. Keep separate encrypted object backup with exact paths. Record 34-card comparison only after separately authorized live read.
Rehearse restore into a NEW isolated environment, never into live. Compare row counts/fingerprints, grants/policies, object byte hashes and all role/direct request cases. A SQL-only rollback cannot restore overwritten images or bucket settings.
Failure response: disable visitor endpoint/flag, revoke visitor grants on candidate data and deny media; preserve owner reads and account settings. Do NOT reopen a private bucket or restore permissive raw-photo policies. Restore only reviewed owned content/settings; do not drop owner-created posts or revert privacy to Public. Retain 0017 unchanged. Verify denial first then owner recovery. This rollback is a documented procedure, NOT a completed restore rehearsal.

## Final production checklist / separate approvals
- Reconcile and separately approve exact SQL delta (not the recovered series blindly).
- Canonical exact alias/ambiguous/orphan fixtures; guest, owner, follower, close friend, unrelated, blocked and moderator parent/child API matrix.
- Private profile column projection; audience/block/revocation/cache/expiry tests across posts/cards/photos/comments/reactions/share links.
- Coordinated consumer migration plus actual live host/cohost/mod selector authorization and consent/revocation checks.
- Existing Vault CRUD/scanner, Marketplace/order/financial, PB Store/Bazaar, trades, collection/wishlist, Arena regressions with real isolated fixtures; no external payment/email side effects without approval.
- Backup/restore and fail-closed rollback EXECUTED in isolation; verify exact 34-card historical comparison via separately authorized live read.
- User personally verifies hosted desktop/mobile candidate; operator tests device video/playback and expired/revoked media.
- Independent acceptance approval (acceptance automatically applies recorded schema changes, but draft data never transfers), exact production SQL/storage cutover approval, and deployment approval. Nothing here authorizes any of those.
Stages 2–4 remain planning-only.
