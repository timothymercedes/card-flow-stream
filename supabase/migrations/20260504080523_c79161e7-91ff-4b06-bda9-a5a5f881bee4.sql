
-- 1. Visibility column
ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

-- 2. Visibility helper (mirrors story visibility)
CREATE OR REPLACE FUNCTION public.can_view_vault(_owner uuid, _visibility text, _viewer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN _viewer = _owner THEN true
      WHEN _visibility = 'public' THEN true
      WHEN _visibility = 'followers' THEN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _viewer AND followee_id = _owner)
      WHEN _visibility = 'friends' THEN EXISTS (SELECT 1 FROM public.story_close_friends WHERE owner_id = _owner AND friend_id = _viewer)
      ELSE false
    END
$$;

-- 3. Replace SELECT policy
DROP POLICY IF EXISTS "Users view own vault" ON public.vault_cards;
CREATE POLICY "Vault visible per privacy"
ON public.vault_cards FOR SELECT
USING (public.can_view_vault(user_id, visibility, auth.uid()));

-- 4. Storage bucket for vault images
INSERT INTO storage.buckets (id, name, public)
VALUES ('vault-images', 'vault-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Vault images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'vault-images');

CREATE POLICY "Users upload own vault images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vault-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own vault images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vault-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own vault images"
ON storage.objects FOR DELETE
USING (bucket_id = 'vault-images' AND auth.uid()::text = (storage.foldername(name))[1]);
