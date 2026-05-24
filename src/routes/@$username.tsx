import { createFileRoute, redirect } from "@tanstack/react-router";

// Short alias: /@username → /seller/username
export const Route = createFileRoute("/@$username")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/seller/$username", params: { username: params.username } });
  },
});
