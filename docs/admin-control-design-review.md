# Owner & Admin Control Center — design review

Status: design and read-only inspection only. No new routes, roles, database changes, sends, favicon replacements or deployment.

## Branding approval
Three original raster logo concepts: PB shield, command brackets and institutional seal. Each uses the existing silver/gold PB heritage with emerald security detail and PULLBID LIVE ADMINISTRATION. The dashboard/login approval board shows graphite navigation, bright working surfaces, gold hierarchy and emerald status accents. Authorized Personnel Only appears on navigation and sign-in. Values are intentionally unloaded, never invented platform statistics.

These are JPG concept assets, not editable vectors or production-sized transparent icons. After selection, refine one actual candidate, derive compact favicon and sidebar/email variants and inspect at small sizes. Do not replace public logo/favicon or customer emails. Administration favicon must be scoped to administration routes and restore public identity on exit.

## Existing architecture inspected
- `/admin` uses the customer AppShell; its exact-match dashboard and Outlet preserve existing child tools.
- Owner/admin/moderator/support visibility is currently broad role-based. `user_roles` remains the authority, never profile metadata or browser storage.
- `admin_assign_role`/`admin_remove_role` enforce owner-only administration role grants/removals and prohibit owner changes. Do not replace these safeguards with UI-only checks.
- Signup aggregate returns total profiles, rolling 24 hours and 7 days; it is not confirmed-registration or calendar-day/month counting. Existing bounded recent-signups projection is reusable after semantic review.
- `handle_new_user` creates a profile at user insertion; that is not proof of successful email-confirmed registration. Registration alert deduplication must key to verified completion, not every profile insertion or sign-in.
- Notifications are recipient-scoped; current email registry has a daily-orders template only. Admin registration alert templates/events/preferences do not yet exist.
- Reuse current disputes, evidence, moderation, revenue, store review, support and audit tools rather than duplicating workflows.

## Proposed access model — for approval, not executable SQL
Use a separate protected `/admin-control` layout and a public branded administration sign-in destination. Authentication reuses approved existing account/passkey/OAuth flows, not a second account system. The public sign-in page exposes no platform data. Each data/action handler validates authenticated identity and current permission; client layout/menu hiding is not authority. Sensitive changes require recent strong authentication, reason, confirmation and server-side audit recording.

Keep owner/admin in protected `user_roles`. Owner controls portal authorization and groups. Existing moderator/support roles alone must not automatically grant portal entry: require an owner-authorized active membership. Finance is a permission group, not a privilege in editable profile metadata.

| Group | Default authority |
|---|---|
| Owner | Manage portal authorization/groups, platform oversight; no secret/password exposure |
| Platform admin | Operational reports and explicitly granted tools; no owner/peer escalation |
| Moderator | Assigned moderation, reports and evidence; no financial/admin management |
| Support | Assigned support/account cases; no payment credentials or broad private profiles |
| Finance | Read authorized accounting reports; money movement remains separately blocked |

## Candidate additive tables — schema refinement required before approval
All in public; app user UUIDs without new auth.users foreign keys. Same-migration CREATE, GRANT, RLS, policy order is mandatory. No anonymous grants.
- `admin_portal_memberships`: user_id PK, authorization/suspension state, authorized_by, timestamps. Owner-managed writes; authenticated own active authorization read, owner read list. Server rechecks on every request.
- `admin_permission_groups`: id PK, unique slug, display name, protected builtin flag. Owner-only mutation/read plus bounded own-membership projection.
- `admin_group_permissions`: group_id + permission_key composite PK/FK, indexed permission lookup. Owner-managed, server permission resolver read.
- `admin_member_groups`: user_id + group_id composite PK/FKs; audit author/time, reverse group index. Owner-managed; own scoped projection.
- `admin_notification_preferences`: user_id PK/FK membership, registration in-app/email/push options, updated_at. Self writes cannot alter permissions. Owner cannot silently opt another recipient into unwanted email.
- `admin_registration_events`: event_id PK, member user_id unique, confirmed_at, created_at. Service-only creation; no auth tokens/raw secrets; narrow authorized projection.
- `admin_notification_deliveries`: event_id + recipient + channel unique, status/idempotency reference/time. Service-only generation/status transitions; own authorized recipient history projection.

Reuse existing admin action logs and notifications where safe; define retention/redaction and append-only privileged action records before new tables. Permission resolver must fail closed on suspension/revocation and restrict case/data columns per capability.

## Registration alerts
Recognize first confirmed registration (including approved social-auth semantics) after hosted auth validates it. Durable deterministic event ID and recipient/channel uniqueness prevent retries sending duplicates. In-app notifications are recipient-scoped. Each recipient-specific expected admin email originates from the registration feature handler using the managed template helper. No generic send endpoint, cron mailing list or tokens/PII in alert content. User ID/public username and timestamp only; member link itself requires permission. Email footer/suppression remains managed; optional push follows permission and opt-in.

## Metrics
Specify UTC/calendar windows versus rolling intervals; show freshness and unavailable states. Separate confirmed members, sellers, approved stores, published unexpired listings, auctions, verified broadcasters and fresh viewers. GMV/revenue/refunds must use accounting definitions and environment scopes; never infer earnings from gross orders or demo/test events. Do not certify online presence from stale last-sign-in timestamps.

## Implementation gates and validation
1. Select/refine branding and approve dashboard design.
2. Approve detailed permission/schema/registration design and read-only finance scope separately.
3. Build in preview with isolated test backend; reuse existing tools through scoped adapters.
4. Verify guest/customer/seller denial, each authorized capability, revocation/strong-auth/audit, registration retry dedupe and own-notification isolation. Verify mobile sidebar/focus, route favicon restoration, readable tables and empty/error states.
5. Separately approve shared migrations and publication. Keep finance mutations, payments, payouts and supplier ordering disabled throughout this review.

Rollback: disable only new portal entry/adapters; revoke new execution/grants after callers are reverted, retain audit/event history. Never remove existing owner access or change historical payments/store permissions.

## Separate social request
Existing `/profile` is settings, `/seller/$username` is storefront, and `/feed` already has captions, one-image posts, reactions, comments, owner edit/delete and edit history. No cover/display-name profile fields, threaded comment parent, multiple media relation or profile pin were found in the reviewed fields. Current posts/comments/reactions SELECT policies are unconditional, despite posts having visibility/moderation fields; privacy-aware reads and related media/comment/reaction protections require separately approved database changes before audience controls can be advertised as safe. Current browser comment notifications target another user, but notification insert permission is self/admin only: reuse a validated feature handler, not wider inserts. Dedicated social desktop/mobile/timeline/menu designs and full schema review remain a separate approval step; no social code changes made.