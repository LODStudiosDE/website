import { ChevronRight, LayoutGrid } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories, type TebexPackage } from "@/lib/tebex";
import { useT } from "@/lib/i18n";

export function FeaturedCarousel({
  showHeader = true,
  limit = 8,
}: { showHeader?: boolean; limit?: number } = {}) {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["tebex", "categories"],
    queryFn: () => fetchCategories(true),
    staleTime: 1000 * 60 * 5,
  });

  const items: TebexPackage[] = (() => {
    if (!data) return [];
    const map = new Map<number, TebexPackage>();
    for (const c of data) for (const p of c.packages ?? [])
      if (p.type !== "subscription" && !map.has(p.id)) map.set(p.id, p); // subscriptions are not products
    return Array.from(map.values())
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, limit);
  })();

  return (
    <div className="relative w-full">
      {showHeader && (
        <div className="mb-5 flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <span className="h-px w-6 bg-[#FF3B3B]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80">
              {t("store.carousel.latestProducts")}
            </span>
          </div>
          <Link
            to="/store"
            className="group flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FF3B3B] transition-opacity hover:opacity-80"
          >
            {t("store.carousel.viewAll")}
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </Link>
        </div>
      )}

      <div className="no-scrollbar -mx-2 flex gap-4 overflow-x-auto px-2 pb-1">
        {isLoading && items.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[135px] w-[280px] flex-shrink-0 animate-pulse rounded-sm border border-white/10 bg-[#111827]"
              />
            ))
          : items.map((item, i) => {
              const img =
                item.image ||
                item.media?.find((m) => m.primary)?.url ||
                item.media?.[0]?.url ||
                "";
              return (
                <Link
                  key={item.id}
                  to="/store/$packageId"
                  params={{ packageId: String(item.id) }}
                  className="group relative h-[135px] w-[280px] flex-shrink-0 overflow-hidden rounded-sm border border-white/10 bg-[#111827] transition-all duration-500 hover:border-[#FF3B3B]/50"
                  style={{
                    animation: `fade-up 0.8s ${0.1 * i + 0.3}s cubic-bezier(0.16,1,0.3,1) both`,
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={item.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-white/20">
                      <LayoutGrid className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F18] via-[#0A0F18]/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#FF3B3B]">
                      {item.category.name}
                    </div>
                    <h3 className="line-clamp-1 text-sm font-semibold text-white">
                      {item.name}
                    </h3>
                  </div>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
