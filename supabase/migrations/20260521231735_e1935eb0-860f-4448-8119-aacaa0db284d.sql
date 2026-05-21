
-- ============================================================
-- MODERATION & AUDIT HISTORY SYSTEM
-- ============================================================

-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.audit_event_type AS ENUM (
    'payment_failed','payment_declined','chargeback','refund_requested','refund_issued',
    'order_cancelled','not_delivered_claim','report_filed','suspicious_activity','bidding_abuse',
    'warning_issued','restriction_applied','restriction_cleared','ban_applied','shipping_issue',
    'policy_violation','store_name_changed','username_changed','verification_status_changed',
    'payout_issue','admin_note','admin_action','dispute_opened','dispute_status_changed',
    'dispute_escalated','dispute_resolved','evidence_uploaded','evidence_reviewed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_severity AS ENUM ('info','low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('open','investigating','resolved','dismissed','escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_subject_type AS ENUM ('user','store','listing','stream','order','message');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.evidence_status AS ENUM ('pending','approved','rejected','flagged','locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dispute_lifecycle AS ENUM (
    'opened','evidence_pending','under_review','escalated',
    'resolved_refund','resolved_rebook','resolved_partial','rejected','closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- account_audit_log: permanent timeline per user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL,
  actor_user_id uuid,
  actor_role text,
  event_type public.audit_event_type NOT NULL,
  severity public.audit_severity NOT NULL DEFAULT 'info',
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_id uuid,
  stream_id uuid,
  payment_intent_id text,
  dispute_id uuid,
  payout_id uuid,
  report_id uuid,
  evidence_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_subject_occurred ON public.account_audit_log(subject_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON public.account_audit_log(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON public.account_audit_log(severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_dispute ON public.account_audit_log(dispute_id) WHERE dispute_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_order ON public.account_audit_log(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.account_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all audit" ON public.account_audit_log FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator'));
CREATE POLICY "Users read own audit" ON public.account_audit_log FOR SELECT
  USING (auth.uid() = subject_user_id AND severity IN ('info','low','medium'));
-- No INSERT/UPDATE/DELETE policies: only SECURITY DEFINER functions write.

-- ============================================================
-- store_name_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_name_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  old_name text,
  new_name text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_name_history_seller ON public.store_name_history(seller_id, changed_at DESC);
ALTER TABLE public.store_name_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read store names" ON public.store_name_history FOR SELECT USING (true);

-- ============================================================
-- username_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.username_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_username text,
  new_username text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_username_history_user ON public.username_history(user_id, changed_at DESC);
ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read usernames" ON public.username_history FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator'));
CREATE POLICY "Users read own usernames" ON public.username_history FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- moderation_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  subject_user_id uuid,
  subject_type public.report_subject_type NOT NULL,
  subject_ref_id uuid,
  category text NOT NULL,
  description text NOT NULL,
  status public.report_status NOT NULL DEFAULT 'open',
  severity public.audit_severity NOT NULL DEFAULT 'medium',
  assigned_admin_id uuid,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.moderation_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_subject_user ON public.moderation_reports(subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_assigned ON public.moderation_reports(assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage reports" ON public.moderation_reports FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator'));
CREATE POLICY "Users create reports" ON public.moderation_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Reporter views own" ON public.moderation_reports FOR SELECT
  USING (auth.uid() = reporter_id);

CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.moderation_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- ============================================================
-- moderation_evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.moderation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.moderation_reports(id) ON DELETE SET NULL,
  dispute_id uuid REFERENCES public.disputes(id) ON DELETE SET NULL,
  audit_log_id uuid REFERENCES public.account_audit_log(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL,
  file_url text NOT NULL,
  storage_path text,
  mime_type text,
  file_size integer,
  caption text,
  status public.evidence_status NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_report ON public.moderation_evidence(report_id);
CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON public.moderation_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON public.moderation_evidence(status, created_at DESC);
ALTER TABLE public.moderation_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage evidence" ON public.moderation_evidence FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator'));
CREATE POLICY "Uploader views own evidence" ON public.moderation_evidence FOR SELECT
  USING (auth.uid() = uploaded_by);
CREATE POLICY "Uploader inserts evidence" ON public.moderation_evidence FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

-- ============================================================
-- evidence_review_log (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evidence_review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.moderation_evidence(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  from_status public.evidence_status,
  to_status public.evidence_status NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_review_evidence ON public.evidence_review_log(evidence_id, created_at DESC);
ALTER TABLE public.evidence_review_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read evidence log" ON public.evidence_review_log FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator'));

-- ============================================================
-- dispute_reconciliation: extends disputes
-- ============================================================
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS lifecycle_status public.dispute_lifecycle NOT NULL DEFAULT 'opened',
  ADD COLUMN IF NOT EXISTS rebook_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_payout_id uuid,
  ADD COLUMN IF NOT EXISTS refund_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_notes text,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_by uuid;

CREATE INDEX IF NOT EXISTS idx_disputes_lifecycle ON public.disputes(lifecycle_status, created_at DESC);

-- ============================================================
-- admin_action_log: tamper-evident admin trail
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_table text,
  target_id uuid,
  subject_user_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_action_admin ON public.admin_action_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_subject ON public.admin_action_log(subject_user_id, created_at DESC) WHERE subject_user_id IS NOT NULL;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read action log" ON public.admin_action_log FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));

-- ============================================================
-- log_account_event RPC (single insertion path)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_account_event(
  _subject_user_id uuid,
  _event_type public.audit_event_type,
  _summary text,
  _severity public.audit_severity DEFAULT 'info',
  _details jsonb DEFAULT '{}'::jsonb,
  _actor_user_id uuid DEFAULT NULL,
  _order_id uuid DEFAULT NULL,
  _stream_id uuid DEFAULT NULL,
  _payment_intent_id text DEFAULT NULL,
  _dispute_id uuid DEFAULT NULL,
  _payout_id uuid DEFAULT NULL,
  _report_id uuid DEFAULT NULL,
  _evidence_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
  actor_role_val text;
BEGIN
  IF _actor_user_id IS NOT NULL THEN
    SELECT role::text INTO actor_role_val FROM public.user_roles
      WHERE user_id = _actor_user_id ORDER BY role LIMIT 1;
  END IF;
  INSERT INTO public.account_audit_log(
    subject_user_id, actor_user_id, actor_role, event_type, severity, summary, details,
    order_id, stream_id, payment_intent_id, dispute_id, payout_id, report_id, evidence_id
  ) VALUES (
    _subject_user_id, _actor_user_id, actor_role_val, _event_type, _severity, _summary, _details,
    _order_id, _stream_id, _payment_intent_id, _dispute_id, _payout_id, _report_id, _evidence_id
  ) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- ============================================================
-- log_admin_action RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _target_table text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _subject_user_id uuid DEFAULT NULL,
  _before jsonb DEFAULT NULL,
  _after jsonb DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR NOT (
    has_role(caller,'admin') OR has_role(caller,'owner') OR has_role(caller,'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.admin_action_log(
    admin_id, action, target_table, target_id, subject_user_id, before_state, after_state, reason
  ) VALUES (caller, _action, _target_table, _target_id, _subject_user_id, _before, _after, _reason)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- profiles: track shop_name and username changes
CREATE OR REPLACE FUNCTION public.track_profile_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.shop_name IS DISTINCT FROM OLD.shop_name THEN
    INSERT INTO public.store_name_history(seller_id, old_name, new_name, changed_by)
      VALUES (NEW.id, OLD.shop_name, NEW.shop_name, auth.uid());
    PERFORM public.log_account_event(
      NEW.id, 'store_name_changed',
      COALESCE('Store renamed from "' || OLD.shop_name || '" to "' || NEW.shop_name || '"',
               'Store name set to "' || COALESCE(NEW.shop_name,'') || '"'),
      'medium',
      jsonb_build_object('old', OLD.shop_name, 'new', NEW.shop_name),
      auth.uid()
    );
  END IF;
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    INSERT INTO public.username_history(user_id, old_username, new_username)
      VALUES (NEW.id, OLD.username, NEW.username);
    PERFORM public.log_account_event(
      NEW.id, 'username_changed',
      'Username changed from @' || OLD.username || ' to @' || NEW.username,
      'medium',
      jsonb_build_object('old', OLD.username, 'new', NEW.username),
      auth.uid()
    );
  END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    PERFORM public.log_account_event(
      NEW.id, 'verification_status_changed',
      'Verification: ' || OLD.verification_status || ' → ' || NEW.verification_status,
      'medium',
      jsonb_build_object('old', OLD.verification_status, 'new', NEW.verification_status),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_audit ON public.profiles;
CREATE TRIGGER trg_profiles_audit AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.track_profile_history();

-- disputes: log open + status changes
CREATE OR REPLACE FUNCTION public.track_dispute_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_account_event(
      COALESCE(NEW.reported_user_id, NEW.reporter_id),
      'dispute_opened',
      'Dispute opened: ' || NEW.reason,
      'high',
      jsonb_build_object('reason', NEW.reason, 'status', NEW.status),
      NEW.reporter_id,
      NEW.order_id, NEW.stream_id, NULL, NEW.id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
      PERFORM public.log_account_event(
        COALESCE(NEW.reported_user_id, NEW.reporter_id),
        CASE
          WHEN NEW.lifecycle_status IN ('resolved_refund','resolved_rebook','resolved_partial') THEN 'dispute_resolved'
          WHEN NEW.lifecycle_status = 'escalated' THEN 'dispute_escalated'
          ELSE 'dispute_status_changed'
        END,
        'Dispute lifecycle: ' || OLD.lifecycle_status || ' → ' || NEW.lifecycle_status,
        CASE WHEN NEW.lifecycle_status = 'escalated' THEN 'high' ELSE 'medium' END,
        jsonb_build_object('old', OLD.lifecycle_status, 'new', NEW.lifecycle_status),
        auth.uid(), NEW.order_id, NEW.stream_id, NULL, NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_disputes_audit ON public.disputes;
CREATE TRIGGER trg_disputes_audit AFTER INSERT OR UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.track_dispute_audit();

-- orders: log cancellation
CREATE OR REPLACE FUNCTION public.track_order_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM public.log_account_event(
      NEW.buyer_id, 'order_cancelled',
      'Order ' || NEW.title || ' cancelled', 'low',
      jsonb_build_object('order_id', NEW.id, 'amount', NEW.amount),
      auth.uid(), NEW.id
    );
    PERFORM public.log_account_event(
      NEW.seller_id, 'order_cancelled',
      'Sold order ' || NEW.title || ' cancelled', 'low',
      jsonb_build_object('order_id', NEW.id, 'amount', NEW.amount),
      auth.uid(), NEW.id
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_cancel_audit ON public.orders;
CREATE TRIGGER trg_orders_cancel_audit AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.track_order_cancellation();

-- payout failures
CREATE OR REPLACE FUNCTION public.track_payout_failure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'failed' AND OLD.status::text IS DISTINCT FROM 'failed' THEN
    PERFORM public.log_account_event(
      NEW.user_id, 'payout_issue',
      'Payout failed: ' || COALESCE(NEW.failure_reason,'unknown'), 'high',
      jsonb_build_object('amount_cents', NEW.amount_cents, 'reason', NEW.failure_reason),
      NULL, NULL, NULL, NULL, NULL, NEW.id
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payouts_audit ON public.payout_requests;
CREATE TRIGGER trg_payouts_audit AFTER UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.track_payout_failure();

-- evidence review log
CREATE OR REPLACE FUNCTION public.track_evidence_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.evidence_review_log(evidence_id, reviewer_id, from_status, to_status, notes)
      VALUES (NEW.id, COALESCE(NEW.reviewed_by, auth.uid()), OLD.status, NEW.status, NEW.review_notes);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_evidence_review_audit ON public.moderation_evidence;
CREATE TRIGGER trg_evidence_review_audit AFTER UPDATE ON public.moderation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.track_evidence_review();

-- ============================================================
-- STORAGE BUCKET for evidence (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('moderation-evidence', 'moderation-evidence', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read evidence files" ON storage.objects FOR SELECT
  USING (bucket_id = 'moderation-evidence' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator')
  ));
CREATE POLICY "Auth users upload evidence" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'moderation-evidence' AND auth.uid() IS NOT NULL);

-- ============================================================
-- Allow new dispute notification types
-- ============================================================
CREATE OR REPLACE FUNCTION public.notifications_validate_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
  allowed_types text[] := ARRAY[
    'won','sale','order','payment','payment_failed','payment_pending',
    'follow','like','comment','mention','reply','dm','message',
    'collab_invite','collab_join','collab_request','collab_accepted',
    'giveaway','giveaway_win','tip','shoutout','ko_request','ko_accepted',
    'verification','verification_request','seller_agreement_reaccept','dispute','dispute_update',
    'dispute_opened','dispute_evidence_submitted','dispute_status_changed','dispute_escalated','dispute_resolved',
    'report_filed','report_resolved','admin_warning_issued','admin_note',
    'shipping','shipped','delivered','listing','listing_sold','offer',
    'system','announcement','warning','support',
    'seller_live','order_packed','order_ready_for_dropoff','order_shipped','order_delivered','order_cancelled'
  ];
BEGIN
  NEW.sender_id := auth.uid();
  IF NEW.body IS NULL OR length(NEW.body) = 0 OR length(NEW.body) > 500 THEN
    RAISE EXCEPTION 'Notification body must be 1..500 chars';
  END IF;
  IF NEW.type IS NULL OR length(NEW.type) > 32 THEN
    RAISE EXCEPTION 'Invalid notification type';
  END IF;
  IF NOT (NEW.type = ANY(allowed_types)) THEN
    RAISE EXCEPTION 'Notification type % is not allowed', NEW.type;
  END IF;
  IF NEW.link IS NOT NULL THEN
    IF length(NEW.link) > 200 THEN
      RAISE EXCEPTION 'Notification link too long';
    END IF;
    IF left(NEW.link, 1) <> '/' THEN
      RAISE EXCEPTION 'Notification link must be an internal path starting with /';
    END IF;
  END IF;
  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO recent_count
  FROM public.notifications
  WHERE sender_id = auth.uid()
    AND user_id <> auth.uid()
    AND created_at > now() - interval '1 hour';
  IF recent_count >= 60 THEN
    RAISE EXCEPTION 'Notification rate limit exceeded';
  END IF;
  RETURN NEW;
END $$;
