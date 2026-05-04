ALTER TABLE public.spin_wheels
  ADD COLUMN IF NOT EXISTS pending_decision_slot_id uuid,
  ADD COLUMN IF NOT EXISTS pending_decision_slot_label text,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;