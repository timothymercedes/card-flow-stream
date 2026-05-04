-- Vault-level visibility settings (replaces per-card visibility for sharing the whole vault)
CREATE TABLE IF NOT EXISTS public.vault_settings (
  user_id uuid PRIMARY KEY,
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vault settings viewable by all"
  ON public.vault_settings FOR SELECT USING (true);

CREATE POLICY "Owners insert own vault settings"
  ON public.vault_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners update own vault settings"
  ON public.vault_settings FOR UPDATE USING (auth.uid() = user_id);

-- New helper: visibility based on the OWNER's vault_settings (not per-card)
CREATE OR REPLACE FUNCTION public.can_view_vault_owner(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _viewer = _owner THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.vault_settings vs
      WHERE vs.user_id = _owner AND (
        vs.visibility = 'public'
        OR (vs.visibility = 'followers' AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _viewer AND followee_id = _owner))
        OR (vs.visibility = 'friends'   AND EXISTS (SELECT 1 FROM public.story_close_friends WHERE owner_id = _owner AND friend_id = _viewer))
      )
    )
  END
$$;

-- Replace the vault_cards SELECT policy to use vault-level visibility
DROP POLICY IF EXISTS "Vault visible per privacy" ON public.vault_cards;
CREATE POLICY "Vault visible per owner setting"
  ON public.vault_cards FOR SELECT
  USING (public.can_view_vault_owner(user_id, auth.uid()));