import buyerImg from "@/assets/mascot-buyer.png";
import sellerImg from "@/assets/mascot-seller.png";
import flexImg from "@/assets/mascot-flex.png";

export type MascotId = "buyer" | "seller" | "flex";

export const MASCOTS: Record<MascotId, {
  name: string;
  image: string;
  glow: string; // tailwind gradient classes for the bubble glow
  accent: string; // accent color for buttons/progress
  voice: (s: string) => string; // dialogue style transformer
}> = {
  buyer: {
    name: "Hoshi",
    image: buyerImg,
    glow: "from-fuchsia-500/40 via-pink-400/30 to-cyan-400/40",
    accent: "bg-fuchsia-500 text-white",
    voice: (s) => s, // energetic, sparkly — keep raw, dialogue already styled
  },
  seller: {
    name: "Vexa",
    image: sellerImg,
    glow: "from-emerald-400/40 via-teal-400/30 to-slate-400/30",
    accent: "bg-emerald-500 text-white",
    voice: (s) => s, // confident, professional
  },
  flex: {
    name: "Krome",
    image: flexImg,
    glow: "from-orange-400/40 via-yellow-300/30 to-pink-400/40",
    accent: "bg-gradient-to-r from-orange-500 to-pink-500 text-white",
    voice: (s) => s, // hype, social
  },
};

export type TourStep = { title: string; body: string };
export type Tour = { id: string; mascot: MascotId; steps: TourStep[] };

// Each tour is keyed; LocalStorage tracks completion so it never re-fires.
export const TOURS: Record<string, Tour> = {
  // ── BUYER ────────────────────────────────────────────────────────────────
  "buyer-welcome": {
    id: "buyer-welcome",
    mascot: "buyer",
    steps: [
      { title: "Hey hey! I'm Hoshi ✨", body: "Your card-collecting bestie. I'll show you around — it'll be quick, promise!" },
      { title: "Watch sellers go LIVE 🔴", body: "Tap the Live tab to drop into real-time auctions. Highest bid when the timer hits zero takes the card home." },
      { title: "Shop the Market 🛒", body: "Buy It Now, place bids, or send a custom offer. Saved payment methods make checkout one-tap." },
      { title: "Build your Vault 🔒", body: "Every card you scan or buy lives in your Vault with live market value. Flex it whenever you want!" },
      { title: "Follow your faves ⭐", body: "Follow sellers and we'll ping you the moment they go live. You'll never miss a drop." },
    ],
  },
  "buyer-first-live": {
    id: "buyer-first-live",
    mascot: "buyer",
    steps: [
      { title: "Welcome to the show! 🎬", body: "This is a live auction. The seller is showing cards in real time." },
      { title: "Bidding 101 💸", body: "Tap the bid button to raise by the minimum increment. The timer extends if someone bids near the end." },
      { title: "Buy It Now ⚡", body: "See a BIN price? Tap it to skip the auction and lock in instantly." },
      { title: "Win & ship 📦", body: "When you win, we charge your card and the seller prints a label. Track everything from your Orders." },
    ],
  },
  "buyer-first-flex": {
    id: "buyer-first-flex",
    mascot: "flex",
    steps: [
      { title: "Yo! I'm Krome 🦖🔥", body: "Welcome to Flex Live — pure community, zero auctions. Just collectors hyping cards together." },
      { title: "Hop on cam 📸", body: "Hosts can invite you to join their stream. Wave at the chat to get noticed!" },
      { title: "Stay safe 🛡️", body: "AI watches every stream for bad vibes. Verified-only hosts means real people, real cards." },
    ],
  },
  "buyer-first-giveaway": {
    id: "buyer-first-giveaway",
    mascot: "buyer",
    steps: [
      { title: "Ooo a giveaway! 🎁", body: "Tap to enter — the host will spin the wheel and pick a winner live." },
    ],
  },

  // ── SELLER ───────────────────────────────────────────────────────────────
  "seller-welcome": {
    id: "seller-welcome",
    mascot: "seller",
    steps: [
      { title: "I'm Vexa. Let's get you live.", body: "I run the Seller Hub. I'll keep things tight — auctions, shipping, payouts. Ready?" },
      { title: "Going Live 📡", body: "Hit Sell → Live, set your title and starting bid, and pick OBS, mobile, or multi-cam in-browser." },
      { title: "OBS / RTMPS setup ⚙️", body: "Copy your Stream Key + RTMPS URL into OBS. Bitrate 4500kbps, 1080p30. I'll show the keys when you create the stream." },
      { title: "Auction controls 🎛️", body: "Scan a card to instantly list it. Tap Add Time, Lock Bids, or End early. Voice triggers work too — say 'sold' or 'next card'." },
      { title: "Ship it fast 📦", body: "Shippo prints labels automatically. Set shipping presets once and every order auto-fills." },
      { title: "Get paid 💳", body: "Stripe Connect handles payouts. Funds land 2 days after delivery confirmation. Track everything in Payouts." },
    ],
  },
  "seller-first-stream": {
    id: "seller-first-stream",
    mascot: "seller",
    steps: [
      { title: "First stream — let's nail it.", body: "Pre-flight: good lighting, quiet room, cards organized within reach." },
      { title: "Scan to list ⚡", body: "Tap the scanner — AI IDs the card and prefills price + condition. Confirm and it's live as the next auction." },
      { title: "Quantity auctions 🃏", body: "Selling a slab pack or multiple? Set quantity > 1 — top N bidders all win at the clearing price." },
      { title: "Voice control 🎙️", body: "Hands busy? Say the trigger words to add time, sell, or move on. Toggle in stream settings." },
    ],
  },
  "seller-first-collab": {
    id: "seller-first-collab",
    mascot: "seller",
    steps: [
      { title: "Bringing on a co-host 🤝", body: "Tap approve and they join the cam grid. Up to 4 guests on screen with sub-200ms latency." },
      { title: "Multi-cam mode 🎥", body: "If your stream is in Multi-cam mode, viewers see all guest tiles baked into the broadcast — no overlay drift." },
    ],
  },
  "seller-first-order": {
    id: "seller-first-order",
    mascot: "seller",
    steps: [
      { title: "First sale! 🎉", body: "Head to Orders. Hit 'Print label' — Shippo handles the rest. Pack it in 48h to keep your seller score green." },
    ],
  },

  // ── FLEX ─────────────────────────────────────────────────────────────────
  "flex-welcome": {
    id: "flex-welcome",
    mascot: "flex",
    steps: [
      { title: "FLEX LIVE TIME 🔥", body: "I'm Krome. This is where collectors hang out — show off pulls, trade hype, build the squad." },
      { title: "Public or Private 🌐🔒", body: "Public = anyone can watch. Private = invite-only link. Both safe, both fire." },
      { title: "Invite the crew 👥", body: "Tag verified users to bring them on cam. They tap accept, they're in the grid." },
      { title: "Approving collabs ✅", body: "Viewers can request to join. Tap the green check to bring 'em up, red X to keep it chill." },
      { title: "Safety first 🛡️", body: "AI moderation runs 24/7 — slurs, nudity, scams get nuked. Verified-only hosts means no bots." },
    ],
  },

  "flex-live-screen": {
    id: "flex-live-screen",
    mascot: "flex",
    steps: [
      { title: "Welcome to your Flex room 🎉", body: "I'm Krome. Quick tour — tap Skip any time, I won't show this again." },
      { title: "Weekly Vibe ✨", body: "Top banner = this week's theme. Match it for bonus reactions and shoutouts." },
      { title: "Reactions 💜🔥", body: "Tap any emoji to send a floating burst over the video. Spam-friendly!" },
      { title: "AI Filters 🪄", body: "Hosts: tap Filter to drop anime, comic, glow-skin, VHS, cyber, and more — viewers see it instantly." },
      { title: "Collab tab 👥", body: "Up to 6 co-hosts. Invite verified friends or approve join requests right from the panel." },
      { title: "Settings ⚙️", body: "Slow chat, manage co-hosts (add/remove), and toggle requests — all Flex-specific, no auction stuff." },
      { title: "Full screen ⛶", body: "Tap 'Full-screen vibe' above the reactions to hide every panel and just enjoy the cam." },
      { title: "End Flex 🛑", body: "Done? Tap End Flex. You can pause for up to 3h with a custom 'be right back' message." },
    ],
  },
  "auction-live-screen": {
    id: "auction-live-screen",
    mascot: "buyer",
    steps: [
      { title: "Live auction tour 🎬", body: "I'm Hoshi! Quick walk-through — Skip any time, this won't pop up again." },
      { title: "Current Bid 💸", body: "Big number at the bottom = current bid. Tap +$1/+$5/+$10/+$25 to jump fast." },
      { title: "Hold to bid ⏳", body: "Press and hold the red button — the longer you hold, the higher you bid. Release to submit." },
      { title: "Snipe ⚡", body: "If the host sets a Snipe price, you can buy-now and skip the timer entirely." },
      { title: "Shout-out 📣", body: "Tip the host to get your name read on stream. Capped at $50 per stream — keeps it fun." },
      { title: "Timer 🕒", body: "Bursts huge in the last 5s. Last-second bids extend it (snipe protection)." },
      { title: "Chat & tags 💬", body: "Type @ to mention users. Tap a username to follow / report / DM." },
      { title: "Win & ship 📦", body: "Win? We auto-charge your saved card and the seller prints a label. Track from Orders." },
    ],
  },
  "obs-connect": {
    id: "obs-connect",
    mascot: "seller",
    steps: [
      { title: "OBS Connect Hub 🎥", body: "I'm Vexa. Let's get OBS hooked up in under a minute — tap Skip to do it yourself." },
      { title: "One-tap profile 📥", body: "Tap 'Download OBS profile'. It pre-fills your server + stream key — zero typing." },
      { title: "Import in OBS ⚙️", body: "Open OBS → Profile menu → Import → pick the .ini file you just downloaded. Done." },
      { title: "Or copy + paste 📋", body: "Prefer manual? Tap 'Copy both' and paste into OBS → Settings → Stream (Service: Custom)." },
      { title: "Recommended encode 📺", body: "1080p · 30fps · 4500 kbps · keyframe 2s · x264. Hit Start Streaming in OBS — you're live." },
    ],
  },
};

export const MASCOT_NAMES = ["Hoshi", "Vexa", "Krome"] as const;
