CREATE TABLE public.auction_ending_alerts (
  listing_id uuid NOT NULL,
  user_id uuid NOT NULL,
  alert_window text NOT NULL CHECK (alert_window IN ('1h','10m')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, user_id, alert_window)
);
GRANT ALL ON public.auction_ending_alerts TO service_role;
ALTER TABLE public.auction_ending_alerts ENABLE ROW LEVEL SECURITY;