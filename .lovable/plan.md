# Admin Moderation & Audit History System

Builds a permanent trust-&-safety layer on top of the existing buyer risk + dispute infrastructure (Phase 11). Everything is append-only and survives username / store renames.

## 1. Database (single migration)

**`account_audit_log`** — permanent, append-only timeline for every user.
- `subject_user_id` (the user the event is about), `actor_user_id` (admin/system/buyer/seller), `actor_role`
- `event_type` enum: `payment_failed`, `payment_declined`, `chargeback`, `refund_requested`, `refund_issued`, `order_cancelled`, `not_delivered_claim`, `report_filed`, `suspicious_activity`, `bidding_abuse`, `warning_issued`, `restriction_applied`, `restriction_cleared`, `ban_applied`, `shipping_issue`, `policy_violation`, `store_name_changed`, `username_changed`, `verification_status_changed`, `payout_issue`, `admin_note`, `admin_action`
- `severity` (`info|low|medium|high|critical`), `summary` text, `details` jsonb
- Polymorphic refs: `order_id`, `stream_id`, `payment_intent_id`, `dispute_id`, `payout_id`, `report_id`, `evidence_id`
- `occurred_at`, `created_at`. Indexed on `(subject_user_id, occurred_at desc)`, `(event_type)`, `(severity)`.
- RLS: admins read all; users read their own non-sensitive events; service-role writes.

**`store_name_history`** — `seller_id`, `old_name`, `new_name`, `changed_at`, `changed_by`. Trigger on `profiles.store_name` update inserts row + emits `store_name_changed` audit event.

**`username_history`** — same pattern for `profiles.username`.

**`moderation_reports`** — `id`, `reporter_id`, `subject_user_id`, `subject_type` (`user|store|listing|stream|order|message`), `subject_ref_id`, `category`, `description`, `status` (`open|investigating|resolved|dismissed|escalated`), `assigned_admin_id`, `resolution_notes`, `resolved_at`. RLS: admins all; reporter sees own.

**`moderation_evidence`** — `id`, `report_id` (nullable), `dispute_id` (nullable), `audit_log_id` (nullable), `uploaded_by`, `file_url`, `mime_type`, `file_size`, `caption`, `status` (`pending|approved|rejected|flagged|locked`), `review_notes`, `reviewed_by`, `reviewed_at`, `locked` bool. Backed by private storage bucket `moderation-evidence`.

**`evidence_review_log`** — append-only history of every evidence status change (who/when/from→to/notes).

**`dispute_reconciliation`** — extends existing `disputes`. New columns: `lifecycle_status` (`opened|evidence_pending|under_review|escalated|resolved_refund|resolved_rebook|resolved_partial|rejected|closed`), `rebook_order_id` (nullable FK → orders), `original_payout_id`, `refund_payment_intent_id`, `reconciled_at`, `reconciliation_notes`, `escalated_at`, `escalated_by`. Trigger writes audit events on every status change.

**`admin_action_log`** — every admin write (apply restriction, lock evidence, resolve report, approve refund, freeze account). `admin_id`, `action`, `target_table`, `target_id`, `before`, `after`, `reason`, `created_at`. Read-only after insert (revoke UPDATE/DELETE).

### Functions
- `log_account_event(...)` security-definer RPC — single insertion path used by app code + triggers.
- `log_admin_action(...)` security-definer RPC — wraps every admin mutation.
- Triggers on `disputes`, `orders` (cancellation), `payout_requests`, `profiles.store_name/username`, `user_restrictions`, `buyer_risk_signals` → call `log_account_event`.

## 2. Server functions (`src/lib/moderation.functions.ts`)

All `requireSupabaseAuth` + admin role check via `has_role(auth.uid(),'admin')`.

- `getUserAuditTimelineFn({ userId, filters, cursor })` — chronological merged timeline.
- `getUserDossierFn({ userId })` — profile + store + roles + risk score + restriction summary + counts (orders, disputes, refunds, reports, payouts) + name history.
- `searchUsersFn({ q, riskTier, hasOpenDisputes, hasFailedPayments, hasRestrictions })`.
- `listReportsFn({ status, assignedTo, severity, cursor })` / `getReportFn` / `updateReportStatusFn` / `assignReportFn`.
- `listDisputesFn({ lifecycleStatus, cursor })` / `getDisputeFn` / `updateDisputeLifecycleFn` / `linkRebookOrderFn` / `runReconciliationCheckFn(disputeId)`.
- `listEvidenceFn`, `uploadEvidenceFn` (signed URL), `reviewEvidenceFn({id, action, notes})`, `lockEvidenceFn`, `flagEvidenceFn`.
- `addAdminNoteFn({ subjectUserId, note, severity })` — writes audit row + admin_action_log.

Every mutation calls `log_admin_action` + `log_account_event`.

## 3. Notifications

Reuse existing `notifications` table; add types: `dispute_opened`, `dispute_evidence_submitted`, `dispute_status_changed`, `dispute_escalated`, `dispute_resolved`, `report_filed`, `report_resolved`, `admin_warning_issued`. Fan-out to buyer + seller + admins on dispute lifecycle events via DB trigger.

## 4. Admin UI

New tabs in `src/routes/admin.tsx`:
- **Users** — `AdminUserSearch.tsx`: filterable table → opens `AdminUserDossier.tsx` (timeline, profile, store, name history, risk, restrictions, evidence, linked accounts by IP/payment fingerprint).
- **Reports** — `AdminReportsQueue.tsx` (status/assignment filters) → `AdminReportDetail.tsx` (evidence, linked audit events, resolve/dismiss/escalate).
- **Disputes** — `AdminDisputesQueue.tsx` with lifecycle filter → `AdminDisputeDetail.tsx` (timeline, reconciliation panel: original payout / refund PI / rebook order, "Run reconciliation" button, escalation log, evidence vault).
- **Evidence Vault** — `AdminEvidenceQueue.tsx` for pending/flagged evidence moderation.
- **Audit Log** — global firehose with filters.

Shared `<UserLink userId>` and `<StoreLink sellerId>` components used everywhere — render current display name + open dossier on click. Always show stable IDs alongside.

`AdminUserDossier` timeline component reused on Reports/Disputes detail pages so context is one click away.

## 5. Integration into existing flows

Add `log_account_event` calls (mostly via triggers, a few explicit):
- `webhook.ts` Stripe handlers → `payment_failed`, `chargeback`, `refund_issued`.
- `order-actions.functions.ts` cancel → `order_cancelled`.
- `DisputeThread.tsx` not-delivered → `not_delivered_claim`.
- `buyer-risk.functions.ts` apply/clear restriction → `restriction_applied/cleared`.
- `stripe-connect.functions.ts` verification sync → `verification_status_changed`.
- `payout_requests` status change trigger → `payout_issue` when failed.
- `profiles` update trigger → `store_name_changed` / `username_changed` + history row.

## Technical notes
- Storage bucket `moderation-evidence` private; signed URLs only via server fn.
- `account_audit_log` is append-only: REVOKE UPDATE/DELETE from authenticated; only service role via security-definer RPC.
- `admin_action_log` similarly locked; provides tamper-evident admin trail.
- Linked-account detection: simple v1 = match on shared `stripe_customer_id`, payment fingerprint, or signup IP (if captured). Surface as "Possibly linked" list — no auto-action.
- Out of scope: ML clustering, automated bans, public-facing user dispute portal redesign (uses existing `DisputeThread`).

## Files
**New migration**, `src/lib/moderation.functions.ts`, `src/components/admin/{AdminUserSearch,AdminUserDossier,AdminReportsQueue,AdminReportDetail,AdminDisputesQueue,AdminDisputeDetail,AdminEvidenceQueue,AdminAuditLog,UserLink,StoreLink,AuditTimeline,EvidenceCard,ReconciliationPanel}.tsx`, edits to `src/routes/admin.tsx`, `src/routes/api/public/stripe/webhook.ts`, `src/lib/order-actions.functions.ts`, `src/lib/buyer-risk.functions.ts`, `src/server/stripe-connect.functions.ts`, `src/components/DisputeThread.tsx`.

Approve to proceed; I'll ship the migration first, then server functions, then admin UI in batches.