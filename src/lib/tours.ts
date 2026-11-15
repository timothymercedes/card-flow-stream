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
      { title: "Vault & collections", body: "Scan cards into your Vault, track sets in Collection Books and keep a Wishlist.", target: '[data-tour="div-vault"]' },
      { title: "Selling", body: "Tap Sell to list an item. Sellers get the Seller Hub for orders, shipping labels and live shows." },
      { title: "Search & discovery", body: "Use search on Marketplace and PB Bazaar. Suggestions show matching stores and items as you type." },
      { title: "Cart & checkout", body: "Marketplace and PB Bazaar items go into your cart. Prices, tax and shipping are checked again at checkout." },
      { title: "Messages & notifications", body: "Message sellers and get alerts when shows go live or items you want appear. Needs an account." },
      { title: "Profile & settings", body: "Your profile, orders and settings live in the account menu at the top right." },
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
};

export const MASCOT_NAMES = ["Hoshi", "Vexa", "Krome"] as const;
