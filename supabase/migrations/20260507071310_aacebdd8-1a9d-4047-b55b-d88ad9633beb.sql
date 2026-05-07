
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.order_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  requested_by_role text NOT NULL CHECK (requested_by_role IN ('buyer','seller')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','resolved','escalated')),
  admin_requested boolean NOT NULL DEFAULT false,
  admin_id uuid,
  admin_note text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_cancellations_order ON public.order_cancellations(order_id);
CREATE INDEX idx_order_cancellations_status ON public.order_cancellations(status) WHERE status IN ('pending','escalated');

ALTER TABLE public.order_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_view_cancellations"
  ON public.order_cancellations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_cancellations.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid()))
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'owner'::app_role)
    OR has_role(auth.uid(),'moderator'::app_role)
    OR has_role(auth.uid(),'support'::app_role)
  );

CREATE POLICY "participants_create_cancellation"
  ON public.order_cancellations FOR INSERT
  WITH CHECK (
    auth.uid() = requested_by
    AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_cancellations.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid()))
  );

CREATE POLICY "participants_update_cancellation"
  ON public.order_cancellations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_cancellations.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid()))
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'owner'::app_role)
  );

CREATE TRIGGER trg_update_order_cancellations
  BEFORE UPDATE ON public.order_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
