import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Loader2,
  Home,
  Star,
  Columns2,
  Columns3,
  Columns4,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { showWishlistToast } from "@/components/WishlistToast";
import { useWishlist } from "@/lib/wishlist-store";
import { useTebexAuth } from "@/lib/tebex-auth";
import { notify as toast } from "@/components/Notify";
import { useT } from "@/lib/i18n";
import { formatPrice } from "@/lib/cart-store";
import {
  type TebexCategory,
  type TebexPackage,
} from "@/lib/tebex";

import { categoriesQuery } from "@/lib/queries";
import { normName, subscriptionPlanGroups } from "@/lib/subscriptions";

export const Route = createFileRoute("/store/")({
  head: () => ({
    meta: [
      { title: "LODStudios | Store" },
      {
        name: "description",
        content:
          "Browse premium FiveM MLOs, vehicles, maps, scripts and frameworks. High quality assets for the most immersive FiveM servers.",
      },
      { property: "og:title", content: "LODStudios | Store" },
      {
        property: "og:description",
        content: "Premium MLOs, Vehicles, Maps, Scripts and Frameworks for FiveM.",
      },
      { property: "og:url", content: "/store" },
    ],
    links: [{ rel: "canonical", href: "/store" }],
  }),
  // `/store?plan=<name>` opens the store with that subscription's "included in"
  // filter already ticked (used by "View plan" on /subscriptions): the list then
  // shows the products the plan includes. `?category=<id>` does the same for a
  // category. Both stay normal filters the visitor can untick or extend.
  validateSearch: (search: Record<string, unknown>): { category?: number; plan?: string } => {
    const out: { category?: number; plan?: string } = {};
    const id = Number(search.category);
    if (Number.isInteger(id) && id > 0) out.category = id;
    if (typeof search.plan === "string" && search.plan.trim()) out.plan = search.plan.trim();
    return out;
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesQuery),
  component: StorePage,
  pendingComponent: StoreLoading,
});

function StoreLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0C0C0D] text-white/60">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF3B3B]" />
    </div>
  );
}

const PAGE_SIZE = 12;

function StorePage() {
  const t = useT();
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const { category: linkedCategory, plan: linkedPlan } = Route.useSearch();
  // Read on the first render, so a link straight to a category is already
  // filtered in the server-rendered page — no flash of the unfiltered list.
  const [selectedCats, setSelectedCats] = useState<number[]>(
    linkedCategory ? [linkedCategory] : [],
  );
  // Subscription plans ticked in the "included in" filter, by normalised name.
  const [selectedPlans, setSelectedPlans] = useState<string[]>(
    linkedPlan ? [normName(linkedPlan)] : [],
  );
  const [page, setPage] = useState(1);

  // Following another category / plan link while already on /store re-applies it.
  useEffect(() => {
    setSelectedCats(linkedCategory ? [linkedCategory] : []);
    setSelectedPlans(linkedPlan ? [normName(linkedPlan)] : []);
    setPage(1);
  }, [linkedCategory, linkedPlan]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "popular" | "low" | "high">("newest");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [cols, setCols] = useState<2 | 3 | 4>(3);

  // Older Tebex baskets return to /store — forward to the cart result screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (status === "success" || status === "cancel") {
      window.location.replace(`/cart?checkout=${status}`);
    }
  }, []);

  // Flatten all packages from all categories
  const allPackages = useMemo(() => {
    const map = new Map<number, TebexPackage>();
    for (const cat of categories) {
      for (const pkg of cat.packages ?? []) {
        if (!map.has(pkg.id)) map.set(pkg.id, pkg);
      }
    }
    // Subscriptions are not store products: they live on the /subscriptions tab
    // and reach the store only through the "included in" plan filter.
    return Array.from(map.values()).filter((pkg) => pkg.type !== "subscription");
  }, [categories]);

  // Subscription plans and the products each one includes.
  const planGroups = useMemo(() => {
    const map = new Map<number, TebexPackage>();
    for (const cat of categories) for (const pkg of cat.packages ?? []) map.set(pkg.id, pkg);
    return subscriptionPlanGroups(Array.from(map.values())).filter((g) => g.included.length > 0);
  }, [categories]);

  const priceBounds = useMemo(() => {
    return { min: 0, max: 500 };
  }, []);

  // Typewriter placeholder cycling through MLO names
  const mloNames = useMemo(() => {
    const mloCats = categories.filter((c) => /mlo/i.test(c.name));
    const source = mloCats.length > 0 ? mloCats.flatMap((c) => c.packages ?? []) : allPackages;
    const names = Array.from(new Set(source.map((p) => p.name.trim()).filter(Boolean)));
    // Shuffle once
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    return names;
  }, [categories, allPackages]);

  const [typedIdx, setTypedIdx] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [typingPhase, setTypingPhase] = useState<"typing" | "pausing" | "deleting">("typing");

  useEffect(() => {
    if (mloNames.length === 0) return;
    const current = mloNames[typedIdx % mloNames.length];
    let timeout: ReturnType<typeof setTimeout>;
    if (typingPhase === "typing") {
      if (typedText.length < current.length) {
        timeout = setTimeout(() => setTypedText(current.slice(0, typedText.length + 1)), 90);
      } else {
        timeout = setTimeout(() => setTypingPhase("pausing"), 1600);
      }
    } else if (typingPhase === "pausing") {
      timeout = setTimeout(() => setTypingPhase("deleting"), 800);
    } else {
      if (typedText.length > 0) {
        timeout = setTimeout(() => setTypedText(current.slice(0, typedText.length - 1)), 40);
      } else {
        const nextIdx = Math.floor(Math.random() * mloNames.length);
        setTypedIdx(nextIdx === typedIdx ? (nextIdx + 1) % mloNames.length : nextIdx);
        setTypingPhase("typing");
      }
    }
    return () => clearTimeout(timeout);
  }, [typedText, typingPhase, typedIdx, mloNames]);



  const visible = useMemo(() => {
    let list =
      selectedCats.length === 0
        ? allPackages
        : allPackages.filter((p) => selectedCats.includes(p.category.id));
    if (selectedPlans.length > 0) {
      const allowed = new Set<number>();
      for (const g of planGroups) {
        if (selectedPlans.includes(normName(g.base))) for (const p of g.included) allowed.add(p.id);
      }
      list = list.filter((p) => allowed.has(p.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    const minN = minPrice === "" ? null : Number(minPrice);
    const maxN = maxPrice === "" ? null : Number(maxPrice);
    if (minN !== null && !Number.isNaN(minN)) {
      list = list.filter((p) => p.total_price >= minN);
    }
    if (maxN !== null && !Number.isNaN(maxN)) {
      list = list.filter((p) => p.total_price <= maxN);
    }
    switch (sort) {
      case "low":
        list = [...list].sort((a, b) => a.total_price - b.total_price);
        break;
      case "high":
        list = [...list].sort((a, b) => b.total_price - a.total_price);
        break;
      case "newest":
        list = [...list].sort(
          (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
        );
        break;
      case "popular":
        list = [...list].sort((a, b) => a.order - b.order);
        break;
    }
    return list;
  }, [allPackages, selectedCats, selectedPlans, planGroups, search, sort, minPrice, maxPrice]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0C0C0D] text-white">
      <Navigation />

      {/* HEADER HERO */}
      <section className="relative h-[640px] w-full overflow-hidden">
        <HeroVideo
          src={import.meta.env.VITE_STORE_VIDEO_URL as string | undefined}
          videoId="Me2ATrIklJA"
          variant="store"
        />

        <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col items-center justify-center px-8 pt-20 text-center">
          <h1 className="font-display max-w-5xl text-[clamp(3rem,7vw,6.5rem)] font-bold leading-[1] tracking-tighter text-foreground drop-shadow-[0_4px_40px_rgba(0,0,0,0.55)]">
            {t("store.hero.title")}
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-foreground/80">
            {t("store.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* CONTENT GRID */}
      <section className="mx-auto max-w-[1600px] px-8 py-10">
        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          {/* FILTERS */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-xl bg-store-panel shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)]">
              <div className="flex items-center justify-between border-b border-store-panel-foreground/10 px-5 py-4">
                <span className="text-[15px] font-bold text-store-panel-foreground">
                  {t("store.filters.title")}
                </span>
                <button
                  onClick={() => {
                    setSelectedCats([]);
                    setSelectedPlans([]);
                    setSearch("");
                    setMinPrice("");
                    setMaxPrice("");
                    setPage(1);
                  }}
                  className="text-[13px] font-semibold text-store-accent hover:opacity-80"
                >
                  {t("store.filters.clearAll")}
                </button>
              </div>

              <FilterSection title={t("store.filters.category")} defaultOpen count={selectedCats.length + selectedPlans.length}>
                <div className="space-y-2">
                  <FilterCheckbox
                    id="cat-all"
                    label={t("store.filters.allAssets")}
                    checked={selectedCats.length === 0 && selectedPlans.length === 0}
                    onCheckedChange={() => {
                      setSelectedCats([]);
                      setSelectedPlans([]);
                      setPage(1);
                    }}
                    count={allPackages.length}
                  />
                  {/* Subscription plans sit in the list like categories: they filter to the products the plan includes. */}
                  {planGroups.length > 0 && (
                    <>
                      {planGroups.map((g) => {
                        const key = normName(g.base);
                        const checked = selectedPlans.includes(key);
                        return (
                          <FilterCheckbox
                            key={key}
                            id={"plan-" + key.replace(/ /g, "-")}
                            label={g.base}
                            checked={checked}
                            onCheckedChange={() => {
                              // One entry at a time: picking a plan replaces any category.
                              setSelectedCats([]);
                              setSelectedPlans(checked ? [] : [key]);
                              setPage(1);
                            }}
                            count={g.included.filter((p) => allPackages.some((a) => a.id === p.id)).length}
                          />
                        );
                      })}
                    </>
                  )}
                  {/* A category made only of subscriptions is covered by the plan entries above. */}
                  {categories
                    .filter((c) => !(c.packages?.length && c.packages.every((p) => p.type === "subscription")))
                    .map((c) => {
                    const checked = selectedCats.includes(c.id);
                    return (
                      <FilterCheckbox
                        key={c.id}
                        id={`cat-${c.id}`}
                        label={c.name}
                        checked={checked}
                        onCheckedChange={() => {
                          // One entry at a time: picking a category replaces any plan.
                          setSelectedPlans([]);
                          setSelectedCats(checked ? [] : [c.id]);
                          setPage(1);
                        }}
                        count={allPackages.filter((p) => p.category.id === c.id).length}
                      />
                    );
                  })}
                </div>
              </FilterSection>

              <FilterSection
                title={t("store.filters.priceRange")}
                defaultOpen
                count={(minPrice !== "" ? 1 : 0) + (maxPrice !== "" ? 1 : 0)}
              >
                {(() => {
                  const lo = priceBounds.min;
                  const hi = Math.max(priceBounds.max, lo + 1);
                  const curMin = minPrice === "" ? lo : Math.max(lo, Number(minPrice));
                  const curMax = maxPrice === "" ? hi : Math.min(hi, Number(maxPrice));
                  return (
                    <div className="space-y-4 pt-1">
                      <div className="flex items-center justify-between">
                        <div className="rounded-md border border-store-panel-foreground/10 bg-background px-2.5 py-1 text-[12px] font-semibold tabular-nums text-store-panel-foreground">
                          €{curMin.toFixed(0)}
                        </div>
                        <div className="rounded-md border border-store-panel-foreground/10 bg-background px-2.5 py-1 text-[12px] font-semibold tabular-nums text-store-panel-foreground">
                          €{curMax.toFixed(0)}
                        </div>
                      </div>

                      <SliderPrimitive.Root
                        value={[curMin, curMax]}
                        min={lo}
                        max={hi}
                        step={1}
                        minStepsBetweenThumbs={1}
                        onValueChange={([a, b]) => {
                          setMinPrice(a === lo ? "" : String(a));
                          setMaxPrice(b === hi ? "" : String(b));
                          setPage(1);
                        }}
                        className="relative flex w-full touch-none select-none items-center py-2"
                      >
                        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-store-panel-foreground/15">
                          <SliderPrimitive.Range className="absolute h-full bg-store-accent" />
                        </SliderPrimitive.Track>
                        <SliderPrimitive.Thumb
                          aria-label="Min price"
                          className="block h-4 w-4 rounded-full border-2 border-store-accent bg-background shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-store-accent),transparent_85%)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent"
                        />
                        <SliderPrimitive.Thumb
                          aria-label="Max price"
                          className="block h-4 w-4 rounded-full border-2 border-store-accent bg-background shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-store-accent),transparent_85%)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent"
                        />
                      </SliderPrimitive.Root>

                      <div className="flex items-center justify-between text-[11px] text-store-muted">
                        <span>
                          €{lo} – €{hi}
                        </span>
                        {(minPrice !== "" || maxPrice !== "") && (
                          <button
                            onClick={() => {
                              setMinPrice("");
                              setMaxPrice("");
                              setPage(1);
                            }}
                            className="font-semibold text-store-accent hover:opacity-80"
                          >
                            {t("store.filters.reset")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </FilterSection>
              <FilterSection title={t("store.filters.layout")} defaultOpen>
                <div className="flex items-center gap-2">
                  {(
                    [
                      { n: 2, Icon: Columns2 },
                      { n: 3, Icon: Columns3 },
                      { n: 4, Icon: Columns4 },
                    ] as const
                  ).map(({ n, Icon }) => {
                    const active = cols === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setCols(n)}
                        aria-label={t("store.filters.perRow", `${n} per row`).replace("{n}", String(n))}
                        title={t("store.filters.perRow", `${n} per row`).replace("{n}", String(n))}
                        className={`group relative flex h-11 flex-1 items-center justify-center overflow-hidden rounded-lg border transition-all ${
                          active
                            ? "border-store-accent bg-store-accent/10 text-store-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-store-accent),transparent_88%)]"
                            : "border-store-panel-foreground/10 bg-background text-store-panel-foreground/60 hover:border-store-accent/40 hover:text-store-panel-foreground"
                        }`}
                      >
                        <Icon
                          className="h-[18px] w-[18px] transition-transform group-hover:scale-110"
                          strokeWidth={active ? 2.25 : 1.75}
                        />
                      </button>
                    );
                  })}
                </div>
              </FilterSection>
              
            </div>
          </aside>

          {/* MAIN */}
          <div>
            {/* Toolbar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-store-muted">
                  {t("store.toolbar.sortBy")}
                </span>
                <div className="relative">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="appearance-none rounded-lg border border-store-panel-foreground/10 bg-store-panel py-2.5 pl-4 pr-10 text-[12px] font-medium text-store-panel-foreground transition-colors hover:border-store-accent/40 focus:border-store-accent focus:outline-none"
                  >
                    <option value="newest">{t("store.toolbar.sortNewest")}</option>
                    <option value="popular">{t("store.toolbar.sortPopular")}</option>
                    <option value="low">{t("store.toolbar.sortLowToHigh")}</option>
                    <option value="high">{t("store.toolbar.sortHighToLow")}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-store-muted" />
                </div>
              </div>

              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-store-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={mloNames.length > 0 ? t("store.toolbar.searchTry").replace("{name}", typedText) : t("store.toolbar.searchPlaceholder")}
                  className="w-full rounded-lg border border-store-panel-foreground/10 bg-store-panel py-2.5 pl-10 pr-4 text-[12px] text-store-panel-foreground placeholder:text-store-muted transition-colors hover:border-store-panel-foreground/20 focus:border-store-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Grid */}
            {pageItems.length === 0 ? (
              <div className="rounded-xl border border-store-panel-foreground/10 bg-store-panel py-20 text-center text-[13px] text-store-muted">
                {t("store.grid.empty")}
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                  cols === 2 ? "xl:grid-cols-2" : cols === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"
                }`}
              >
                {pageItems.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="relative mt-12 flex flex-wrap items-center justify-center gap-2">
                <PageBtn disabled={safePage === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </PageBtn>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <PageBtn key={n} active={n === safePage} onClick={() => setPage(n)}>
                    {n}
                  </PageBtn>
                ))}
                <PageBtn
                  disabled={safePage === pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </PageBtn>
                <span className="absolute right-0 top-1/2 hidden -translate-y-1/2 text-[11px] uppercase tracking-[0.2em] text-store-muted md:inline">
                  {t("store.pagination.showing")
                    .replace("{from}", String((safePage - 1) * PAGE_SIZE + 1))
                    .replace("{to}", String(Math.min(safePage * PAGE_SIZE, visible.length)))
                    .replace("{total}", String(visible.length))}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <div className="mt-10">
        <Footer />
      </div>
    </div>
  );
}


function ProductCard({ product, index }: { product: TebexPackage; index: number }) {
  const t = useT();
  const { has, toggle } = useWishlist();
  const { isAuthed, login } = useTebexAuth();
  const favorited = has(product.id);

  const img =
    product.image ||
    product.media?.find((m) => m.primary)?.url ||
    product.media?.[0]?.url ||
    "";

  const price = formatPrice(product.total_price, product.currency);

  const INFO_H = 28;

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Wishlists are tied to a CFX account so admins can see them — require login.
    if (!isAuthed) {
      toast.info("Bitte logge dich ein, damit deine Wunschliste gespeichert wird.");
      void login();
      return;
    }
    const added = toggle({
      id: product.id,
      name: product.name,
      image: img || null,
      category: product.category?.name ?? t("store.product.category"),
      price: product.total_price,
      basePrice: product.base_price,
      taxPerUnit: product.sales_tax,
      currency: product.currency,
    });
    if (added) {
      showWishlistToast({
        name: product.name,
        image: img || null,
        category: product.category?.name ?? t("store.product.category"),
        unitPrice: product.total_price,
        currency: product.currency,
      });
    }
  };

  return (
    <Link
      to="/store/$packageId"
      params={{ packageId: String(product.id) }}
      // Product data is seeded from the categories cache (no network), so
      // preloading every visible card's route on render is free and makes the
      // click switch instantly.
      preload="render"
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-store-panel-foreground/10 bg-store-panel transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
      style={{
        animation: `fade-up 0.6s ${index * 0.06}s cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      {/* ============== IMAGE ============== */}
      <div
        className="relative w-full overflow-hidden rounded-t-2xl bg-background"
        style={{
          aspectRatio: "16 / 9",
        }}
      >
        {img ? (
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground">
            <LayoutGrid className="h-10 w-10" />
          </div>
        )}

        {/* Wishlist star */}
        <button
          type="button"
          onClick={handleWishlist}
          aria-label={favorited ? t("store.product.wishlistRemove") : t("store.product.wishlistAdd")}
          title={favorited ? t("store.product.wishlistRemove") : t("store.product.wishlistAdd")}
          className={`absolute right-2.5 top-2.5 z-20 grid h-9 w-9 place-items-center rounded-full border backdrop-blur-md transition-all duration-300 ${
            favorited
              ? "border-store-accent bg-store-accent/20 text-store-accent"
              : "border-white/15 bg-black/35 text-white/80 hover:border-store-accent hover:text-store-accent"
          }`}
        >
          <Star
            className="h-[18px] w-[18px] transition-transform duration-300 hover:scale-110"
            strokeWidth={2}
            fill={favorited ? "currentColor" : "none"}
          />
        </button>

        {/* Bottom-left info strip */}
        <div
          className="absolute bottom-[-1px] left-0 z-10 flex max-w-full items-center"
          style={{ height: INFO_H }}
        >
          <div className="relative z-10 flex h-full min-w-0 items-center justify-center gap-1.5 bg-store-panel px-3 text-[11px] leading-none text-store-panel-foreground">
            <Home className="h-3.5 w-3.5 shrink-0 text-store-panel-foreground/80" />
            <span className="min-w-0 truncate leading-none">{product.category.name}</span>
          </div>
          <svg
            aria-hidden="true"
            viewBox="0 0 66 40"
            preserveAspectRatio="none"
            className="-ml-2 h-full w-[60px] shrink-0 text-store-panel"
          >
            <path
              fill="currentColor"
              d="M0 0H2C10.5 0 18.6 3.35 24.6 9.32L45 29.68C51 35.65 59.1 39 67.6 39H70V42H0Z"
            />
          </svg>
        </div>
      </div>

      {/* ============== FOOTER ============== */}
      <div className="mt-auto flex items-end justify-between gap-4 px-4 pb-3 pt-3">
        <h3 className="truncate text-[17px] font-medium leading-tight tracking-tight text-store-panel-foreground">
          {product.name}
        </h3>
        <div
          suppressHydrationWarning
          className="shrink-0 whitespace-nowrap text-right text-[14px] font-semibold tracking-tight text-store-panel-foreground/90"
        >
          {price}
        </div>
      </div>

    </Link>
  );
}


function FilterSection({
  title,
  defaultOpen = false,
  count = 0,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-store-panel-foreground/10 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-[13px] font-bold text-store-panel-foreground transition-colors hover:text-store-panel-foreground/80"
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[11px] font-medium text-store-muted">
              [{count}]
            </span>
          )}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-store-muted" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-store-muted" />
          )}
        </span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function FilterCheckbox({
  id,
  label,
  checked,
  onCheckedChange,
  count,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  count?: number;
}) {
  return (
    <label
      htmlFor={id}
      className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-store-panel-foreground/5"
    >
      <span className="flex items-center gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="h-4 w-4 rounded border-store-panel-foreground/30 bg-background data-[state=checked]:border-store-accent data-[state=checked]:bg-store-accent"
        />
        <span className={checked ? "text-store-panel-foreground" : "text-store-panel-foreground/70"}>
          {label}
        </span>
      </span>
      {count !== undefined && (
        <span className="text-[11px] tabular-nums text-store-muted">{count}</span>
      )}
    </label>
  );
}

function PageBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`grid h-9 w-9 place-items-center rounded-lg border text-[12px] font-semibold transition-all ${
        active
          ? "border-store-accent bg-store-accent text-store-accent-foreground shadow-[0_0_20px_color-mix(in_srgb,var(--color-store-accent),transparent_60%)]"
          : "border-store-panel-foreground/10 bg-store-panel text-store-panel-foreground/70 hover:border-store-accent/40 hover:text-store-panel-foreground"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
        {title}
      </h4>
      <ul className="mt-5 space-y-2.5">
        {items.map((i) => (
          <li key={i}>
            <a
              href="#"
              className="text-[13px] text-white/50 transition-colors hover:text-white"
            >
              {i}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
