CREATE TABLE public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  user_id uuid,
  origin text NOT NULL,
  rp_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);
GRANT ALL ON public.webauthn_challenges TO service_role;
REVOKE ALL ON public.webauthn_challenges FROM anon, authenticated;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX webauthn_challenges_expiry_idx ON public.webauthn_challenges (expires_at);
COMMENT ON TABLE public.webauthn_challenges IS 'Server-only, single-use WebAuthn challenges; no browser access.';