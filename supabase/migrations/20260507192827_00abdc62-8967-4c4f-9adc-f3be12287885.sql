ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS a11y_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shop_name_changes INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.shop_name_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  old_name TEXT,
  new_name TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_name_history_user ON public.shop_name_history(user_id);
ALTER TABLE public.shop_name_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_name_hist_owner_read" ON public.shop_name_history;
CREATE POLICY "shop_name_hist_owner_read" ON public.shop_name_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.change_shop_name(_new_name TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _old text;
  _changes int;
  _pending int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _new_name IS NULL OR length(btrim(_new_name)) < 3 OR length(_new_name) > 30 THEN
    RAISE EXCEPTION 'Shop name must be 3-30 characters';
  END IF;
  IF _new_name !~ '^[A-Za-z0-9_ -]+$' THEN
    RAISE EXCEPTION 'Shop name may only contain letters, numbers, spaces, _ and -';
  END IF;

  SELECT shop_name, shop_name_changes INTO _old, _changes
    FROM public.profiles WHERE id = _uid;

  IF _changes >= 1 AND _old IS NOT NULL THEN
    RAISE EXCEPTION 'Shop name can only be changed once';
  END IF;

  SELECT count(*) INTO _pending FROM public.orders
    WHERE seller_id = _uid AND status IN ('pending','shipped','disputed');
  IF _pending > 0 THEN
    RAISE EXCEPTION 'Finish your pending and undelivered orders before renaming your shop';
  END IF;

  INSERT INTO public.shop_name_history (user_id, old_name, new_name)
    VALUES (_uid, _old, _new_name);

  UPDATE public.profiles
    SET shop_name = _new_name,
        shop_name_changes = COALESCE(shop_name_changes, 0) + 1
    WHERE id = _uid;

  RETURN jsonb_build_object('ok', true, 'old', _old, 'new', _new_name);
END;
$$;