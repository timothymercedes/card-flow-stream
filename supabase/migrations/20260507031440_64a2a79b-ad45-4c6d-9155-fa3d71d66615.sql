DROP POLICY IF EXISTS "Auth users insert audit" ON public.audit_log;

CREATE POLICY "Users insert own audit entries"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = actor_id);