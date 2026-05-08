-- Performance metrics
CREATE TABLE public.perf_metrics (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  route TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INT,
  duration_ms INT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'server_fn', -- server_fn | server_route | client_nav | db_query | external_api | ws | bid | chat | upload | stripe | shipping
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_perf_metrics_created ON public.perf_metrics (created_at DESC);
CREATE INDEX idx_perf_metrics_route ON public.perf_metrics (route, created_at DESC);
CREATE INDEX idx_perf_metrics_kind ON public.perf_metrics (kind, created_at DESC);
CREATE INDEX idx_perf_metrics_slow ON public.perf_metrics (duration_ms DESC, created_at DESC);

ALTER TABLE public.perf_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/owners view all perf metrics"
ON public.perf_metrics FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "Authenticated users insert their perf metrics"
ON public.perf_metrics FOR INSERT TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Error logs
CREATE TABLE public.error_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  severity TEXT NOT NULL DEFAULT 'error', -- info | warning | error | critical
  source TEXT NOT NULL DEFAULT 'client', -- client | server_fn | server_route | edge | db | unknown
  route TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_error_logs_created ON public.error_logs (created_at DESC);
CREATE INDEX idx_error_logs_severity ON public.error_logs (severity, created_at DESC);
CREATE INDEX idx_error_logs_source ON public.error_logs (source, created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/owners view all error logs"
ON public.error_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "Authenticated users insert error logs"
ON public.error_logs FOR INSERT TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Validation triggers (size + rate limit)
CREATE OR REPLACE FUNCTION public.perf_metrics_validate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _recent int;
BEGIN
  IF length(NEW.route) > 200 THEN NEW.route := left(NEW.route,200); END IF;
  IF length(NEW.method) > 10 THEN NEW.method := left(NEW.method,10); END IF;
  IF length(NEW.kind) > 32 THEN NEW.kind := left(NEW.kind,32); END IF;
  IF NEW.duration_ms < 0 THEN NEW.duration_ms := 0; END IF;
  IF NEW.duration_ms > 600000 THEN NEW.duration_ms := 600000; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT count(*) INTO _recent FROM public.perf_metrics
      WHERE user_id = auth.uid() AND created_at > now() - interval '1 minute';
    IF _recent >= 600 THEN RAISE EXCEPTION 'perf_metrics rate limit'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER perf_metrics_validate_trg BEFORE INSERT ON public.perf_metrics
FOR EACH ROW EXECUTE FUNCTION public.perf_metrics_validate();

CREATE OR REPLACE FUNCTION public.error_logs_validate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _recent int;
BEGIN
  IF NEW.message IS NULL OR length(NEW.message)=0 THEN RAISE EXCEPTION 'message required'; END IF;
  IF length(NEW.message) > 2000 THEN NEW.message := left(NEW.message,2000); END IF;
  IF NEW.stack IS NOT NULL AND length(NEW.stack) > 8000 THEN NEW.stack := left(NEW.stack,8000); END IF;
  IF NEW.severity NOT IN ('info','warning','error','critical') THEN NEW.severity := 'error'; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT count(*) INTO _recent FROM public.error_logs
      WHERE user_id = auth.uid() AND created_at > now() - interval '1 minute';
    IF _recent >= 120 THEN RAISE EXCEPTION 'error_logs rate limit'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER error_logs_validate_trg BEFORE INSERT ON public.error_logs
FOR EACH ROW EXECUTE FUNCTION public.error_logs_validate();

-- Alerts config
CREATE TABLE public.perf_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  kind TEXT NOT NULL, -- slow_request | error_rate | error_count | failed_request
  threshold_ms INT,
  threshold_count INT,
  threshold_pct NUMERIC,
  window_minutes INT NOT NULL DEFAULT 5,
  notes TEXT
);
ALTER TABLE public.perf_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/owners manage alerts"
ON public.perf_alerts FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TRIGGER perf_alerts_updated BEFORE UPDATE ON public.perf_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Alert events
CREATE TABLE public.perf_alert_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_id UUID REFERENCES public.perf_alerts(id) ON DELETE SET NULL,
  alert_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  measured_value NUMERIC,
  threshold NUMERIC,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_alert_events_created ON public.perf_alert_events (created_at DESC);
ALTER TABLE public.perf_alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/owners view alert events"
ON public.perf_alert_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- Summary function
CREATE OR REPLACE FUNCTION public.perf_summary(_minutes INT DEFAULT 60)
RETURNS TABLE(
  kind TEXT,
  request_count BIGINT,
  error_count BIGINT,
  p50_ms NUMERIC,
  p95_ms NUMERIC,
  p99_ms NUMERIC,
  max_ms INT,
  avg_ms NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.kind,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status_code >= 500 OR m.status_code = 0)::bigint,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY m.duration_ms),
    percentile_cont(0.95) WITHIN GROUP (ORDER BY m.duration_ms),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY m.duration_ms),
    max(m.duration_ms),
    round(avg(m.duration_ms)::numeric, 2)
  FROM public.perf_metrics m
  WHERE m.created_at > now() - make_interval(mins => GREATEST(1, LEAST(_minutes, 1440)))
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  GROUP BY m.kind
  ORDER BY count(*) DESC;
$$;

-- Top slow routes
CREATE OR REPLACE FUNCTION public.perf_slow_routes(_minutes INT DEFAULT 60, _limit INT DEFAULT 20)
RETURNS TABLE(route TEXT, kind TEXT, hits BIGINT, p95_ms NUMERIC, max_ms INT, avg_ms NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.route, m.kind, count(*),
         percentile_cont(0.95) WITHIN GROUP (ORDER BY m.duration_ms),
         max(m.duration_ms),
         round(avg(m.duration_ms)::numeric,2)
  FROM public.perf_metrics m
  WHERE m.created_at > now() - make_interval(mins => GREATEST(1, LEAST(_minutes, 1440)))
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  GROUP BY m.route, m.kind
  ORDER BY percentile_cont(0.95) WITHIN GROUP (ORDER BY m.duration_ms) DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

-- Purge function
CREATE OR REPLACE FUNCTION public.purge_old_perf_data()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INT;
BEGIN
  DELETE FROM public.perf_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  DELETE FROM public.error_logs WHERE created_at < now() - interval '30 days';
  DELETE FROM public.perf_alert_events WHERE created_at < now() - interval '30 days';
  RETURN _n;
END; $$;

-- Seed default alerts
INSERT INTO public.perf_alerts (name, kind, threshold_ms, window_minutes, notes) VALUES
  ('Slow server response (>1s)', 'slow_request', 1000, 5, 'Any server fn / route p95 > 1000ms'),
  ('Very slow request (>3s)', 'slow_request', 3000, 5, 'Critical latency threshold'),
  ('High error count', 'error_count', NULL, 5, 'Triggers when >20 errors in 5 min');
UPDATE public.perf_alerts SET threshold_count = 20 WHERE kind = 'error_count';
INSERT INTO public.perf_alerts (name, kind, threshold_pct, window_minutes, notes)
VALUES ('Error rate >5%', 'error_rate', 5.0, 5, 'Server error rate exceeds 5%');