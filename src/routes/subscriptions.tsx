import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Crown, Check, ShoppingCart, ArrowRight, Loader2, Sparkles, Layers } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { showCartToast } from "@/components/CartToast";
import { useCart, formatPrice } from "@/lib/cart-store";
import { useT } from "@/lib/i18n";
import { categoriesQuery } from "@/lib/queries";
import { stripHtml, type TebexPackage } from "@/lib/tebex";
import {
  SUBSCRIPTION_RULES,
  subscriptionVariants,
  type SubscriptionVariant,
} from "@/lib/subscriptions";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "LODStudios | Subscriptions" },
      {
        name: "description",
        content:
          "Every LODStudios subscription at a glance: unlock whole collections of premium FiveM MLOs with one monthly plan.",
      },
      { property: "og:title", content: "LODStudios | Subscriptions" },
      { property: "og:url", content: "/subscriptions" },
    ],
    links: [{ rel: "canonical", href: "/subscriptions" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesQuery),
  component: SubscriptionsPage,
  pendingComponent: SubscriptionsLoading,
});

function SubscriptionsLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0C0C0D] text-white/60">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF3B3B]" />
    </div>
  );
}

// One card per plan. The 1 / 2 / 3 month terms are separate Tebex packages
// (see subscriptions.ts); the card shows them as a selector, like the product
// page does, so the price shown is always the real Tebex price of that term.
type Plan = {
  base: string;
  /** The package the card is built from (shortest available term). */
  anchor: TebexPackage;
  /** Term variants, or null for a subscription without a "- N months" suffix. */
  variants: SubscriptionVariant[] | null;
  /** Store products this plan covers, from the coverage rules. */
  included: TebexPackage[];
};

function packageImage(pkg: TebexPackage): string | null {
  return pkg.image ?? pkg.media?.find((m) => m.primary)?.url ?? pkg.media?.[0]?.url ?? null;
}

function SubscriptionsPage() {
  const t = useT();
  const { data: categories } = useSuspenseQuery(categoriesQuery);

  const plans = useMemo((): Plan[] => {
    // A package can sit in several categories: de-duplicate by id first.
    const byId = new Map<number, TebexPackage>();
    for (const cat of categories) for (const p of cat.packages ?? []) byId.set(p.id, p);
    const all = Array.from(byId.values());
    const subs = all.filter((p) => p.type === "subscription");
    const singles = all.filter((p) => p.type === "single");

    const seen = new Set<string>();
    const out: Plan[] = [];
    for (const pkg of subs) {
      const plan = subscriptionVariants(pkg, subs);
      if (!plan) {
        out.push({ base: pkg.name, anchor: pkg, variants: null, included: [] });
        continue;
      }
      const key = plan.base.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const anchor = plan.variants.find((v) => v.pkg)?.pkg ?? pkg;
      // The rule is keyed by ONE of the plan's packages (its 1-month one).
      const ids = new Set(plan.variants.flatMap((v) => (v.pkg ? [v.pkg.id] : [])));
      const rule = SUBSCRIPTION_RULES.find((r) => ids.has(r.packageId));
      const included = rule
        ? singles.filter((s) => {
            const name = s.name.toLowerCase();
            return rule.keywords.some((k) => name.includes(k.toLowerCase()));
          })
        : [];
      out.push({ base: plan.base, anchor, variants: plan.variants, included });
    }
    return out.sort((a, b) => a.anchor.order - b.anchor.order);
  }, [categories]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0C0C0D] text-white">
      <Navigation />

      {/* HEADER HERO — same treatment as the store */}
      <section className="relative h-[640px] w-full overflow-hidden">
        <HeroVideo
          src={import.meta.env.VITE_STORE_VIDEO_URL as string | undefined}
          videoId="Me2ATrIklJA"
          variant="store"
        />
        <div className="absolute inset-0 z-[3] bg-gradient-to-b from-[#0C0C0D]/30 via-transparent to-[#0C0C0D]" />

        <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col items-center justify-center px-8 pt-20 text-center">
          <span className="mb-4 inline-flex items-center gap-2 border border-[#FF3B3B]/40 bg-[#FF3B3B]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
            <Crown className="h-3.5 w-3.5" />
            {t("subs.hero.eyebrow")}
          </span>
          <h1 className="font-display max-w-5xl text-[clamp(3rem,7vw,6.5rem)] font-bold leading-[1] tracking-tighter text-foreground drop-shadow-[0_4px_40px_rgba(0,0,0,0.55)]">
            {t("subs.hero.title")}
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-foreground/80">
            {t("subs.hero.subtitle")}
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1400px] px-6 pb-28 pt-4 lg:px-12">
        <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] font-bold tracking-tight text-white">
              {t("subs.plans.title")}
            </h2>
            <p className="mt-1 text-[14px] text-white/50">{t("subs.plans.sub")}</p>
          </div>
          <p className="flex items-center gap-1.5 text-[12px] text-white/35">
            <Sparkles className="h-3.5 w-3.5 text-[#FF3B3B]" />
            {t("subs.note")}
          </p>
        </div>

        {plans.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-24 text-center">
            <Crown className="h-8 w-8 text-white/25" />
            <p className="mt-4 max-w-sm text-sm text-white/45">{t("subs.empty")}</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan, i) => (
              <PlanCard key={plan.anchor.id} plan={plan} index={i} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function PlanCard({ plan, index }: { plan: Plan; index: number }) {
  const t = useT();
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const available = plan.variants?.filter((v) => v.pkg) ?? [];
  const bestMonths =
    available.reduce<SubscriptionVariant | null>(
      (best, v) => (v.savePercent > (best?.savePercent ?? 0) ? v : best),
      null,
    )?.months ?? null;
  const [months, setMonths] = useState<number>(available[0]?.months ?? 1);
  const term = available.find((v) => v.months === months) ?? available[0] ?? null;
  const pkg = term?.pkg ?? plan.anchor;

  const img = packageImage(plan.anchor);
  const description = stripHtml(plan.anchor.description ?? "", 150);
  const termLabel = (n: number) =>
    n === 1 ? t("subs.term.month") : t("subs.term.months").replace("{n}", String(n));

  const addToCart = () => {
    addItem({
      id: pkg.id,
      name: pkg.name,
      image: packageImage(pkg),
      category: t("store.sub.badge"),
      unitPrice: pkg.base_price,
      taxPerUnit: pkg.sales_tax,
      currency: pkg.currency,
    });
    showCartToast({
      name: pkg.name,
      image: packageImage(pkg),
      category: t("store.sub.badge"),
      unitPrice: pkg.total_price,
      currency: pkg.currency,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  };

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#151516] to-[#0E0E0F] transition-all duration-500 hover:-translate-y-1 hover:border-[#FF3B3B]/40 hover:shadow-[0_24px_60px_-20px_rgba(255,59,59,0.25)]"
      style={{ animation: `fade-up 0.6s ${index * 0.08}s cubic-bezier(0.16,1,0.3,1) both` }}
    >
      {/* Image */}
      <Link
        to="/store/$packageId"
        params={{ packageId: String(pkg.id) }}
        preload="render"
        className="relative block w-full overflow-hidden bg-[#0A0A0B]"
        style={{ aspectRatio: "16 / 9" }}
      >
        {img ? (
          <img
            src={img}
            alt={plan.base}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[#FF3B3B]/[0.06] text-[#FF3B3B]/60">
            <Crown className="h-12 w-12" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E0F] via-transparent to-transparent" />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-sm bg-[#FF3B3B] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_8px_24px_-8px_rgba(255,59,59,0.7)]">
          <Crown className="h-3 w-3" />
          {t("store.sub.badge")}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="font-display text-[22px] font-bold leading-tight tracking-tight text-white">
          {plan.base}
        </h3>
        {description && (
          <p className="mt-2 text-[13px] leading-relaxed text-white/55">{description}</p>
        )}

        {/* Term selector — the real Tebex price of every term */}
        {plan.variants && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            {plan.variants.map((v) => {
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
                    <span className="text-[12px] font-bold">{termLabel(v.months)}</span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-[0.1em]">
                      {t("store.subterm.unavailable")}
                    </span>
                  </div>
                );
              }
              const selected = v.months === term?.months;
              return (
                <button
                  key={v.months}
                  type="button"
                  onClick={() => setMonths(v.months)}
                  aria-pressed={selected}
                  className={`${base} ${
                    selected
                      ? "border-[#FF3B3B] bg-[#FF3B3B]/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
                  }`}
                >
                  <span className="text-[12px] font-bold">{termLabel(v.months)}</span>
                  <span className="mt-0.5 text-[11px] text-white/55">
                    {formatPrice(v.pkg.total_price, v.pkg.currency)}
                  </span>
                  {v.savePercent > 0 && (
                    <span className="absolute -right-1.5 -top-2 rounded-sm bg-[#FF3B3B] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white">
                      -{v.savePercent}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Price */}
        <div className="mt-5 border-y border-white/10 py-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-[30px] font-bold tracking-tight text-white">
              {formatPrice(pkg.total_price, pkg.currency)}
            </span>
            {term && term.savePercent > 0 && term.regularTotal != null && (
              <span className="text-[14px] text-white/35 line-through">
                {formatPrice(term.regularTotal, pkg.currency)}
              </span>
            )}
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">
              {term
                ? term.months === 1
                  ? t("store.subterm.forMonth")
                  : t("store.subterm.forMonths").replace("{n}", String(term.months))
                : t("store.sub.perMonth")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
            {term && term.months > 1 && (
              <span>
                {t("subs.perMonthEq").replace(
                  "{price}",
                  formatPrice(pkg.total_price / term.months, pkg.currency),
                )}
              </span>
            )}
            {term && bestMonths != null && term.months === bestMonths && (
              <span className="rounded-sm border border-[#FF3B3B]/40 bg-[#FF3B3B]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#FF3B3B]">
                {t("subs.best")}
              </span>
            )}
          </div>
        </div>

        {/* What the plan covers */}
        {plan.included.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              <Layers className="h-3.5 w-3.5 text-[#FF3B3B]" />
              {t("subs.includes")} ·{" "}
              {t("subs.includesCount").replace("{n}", String(plan.included.length))}
            </div>
            <ul className="mt-2 space-y-1">
              {plan.included.slice(0, 3).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-[12px] text-white/65">
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#FF3B3B]" strokeWidth={2.5} />
                  <span className="truncate">{p.name}</span>
                </li>
              ))}
              {plan.included.length > 3 && (
                <li className="pl-[22px] text-[11px] text-white/35">
                  {t("subs.more").replace("{n}", String(plan.included.length - 3))}
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-6">
          <button
            type="button"
            onClick={addToCart}
            className="group/btn relative inline-flex h-11 flex-1 items-center justify-center gap-2 overflow-hidden rounded-sm bg-[#FF3B3B] text-[10px] font-bold uppercase tracking-[0.18em] text-white transition-all hover:bg-[#D63030] hover:shadow-[0_0_30px_rgba(255,59,59,0.35)]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.9)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover/btn:bg-[position:0%_0%]"
            />
            <span className="relative z-10 inline-flex items-center gap-2">
              {added ? (
                <>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {t("store.product.added")}
                </>
              ) : (
                <>
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {t("store.product.addToCart")}
                </>
              )}
            </span>
          </button>
          <Link
            to="/store/$packageId"
            params={{ packageId: String(pkg.id) }}
            preload="render"
            className="group/link inline-flex h-11 items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 transition hover:border-white/25 hover:text-white"
          >
            {t("subs.viewPlan")}
            <ArrowRight className="h-3.5 w-3.5 transition group-hover/link:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
