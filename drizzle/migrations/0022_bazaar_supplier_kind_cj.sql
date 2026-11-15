ALTER TABLE public.bazaar_suppliers DROP CONSTRAINT bazaar_suppliers_kind_check;
ALTER TABLE public.bazaar_suppliers ADD CONSTRAINT bazaar_suppliers_kind_check
  CHECK (kind = ANY (ARRAY['aliexpress','wish','temu','shein','manual','demo','other','cj']::text[]));