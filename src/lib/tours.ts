import buyerImg from "@/assets/mascot-buyer.png";
import sellerImg from "@/assets/mascot-seller.png";
import flexImg from "@/assets/mascot-flex.png";

export type MascotId = "buyer" | "seller" | "flex";

export const MASCOTS: Record<MascotId, {
  name: string;
  image: string;
  glow: string;
  accent: string;
  voice: (s: string) => string;
}> = {
  buyer:  { name: "Hoshi", image: buyerImg,  glow: "from-fuchsia-500/40 via-pink-400/30 to-cyan-400/40", accent: "bg-fuchsia-500 text-white", voice: (s) => s },
  seller: { name: "Vexa",  image: sellerImg, glow: "from-emerald-400/40 via-teal-400/30 to-slate-400/30", accent: "bg-emerald-500 text-white", voice: (s) => s },
  flex:   { name: "Krome", image: flexImg,   glow: "from-orange-400/40 via-yellow-300/30 to-pink-400/40", accent: "bg-gradient-to-r from-orange-500 to-pink-500 text-white", voice: (s) => s },
};

/** Audience gate: who is this tour for? `any` shows to everyone. */
export type TourAudience = "buyer" | "seller" | "any";

export type TourStep = {
  title: string;
  body: string;
  /** Optional CSS selector or [data-tour] key to spotlight + arrow-point to. */
  target?: string;
};
export type Tour = {
  id: string;
  mascot: MascotId;
  audience: TourAudience;
  steps: TourStep[];
};

// Each tour is keyed; per-user storage tracks completion so it never re-fires.
export const TOURS: Record<string, Tour> = {
  // ── PLATFORM TOURS (everyone) ───────────────────────────────────────────
  "platform-quick": {
    id: "platform-quick", mascot: "buyer", audience: "any",
    steps: [
      { title: "Welcome to PullBid Live", body: "A 60-second look at everything you can do here." },
      { title: "Live", body: "Watch live shows and join real-time auctions. Bidding needs an account.", target: '[data-tour="div-live"]' },
      { title: "Marketplace", body: "Collectors buy and sell to each other: Buy Now, Make an Offer or auctions.", target: '[data-tour="div-market"]' },
      { title: "PB Bazaar", body: "Everyday merchandise at fixed prices. Add to Cart or Buy Now — no bidding.", target: '[data-tour="div-bazaar"]' },
      { title: "PB Store", body: "New trading cards and sealed products. Fixed prices only — opening soon.", target: '[data-tour="div-store"]' },
      { title: "PB Social", body: "Discover collectors, stories and community posts.", target: '[data-tour="div-social"]' },
      { title: "Vault", body: "Save and organize your card collection. Sign in to start yours.", target: '[data-tour="div-vault"]' },
      { title: "You're set!", body: "Replay this tour or take the Full Tour any time from the Help button." },
    ],
  },
  "platform-full": {
    id: "platform-full", mascot: "buyer", audience: "any",
    steps: [
      { title: "Welcome to PullBid Live", body: "The full walkthrough. Use Previous and Next, or skip any time." },
      { title: "Home & navigation", body: "Categories at the top, divisions below. Tap a category to pick PB Bazaar or Independent Market.", target: '[data-tour="divisions"]' },
      { title: "Live shows & auctions", body: "Open Live to watch shows. Tap quick-bid chips or Buy It Now during an auction. The timer extends near the end.", target: '[data-tour="div-live"]' },
      { title: "Flex Live", body: "Flex Live is social streaming with no auctions — reactions, collabs and chat. Find it in the Live / Flex tab on Home." },
      { title: "Marketplace", body: "Customer-to-customer listings. Buy Now, Make an Offer, or bid on auctions.", target: '[data-tour="div-market"]' },
      { title: "PB Bazaar", body: "Fixed-price merchandise from partner stores. Add to Cart or Buy Now. Items marked Coming soon are still being checked.", target: '[data-tour="div-bazaar"]' },
      { title: "PB Store", body: "Dedicated to new TCG products. Fixed prices only. Opening soon.", target: '[data-tour="div-store"]' },
      { title: "PB Social", body: "Follow collectors, watch stories, and post in category communities.", target: '[data-tour="div-social"]' },
      { title: "Vault & collections", body: "After signing in, scan cards into your Vault, track sets in Collection Books and keep a Wishlist.", target: '[data-tour="div-vault"]' },
      { title: "Selling", body: "Tap Sell to list an item (needs an account). Approved sellers get the Seller Hub for orders, shipping labels and live shows." },
      { title: "Search & discovery", body: "Use search on Marketplace and PB Bazaar. Suggestions show matching stores and items as you type." },
      { title: "Cart & checkout", body: "Marketplace and PB Bazaar each have their own cart. Prices, tax and shipping are checked again at checkout. Needs an account." },
      { title: "Messages & notifications", body: "Message sellers and get alerts when shows go live or items you want appear. Needs an account." },
      { title: "Profile & settings", body: "After you sign in, your profile, orders and settings are in the account menu at the top right." },
      { title: "All done!", body: "Replay any tour from the Help button. Happy collecting!" },
    ],
  },
  // ── BUYER ────────────────────────────────────────────────────────────────
  "buyer-welcome": {
    id: "buyer-welcome", mascot: "buyer", audience: "buyer",
    steps: [
      { title: "Hey hey! I'm Hoshi ✨", body: "Your card-collecting bestie. Quick tour — promise!" },
      { title: "Watch sellers go LIVE 🔴", body: "Open Live to drop into real-time auctions." },
      { title: "Shop the Market 🛒", body: "Buy It Now, place bids, or send custom offers." },
      { title: "Build your Vault 🔒", body: "Every card you scan or buy lives here with live market value." },
      { title: "Follow your faves ⭐", body: "We'll ping you the moment they go live." },
    ],
  },
  "buyer-first-live": {
    id: "buyer-first-live", mascot: "buyer", audience: "buyer",
    steps: [
      { title: "Welcome to the show! 🎬", body: "Live auction in real time." },
      { title: "Bidding 101 💸", body: "Tap a quick-bid chip to raise. Timer extends near the end.", target: '[data-tour="bid-controls"]' },
      { title: "Buy It Now ⚡", body: "See a BIN price? Tap to lock it in instantly.", target: '[data-tour="bin-button"]' },
      { title: "Win & ship 📦", body: "We charge your saved card and the seller prints a label." },
    ],
  },

  // ── SELLER / HOST ────────────────────────────────────────────────────────
  "seller-welcome": {
    id: "seller-welcome", mascot: "seller", audience: "seller",
    steps: [
      { title: "I'm Vexa. Let's get you live.", body: "I run the Seller Hub. Auctions, shipping, payouts." },
      { title: "Title & category 📝", body: "Set the title — tags stay separate.", target: '[data-tour="stream-title"]' },
      { title: "OBS Hub ⚙️", body: "One-tap setup, persistent stream keys, live health.", target: '[data-tour="obs-hub-link"]' },
      { title: "Go Live 📡", body: "Hit Start Stream. We'll provision Cloudflare ingest.", target: '[data-tour="start-stream"]' },
      { title: "Get paid 💳", body: "Stripe Connect handles payouts after delivery." },
    ],
  },
  "seller-first-stream": {
    id: "seller-first-stream", mascot: "seller", audience: "seller",
    steps: [
      { title: "First stream — let's nail it.", body: "Good lighting, quiet room, cards in reach." },
      { title: "Scan to list ⚡", body: "AI IDs the card and prefills price + condition.", target: '[data-tour="scan-card"]' },
      { title: "Auction controls 🎛️", body: "Add Time, Lock Bids, End early.", target: '[data-tour="auction-controls"]' },
      { title: "Voice triggers 🎙️", body: "Say 'sold' or 'next card' — hands-free." },
    ],
  },
  "seller-first-order": {
    id: "seller-first-order", mascot: "seller", audience: "seller",
    steps: [
      { title: "First sale! 🎉", body: "Hit 'Print label' in Orders — Shippo handles the rest." },
    ],
  },

  // ── FLEX (host-side) ─────────────────────────────────────────────────────
  "flex-welcome": {
    id: "flex-welcome", mascot: "flex", audience: "seller",
    steps: [
      { title: "FLEX LIVE TIME 🔥", body: "Pure community, zero auctions." },
      { title: "Public or Private 🌐🔒", body: "Public = anyone watches. Private = invite-only." },
      { title: "Invite the crew 👥", body: "Tag verified users to bring them on cam." },
      { title: "Safety 🛡️", body: "AI moderation runs 24/7. Verified-only hosts." },
    ],
  },
  "flex-live-screen": {
    id: "flex-live-screen", mascot: "flex", audience: "any",
    steps: [
      { title: "Welcome to your Flex room 🎉", body: "Quick tour — Skip any time." },
      { title: "Reactions 💜🔥", body: "Tap any emoji to send floating bursts.", target: '[data-tour="reactions"]' },
      { title: "Collab tab 👥", body: "Up to 6 co-hosts.", target: '[data-tour="collab-tab"]' },
      { title: "Settings ⚙️", body: "Slow chat, manage co-hosts, toggle requests.", target: '[data-tour="flex-settings"]' },
    ],
  },
  "auction-live-screen": {
    id: "auction-live-screen", mascot: "buyer", audience: "buyer",
    steps: [
      { title: "Live auction tour 🎬", body: "Quick walk-through." },
      { title: "Current Bid 💸", body: "Big number = current bid. Quick-bid chips jump fast.", target: '[data-tour="bid-controls"]' },
      { title: "Hold to bid ⏳", body: "Press and hold the red button. Longer = higher.", target: '[data-tour="hold-bid"]' },
      { title: "Timer 🕒", body: "Bursts huge in the last 5s.", target: '[data-tour="timer"]' },
      { title: "Chat 💬", body: "Type @ to mention users.", target: '[data-tour="chat"]' },
    ],
  },
  "obs-connect": {
    id: "obs-connect", mascot: "seller", audience: "seller",
    steps: [
      { title: "OBS Connect Hub 🎥", body: "Sub-minute setup." },
      { title: "One-tap profile 📥", body: "Tap 'Download .ini' — pre-fills server + key.", target: '[data-tour="obs-download"]' },
      { title: "Or copy + paste 📋", body: "'Copy both' → OBS Settings → Stream → Custom.", target: '[data-tour="obs-copy"]' },
      { title: "Recommended encode 📺", body: "1080p · 30fps · 4500 kbps · keyframe 2s." },
    ],
  },
  // ── TOPIC GUIDES (everyone) — Nov 2026 content refresh ─────────────────
  "guide-social": {
    id: "guide-social", mascot: "flex", audience: "any",
    steps: [
      { title: "Your social profile", body: "Sign up, then open your profile from the account menu. Add a name, bio, cover and profile picture." },
      { title: "Three kinds of media", body: "Your profile picture, your Stories and your post photos are separate. Deleting one never touches the others." },
      { title: "Stories", body: "Open Stories to share a photo or video. Stories disappear from public view after 24 hours." },
      { title: "Your private archive", body: "Expired Stories and archived posts move to your Archive. Only you can open it, from your own profile." },
      { title: "Posts", body: "Share photos, videos and updates. Others can like, comment and share them." },
      { title: "Followers", body: "Follow collectors and sellers to see their posts and get alerts when they go live. Your profile shows followers and following." },
    ],
  },
  "guide-marketplace": {
    id: "guide-marketplace", mascot: "buyer", audience: "any",
    steps: [
      { title: "The Marketplace", body: "Members selling to members: cards, collectibles and everyday items. Browse, search and filter by department." },
      { title: "Check the options", body: "Each listing shows what the seller turned on: Buy Now, Make an Offer, Auction or Trade. Only those buttons appear." },
      { title: "Buy Now", body: "Pay the listed price and check out right away." },
      { title: "Make an Offer", body: "Send a price. The seller can accept, decline or counter." },
      { title: "Auctions", body: "Place a bid before the timer ends. The highest bid when it ends wins." },
      { title: "Trades", body: "On trade-friendly listings, tap Propose a Trade to offer cards from your Vault." },
      { title: "Selling", body: "Tap Sell, add photos, title, category, condition and your selling options. Manage everything in My Listings." },
      { title: "Sponsored listings", body: "Some listings are labelled Sponsored or Boosted. Boosts are limited so they never take over the feed." },
      { title: "Seller stores", body: "Tap a seller's name on any listing to visit their PullBid Live store." },
    ],
  },
  "guide-bazaar": {
    id: "guide-bazaar", mascot: "buyer", audience: "any",
    steps: [
      { title: "PB Bazaar", body: "Everyday products from PullBid's partner suppliers, at fixed prices. It is separate from the member Marketplace." },
      { title: "Departments & search", body: "Pick a department or search. Filter results to narrow things down." },
      { title: "Product details", body: "Choose a size, color or other option. Items marked Coming soon can't be bought yet." },
      { title: "Cart or Buy Now", body: "Add to Cart or Buy Now. No bidding or offers in PB Bazaar." },
      { title: "Shipping", body: "Shipping is worked out from your address and cart, and shown before you pay." },
      { title: "Your orders", body: "Track every PB Bazaar order under Bazaar orders." },
    ],
  },
  "guide-live": {
    id: "guide-live", mascot: "buyer", audience: "any",
    steps: [
      { title: "Live Shows", body: "Open Live or Upcoming Shows to find a show. Tap one to join." },
      { title: "Live bidding", body: "Use the quick-bid buttons during an auction. The timer can extend near the end." },
      { title: "Pre-bidding", body: "On some upcoming shows you can place a bid on items before the show starts." },
      { title: "Chat & shoutouts", body: "Chat with the host and viewers, send reactions and shoutouts." },
      { title: "Flex Live", body: "Flex Live is for hanging out — no sales. Hosts may show a content warning before you join." },
      { title: "Follow hosts", body: "Follow a seller or creator to get an alert when they go live." },
    ],
  },
  "guide-trade": {
    id: "guide-trade", mascot: "seller", audience: "any",
    steps: [
      { title: "PB Trade", body: "Swap cards with other members. Trades work from the Marketplace and your Vault only." },
      { title: "Propose or respond", body: "Pick cards from your Vault and theirs, then send. You can accept, decline or counter proposals in Trades." },
      { title: "Agreement", body: "Once both sides accept, the cards are locked to that trade so they can't be sold elsewhere." },
      { title: "Ship & track", body: "Add your carrier and tracking number. Both of you can follow each side's shipment." },
      { title: "Confirm arrival", body: "Mark the cards as received once they arrive. The trade completes when both sides confirm." },
      { title: "Problems", body: "Report an issue on the trade page. PullBid staff review disputes. Canceled trades unlock the cards." },
    ],
  },
  "guide-account": {
    id: "guide-account", mascot: "seller", audience: "any",
    steps: [
      { title: "Settings", body: "Open Settings from the account menu for profile, notifications, privacy and security." },
      { title: "Security", body: "Use a strong password and add a passkey for faster, safer sign-in." },
      { title: "Notifications", body: "Choose which alerts you get: live shows, offers, orders, trades and messages." },
      { title: "Privacy", body: "Control who sees your profile and Vault. Your profile picture and name stay visible." },
      { title: "Block & report", body: "Use the menu on a member's profile or message to block or report them. Reports go to our moderators." },
      { title: "Your content", body: "Edit or delete your posts and Stories any time. Deleted items disappear publicly right away." },
    ],
  },
};

export const MASCOT_NAMES = ["Hoshi", "Vexa", "Krome"] as const;
