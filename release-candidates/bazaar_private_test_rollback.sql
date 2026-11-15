-- ROLLBACK for 0026_bazaar_private_test_status. NOT applied. Run only with explicit approval.
-- Preserves all orders and products: private_test rows are returned to draft (not deleted).
BEGIN;
UPDATE public.bazaar_products SET status = 'draft' WHERE status = 'private_test';
UPDATE public.bazaar_stores SET status = 'draft' WHERE status = 'private_test';
ALTER TABLE public.bazaar_stores DROP CONSTRAINT bazaar_stores_status_check;
ALTER TABLE public.bazaar_stores ADD CONSTRAINT bazaar_stores_status_check
  CHECK (status IN ('draft','pending_review','active','rejected','suspended','closed'));
ALTER TABLE public.bazaar_products DROP CONSTRAINT bazaar_products_status_check;
ALTER TABLE public.bazaar_products ADD CONSTRAINT bazaar_products_status_check
  CHECK (status IN ('draft','in_review','published','paused','archived'));
-- Then re-run the bazaar_reserve_order_inventory definition from
-- drizzle/migrations/0025_bazaar_retail_checkout_v8.sql (lines 161-218) verbatim.
COMMIT;
