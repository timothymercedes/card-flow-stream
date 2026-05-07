ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.listings      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.live_streams  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.vault_cards   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_listings_is_demo     ON public.listings(is_demo);
CREATE INDEX IF NOT EXISTS idx_live_streams_is_demo ON public.live_streams(is_demo);
CREATE INDEX IF NOT EXISTS idx_vault_cards_is_demo  ON public.vault_cards(is_demo);

DO $$
DECLARE
  demo_users jsonb := '[
    {"id":"d0000001-0000-0000-0000-000000000001","email":"demo_alex_cards@demo.pullbidlive.com","username":"demo_alex_cards","shop":"Alex Card Vault Demo"},
    {"id":"d0000002-0000-0000-0000-000000000002","email":"demo_pokestore@demo.pullbidlive.com","username":"demo_pokestore","shop":"PokeStore Demo"},
    {"id":"d0000003-0000-0000-0000-000000000003","email":"demo_sportsvault@demo.pullbidlive.com","username":"demo_sportsvault","shop":"Sports Vault Demo"},
    {"id":"d0000004-0000-0000-0000-000000000004","email":"demo_topdeck@demo.pullbidlive.com","username":"demo_topdeck","shop":"TopDeck Demo"}
  ]'::jsonb;
  u jsonb;
BEGIN
  FOR u IN SELECT * FROM jsonb_array_elements(demo_users) LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', (u->>'id')::uuid,
      'authenticated','authenticated', u->>'email',
      crypt('!demo-locked-' || (u->>'id'), gen_salt('bf')), NULL,
      jsonb_build_object('provider','demo','providers',jsonb_build_array('demo')),
      jsonb_build_object('username', u->>'username','is_demo',true),
      now() - interval '14 days', now(), false, false
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, username, shop_name, is_seller, seller_status, live_verified, verification_status, verified_at, is_demo, avatar_url, created_at)
    VALUES ((u->>'id')::uuid, u->>'username', u->>'shop',
      true, 'approved', true, 'approved', now() - interval '10 days', true,
      'https://api.dicebear.com/7.x/shapes/svg?seed=' || (u->>'username'),
      now() - interval '14 days')
    ON CONFLICT (id) DO UPDATE
      SET shop_name = EXCLUDED.shop_name, is_seller = true, seller_status = 'approved',
          live_verified = true, verification_status = 'approved',
          is_demo = true, avatar_url = EXCLUDED.avatar_url;
  END LOOP;
END$$;

WITH seller AS (SELECT id, username FROM public.profiles WHERE is_demo = true)
INSERT INTO public.listings (seller_id, title, description, image_url, price, buy_now_price, listing_type, accepts_offers, starting_bid, current_bid, is_auction, auction_ends_at, category, condition, quantity, is_demo)
SELECT s.id, t.title, t.description, t.image_url, t.price, t.price, t.listing_type, t.accepts_offers, t.starting_bid, t.starting_bid, t.is_auction, t.auction_ends_at, t.category, t.condition::card_condition, 1, true
FROM seller s
JOIN LATERAL (VALUES
  ('demo_pokestore',  'Charizard VMAX Rainbow Rare', 'Demo listing - Champions Path slab.', 'https://images.unsplash.com/photo-1647892275598-3e96d6f7b6ef?w=800', 320::numeric, 'buy_now',  true,  NULL::numeric, false, NULL::timestamptz, 'pokemon', 'NM'),
  ('demo_pokestore',  'Pikachu Illustrator (Display Repro)', 'Demo listing - clearly marked replica.', 'https://images.unsplash.com/photo-1605557202138-bdcc25c2a8b9?w=800', NULL, 'offer',  true,  NULL,  false, NULL, 'pokemon', 'NM'),
  ('demo_pokestore',  'Pokemon Booster Box - Lost Origin (Sealed)', 'Demo listing - factory sealed.', 'https://images.unsplash.com/photo-1628083022019-bf8b73d9e0c0?w=800', 165, 'buy_now',  false, NULL, false, NULL, 'pokemon', 'NM'),
  ('demo_alex_cards', 'Pokemon Slab Lot - 5 Holos', 'Demo auction - five graded holos.', 'https://images.unsplash.com/photo-1612036782180-6f0822045d23?w=800', NULL, 'auction', false, 25, true, now() + interval '2 days', 'pokemon', 'NM'),
  ('demo_alex_cards', 'MTG Black Lotus (Display Repro)', 'Demo listing - clearly marked replica.', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800', NULL, 'offer', true, NULL, false, NULL, 'magic', 'NM'),
  ('demo_alex_cards', 'One Piece OP-01 Booster Pack Lot (12)', 'Demo listing - 12 sealed packs.', 'https://images.unsplash.com/photo-1601370690183-1c7796ecec61?w=800', 95, 'buy_now', true, NULL, false, NULL, 'one_piece', 'NM'),
  ('demo_sportsvault','Michael Jordan Rookie (Display Repro)', 'Demo listing - replica display.', 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800', NULL, 'offer', true, NULL, false, NULL, 'sports', 'NM'),
  ('demo_sportsvault','2023 Topps Chrome Hobby Box (Sealed)', 'Demo auction - sealed hobby box.', 'https://images.unsplash.com/photo-1577741314755-048d8525d31e?w=800', NULL, 'auction', false, 80, true, now() + interval '3 days', 'sports', 'NM'),
  ('demo_sportsvault','Patrick Mahomes Prizm Silver PSA 10', 'Demo listing - graded slab.', 'https://images.unsplash.com/photo-1518604666860-9ed391f76460?w=800', 240, 'buy_now', true, NULL, false, NULL, 'sports', 'NM'),
  ('demo_topdeck',    'Yu-Gi-Oh Blue-Eyes White Dragon LOB-001', 'Demo listing - vintage 1st ed.', 'https://images.unsplash.com/photo-1606503153255-59d8b8b4e2ed?w=800', NULL, 'offer', true, NULL, false, NULL, 'yugioh', 'LP'),
  ('demo_topdeck',    'Lorcana First Chapter Booster Lot', 'Demo auction - 24 sealed packs.', 'https://images.unsplash.com/photo-1628511252492-58d8b3a6b1f2?w=800', NULL, 'auction', false, 40, true, now() + interval '1 day', 'lorcana', 'NM'),
  ('demo_topdeck',    'Funko Pop Vaulted Bundle (5)', 'Demo listing - five vaulted Pops.', 'https://images.unsplash.com/photo-1608889335941-32ac5f2041b9?w=800', 110, 'buy_now', true, NULL, false, NULL, 'funko', 'NM')
) AS t(seller_username,title,description,image_url,price,listing_type,accepts_offers,starting_bid,is_auction,auction_ends_at,category,condition)
ON s.username = t.seller_username
WHERE NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.seller_id = s.id AND l.is_demo = true AND l.title = t.title);

WITH seller AS (SELECT id, username FROM public.profiles WHERE is_demo = true)
INSERT INTO public.vault_cards (user_id, name, image_url, category, estimated_value, condition, tcg_set, tcg_number, visibility, is_demo)
SELECT s.id, v.name, v.image_url, v.category, v.estimated_value, v.condition::card_condition, v.tcg_set, v.tcg_number, 'public', true
FROM seller s
JOIN LATERAL (VALUES
  ('demo_pokestore', 'Charizard Base Set Shadowless', 'https://images.unsplash.com/photo-1647892275598-3e96d6f7b6ef?w=600', 'pokemon', 1850::numeric, 'NM', 'Base Set', '4/102'),
  ('demo_pokestore', 'Mew Promo 8', 'https://images.unsplash.com/photo-1605557202138-bdcc25c2a8b9?w=600', 'pokemon', 240, 'NM', 'WOTC Promo', '8'),
  ('demo_pokestore', 'Umbreon Gold Star', 'https://images.unsplash.com/photo-1628083022019-bf8b73d9e0c0?w=600', 'pokemon', 1100, 'LP', 'POP Series 5', '17'),
  ('demo_alex_cards','Black Lotus Beta (Display Repro)', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600', 'magic', 25, 'NM', 'Beta', '232'),
  ('demo_alex_cards','Mox Sapphire (Display Repro)', 'https://images.unsplash.com/photo-1601370690183-1c7796ecec61?w=600', 'magic', 25, 'NM', 'Beta', '263'),
  ('demo_sportsvault','Michael Jordan Fleer Rookie 57', 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600', 'sports', 4800, 'NM', 'Fleer 1986', '57'),
  ('demo_sportsvault','Tom Brady Bowman Chrome Refractor', 'https://images.unsplash.com/photo-1577741314755-048d8525d31e?w=600', 'sports', 2200, 'NM', 'Bowman Chrome', '236'),
  ('demo_topdeck',   'Blue-Eyes White Dragon 1st Ed', 'https://images.unsplash.com/photo-1606503153255-59d8b8b4e2ed?w=600', 'yugioh', 650, 'LP', 'LOB', '001'),
  ('demo_topdeck',   'Dark Magician Girl Secret Rare', 'https://images.unsplash.com/photo-1612036782180-6f0822045d23?w=600', 'yugioh', 180, 'NM', 'MFC', '000')
) AS v(seller_username,name,image_url,category,estimated_value,condition,tcg_set,tcg_number)
ON s.username = v.seller_username
WHERE NOT EXISTS (SELECT 1 FROM public.vault_cards vc WHERE vc.user_id = s.id AND vc.is_demo = true AND vc.name = v.name);

INSERT INTO public.vault_settings (user_id, visibility)
SELECT id, 'public' FROM public.profiles WHERE is_demo = true
ON CONFLICT (user_id) DO UPDATE SET visibility = 'public';

WITH seller AS (SELECT id, username FROM public.profiles WHERE is_demo = true)
INSERT INTO public.live_streams (seller_id, title, thumbnail_url, status, mode, stream_type, listing_type, current_bid, starting_bid, category, is_active, is_demo, started_at, last_activity_at)
SELECT s.id, t.title, t.thumb, 'live', 'auction', 'auction', 'auction', 0, 1, t.category, true, true, now() - interval '5 minutes', now()
FROM seller s
JOIN LATERAL (VALUES
  ('demo_pokestore',  'Pokemon Pack Rip Night - Demo Preview',     'https://images.unsplash.com/photo-1628083022019-bf8b73d9e0c0?w=800', 'pokemon'),
  ('demo_alex_cards', 'Friday Slab Showcase - Demo Preview',       'https://images.unsplash.com/photo-1612036782180-6f0822045d23?w=800', 'pokemon'),
  ('demo_sportsvault','Sports Card Hits Live - Demo Preview',      'https://images.unsplash.com/photo-1577741314755-048d8525d31e?w=800', 'sports'),
  ('demo_topdeck',    'TCG Auction Block - Demo Preview',          'https://images.unsplash.com/photo-1601370690183-1c7796ecec61?w=800', 'one_piece')
) AS t(seller_username,title,thumb,category)
ON s.username = t.seller_username
WHERE NOT EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.seller_id = s.id AND ls.is_demo = true AND ls.title = t.title);
