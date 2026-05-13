REVOKE EXECUTE ON FUNCTION public.reconcile_sold_items() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.reconcile_auction_states() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.reconcile_stale_payments() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_platform_reconciliation() FROM anon, authenticated, public;