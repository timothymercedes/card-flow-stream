CREATE TABLE public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('bug','idea','praise','other')),
  message text NOT NULL CHECK (length(message) BETWEEN 3 AND 4000),
  page_path text,
  user_agent text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','in_progress','resolved','wontfix')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_beta_feedback_user ON public.beta_feedback(user_id, created_at DESC);
CREATE INDEX idx_beta_feedback_status ON public.beta_feedback(status, created_at DESC);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

-- Users can submit and view their own feedback
CREATE POLICY "Users insert their own feedback"
ON public.beta_feedback FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their own feedback"
ON public.beta_feedback FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admins manage all feedback
CREATE POLICY "Admins view all feedback"
ON public.beta_feedback FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update feedback"
ON public.beta_feedback FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));