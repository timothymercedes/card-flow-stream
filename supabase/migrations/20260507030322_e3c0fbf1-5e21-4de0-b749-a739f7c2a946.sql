
CREATE TABLE IF NOT EXISTS public.live_stream_credentials (
  stream_id uuid PRIMARY KEY REFERENCES public.live_streams(id) ON DELETE CASCADE,
  cf_live_input_id text,
  cf_rtmps_url text,
  cf_stream_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_stream_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own stream credentials"
  ON public.live_stream_credentials FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid()));

CREATE POLICY "Owner inserts own stream credentials"
  ON public.live_stream_credentials FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid()));

CREATE POLICY "Owner updates own stream credentials"
  ON public.live_stream_credentials FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid()));

CREATE POLICY "Owner deletes own stream credentials"
  ON public.live_stream_credentials FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid()));

CREATE TRIGGER live_stream_credentials_set_updated_at
  BEFORE UPDATE ON public.live_stream_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migrate any existing credentials
INSERT INTO public.live_stream_credentials (stream_id, cf_live_input_id, cf_rtmps_url, cf_stream_key)
SELECT id, cf_live_input_id, cf_rtmps_url, cf_stream_key
FROM public.live_streams
WHERE cf_live_input_id IS NOT NULL OR cf_rtmps_url IS NOT NULL OR cf_stream_key IS NOT NULL
ON CONFLICT (stream_id) DO NOTHING;

-- Drop the now-redundant credential columns from live_streams
ALTER TABLE public.live_streams DROP COLUMN IF EXISTS cf_stream_key;
ALTER TABLE public.live_streams DROP COLUMN IF EXISTS cf_rtmps_url;
ALTER TABLE public.live_streams DROP COLUMN IF EXISTS cf_live_input_id;
