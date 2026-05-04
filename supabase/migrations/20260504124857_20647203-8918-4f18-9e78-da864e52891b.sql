-- Legal document acceptances
CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_type text NOT NULL, -- 'tos' | 'privacy' | 'buyer_terms' | 'seller_agreement'
  version text NOT NULL DEFAULT '1.0',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  UNIQUE (user_id, document_type, version)
);
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own acceptances" ON public.legal_acceptances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users record own acceptances" ON public.legal_acceptances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all acceptances" ON public.legal_acceptances FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Disputes table
CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  stream_id uuid,
  reporter_id uuid NOT NULL,
  reporter_username text NOT NULL,
  reported_user_id uuid,
  reason text NOT NULL, -- 'not_received' | 'not_as_described' | 'fake' | 'fraud' | 'chargeback' | 'other'
  description text NOT NULL,
  evidence_urls text[],
  status text NOT NULL DEFAULT 'open', -- 'open' | 'investigating' | 'resolved' | 'rejected'
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reporter views own disputes" ON public.disputes FOR SELECT USING (auth.uid() = reporter_id OR auth.uid() = reported_user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Auth users file disputes" ON public.disputes FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins update disputes" ON public.disputes FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role));

-- User suspensions / bans
CREATE TABLE public.user_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text NOT NULL,
  type text NOT NULL DEFAULT 'suspension', -- 'suspension' | 'ban'
  reason text NOT NULL,
  by_admin_id uuid NOT NULL,
  expires_at timestamptz, -- NULL for permanent ban
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User views own suspension" ON public.user_suspensions FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins create suspensions" ON public.user_suspensions FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update suspensions" ON public.user_suspensions FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Helper function to check active suspension
CREATE OR REPLACE FUNCTION public.is_user_suspended(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_suspensions
    WHERE user_id = _user_id AND active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Audit log for transactions/bids/messages (lightweight summary table)
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- 'bid' | 'order' | 'message' | 'auction_won' | 'admin_action'
  actor_id uuid,
  actor_username text,
  target_id uuid,
  stream_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users insert audit" ON public.audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins view audit" ON public.audit_log FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users view own audit" ON public.audit_log FOR SELECT USING (auth.uid() = actor_id);

CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_stream ON public.audit_log(stream_id, created_at DESC);
CREATE INDEX idx_disputes_status ON public.disputes(status, created_at DESC);
CREATE INDEX idx_suspensions_user ON public.user_suspensions(user_id) WHERE active = true;