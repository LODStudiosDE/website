import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Gift,
  ShoppingCart,
  Check,
  Loader2,
  ArrowRight,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  ExternalLink,
} from "lucide-react";

import { Navigation } from "@/components/Navigation";
import { stripHtml, type TebexPackage } from "@/lib/tebex";
import { categoriesQuery, packageQuery, seedPackage } from "@/lib/queries";
import { useCart } from "@/lib/cart-store";
import { showCartToast } from "@/components/CartToast";
import { ProductDescription } from "@/components/ProductDescription";
import { SubscriptionOffer } from "@/components/SubscriptionOffer";
import { findSubscriptionsForProduct, subscriptionVariants } from "@/lib/subscriptions";
import { Footer } from "@/components/Footer";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/store/$packageId")({
  loader: ({ context, params }) => {
    const id = Number(params.packageId);
    // Instant when the store list / home was visited: the package is copied
    // from the cached categories payload, so ensureQueryData resolves at once.
    seedPackage(context.queryClient, id);
    return context.queryClient.ensureQueryData(packageQuery(id));
  },
  head: ({ loaderData }) => {
    const p = loaderData as TebexPackage | undefined;
    const title = p ? `LODStudios | ${p.name}` : "LODStudios | Product";
    const desc = p ? stripHtml(p.description, 160) : "Premium FiveM asset.";
    const img =
      p?.image || p?.media?.find((m) => m.primary)?.url || p?.media?.[0]?.url || "";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        ...(img ? [{ property: "og:image", content: img }] : []),
      ],
    };
  },
  component: ProductPage,
  pendingComponent: () => (
    <div className="grid min-h-screen place-items-center bg-[#0C0C0D] text-white/60">
      <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
    </div>
  ),
  errorComponent: ({ reset }) => {
    const router = useRouter();
    const t = useT();
    return (
      <div className="grid min-h-screen place-items-center bg-[#0C0C0D] text-white">
        <div className="text-center">
          <p className="mb-4 text-white/70">{t("store.loading.failedProduct")}</p>
          <button
            onClick={() => {
              reset();
              router.invalidate();
            }}
            className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("store.loading.retry")}
          </button>
        </div>
      </div>
    );
  },
  notFoundComponent: () => {
    const t = useT();
    return (
      <div className="grid min-h-screen place-items-center bg-[#0C0C0D] text-white">
        {t("store.loading.notFound")}
      </div>
    );
  },
});

function ProductPage() {
  const t = useT();
  const { packageId } = Route.useParams();
  const { data: product } = useSuspenseQuery(packageQuery(Number(packageId)));

  // Non-blocking: discover subscription plans that include this product.
  const { data: categories } = useQuery(categoriesQuery);
  const subscriptionPackages = useMemo(() => {
    const subs = (categories ?? [])
      .flatMap((c) => c.packages ?? [])
      .filter((p) => p.type === "subscription");
    // De-duplicate by id (a plan can appear in multiple categories).
    return Array.from(new Map(subs.map((p) => [p.id, p])).values());
  }, [categories]);

  const matchedSubscriptions = useMemo(
    () => findSubscriptionsForProduct(product, subscriptionPackages),
    [product, subscriptionPackages],
  );

  // When THIS product is a subscription: its 1 / 2 / 3 month terms. Each term
  // is its own Tebex package, so prices and savings come from Tebex itself.
  const isSubscription = product.type === "subscription";
  const plan = useMemo(
    () => subscriptionVariants(product, subscriptionPackages),
    [product, subscriptionPackages],
  );
  const currentTerm = plan?.variants.find((v) => v.pkg?.id === product.id) ?? null;

  const gallery = useMemo(() => {
    const items: string[] = [];
    if (product.image) items.push(product.image);
    for (const m of product.media ?? []) {
      if (m.url && !items.includes(m.url)) items.push(m.url);
    }
    return items;
  }, [product]);

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomActive, setZoomActive] = useState(0);

  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const handleAddToCart = () => {
    setAdding(true);
    addItem({
      id: product.id,
      name: product.name,
      image: product.image ?? product.media?.[0]?.url ?? null,
      category: product.category?.name ?? t("store.product.category"),
      unitPrice: product.base_price,
      taxPerUnit: product.sales_tax,
      currency: product.currency,
    });
    showCartToast({
      name: product.name,
      image: product.image ?? product.media?.[0]?.url ?? null,
      category: product.category?.name ?? t("store.product.category"),
      unitPrice: product.total_price,
      currency: product.currency,
    });
    window.setTimeout(() => setAdding(false), 600);
  };

  const price = `€${product.total_price.toFixed(2)}`;

  const total = Math.max(gallery.length, 1);
  const next = () => setActive((i) => (i + 1) % total);
  const prev = () => setActive((i) => (i - 1 + total) % total);
  const zoomNext = () => setZoomActive((i) => (i + 1) % total);
  const zoomPrev = () => setZoomActive((i) => (i - 1 + total) % total);

  // Auto-advance slideshow
  useEffect(() => {
    if (paused || gallery.length <= 1) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % gallery.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [paused, gallery.length]);

  // Lock body scroll when zoom modal is open
  useEffect(() => {
    if (!zoomed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [zoomed]);


  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0C0C0D] text-white">
      <Navigation />


      <main className="relative mx-auto max-w-[1400px] px-6 pb-24 pt-32 lg:px-10">
        {/* Title block */}
        <header className="relative mb-10 border-b border-white/10 pb-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[#FF3B3B]/10 blur-[110px]"
          />
          <div className="relative min-w-0">
            <span className="mb-4 inline-flex items-center gap-2 rounded-sm border border-[#FF3B3B]/30 bg-[#FF3B3B]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF3B3B]">
              {product.category?.name ?? "Product"}
            </span>
            <h1 className="font-display text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[1] tracking-tight text-white">
              {/* Subscriptions: the term lives in the selector, not in the title. */}
              {plan?.base ?? product.name}
            </h1>
          </div>
        </header>

        {/* Main grid */}
        <div className="mb-20 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* ===== LEFT (8 cols): Gallery + Tabs ===== */}
          <div className="space-y-12 lg:col-span-8">
            {/* Slideshow */}
            <div
              className="relative"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <div className="relative overflow-hidden rounded-sm border border-white/10 bg-black/40 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
                <div className="relative aspect-[16/10] w-full">
                  {gallery.length > 0 ? (
                    gallery.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`${product.name} Slide ${i + 1}`}
                        // Plan artwork is near-square box art: show it whole instead
                        // of cropping it into the wide screenshot frame.
                        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ease-out ${
                          isSubscription ? "object-contain p-4 sm:p-6" : "object-cover"
                        } ${i === active ? "opacity-100" : "opacity-0"}`}
                        draggable={false}
                      />
                    ))
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-white/40">
                      {t("store.product.noImage")}
                    </div>
                  )}

                  {gallery.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setZoomLevel(1);
                        setZoomActive(active);
                        setZoomed(true);
                      }}
                      aria-label="Zoom image"
                      className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-sm border border-white/20 bg-black/55 text-white/90 backdrop-blur-sm transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/20"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {gallery.length > 1 && (
                <div className="mt-6 flex items-center justify-center gap-5">
                  <button
                    onClick={prev}
                    aria-label="Previous slide"
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/80 transition hover:bg-[#FF3B3B] hover:text-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="flex items-center gap-2">
                    {gallery.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActive(i)}
                        aria-label={`Go to slide ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i === active
                            ? "w-8 bg-[#FF3B3B]"
                            : "w-1.5 bg-white/25 hover:bg-white/50"
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={next}
                    aria-label="Next slide"
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/80 transition hover:bg-[#FF3B3B] hover:text-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            <section className="relative overflow-hidden rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.035] to-white/[0.01] p-6 sm:p-9">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#FF3B3B]/10 blur-[100px]"
              />
              <div className="relative">
                <ProductDescription html={product.description} title={product.name} />
              </div>
            </section>
          </div>

          {/* ===== RIGHT (4 cols): Buy + Support + Tech ===== */}
          <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-28 lg:self-start">
            {/* Buy panel */}
            <div className="rounded-sm border border-white/10 bg-[#151516] p-6">
              <div className="hidden" />

              <h2 className="mt-3 font-display text-[22px] font-bold leading-tight text-white">
                {plan?.base ?? product.name}
              </h2>

              {/* Subscription term: 1 / 2 / 3 months. Every term is its own Tebex
                  package, so choosing one simply opens that package's page. */}
              {plan && plan.variants.filter((v) => v.pkg).length > 1 && (
                <div className="mt-5">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                    {t("store.subterm.title")}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {plan.variants.map((v) => {
                      const selected = v.pkg?.id === product.id;
                      const label = t(v.months === 1 ? "store.subterm.month" : "store.subterm.months").replace(
                        "{n}",
                        String(v.months),
                      );
                      const base =
                        "relative flex h-[58px] flex-col items-center justify-center rounded-sm border px-1 text-center transition";
                      if (!v.pkg) {
                        return (
                          <div
                            key={v.months}
                            aria-disabled="true"
                            title={t("store.subterm.unavailable")}
                            className={`${base} cursor-not-allowed border-white/[0.06] bg-white/[0.015] text-white/25`}
                          >
                            <span className="text-[12px] font-bold">{label}</span>
                            <span className="mt-0.5 text-[9px] uppercase tracking-[0.1em]">
                              {t("store.subterm.unavailable")}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <Link
                          key={v.months}
                          to="/store/$packageId"
                          params={{ packageId: String(v.pkg.id) }}
                          replace
                          resetScroll={false}
                          preload="render"
                          aria-current={selected ? "true" : undefined}
                          className={`${base} ${
                            selected
                              ? "border-[#FF3B3B] bg-[#FF3B3B]/10 text-white"
                              : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
                          }`}
                        >
                          <span className="text-[12px] font-bold">{label}</span>
                          <span className="mt-0.5 text-[11px] text-white/55">
                            €{v.pkg.total_price.toFixed(2)}
                          </span>
                          {v.savePercent > 0 && (
                            <span className="absolute -right-1.5 -top-2 rounded-sm bg-[#FF3B3B] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white">
                              -{v.savePercent}%
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              <div suppressHydrationWarning className="mt-5 border-y border-white/10 py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-[32px] font-bold tracking-tight text-white">
                    {price}
                  </span>
                  {currentTerm && currentTerm.savePercent > 0 && currentTerm.regularTotal != null && (
                    <span className="text-[15px] text-white/35 line-through">
                      €{currentTerm.regularTotal.toFixed(2)}
                    </span>
                  )}
                  <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                    {currentTerm && !currentTerm.perMonth
                      ? currentTerm.months === 1
                        ? t("store.subterm.forMonth")
                        : t("store.subterm.forMonths").replace("{n}", String(currentTerm.months))
                      : isSubscription
                        ? t("store.sub.perMonth")
                        : t("store.product.oneTime")}
                  </span>
                </div>

                {currentTerm && currentTerm.savePercent > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-sm border border-[#FF3B3B]/30 bg-[#FF3B3B]/[0.08] px-3 py-2">
                    <span className="shrink-0 rounded-sm bg-[#FF3B3B] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                      {t("store.subterm.save").replace("{pct}", String(currentTerm.savePercent))}
                    </span>
                    <span className="text-[12px] leading-snug text-white/70">
                      {t("store.subterm.discountNote")
                        .replace("{pct}", String(currentTerm.savePercent))
                        .replace("{n}", String(currentTerm.months))}
                    </span>
                  </div>
                )}

                {currentTerm && currentTerm.months > 1 && !currentTerm.perMonth && (
                  <div className="mt-2 text-[11px] text-white/40">
                    {t("store.subterm.perMonthEq").replace(
                      "{price}",
                      `€${(product.total_price / currentTerm.months).toFixed(2)}`,
                    )}
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={handleAddToCart}
                  disabled={adding}
                  className="group relative inline-flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-sm bg-[#FF3B3B] text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[#D63030] hover:shadow-[0_0_40px_rgba(255,59,59,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,1)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
                  />
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {adding ? (
                      <>
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                        {t("store.product.added")}
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4" />
                        {t("store.product.addToCart")}
                      </>
                    )}
                  </span>
                </button>
                <button
                  aria-label={t("store.product.gift")}
                  className="grid h-12 w-12 place-items-center rounded-sm border border-white/15 bg-white/[0.03] text-white/80 transition hover:border-[#FF3B3B] hover:text-[#FF3B3B]"
                >
                  <Gift className="h-5 w-5" />
                </button>
              </div>

              <Link
                to="/store"
                className="group relative mt-3 inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-sm border border-white/15 bg-transparent text-[11px] font-bold uppercase tracking-[0.2em] text-white/85 transition hover:border-[#FF3B3B]/50 hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.35)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
                />
                <span className="relative z-10 inline-flex items-center gap-2">
                  {t("store.product.browseStore")}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              </Link>
            </div>


            {/* Subscription promo — shown only when this product is part of a plan */}
            <SubscriptionOffer productName={product.name} subscriptions={matchedSubscriptions} />

            {/* Support card */}
            <div className="rounded-sm border border-white/10 bg-gradient-to-br from-[#151516] to-[#0C0C0D] p-6">
              <h3 className="font-display text-[18px] font-bold leading-tight text-white">
                {t("store.product.needAssistance")}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/55">
                {t("store.product.assistanceLead")}
              </p>
              <a
                href="https://discord.gg/lodstudio"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative mt-5 inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-sm border border-white/10 bg-white/5 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-[#FF3B3B]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.35)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
                />
                <span className="relative z-10 inline-flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  {t("store.product.getSupport")}
                </span>
              </a>
            </div>

            {/* Technical details */}
            <div className="space-y-4 pt-2">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                {t("store.tech.title")}
              </h4>
              <div className="space-y-px overflow-hidden rounded-sm border border-white/10">
                <TechRow label={t("store.tech.category")} value={product.category?.name ?? t("store.tech.dash")} />
                <TechRow label={t("store.tech.framework")} value={t("store.tech.frameworkValue")} />
                <TechRow
                  label={t("store.tech.license")}
                  value={t(isSubscription ? "store.tech.licenseValueSub" : "store.tech.licenseValue")}
                />
                <TechRow
                  label={t("store.tech.delivery")}
                  value={t("store.tech.deliveryValue")}
                  href="https://portal.cfx.re"
                  highlight
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {[product.category?.name, t("store.tech.badgePremium"), t("store.tech.badgeStandalone")]
                  .filter(Boolean)
                  .map((t) => (
                    <span
                      key={t as string}
                      className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60"
                    >
                      {t}
                    </span>
                  ))}
              </div>
            </div>
          </aside>
        </div>

      </main>

      <Footer />



      {zoomed && gallery.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomed(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-sm border border-white/10 bg-[#0C0C0D] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-[#151516] px-6 py-4">
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF3B3B]">
                  {t("store.zoom.preview")}
                </span>
                <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                  {String(zoomActive + 1).padStart(2, "0")} / {String(gallery.length).padStart(2, "0")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setZoomed(false)}
                aria-label={t("store.zoom.close")}
                className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 text-white/80 transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Image area */}
            <div className="relative flex-1 overflow-auto bg-black/40">
              <div className="flex min-h-full items-center justify-center p-6">
                <img
                  src={gallery[zoomActive]}
                  alt={`${product.name} Slide ${zoomActive + 1}`}
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center" }}
                  className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
                  draggable={false}
                />
              </div>
            </div>

            {/* Footer controls */}
            <div className="grid grid-cols-3 items-center gap-4 border-t border-white/10 bg-[#151516] px-6 py-4">
              <div />
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={zoomPrev}
                  aria-label={t("store.zoom.previous")}
                  className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 text-white/80 transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  {gallery.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setZoomActive(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        i === zoomActive
                          ? "w-6 bg-[#FF3B3B]"
                          : "w-1.5 bg-white/25 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={zoomNext}
                  aria-label={t("store.zoom.next")}
                  className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 text-white/80 transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-end gap-2">

                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  aria-label={t("store.zoom.zoomOut")}
                  className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 text-white/80 transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-white"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <div className="min-w-[52px] text-center text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                  aria-label={t("store.zoom.zoomIn")}
                  className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 text-white/80 transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-white"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

function TechRow({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  href?: string;
}) {
  const valueClass = `font-semibold ${highlight ? "text-[#FF3B3B]" : "text-white"}`;
  return (
    <div className="flex items-center justify-between bg-[#151516] px-4 py-3 text-[12px]">
      <span className="text-white/45">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${valueClass} inline-flex items-center gap-1.5 transition hover:underline`}
        >
          {value}
          <ExternalLink className="h-3 w-3 text-[#FF3B3B]" />
        </a>
      ) : (
        <span className={valueClass}>{value}</span>
      )}
    </div>
  );
}

