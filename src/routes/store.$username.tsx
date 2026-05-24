import { createFileRoute, redirect } from "@tanstack/react-router";

// Canonical storefront URL. Redirects to the existing /seller/$username page,
// which now declares /store/$username as its canonical URL for SEO.
export const Route = createFileRoute("/store/$username")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/seller/$username", params: { username: params.username } });
  },
});
