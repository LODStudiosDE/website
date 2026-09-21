import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/jobs")({
  component: JobsLayout,
});

function JobsLayout() {
  return <Outlet />;
}