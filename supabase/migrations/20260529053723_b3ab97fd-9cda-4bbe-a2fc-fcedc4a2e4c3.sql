UPDATE public.profiles
SET is_seller = true, onboarding_completed = true, age_verified = true,
    tos_accepted = true, guidelines_accepted = true, buyer_verified = true,
    is_demo = true, stripe_charges_enabled = true, stripe_payouts_enabled = true,
    stripe_onboarding_status = 'complete', seller_status = 'approved'
WHERE username = 'reviewer_seller';

UPDATE public.profiles
SET is_demo = true, onboarding_completed = true, age_verified = true,
    tos_accepted = true, guidelines_accepted = true, buyer_verified = true
WHERE username = 'reviewer_buyer';

INSERT INTO public.listings
  (seller_id, title, description, image_url, price, buy_now_price, is_auction, listing_type, condition, category, quantity, is_demo, shipping_price)
SELECT p.id, 'Charizard Holo - Base Set (Demo)',
  'Demo listing for app review. Classic Base Set Charizard in Near Mint condition.',
  'https://images.pokemontcg.io/base1/4_hires.png',
  450.00, 450.00, false, 'buy_now', 'NM'::card_condition, 'pokemon', 1, true, 5.00
FROM public.profiles p WHERE p.username = 'reviewer_seller';

INSERT INTO public.listings
  (seller_id, title, description, image_url, price, buy_now_price, is_auction, listing_type, condition, category, quantity, is_demo, shipping_price)
SELECT p.id, 'Pikachu Illustrator Promo (Demo)',
  'Demo listing for app review. Collector-grade promo card.',
  'https://images.pokemontcg.io/base1/58_hires.png',
  25.00, 25.00, false, 'buy_now', 'LP'::card_condition, 'pokemon', 3, true, 4.00
FROM public.profiles p WHERE p.username = 'reviewer_seller';

INSERT INTO public.listings
  (seller_id, title, description, image_url, price, starting_bid, current_bid, is_auction, auction_status, auction_ends_at, expires_at, listing_type, condition, category, quantity, is_demo, shipping_price)
SELECT p.id, 'Blastoise Holo - Base Set (Demo Auction)',
  'Demo live auction for app review. Bidding open for 7 days.',
  'https://images.pokemontcg.io/base1/2_hires.png',
  120.00, 120.00, 120.00, true, 'active', now() + interval '7 days', now() + interval '7 days', 'auction', 'NM'::card_condition, 'pokemon', 1, true, 5.00
FROM public.profiles p WHERE p.username = 'reviewer_seller';