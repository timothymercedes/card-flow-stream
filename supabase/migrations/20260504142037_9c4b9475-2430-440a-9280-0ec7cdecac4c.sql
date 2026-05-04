
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || fn.sig || ' FROM PUBLIC, anon, authenticated';
  END LOOP;
END$$;

-- Re-grant the one RPC clients legitimately need
GRANT EXECUTE ON FUNCTION public.get_winner_shipping(uuid, uuid) TO authenticated;
