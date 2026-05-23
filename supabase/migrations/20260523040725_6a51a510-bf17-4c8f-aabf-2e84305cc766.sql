-- Security fixes batch

-- 1) Dispute evidence bucket: make private and restrict reads to participants/admins
UPDATE storage.buckets SET public = false WHERE id = 'dispute-evidence';

DROP POLICY IF EXISTS "Dispute evidence public read" ON storage.objects;

CREATE POLICY "Dispute evidence read participants"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dispute-evidence' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
    OR auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id::text = (storage.foldername(name))[2]
        AND (d.reporter_id = auth.uid() OR d.reported_user_id = auth.uid())
    )
  )
);

-- 2) Notifications: only allow inserting for own user or admin
DROP POLICY IF EXISTS "Auth users create notifications" ON public.notifications;

CREATE POLICY "Users create own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 3) Live stream credential columns: explicitly revoke client roles (defense in depth).
--    These columns are already nulled by trigger and credentials live in live_stream_credentials.
REVOKE SELECT (cf_live_input_id, cf_rtmps_url, cf_stream_key) ON public.live_streams FROM anon, authenticated;
REVOKE UPDATE (cf_live_input_id, cf_rtmps_url, cf_stream_key) ON public.live_streams FROM anon, authenticated;
REVOKE INSERT (cf_live_input_id, cf_rtmps_url, cf_stream_key) ON public.live_streams FROM anon, authenticated;

-- 4) Security Definer views: switch to security_invoker so caller's RLS applies
ALTER VIEW public.v_seller_available_balance SET (security_invoker = on);
ALTER VIEW public.seller_offer_risk SET (security_invoker = on);

-- 5) Set immutable search_path on user-defined functions missing it
ALTER FUNCTION public.orders_revoke_payout_on_refund() SET search_path = public;
ALTER FUNCTION public.xp_to_level(bigint) SET search_path = public;
ALTER FUNCTION public.account_holds_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.block_balance_audit_mutation() SET search_path = public;
ALTER FUNCTION public.validate_queue_offer() SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public._buyer_signal_weight(text) SET search_path = public;

-- 6) Materialized view should not be exposed via the Data API
REVOKE ALL ON public.mv_seller_shipping_analytics FROM anon, authenticated;