import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/store")({
  component: StoreLayout,
});

function StoreLayout() {
  return <Outlet />;
}