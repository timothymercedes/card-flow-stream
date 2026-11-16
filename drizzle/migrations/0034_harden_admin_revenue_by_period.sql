CREATE OR REPLACE FUNCTION public.admin_revenue_by_period(_bucket text, _since timestamptz DEFAULT NULL, _until timestamptz DEFAULT NULL)
RETURNS TABLE(bucket_start timestamptz, gross_cents bigint, losses_cents bigint, net_cents bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_owner();
  IF _bucket NOT IN ('day','week','month','year') THEN
    RAISE EXCEPTION 'invalid bucket';
  END IF;
  RETURN QUERY
    SELECT date_trunc(_bucket, pr.created_at),
           COALESCE(SUM(CASE WHEN pr.amount_cents >= 0 THEN pr.amount_cents ELSE 0 END),0)::bigint,
           COALESCE(SUM(CASE WHEN pr.amount_cents < 0 THEN pr.amount_cents ELSE 0 END),0)::bigint,
           COALESCE(SUM(pr.amount_cents),0)::bigint
    FROM public.platform_revenue pr
    WHERE (_since IS NULL OR pr.created_at >= _since)
      AND (_until IS NULL OR pr.created_at < _until)
    GROUP BY 1 ORDER BY 1 ASC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_by_period(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_period(text, timestamptz, timestamptz) TO authenticated, service_role;