import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/collection")({
  component: CollectionLayout,
});

function CollectionLayout() {
  return <Outlet />;
}
