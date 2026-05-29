-- Fix: OVERPERMISSIVE_UPDATE_POLICY on live_streams
-- Bids are placed exclusively through the SECURITY DEFINER RPC public.place_live_bid,
-- which bypasses RLS. The broad "Bidders update bid fields" UPDATE policy let any
-- authenticated non-seller submit a direct UPDATE to the row. Even though a trigger
-- (live_streams_restrict_bidder_update) resets non-bid columns, the policy itself is an
-- unnecessary attack surface. Removing it eliminates all client-side direct writes by
-- bidders; legitimate bidding continues to work via the place_live_bid RPC, and sellers
-- retain their own seller-scoped UPDATE policy.
DROP POLICY IF EXISTS "Bidders update bid fields" ON public.live_streams;