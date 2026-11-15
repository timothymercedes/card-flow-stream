REVOKE INSERT, UPDATE, DELETE ON public.arena_user_cosmetics FROM anon, authenticated;
GRANT UPDATE (equipped) ON public.arena_user_cosmetics TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sweep_inactive_streams() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_inactive_streams() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.clear_hold_admin(_hold_id uuid, _override boolean DEFAULT false, _notes text DEFAULT NULL::text)
 RETURNS public.account_holds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hold public.account_holds;
  v_caller uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_role(v_caller, 'admin') OR
    public.has_role(v_caller, 'owner') OR
    public.has_role(v_caller, 'moderator') OR
    public.has_role(v_caller, 'support')
  ) THEN RAISE EXCEPTION 'Only staff can clear holds'; END IF;

  IF EXISTS (SELECT 1 FROM public.account_holds WHERE id = _hold_id AND user_id = v_caller) THEN
    RAISE EXCEPTION 'Staff cannot clear their own holds';
  END IF;

  UPDATE public.account_holds
  SET status = CASE WHEN _override THEN 'admin_override'::public.hold_status ELSE 'cleared'::public.hold_status END,
      cleared_at = now(),
      cleared_by = v_caller,
      notes = COALESCE(notes || E'\n', '') || COALESCE(_notes, '')
  WHERE id = _hold_id AND user_id <> v_caller
  RETURNING * INTO v_hold;

  IF v_hold.id IS NULL THEN RAISE EXCEPTION 'Hold not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.account_holds WHERE user_id = v_hold.user_id AND status = 'active') THEN
    UPDATE public.profiles SET payout_hold = false WHERE id = v_hold.user_id;
  END IF;

  RETURN v_hold;
END;
$function$;