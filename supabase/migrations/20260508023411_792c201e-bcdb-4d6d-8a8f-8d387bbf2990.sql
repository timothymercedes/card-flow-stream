CREATE TABLE IF NOT EXISTS public.beta_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  role text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_access_requests_email_idx ON public.beta_access_requests (email);
CREATE INDEX IF NOT EXISTS beta_access_requests_status_idx ON public.beta_access_requests (status);

ALTER TABLE public.beta_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can request beta access"
ON public.beta_access_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "admins view beta requests"
ON public.beta_access_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "admins manage beta requests"
ON public.beta_access_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "admins delete beta requests"
ON public.beta_access_requests FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));