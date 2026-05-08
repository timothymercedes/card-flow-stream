// Real-app tutorial scripts. Every `target` MUST resolve to a data-tour anchor
// in the live app — overlays are positioned from the element's bounding rect.

const A = process.env.PBL_AUCTION_ID || "";
const H = process.env.PBL_HOST_STREAM_ID || "";

export const scenes = {
  bid: [
    { goto: "/", voice: "This is PullBidLive. Tap any live show to drop into a real auction." },
    { goto: `/live/${A}`, wait: '[data-tour="hold-bid"]', voice: "We're now inside a real live auction." },
    { label: "Seller name & item",      target: '[data-tour="viewer-count"]', voice: "Up top you see how many people are watching right now." },
    { label: "Auction timer",           target: '[data-tour="timer"]',        voice: "This is the countdown. When it drops under five seconds, late bids extend it." },
    { label: "Pin item",                target: '[data-tour="pin-item"]',     voice: "Tap pin to keep the auction visible while you scroll the chat." },
    { label: "Quick bid chips",         target: '[data-tour="bid-controls"]', voice: "Tap a chip to bump the bid by one, five, ten, or twenty-five dollars." },
    { label: "Hold to bid (Max Bid)",   target: '[data-tour="hold-bid"]', click: false, voice: "Press and hold the red button. The longer you hold, the higher your max bid goes — release to fire." },
    { label: "Buy It Now",              target: '[data-tour="bin-button"]', click: false, voice: "If the seller posted a Buy-It-Now price, hit this yellow strip to win the card instantly." },
    { label: "Chat",                    target: '[data-tour="chat"]', voice: "Type @ to tag another viewer. Hosts moderate from the same chat." },
    { goto: "/cart", voice: "When the auction ends in your favour, the card lands in your cart for one-tap checkout." },
    { goto: "/orders", voice: "Track shipping and payment confirmation right here under Orders." },
  ],

  host: [
    { goto: "/sell", wait: '[data-tour="start-stream"]', voice: "This is the Seller Hub — where every live show begins." },
    { label: "Stream title",         target: '[data-tour="stream-title"]', voice: "Give the show a title — keep it punchy." },
    { label: "OBS Hub",              target: '[data-tour="obs-hub-link"]', click: false, voice: "If you stream from OBS, grab your stream key from the OBS Hub." },
    { label: "Start Live",           target: '[data-tour="start-stream"]', click: false, voice: "Hit Start Live to provision a Cloudflare ingest and go on air." },
    H ? { goto: `/live/${H}`, wait: '[data-tour="timer"]', voice: "Once you're live, your show looks exactly like this." } : null,
    H ? { label: "Pin item",         target: '[data-tour="pin-item"]', voice: "Pin the active card so viewers always see what's up for grabs." } : null,
    H ? { label: "Add product / Start auction", target: '[data-tour="bid-controls"]', voice: "Set the start price and timer, then start the round." } : null,
    H ? { label: "Moderate chat",    target: '[data-tour="chat"]', voice: "Tap any viewer in chat to mute or ban them in one tap." } : null,
    { goto: "/store?tab=orders", voice: "After the show, fulfil orders and print Shippo labels straight from the Seller Hub." },
    { goto: "/store?tab=payouts", voice: "Stripe Connect handles payouts automatically once the buyer marks the card delivered." },
  ].filter(Boolean),

  "seller-hub": [
    { goto: "/store",            voice: "The Seller Hub has every tab a host needs." },
    { goto: "/store?tab=listings", voice: "Listings — your live inventory." },
    { goto: "/store?tab=orders",   voice: "Orders — print labels and add tracking." },
    { goto: "/store?tab=shipping", voice: "Shipping — set defaults and the Pull-Win-Eligible rules." },
    { goto: "/store?tab=payouts",  voice: "Payouts — see every Stripe Connect transfer." },
  ],
};
