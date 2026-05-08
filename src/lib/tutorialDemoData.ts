/**
 * Demo fixtures used during tutorial-mode recordings. Read-only.
 * Never inserted into the DB — these are for screen capture only.
 */
export const demoListings = [
  { id: "demo-1", title: "Charizard Holo 1st Edition PSA 9", price_cents: 285000, image_url: "/demo/charizard.jpg", category: "pokemon", views: 1240, watchers: 87 },
  { id: "demo-2", title: "Mike Trout Rookie Bowman Chrome BGS 9.5", price_cents: 145000, image_url: "/demo/trout.jpg", category: "sports", views: 980, watchers: 52 },
  { id: "demo-3", title: "Black Lotus Beta MTG", price_cents: 1200000, image_url: "/demo/lotus.jpg", category: "mtg", views: 3210, watchers: 220 },
  { id: "demo-4", title: "Pikachu Illustrator Promo", price_cents: 4500000, image_url: "/demo/pikachu.jpg", category: "pokemon", views: 5400, watchers: 410 },
  { id: "demo-5", title: "LeBron James Topps Chrome RC PSA 10", price_cents: 320000, image_url: "/demo/lebron.jpg", category: "sports", views: 1650, watchers: 134 },
  { id: "demo-6", title: "Yu-Gi-Oh Blue-Eyes White Dragon LOB 1st Ed", price_cents: 89000, image_url: "/demo/blueeyes.jpg", category: "ygo", views: 720, watchers: 41 },
  { id: "demo-7", title: "One Piece Luffy Manga Rare", price_cents: 22000, image_url: "/demo/luffy.jpg", category: "anime", views: 530, watchers: 28 },
  { id: "demo-8", title: "Kobe Bryant Topps Chrome RC PSA 8", price_cents: 215000, image_url: "/demo/kobe.jpg", category: "sports", views: 1320, watchers: 98 },
];

export const demoBids = [
  { id: "b1", listing_id: "demo-1", bidder: "card_hunter22", amount_cents: 285000, at: "2m ago" },
  { id: "b2", listing_id: "demo-1", bidder: "vintage_vault", amount_cents: 280000, at: "3m ago" },
  { id: "b3", listing_id: "demo-1", bidder: "pull_king", amount_cents: 275000, at: "4m ago" },
  { id: "b4", listing_id: "demo-3", bidder: "mtg_master", amount_cents: 1200000, at: "1m ago" },
  { id: "b5", listing_id: "demo-3", bidder: "alpha_collector", amount_cents: 1180000, at: "2m ago" },
];

export const demoChatMessages = [
  { id: "c1", user: "card_hunter22", text: "Let's gooo 🔥", at: "now" },
  { id: "c2", user: "vintage_vault", text: "GLWS!", at: "30s ago" },
  { id: "c3", user: "pull_king", text: "Bidding now", at: "1m ago" },
  { id: "c4", user: "demo_seller", text: "Welcome everyone! Auction starting", at: "2m ago" },
  { id: "c5", user: "anime_fan", text: "Got my eye on the Luffy 👀", at: "3m ago" },
];

export const demoOrders = [
  { id: "o1", listing_id: "demo-2", buyer: "card_hunter22", total_cents: 145000, status: "paid", created_at: "2026-05-07" },
  { id: "o2", listing_id: "demo-5", buyer: "vintage_vault", total_cents: 320000, status: "shipped", tracking: "1Z999AA10123456784", created_at: "2026-05-05" },
  { id: "o3", listing_id: "demo-6", buyer: "pull_king", total_cents: 89000, status: "delivered", tracking: "9405511899560537461234", created_at: "2026-05-01" },
  { id: "o4", listing_id: "demo-7", buyer: "anime_fan", total_cents: 22000, status: "paid", created_at: "2026-05-08" },
];

export const demoShippingTracking = {
  "1Z999AA10123456784": { carrier: "UPS", status: "In Transit", eta: "2026-05-10", lastUpdate: "Departed Memphis, TN" },
  "9405511899560537461234": { carrier: "USPS", status: "Delivered", eta: "2026-05-01", lastUpdate: "Delivered to mailbox" },
};

export const demoSellerAnalytics = {
  revenue_cents_30d: 1842000,
  orders_30d: 47,
  avg_order_cents: 39191,
  views_30d: 18420,
  conversion_rate: 0.0255,
  top_listing_id: "demo-1",
  followers: 1284,
  rating: 4.9,
  reviews: 312,
};

export const demoNotifications = [
  { id: "n1", type: "bid", text: "card_hunter22 bid $2,850 on Charizard Holo", at: "2m ago", read: false },
  { id: "n2", type: "order", text: "New order: Mike Trout Rookie — $1,450", at: "1h ago", read: false },
  { id: "n3", type: "message", text: "vintage_vault sent you a message", at: "3h ago", read: true },
  { id: "n4", type: "follow", text: "pull_king started following you", at: "1d ago", read: true },
];

export const demoLiveStream = {
  id: "demo-stream",
  host: "demo_seller",
  title: "Friday Night Vintage Pulls 🔥",
  viewers: 247,
  isLive: true,
  currentListing: demoListings[0],
  bidIncrement_cents: 500,
  timeRemaining: 23,
};

export const demoFlexLive = {
  active: true,
  format: "spots",
  totalSpots: 20,
  filledSpots: 14,
  pricePerSpot_cents: 2500,
};

export const demoWheel = {
  segments: ["Pikachu", "Charizard", "Mewtwo", "Blastoise", "Venusaur", "Snorlax", "Gengar", "Eevee"],
  spinning: false,
  winner: null as string | null,
};

export const demoKO = {
  round: 3,
  totalRounds: 5,
  remainingPlayers: 8,
  prize_cents: 50000,
};
