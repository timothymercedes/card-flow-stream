# Owner & Admin Control Center — design review

Status: design and read-only inspection only. No new routes, roles, database changes, sends, favicon replacements or deployment.

## Branding approval
PB Shield is the selected logo direction. The revised overview and moderation/notification boards use silver/gold PB heritage, graphite navigation, bright working surfaces and emerald status accents. Authorized Personnel Only appears on navigation and sign-in. Values are intentionally unloaded, never invented platform statistics. This selection does not approve implementation or permission changes.

## Complete navigation structure
One central portal, not a single screen containing every tool. Overview is always the first sidebar item; every section has Administration / Overview / Section breadcrumbs and a Back to Overview link. Mobile uses a labeled menu sheet with the same authorized sections. Remember filters within each section and retain return-to-list context after opening a case.

| Section | Contents, kept out of Overview |
|---|---|
| Overview | Four important statistics, unresolved/critical/escalated attention counts, a short recent-alert preview; no settings or full case tables |
| Members | Searchable members, account dossier, registrations, assigned account actions |
| Administrators | Owner-managed invites, active/suspended access, permission groups, access/activity review |
| Live Control | Genuine broadcasts, viewer freshness, auctions, stream diagnostics and scoped moderation |
| Reports & Disputes | Reports / Disputes / Appeals tabs, grouped review queue, assignments, evidence and decisions |
| Stores | Marketplace sellers / PB Store / PB Bazaar tabs; reuse approvals, never merge catalogs or orders |
| Finance | Scoped transaction/accounting reports, period filters and definitions; no new money movement |
| Notifications | Own alerts, All / Critical / Assigned filters, acknowledgment, delivery preferences |
| System Settings | Authorized platform configuration, integrations status, advanced controls inside subpages; never secret values |
| Audit Logs | Permission-scoped immutable action history, actor/resource/time filters |

Overview adapts to role: only permitted metrics/alerts are fetched and shown. Unavailable is an em dash with freshness/error status, not a fake zero. Critical uses red and clear text/icon, not color alone. The full report list appears only after Open review queue.

## Verified Owner & Founder account
Read-only hosted account inspection on November 14, 2026 found exactly one account matching timothymercedes@gmail.com, with verified email and existing owner and admin roles. No role was assigned or changed. Bind future Owner & Founder designation to that verified authenticated account ID and protected owner role, not an editable email/profile field or browser comparison. Email is an identification input for the controlled setup review, not a continuing privilege condition.

Owner has authority across all sections and owner-controlled administrator/settings operations; other administrators cannot demote, suspend, revoke group access from, delete, or otherwise indirectly disable the owner account. Existing role RPCs prohibit removing the owner role; additional indirect membership/account paths require explicit companion protection before launch. Account email changes must not remove ownership. No browser-accessible bootstrap or owner-assignment endpoint. Keep server revalidation, recent secure authentication for sensitive actions and recovery review; highest authority never includes access to passwords/tokens or bypassing payment publication gates.

## Proposed permission matrix
Legend: Full = permitted operations after sensitive-action checks; Scoped = only explicitly granted resources/capabilities; Own = own alerts/preferences. Owner-authorized active membership is required for all non-owner groups; existing customer/seller/moderator role alone is not portal authorization.

| Section / capability | Owner | Platform admin | Moderator | Support | Finance |
|---|---|---|---|---|---|
| Overview | Full | Scoped | Scoped | Scoped | Scoped |
| Members / account data | Full | Scoped | Case-related safe fields | Assigned support safe fields | Accounting-related safe fields |
| Administrator access/permissions | Full | No grant/revoke authority | None | None | None |
| Live Control | Full | Scoped | Authorized investigation/moderation | Case read if granted | None |
| Reports & Disputes | Full | Scoped | Authorized moderation cases | Assigned support/dispute cases | Financial case projection if granted |
| Warn / temporary restriction | Full | Explicit capability | Explicit capability | Escalation only by default | Escalation only |
| Suspend / remove content | Full | Explicit high-impact capability | Explicit high-impact capability | None by default | None |
| Reporter identity | Exceptional need-to-know capability with logged reason | Same; not default | Same; not default | None by default | None |
| Stores | Full | Scoped | Report-linked read | Assigned support read | Scoped accounting read |
| Finance | Full authority; existing release gates apply | Explicit read scope | None | No broad financial access | Scoped read-only first release |
| Notifications | Own plus authorized operational oversight | Own | Own | Own | Own |
| System Settings | Full | Explicit non-security configuration | None | None | None |
| Audit Logs | Full | Scoped | Own/case-related | Own/case-related | Finance-scoped |

Server handlers and database permissions enforce this matrix independently of sidebar visibility. No inherited finance/refund/transfer authority merely from access to a dispute screen. Suspension/revocation removes access promptly and prevents cached sensitive responses from being reused.

## Moderation workflow and notifications
1. Validate report subject, reason and evidence; rate-limit abuse without refusing urgent reports solely because a subject already has a case. Preserve each submission and reporter privately.
2. Route all existing intake sources to one review surface. Group by division + subject type + canonical subject ID + compatible incident; never merge unrelated null IDs or equate report count with guilt. Legacy and newer report tables remain traceable.
3. Create New case with Low / Normal / High / Critical operational priority. Priority is distinct from audit severity. Sort Critical first, then escalation/age. Credible fraud, critical threats and serious safety signals immediately enter Escalated review and alert authorized recipients, not automatic punishment.
4. Notify eligible on-duty reviewers; if none are configured, notify Owner as fallback. Deduplicate case/event/recipient/channel deliveries. In-app attention is durable; email/push require preferences/consent and respect managed suppression. No promised numeric response deadline until an operational policy is agreed.
5. Assign eligible staff; acknowledge alert, review protected evidence and put case Under Review. Use atomic assignment/status transitions to prevent competing staff overwrites. Internal notes and reporter identity never enter subject/reporter-facing outcome responses.
6. Reviewer selects warn, temporary restriction, suspension, per-content removal or escalation according to permission. Confirmation shows target, scope, duration, reason, impact and appeal path. Recheck current permission and recent secure authentication before commit. Preserve evidence before removal; link action and outcome to case.
7. Resolve only after action outcome is verified, or Dismiss with documented reason. Failed action remains open for attention. Record decision, before/after values, actor/time and reason atomically; record external action pending/failure without claiming completion. Resolved and Dismissed are terminal; reopening requires explicit authorized reason and clears obsolete resolution metadata while preserving history.
8. Send privacy-safe decision notice and offer appeal tied to decision. Suspended users must retain a narrow authenticated appeal/support path without recovering ordinary account powers. Assign appeal to a different reviewer where feasible, escalate owner-sensitive decisions appropriately and track uphold/modify/overturn with audited restoration.

Unresolved counts represent grouped cases in New / Under Review / Escalated, not raw duplicate reports. Critical count is unresolved Critical cases; escalated count is unresolved Escalated cases. These overlap and must not be summed as a total. Counts and alert previews are permission scoped. Reading or acknowledging an alert does not resolve the case. Bell unread count is separate from unresolved queue counts.

## Reuse findings and gaps
Current public ReportDialog writes user_reports; newer moderation queue reads moderation_reports. A unified UI without a bridge could miss submitted reports. Deployed columns confirm separate schemas, severity and assignment fields. Existing evidence/audit/support tools can be adapted, not rebuilt.

Reviewed code gaps: assignment/priority controls are missing; status updates lack strict transition enforcement; staff full-row report reads expose reporter IDs; internal versus public outcome notes are not separated; evidence signing must validate linked case permission rather than accept any path; action/log writes must become atomic and check errors. Buyer restrictions are not proof of posting/selling/chat/stream enforcement. Generic ban-appeal support is not yet a decision-linked appeal workflow. These require scoped design/schema/permission approval, not cosmetic fixes.

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