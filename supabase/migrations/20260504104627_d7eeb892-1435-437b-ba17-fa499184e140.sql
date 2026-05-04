-- ===== Spin Wheel =====
CREATE TABLE public.spin_wheels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL UNIQUE,
  seller_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Spin to Win',
  mode text NOT NULL DEFAULT 'remove' CHECK (mode IN ('remove', 'keep')),
  spin_speed text NOT NULL DEFAULT 'normal' CHECK (spin_speed IN ('slow', 'normal', 'fast')),
  viewer_can_spin boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT true,
  -- Live spin state (broadcast via realtime)
  is_spinning boolean NOT NULL DEFAULT false,
  spin_started_at timestamptz,
  spin_ends_at timestamptz,
  spin_target_slot_id uuid,
  spin_seed integer,
  last_winner_username text,
  last_winner_slot_label text,
  last_winner_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wheel_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_id uuid NOT NULL REFERENCES public.spin_wheels(id) ON DELETE CASCADE,
  label text NOT NULL,
  weight integer NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 100),
  color text NOT NULL DEFAULT '#7c3aed',
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wheel_slots_wheel_id_idx ON public.wheel_slots(wheel_id);

CREATE TABLE public.wheel_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_id uuid NOT NULL REFERENCES public.spin_wheels(id) ON DELETE CASCADE,
  stream_id uuid NOT NULL,
  triggered_by_id uuid NOT NULL,
  triggered_by_username text NOT NULL,
  winner_id uuid,
  winner_username text NOT NULL,
  slot_id uuid,
  slot_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wheel_spins_wheel_id_idx ON public.wheel_spins(wheel_id);

-- RLS
ALTER TABLE public.spin_wheels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wheel_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wheel_spins ENABLE ROW LEVEL SECURITY;

-- Wheels: anyone reads; host creates/updates
CREATE POLICY "Wheels viewable by all" ON public.spin_wheels FOR SELECT USING (true);
CREATE POLICY "Host creates wheel" ON public.spin_wheels FOR INSERT
  WITH CHECK (auth.uid() = seller_id AND EXISTS (
    SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid()
  ));
-- Host always updates; viewers may flip is_spinning fields if viewer_can_spin is on
CREATE POLICY "Host updates wheel" ON public.spin_wheels FOR UPDATE
  USING (auth.uid() = seller_id);
CREATE POLICY "Viewer triggers allowed spin" ON public.spin_wheels FOR UPDATE
  USING (auth.uid() IS NOT NULL AND viewer_can_spin = true AND is_open = true AND is_spinning = false);

-- Slots: anyone reads; host writes
CREATE POLICY "Slots viewable by all" ON public.wheel_slots FOR SELECT USING (true);
CREATE POLICY "Host inserts slots" ON public.wheel_slots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.spin_wheels w WHERE w.id = wheel_id AND w.seller_id = auth.uid()
  ));
CREATE POLICY "Host updates slots" ON public.wheel_slots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.spin_wheels w WHERE w.id = wheel_id AND w.seller_id = auth.uid()
  ));
CREATE POLICY "Host deletes slots" ON public.wheel_slots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.spin_wheels w WHERE w.id = wheel_id AND w.seller_id = auth.uid()
  ));

-- Spin history: anyone reads; only host records results
CREATE POLICY "Spins viewable by all" ON public.wheel_spins FOR SELECT USING (true);
CREATE POLICY "Host records spin" ON public.wheel_spins FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.spin_wheels w WHERE w.id = wheel_id AND w.seller_id = auth.uid()
  ));

-- Realtime: broadcast wheel state + slot changes + spin history
ALTER PUBLICATION supabase_realtime ADD TABLE public.spin_wheels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wheel_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wheel_spins;