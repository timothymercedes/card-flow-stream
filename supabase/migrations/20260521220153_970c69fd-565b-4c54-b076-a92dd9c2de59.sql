
-- 1) Messages column on disputes
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Security-definer helper to append a message (reporter, reported, or admin)
CREATE OR REPLACE FUNCTION public.append_dispute_message(
  _dispute_id uuid,
  _body text,
  _username text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
  is_admin boolean;
  role_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _body IS NULL OR length(btrim(_body)) = 0 THEN
    RAISE EXCEPTION 'Message body required';
  END IF;
  IF length(_body) > 2000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_role(auth.uid(), 'owner'::app_role);

  IF NOT (is_admin OR auth.uid() = d.reporter_id OR auth.uid() = d.reported_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF is_admin THEN role_label := 'admin';
  ELSIF auth.uid() = d.reporter_id THEN role_label := 'reporter';
  ELSE role_label := 'reported';
  END IF;

  UPDATE public.disputes
  SET messages = COALESCE(messages, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'user_id', auth.uid(),
          'username', COALESCE(_username, 'user'),
          'role', role_label,
          'body', btrim(_body),
          'at', now()
        )
      ),
      updated_at = now()
  WHERE id = _dispute_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_dispute_message(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.append_dispute_message(uuid, text, text) TO authenticated;

-- 3) Storage bucket for dispute evidence (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispute-evidence', 'dispute-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Policies: authenticated users can upload to their own folder; anyone can read.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Dispute evidence public read'
  ) THEN
    CREATE POLICY "Dispute evidence public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'dispute-evidence');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Dispute evidence upload own'
  ) THEN
    CREATE POLICY "Dispute evidence upload own"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'dispute-evidence'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
