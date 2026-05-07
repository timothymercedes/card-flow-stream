-- 1) Lock down user_roles direct writes. Roles can only be changed via
--    admin_assign_role / admin_remove_role (SECURITY DEFINER), which run as
--    postgres and bypass RLS.
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

-- (SELECT policies remain: "Users view own roles", "Privileged view all roles")
-- No INSERT/UPDATE/DELETE policies = no direct writes from clients.

-- 2) Reports — owner + moderator can also update
DROP POLICY IF EXISTS "Admins update reports" ON public.user_reports;
CREATE POLICY "Staff update reports"
ON public.user_reports
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'moderator')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'moderator')
);

DROP POLICY IF EXISTS "Reporter views own reports" ON public.user_reports;
CREATE POLICY "Reporter and staff view reports"
ON public.user_reports
FOR SELECT
TO authenticated
USING (
  auth.uid() = reporter_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'moderator')
);

-- 3) Suspensions — owner can also create/update
DROP POLICY IF EXISTS "Admins create suspensions" ON public.user_suspensions;
CREATE POLICY "Privileged create suspensions"
ON public.user_suspensions
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
);

DROP POLICY IF EXISTS "Admins update suspensions" ON public.user_suspensions;
CREATE POLICY "Privileged update suspensions"
ON public.user_suspensions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
);
