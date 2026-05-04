
-- Posts: allow owner update
CREATE POLICY "Owners update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);

-- Post edit history
CREATE TABLE public.post_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  prev_caption text,
  prev_image_url text,
  action text NOT NULL DEFAULT 'edit',
  edited_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.post_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Edit history viewable by all" ON public.post_edits FOR SELECT USING (true);
CREATE POLICY "Owners log edits" ON public.post_edits FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Vault: last valued timestamp for daily updates
ALTER TABLE public.vault_cards ADD COLUMN IF NOT EXISTS last_valued_at timestamptz;
