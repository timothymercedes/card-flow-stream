DROP POLICY "Vault per-card privacy restriction" ON public.vault_cards;
CREATE POLICY "Vault per-card privacy restriction" ON public.vault_cards AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(user_id=auth.uid() OR public.social_vault_card_visible(id));
DROP POLICY "Posts respect audience and moderation" ON public.posts;
CREATE POLICY "Posts respect audience and moderation" ON public.posts FOR SELECT TO anon,authenticated USING(user_id=auth.uid() OR public.social_post_visible(id));
COMMENT ON POLICY "Vault per-card privacy restriction" ON public.vault_cards IS 'DRAFT ONLY: direct owner guard preserves INSERT RETURNING before helper snapshot sees new row.';