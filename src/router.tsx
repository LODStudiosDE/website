import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { routeTree } from "./routeTree.gen";

// Shown the instant a navigation starts while the target route's data loads.
function PendingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0C0C0D] text-white/60">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF3B3B]" />
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload a route's data as soon as the user hovers/touches its link, so the
    // actual click switches pages instantly instead of waiting on the loader.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // By default the router keeps showing the OLD page for up to 1s while a
    // loader runs before revealing any pending UI — that reads as "nothing
    // happens" after a click. Switch to the new route's pending state at once.
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: PendingScreen,
  });

  return router;
};
