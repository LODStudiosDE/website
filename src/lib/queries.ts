// Shared React Query definitions for Tebex data, used by the router loaders
// and the page components so every route reads from the same cache.
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { fetchCategories, fetchPackage, peekPackage, type TebexCategory, type TebexPackage } from "./tebex";

const NO_REFETCH = {
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
};

export const categoriesQuery = queryOptions({
  queryKey: ["tebex", "categories"],
  queryFn: () => fetchCategories(true),
  ...NO_REFETCH,
});

export const packageQuery = (id: number) =>
  queryOptions({
    queryKey: ["tebex", "package", id],
    queryFn: () => fetchPackage(id),
    ...NO_REFETCH,
  });

/**
 * Make a product page render instantly: the categories payload already carries
 * the full package objects (description, media, prices), so if it's in the
 * query cache (store list / home visited) or in the tebex memory cache, copy
 * the package into its own query key. No network round-trip needed.
 */
export function seedPackage(queryClient: QueryClient, id: number): TebexPackage | undefined {
  const key = packageQuery(id).queryKey;
  const existing = queryClient.getQueryData<TebexPackage>(key);
  if (existing) return existing;

  const cats = queryClient.getQueryData<TebexCategory[]>(categoriesQuery.queryKey);
  let pkg: TebexPackage | undefined;
  if (cats) {
    for (const c of cats) {
      pkg = (c.packages ?? []).find((p) => p.id === id);
      if (pkg) break;
    }
  }
  pkg ??= peekPackage(id);

  if (pkg) queryClient.setQueryData(key, pkg);
  return pkg;
}
