
ALTER TABLE public.tutorials
  ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS route_path text,
  ADD COLUMN IF NOT EXISTS voice_id text DEFAULT 'EXAVITQu4vr4xnSDxMaL';

CREATE INDEX IF NOT EXISTS idx_tutorials_route ON public.tutorials(route_path) WHERE route_path IS NOT NULL;

-- Backfill existing tutorials with step content + deep-links
UPDATE public.tutorials SET route_path = '/', steps = '[
  {"title":"Tap Live to watch a stream","body":"Open the bottom Live tab to see who is hosting right now."},
  {"title":"Browse the marketplace","body":"The Market tab lists every listing. Use the search bar to find specific cards or sellers."},
  {"title":"Open your profile","body":"From your profile you can edit info, see your vault, and adjust settings."}
]'::jsonb WHERE id = 'bc9021f3-17de-4639-8d02-fce710e360dc';

UPDATE public.tutorials SET route_path = '/profile', steps = '[
  {"title":"Open Profile","body":"Tap the profile icon in the bottom nav."},
  {"title":"Edit avatar and bio","body":"Add a clear photo and a short bio so collectors recognize you."},
  {"title":"Pick your interests","body":"Selecting interests personalizes your home feed."},
  {"title":"Toggle vault visibility","body":"Decide whether your vault appears on the public Vault Marketplace."}
]'::jsonb WHERE id = '21ba81a4-9b5d-4b31-9ae2-43783a5c943d';

UPDATE public.tutorials SET route_path = '/sell', steps = '[
  {"title":"Apply to be a seller","body":"Open Settings → Become a Seller and complete the short application."},
  {"title":"Accept the seller agreement","body":"Read and accept the seller and host agreements when prompted."},
  {"title":"Connect Stripe payouts","body":"Open Payouts and finish Stripe Connect onboarding to receive money."},
  {"title":"Wait for approval","body":"Most sellers are approved within a few hours."}
]'::jsonb WHERE id = '29a2cc77-a550-4d45-b33c-5eaf2b4f04f1';

UPDATE public.tutorials SET route_path = '/sell', steps = '[
  {"title":"Tap the + button","body":"From any screen, tap the central + and choose Sell."},
  {"title":"Snap or pick photos","body":"Add a clear front and back photo. Good light and a plain background help sales."},
  {"title":"Use the AI scanner","body":"Tap Scan card to auto-fill name, set, number, and rarity."},
  {"title":"Set price or auction","body":"Choose Buy Now, Make Offer, or Auction and confirm shipping options."},
  {"title":"Publish","body":"Your listing appears in the marketplace immediately."}
]'::jsonb WHERE id = '42f5a47e-7db4-418d-85de-62e574da8823';

UPDATE public.tutorials SET route_path = '/orders', steps = '[
  {"title":"Open Orders → Sold","body":"Find the order that needs to ship."},
  {"title":"Tap Buy Label","body":"Choose carrier, package size and confirm. Shippo prints a label paid from your balance."},
  {"title":"Pack and drop off","body":"Print the label, attach it, and drop the package at the carrier."},
  {"title":"Mark shipped","body":"Tap Mark shipped — the buyer is notified automatically."}
]'::jsonb WHERE id = 'abf4dc73-abee-4556-a28a-63a89ddda5d4';

UPDATE public.tutorials SET route_path = '/live', steps = '[
  {"title":"Open Live → Go Live","body":"Tap Go Live from the Live tab."},
  {"title":"Pick a category and title","body":"Categories help viewers find your show."},
  {"title":"Choose stream type","body":"Auction for selling, Show Off for flexing, Hybrid for both."},
  {"title":"Start camera","body":"Allow camera/mic access. Use good lighting and steady framing."},
  {"title":"Add cards in the OBS Hub","body":"Queue items so you can launch each auction in one tap."}
]'::jsonb WHERE id = '082be369-084d-44bd-bbbe-882c807f5fa0';

UPDATE public.tutorials SET route_path = '/showoff', steps = '[
  {"title":"Open Flex Live","body":"Tap the Flex Live tile from Home or Live tab."},
  {"title":"Tag your TCGs","body":"Pick the games you are showing — viewers filter by these tags."},
  {"title":"Show the vault, not sales","body":"Flex Live is for collection talk. Disable selling to avoid distractions."},
  {"title":"Engage chat","body":"Tipping and reactions are the social currency here."}
]'::jsonb WHERE id = '86b6b02e-3084-47b9-9230-086992a6944b';

UPDATE public.tutorials SET route_path = '/live', steps = '[
  {"title":"Standard","body":"Highest bid before timer ends wins."},
  {"title":"Sudden Death","body":"After the timer hits zero, each new bid extends time. Last bid wins."},
  {"title":"KO Round","body":"Multiple viewers compete in a fast knockout round to claim the lot."},
  {"title":"Buy It Now","body":"Some lots include a BIN price — first viewer to tap wins instantly."}
]'::jsonb WHERE id = '45ef664d-6e4f-4a3b-8a8a-53f3c5640774';

UPDATE public.tutorials SET route_path = '/disputes', steps = '[
  {"title":"Use built-in chat","body":"Always communicate via in-app messages so support can review."},
  {"title":"Open a dispute fast","body":"If something is wrong, open Disputes within 7 days of delivery."},
  {"title":"Add proof","body":"Photos, videos, and tracking screenshots speed up resolutions."},
  {"title":"Contact support","body":"From Settings → Support, send a help request anytime."}
]'::jsonb WHERE id = '89385623-f1a0-450b-945e-95d75cc741a7';

-- New BUYER tutorials (no real videos yet — text + steps still useful, and a placeholder video URL)
INSERT INTO public.tutorials (title, description, audience, category, video_url, route_path, order_index, steps) VALUES
  ('Browsing the Marketplace', 'Find your grail with search, filters, and categories.', 'buyer', 'getting-started',
   'https://pullbidlive.com/__l5e/assets-v1/21c2a990-2dcf-4437-a79c-1d2182b8fbcb/welcome.mp4', '/market', 0, '[
    {"title":"Use the top search bar","body":"Search for any card name, set, or seller from any screen."},
    {"title":"Filter by category","body":"Tap a category chip to narrow down by Pokémon, Sports, Funko, etc."},
    {"title":"Sort smartly","body":"Use Discover for variety, Ending Soon for hot auctions, or Lowest Price for deals."},
    {"title":"Tap a card","body":"Open the listing for full details, photos, and the seller profile."}
   ]'::jsonb),
  ('Placing Your First Bid', 'Bid safely on auctions and avoid bidding mistakes.', 'buyer', 'auctions',
   'https://pullbidlive.com/__l5e/assets-v1/21c2a990-2dcf-4437-a79c-1d2182b8fbcb/welcome.mp4', '/market', 1, '[
    {"title":"Open an auction","body":"Auction listings are tagged with an AUCTION badge."},
    {"title":"Read the terms","body":"Check shipping, returns, and the auction end time."},
    {"title":"Place your max bid","body":"We auto-bid for you up to your max — you only pay the minimum needed to win."},
    {"title":"Watch the clock","body":"Sudden Death auctions extend on every late bid — stay until it locks."}
   ]'::jsonb),
  ('Watching a Live Auction', 'Join live shows, react, and bid in real time.', 'buyer', 'live',
   'https://pullbidlive.com/__l5e/assets-v1/21c2a990-2dcf-4437-a79c-1d2182b8fbcb/welcome.mp4', '/live', 2, '[
    {"title":"Open the Live tab","body":"Tap any show that is currently live."},
    {"title":"Tap Bid","body":"The bid button shows the next valid amount. Tap once to bid."},
    {"title":"Use chat and reactions","body":"Hosts notice active viewers and often run giveaways."},
    {"title":"Pay automatically","body":"Winnings are charged to your saved card and shipped together when possible."}
   ]'::jsonb),
  ('Checkout and Payments', 'How to pay, save cards, and track orders.', 'buyer', 'orders',
   'https://pullbidlive.com/__l5e/assets-v1/21c2a990-2dcf-4437-a79c-1d2182b8fbcb/welcome.mp4', '/cart', 3, '[
    {"title":"Open your cart","body":"Add Buy Now items, then open Cart from the bottom nav."},
    {"title":"Save a payment method","body":"We use Stripe — your card details are never stored on our servers."},
    {"title":"Combine shipping","body":"Buying multiple items from one seller within 24h auto-combines shipping."},
    {"title":"Track in Orders","body":"All shipments and tracking numbers are in Orders → Bought."}
   ]'::jsonb),
  ('Building Your Vault', 'Save cards you own and showcase your collection.', 'buyer', 'vault',
   'https://pullbidlive.com/__l5e/assets-v1/21c2a990-2dcf-4437-a79c-1d2182b8fbcb/welcome.mp4', '/vault', 4, '[
    {"title":"Open Profile → My Vault","body":"Your private collection lives inside your profile."},
    {"title":"Add cards via scanner","body":"Use the AI scanner from the + button to add cards in seconds."},
    {"title":"Set visibility","body":"Toggle each card or your whole vault to public to appear on the Public Vault page."},
    {"title":"Watch values","body":"AI updates estimated value over time so you can spot what is heating up."}
   ]'::jsonb)
ON CONFLICT DO NOTHING;

-- Helper RPC: tutorials relevant to a given screen
CREATE OR REPLACE FUNCTION public.tutorials_for_route(_path text)
RETURNS SETOF public.tutorials
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.tutorials
  WHERE is_published = true AND route_path = _path
  ORDER BY audience, order_index
$$;
