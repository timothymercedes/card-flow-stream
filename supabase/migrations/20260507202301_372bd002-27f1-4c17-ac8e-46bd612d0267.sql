
-- Audit logs (admin actions, security events)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_username text,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs (target_type, target_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Tamper protection: rows are append-only. No UPDATE or DELETE for anyone except service role.
DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- No insert/update/delete policies for client roles → only SECURITY DEFINER function can write.

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb,
  _ip_hash text DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _username text;
  _id uuid;
BEGIN
  IF _action IS NULL OR length(btrim(_action)) = 0 OR length(_action) > 64 THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;
  IF _uid IS NOT NULL THEN
    SELECT username INTO _username FROM public.profiles WHERE id = _uid;
  END IF;
  INSERT INTO public.audit_logs (actor_id, actor_username, action, target_type, target_id, meta, ip_hash, user_agent)
  VALUES (_uid, _username, _action, _target_type, _target_id, COALESCE(_meta, '{}'::jsonb), _ip_hash, LEFT(_user_agent, 300))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(_limit int DEFAULT 100, _action_filter text DEFAULT NULL)
RETURNS TABLE(
  id uuid, actor_id uuid, actor_username text, action text,
  target_type text, target_id uuid, meta jsonb,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, actor_id, actor_username, action, target_type, target_id, meta, created_at
  FROM public.audit_logs
  WHERE (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
    AND (_action_filter IS NULL OR action = _action_filter)
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;
