REVOKE ALL ON FUNCTION public.claim_break_slots(uuid, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_break_slots(uuid, integer[]) TO authenticated;