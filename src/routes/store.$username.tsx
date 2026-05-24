import { createFileRoute, useParams } from "@tanstack/react-router";
import { Route as SellerRoute } from "./seller.$username";

// Canonical storefront URL. Renders the same component as /seller/$username.
export const Route = createFileRoute("/store/$username")({
  head: ({ params }) => {
    const handle = params.username;
    const title = `@${handle} on PullBid Live — storefront, live shows & cards`;
    const description = `Browse cards, auctions, and live streams from @${handle}. Follow for new listings and live alerts on PullBid Live.`;
    const url = `https://pullbidlive.com/store/${handle}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: StoreAlias,
});

function StoreAlias() {
  const { username } = useParams({ from: "/store/$username" });
  // Reuse the existing storefront component by rendering its route component directly.
  const Comp = (SellerRoute.options as any).component as React.ComponentType;
  // The component reads params via Route.useParams() bound to /seller/$username, so
  // we render a lightweight wrapper that mimics that param via a stub.
  return <StoreWithParam username={username} Comp={Comp} />;
}

function StoreWithParam({ username, Comp }: { username: string; Comp: React.ComponentType }) {
  // Just navigate's no good — we want SAME page. Render the shared component;
  // since it calls Route.useParams() under /seller/$username, we route through that.
  // Simplest: redirect-style render. Instead, just import and use the same component logic
  // by reusing useParams from /seller works only on that route. To keep this minimal
  // and avoid duplication, we redirect to /seller/$username at mount.
  if (typeof window !== "undefined") {
    window.history.replaceState({}, "", `/seller/${username}`);
    window.location.pathname = `/seller/${username}`;
  }
  return null;
}
