/**
 * shareEntity — canonical model for any shareable thing on PullBidLive.
 *
 * Every share button on the platform funnels through buildShareUrl() so the
 * URL, title, and description are consistent across in-app share, system
 * share, and external destinations (FB, X, WhatsApp, etc.).
 */

const SITE = "https://pullbidlive.com";

export type ShareEntity =
  | { kind: "live"; id: string; title?: string; seller?: string | null; thumbnail?: string | null }
  | { kind: "stream"; id: string; title?: string; seller?: string | null; thumbnail?: string | null }
  | { kind: "show"; id: string; title?: string; seller?: string | null; thumbnail?: string | null }
  | { kind: "listing"; id: string; title?: string; price?: string | number | null; image?: string | null }
  | { kind: "storefront"; username: string; displayName?: string | null; avatar?: string | null }
  | { kind: "profile"; username: string; displayName?: string | null; avatar?: string | null }
  | { kind: "post"; id: string; author?: string | null; excerpt?: string | null; image?: string | null }
  | { kind: "clip"; id: string; title?: string | null; thumbnail?: string | null }
  | { kind: "story"; id: string; author?: string | null; image?: string | null }
  | { kind: "url"; href: string; title?: string; description?: string };

export function buildSharePath(e: ShareEntity): string {
  switch (e.kind) {
    case "live":
      return `/live/${e.id}`;
    case "stream":
    case "show":
      return `/shows/${e.id}`;
    case "listing":
      return `/market/${e.id}`;
    case "storefront":
      return `/store/${e.username}`;
    case "profile":
      return `/@${e.username}`;
    case "post":
      return `/feed?post=${e.id}`;
    case "clip":
      return `/showoff?clip=${e.id}`;
    case "story":
      return `/stories?s=${e.id}`;
    case "url":
      return e.href.startsWith("http") ? e.href : e.href;
  }
}

export function buildShareUrl(e: ShareEntity): string {
  const path = buildSharePath(e);
  if (path.startsWith("http")) return path;
  // Prefer the current origin in dev/preview so links work without leaving the env.
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return `${SITE}${path}`;
}

export function buildShareTitle(e: ShareEntity): string {
  switch (e.kind) {
    case "live":
      return `📺 ${e.seller ? `@${e.seller} is LIVE — ` : "LIVE on PullBidLive — "}${e.title || "Live card auction"}`;
    case "stream":
    case "show":
      return `${e.title || "Upcoming live show"}${e.seller ? ` — @${e.seller}` : ""} on PullBidLive`;
    case "listing": {
      const p = e.price != null ? ` — ${typeof e.price === "number" ? `$${e.price.toFixed(2)}` : e.price}` : "";
      return `${e.title || "Card for sale"}${p} | PullBidLive`;
    }
    case "storefront":
      return `${e.displayName || `@${e.username}`}'s store on PullBidLive`;
    case "profile":
      return `${e.displayName || `@${e.username}`} on PullBidLive`;
    case "post":
      return `${e.author ? `@${e.author}` : "A post"} on PullBidLive`;
    case "clip":
      return `${e.title || "Clip"} — PullBidLive`;
    case "story":
      return `${e.author ? `@${e.author}'s` : "A"} story on PullBidLive`;
    case "url":
      return e.title || "PullBidLive";
  }
}

export function buildShareDescription(e: ShareEntity): string {
  switch (e.kind) {
    case "live":
    case "stream":
    case "show":
      return "Watch the auction live, bid in realtime, and win cards on PullBidLive.";
    case "listing":
      return "Buy this card on PullBidLive — the live card auction marketplace.";
    case "storefront":
      return "Browse this seller's inventory and live shows on PullBidLive.";
    case "profile":
      return "See their collection, listings, and live shows on PullBidLive.";
    case "post":
    case "story":
      return e.kind === "post" && "excerpt" in e && e.excerpt ? e.excerpt : "On PullBidLive — live card auctions and the collector community.";
    case "clip":
      return "Watch this clip on PullBidLive.";
    case "url":
      return e.description || "PullBidLive — live card auctions.";
  }
}

export function buildShareImage(e: ShareEntity): string | null {
  switch (e.kind) {
    case "live":
    case "stream":
    case "show":
      return e.thumbnail || null;
    case "listing":
      return e.image || null;
    case "storefront":
    case "profile":
      return e.avatar || null;
    case "post":
      return e.image || null;
    case "clip":
      return e.thumbnail || null;
    case "story":
      return e.image || null;
    case "url":
      return null;
  }
}
