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
  // ── BUYER ────────────────────────────────────────────────────────────────
  "buyer-welcome": {
    id: "buyer-welcome", mascot: "buyer", audience: "buyer",
    steps: [
      { title: "Hey hey! I'm Hoshi ✨", body: "Your card-collecting bestie. Quick tour — promise!" },
      { title: "Watch sellers go LIVE 🔴", body: "Tap the Live tab to drop into real-time auctions.", target: '[data-tour="nav-live"]' },
      { title: "Shop the Market 🛒", body: "Buy It Now, place bids, or send custom offers.", target: '[data-tour="nav-market"]' },
      { title: "Build your Vault 🔒", body: "Every card you scan or buy lives here with live market value.", target: '[data-tour="nav-vault"]' },
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
