import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/trades")({
  component: TradesLayout,
});

function TradesLayout() {
  return <Outlet />;
}
