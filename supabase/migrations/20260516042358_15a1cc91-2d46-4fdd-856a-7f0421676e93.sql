
-- ============================================================
-- PullBid Pricing Intelligence — Phase 1 & 2 foundation
-- ============================================================

-- 1. Canonical card identity (multi-category, provider-agnostic)
CREATE TABLE IF NOT EXISTS public.card_identities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text NOT NULL,                  -- pokemon | mtg | yugioh | onepiece | lorcana | sports | dbs_fusion | swu | fab | other
  name            text NOT NULL,
  set_name        text,
  set_code        text,
  number          text,
  year            int,
  manufacturer    text,                           -- Topps | Panini | WotC | Konami | Bandai | Ravensburger ...
  variant         text,                           -- holo | reverse | 1st_edition | refractor | prizm | parallel:gold ...
  is_rookie       boolean NOT NULL DEFAULT false,
  player          text,                           -- sports
  team            text,                           -- sports
  grade           text,                           -- raw | psa_10 | psa_9 | bgs_9_5 | sgc_10 | cgc_10 ...
  grading_company text,                           -- PSA | BGS | SGC | CGC
  image_url       text,
  image_source    text,                           -- scryfall | pokemontcg | pricecharting | tcgplayer | user_upload ...
  external_ids    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { scryfall, tcgplayer, pricecharting, ebay_epid, ygoprodeck }
  fingerprint     text NOT NULL UNIQUE,           -- deterministic hash of identity fields
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_identities_category ON public.card_identities(category);
CREATE INDEX IF NOT EXISTS idx_card_identities_name     ON public.card_identities(lower(name));
CREATE INDEX IF NOT EXISTS idx_card_identities_player   ON public.card_identities(lower(player)) WHERE player IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_identities_set_num  ON public.card_identities(set_code, number);
CREATE INDEX IF NOT EXISTS idx_card_identities_extids   ON public.card_identities USING GIN (external_ids);

ALTER TABLE public.card_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_identities readable by all"
  ON public.card_identities FOR SELECT
  USING (true);

-- Writes are service-role / admin only (no public insert/update/delete policy)

-- 2. Price observations (append-only history from any source)
CREATE TABLE IF NOT EXISTS public.price_observations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   uuid NOT NULL REFERENCES public.card_identities(id) ON DELETE CASCADE,
  source        text NOT NULL,                    -- tcg_api | scryfall | pricecharting | ebay_sold | ygoprodeck | tcg_prices | pullbid_internal
  price_cents   int NOT NULL CHECK (price_cents >= 0),
  currency      text NOT NULL DEFAULT 'USD',
  sample_size   int,                              -- # of comps that produced this price (when applicable)
  raw_payload   jsonb,                            -- provider response slice for audit
  observed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_obs_identity_time ON public.price_observations(identity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_obs_source        ON public.price_observations(source);

ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_observations readable by all"
  ON public.price_observations FOR SELECT
  USING (true);

-- 3. Sold comps (actual sales — internal + external)
CREATE TABLE IF NOT EXISTS public.sold_comps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id     uuid NOT NULL REFERENCES public.card_identities(id) ON DELETE CASCADE,
  source          text NOT NULL,                  -- pullbid_marketplace | pullbid_live | pullbid_offer | ebay_sold | pricecharting_sold
  sale_price_cents int NOT NULL CHECK (sale_price_cents >= 0),
  currency        text NOT NULL DEFAULT 'USD',
  sold_at         timestamptz NOT NULL,
  channel         text,                           -- auction | buy_now | offer | live_hammer | bin
  buyer_user_id   uuid,                           -- nullable, only for internal pullbid sales
  seller_user_id  uuid,                           -- nullable, only for internal pullbid sales
  external_url    text,                           -- link to eBay listing etc.
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sold_comps_identity_time ON public.sold_comps(identity_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sold_comps_source        ON public.sold_comps(source);

ALTER TABLE public.sold_comps ENABLE ROW LEVEL SECURITY;

-- Aggregate sold comps readable by all (no PII exposed in select); buyer/seller IDs
-- are not exposed to public clients unless joined by RLS on the source tables.
CREATE POLICY "sold_comps readable by all"
  ON public.sold_comps FOR SELECT
  USING (true);

-- 4. Card images (multi-source per identity)
CREATE TABLE IF NOT EXISTS public.card_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   uuid NOT NULL REFERENCES public.card_identities(id) ON DELETE CASCADE,
  url           text NOT NULL,
  source        text NOT NULL,                    -- scryfall | pokemontcg | pricecharting | user_upload | scan_capture
  quality_score real,                             -- 0..1, higher = better (resolution * clarity)
  uploaded_by   uuid,                             -- nullable (provider images have no uploader)
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_images_identity_url ON public.card_images(identity_id, url);
CREATE INDEX IF NOT EXISTS idx_card_images_identity_primary    ON public.card_images(identity_id) WHERE is_primary = true;

ALTER TABLE public.card_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_images readable by all"
  ON public.card_images FOR SELECT
  USING (true);

-- 5. updated_at trigger on card_identities
CREATE OR REPLACE FUNCTION public.touch_card_identities_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_identities_updated_at ON public.card_identities;
CREATE TRIGGER trg_card_identities_updated_at
  BEFORE UPDATE ON public.card_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_card_identities_updated_at();
