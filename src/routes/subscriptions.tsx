import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Crown,
  Check,
  ShoppingCart,
  ArrowRight,
  Loader2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { showCartToast } from "@/components/CartToast";
import { useCart, formatPrice } from "@/lib/cart-store";
import { useT } from "@/lib/i18n";
import { categoriesQuery } from "@/lib/queries";
import { stripHtml, type TebexPackage } from "@/lib/tebex";
import { parseDescription } from "@/lib/description-parser";
import {
  SUBSCRIPTION_RULES,
  SUBSCRIPTION_TERMS,
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
          "Every LODStudios subscription at a glance: unlock whole collections of premium FiveM MLOs with one plan.",
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

/** One line of "what you get". Entries that name a store product link to it. */
type Perk = { label: string; pkg: TebexPackage | null };

type Plan = {
  base: string;
  /** The package the card is built from (shortest available term). */
  anchor: TebexPackage;
  /** Term variants, or null for a plan sold with a single term. */
  variants: SubscriptionVariant[] | null;
  perks: Perk[];
  /** The plan's own artwork, or — when it has none — that of a product it unlocks. */
  image: string | null;
};

function packageImage(pkg: TebexPackage): string | null {
  return pkg.image ?? pkg.media?.find((m) => m.primary)?.url ?? pkg.media?.[0]?.url ?? null;
}

/** Comparison form for product names: case, accents and punctuation must not decide a match. */
const normName = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Turns one line of the plan description into a perk. A line that names a store
 * product ("Pillbox Medical Department") becomes a link to it; the shop writes
 * these lists by hand, so the names are close but rarely exact ("Carmeet" vs.
 * "Carmeet Autopia") — hence the contains-match on top of the exact one.
 */
function toPerk(label: string, singles: TebexPackage[]): Perk {
  const q = normName(label);
  if (q.length < 3) return { label, pkg: null };
  const exact = singles.find((p) => normName(p.name) === q);
  if (exact) return { label, pkg: exact };
  const partial = singles.filter((p) => {
    const n = normName(p.name);
    return n.length >= 4 && (q.includes(n) || n.includes(q));
  });
  // Only an unambiguous partial match counts — two candidates mean we guessed.
  return { label, pkg: partial.length === 1 ? partial[0] : null };
}

function buildPlans(all: TebexPackage[]): Plan[] {
  const subs = all.filter((p) => p.type === "subscription");
  const singles = all.filter((p) => p.type === "single");

  const perksOf = (anchor: TebexPackage, coveredIds: Set<number>): Perk[] => {
    // What the shop wrote into the Tebex description is authoritative.
    const written = parseDescription(anchor.description ?? "", anchor.name).features;
    if (written.length > 0) return written.map((f) => toPerk(f, singles));
    // No list in the description: fall back to the keyword coverage rules.
    const rule = SUBSCRIPTION_RULES.find((r) => coveredIds.has(r.packageId));
    if (!rule) return [];
    return singles
      .filter((s) => rule.keywords.some((k) => s.name.toLowerCase().includes(k.toLowerCase())))
      .map((p) => ({ label: p.name, pkg: p }));
  };

  const seen = new Set<string>();
  const out: Plan[] = [];
  for (const pkg of subs) {
    const plan = subscriptionVariants(pkg, subs);

    if (!plan) {
      const perks = perksOf(pkg, new Set([pkg.id]));
      out.push({
        base: pkg.name,
        anchor: pkg,
        variants: null,
        perks,
        image: packageImage(pkg) ?? perks.map((x) => x.pkg && packageImage(x.pkg)).find(Boolean) ?? null,
      });
      continue;
    }
    const key = plan.base.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const anchor = plan.variants.find((v) => v.pkg)?.pkg ?? pkg;
    const ids = new Set(plan.variants.flatMap((v) => (v.pkg ? [v.pkg.id] : [])));
    const perks = perksOf(anchor, ids);
    out.push({
      base: plan.base,
      anchor,
      variants: plan.variants,
      perks,
      image:
        packageImage(anchor) ?? perks.map((x) => x.pkg && packageImage(x.pkg)).find(Boolean) ?? null,
    });
  }
  return out.sort((a, b) => a.anchor.order - b.anchor.order);
}

function SubscriptionsPage() {
  const t = useT();
  const { data: categories } = useSuspenseQuery(categoriesQuery);

  const plans = useMemo(() => {
    // A package can sit in several categories: de-duplicate by id first.
    const byId = new Map<number, TebexPackage>();
    for (const cat of categories) for (const p of cat.packages ?? []) byId.set(p.id, p);
    return buildPlans(Array.from(byId.values()));
  }, [categories]);

  // Terms at least one plan offers — the switcher never shows a dead option.
  const terms = useMemo(() => {
    const offered = new Set<number>();
    for (const p of plans) for (const v of p.variants ?? []) if (v.pkg) offered.add(v.months);
    return SUBSCRIPTION_TERMS.filter((m) => offered.has(m));
  }, [plans]);

  const [months, setMonths] = useState<number>(1);
  // The plan with the biggest saving at the selected term gets the spotlight;
  // with a single plan that is simply the one plan.
  const bestId = useMemo(() => {
    let best: { id: number; save: number } | null = null;
    for (const p of plans) {
      const v = p.variants?.find((x) => x.months === months && x.pkg);
      if (v && v.savePercent > (best?.save ?? 0)) best = { id: p.anchor.id, save: v.savePercent };
    }
    return best?.id ?? plans[Math.min(1, plans.length - 1)]?.anchor.id ?? null;
  }, [plans, months]);

  const termLabel = (n: number) =>
    n === 1 ? t("subs.term.month") : t("subs.term.months").replace("{n}", String(n));

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0C0C0D] text-white">
      {/* The clip IS the page background: pinned to the viewport, edge to edge,
          and it stays put while the content scrolls over it. A light tint only
          keeps the type readable — the footage stays clearly visible. */}
      <div className="fixed inset-0 z-0">
        <HeroVideo
          src={import.meta.env.VITE_STORE_VIDEO_URL as string | undefined}
          videoId="Me2ATrIklJA"
          variant="store"
        />
        <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-black/35 via-black/15 to-black/45" />
      </div>

      <div className="relative z-10">
        <Navigation />

        {/* One screen: the heading on top, the subscription centred below it. */}
        <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col items-center justify-center px-6 pb-16 pt-[130px] lg:px-12">
          <div className="mb-8 flex flex-col items-center text-center">
            <h1 className="font-display max-w-4xl text-[clamp(2rem,4.6vw,4rem)] font-bold leading-[1.02] tracking-tighter text-white [text-shadow:0_2px_30px_rgba(0,0,0,0.85)]">
              {t("subs.hero.title")}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/85 [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]">
              {t("subs.hero.subtitle")}
            </p>
          </div>

          {plans.length === 0 ? (
            <div className="grid w-full max-w-md place-items-center rounded-2xl border border-dashed border-white/15 bg-black/40 px-6 py-16 text-center backdrop-blur-md">
              <Crown className="h-8 w-8 text-white/30" />
              <p className="mt-4 max-w-sm text-sm text-white/55">{t("subs.empty")}</p>
            </div>
          ) : (
            <>
            {/* Term switcher — every card compares at the same term */}
            {terms.length > 1 && (
              <div className="mb-10 flex flex-col items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                  {t("subs.term.label")}
                </span>
                <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                  {terms.map((m) => {
                    const active = m === months;
                    const best = Math.max(
                      0,
                      ...plans.map(
                        (p) => p.variants?.find((v) => v.months === m && v.pkg)?.savePercent ?? 0,
                      ),
                    );
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMonths(m)}
                        aria-pressed={active}
                        className={`relative rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-[0.14em] transition-all duration-300 ${
                          active
                            ? "bg-gradient-to-r from-[#FF3B3B] to-[#C72C2C] text-white shadow-[0_8px_24px_-10px_rgba(255,59,59,0.8)]"
                            : "text-white/50 hover:text-white"
                        }`}
                      >
                        {termLabel(m)}
                        {best > 0 && (
                          <span className={active ? "ml-1.5 text-white/80" : "ml-1.5 text-[#FF3B3B]"}>
                            −{best}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              className={`grid items-start gap-6 ${
                plans.length === 1
                  ? "mx-auto max-w-lg"
                  : plans.length === 2
                    ? "mx-auto max-w-3xl sm:grid-cols-2"
                    : "sm:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {plans.map((plan, i) => (
                <PlanCard
                  key={plan.anchor.id}
                  plan={plan}
                  months={months}
                  featured={plan.anchor.id === bestId}
                  index={i}
                />
              ))}
            </div>

            <p className="mt-10 flex items-center justify-center gap-1.5 text-center text-[12px] text-white/35">
              <Sparkles className="h-3.5 w-3.5 text-[#FF3B3B]" />
              {t("subs.note")}
            </p>
            </>
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}

const VISIBLE_PERKS = 7;

function PlanCard({
  plan,
  months,
  featured,
  index,
}: {
  plan: Plan;
  months: number;
  featured: boolean;
  index: number;
}) {
  const t = useT();
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const available = plan.variants?.filter((v) => v.pkg) ?? [];
  // The chosen term, or the closest one this plan actually offers.
  const term =
    available.find((v) => v.months === months) ??
    available.reduce<SubscriptionVariant | null>(
      (closest, v) =>
        closest == null || Math.abs(v.months - months) < Math.abs(closest.months - months)
          ? v
          : closest,
      null,
    );
  const pkg = term?.pkg ?? plan.anchor;
  const offTerm = term != null && term.months !== months;

  const blurb = stripHtml(plan.anchor.description ?? "", 130);
  const perks = expanded ? plan.perks : plan.perks.slice(0, VISIBLE_PERKS);
  const hidden = plan.perks.length - VISIBLE_PERKS;
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
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-500 ${
        featured
          ? "border-[#FF3B3B]/45 bg-gradient-to-b from-[#FF3B3B]/[0.13] via-[#161011] to-[#0E0E0F] shadow-[0_30px_80px_-30px_rgba(255,59,59,0.45)]"
          : "border-white/[0.08] bg-gradient-to-b from-[#151516] to-[#0E0E0F] hover:border-white/20"
      }`}
      style={{ animation: `fade-up 0.6s ${index * 0.08}s cubic-bezier(0.16,1,0.3,1) both` }}
    >
      {featured && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#FF3B3B]/25 blur-[90px]"
        />
      )}

      {/* Header: artwork + name */}
      <div className="relative flex items-center gap-4 p-5 pb-0 sm:p-6 sm:pb-0">
        <Link
          to="/store/$packageId"
          params={{ packageId: String(pkg.id) }}
          preload="render"
          className="relative block h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0A0A0B]"
        >
          {plan.image ? (
            <img
              src={plan.image}
              alt={plan.base}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-[#FF3B3B]/[0.08] text-[#FF3B3B]/70">
              <Crown className="h-7 w-7" />
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <span
            className={`block text-[10px] font-bold uppercase tracking-[0.24em] ${
              featured ? "text-[#FF3B3B]" : "text-white/35"
            }`}
          >
            {t("store.sub.badge")}
          </span>
          <h3 className="mt-0.5 truncate font-display text-[26px] font-bold uppercase leading-tight tracking-tight text-white">
            {plan.base}
          </h3>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col p-5 pt-4 sm:p-6 sm:pt-4">
        {blurb && <p className="text-[13px] leading-relaxed text-white/50">{blurb}</p>}

        {/* Price */}
        <div className="mt-5 border-y border-white/10 py-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-[34px] font-bold leading-none tracking-tight text-white">
              {formatPrice(pkg.total_price, pkg.currency)}
            </span>
            {term && term.savePercent > 0 && term.regularTotal != null && (
              <span className="text-[14px] text-white/30 line-through">
                {formatPrice(term.regularTotal, pkg.currency)}
              </span>
            )}
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              {term
                ? term.months === 1
                  ? t("store.subterm.forMonth")
                  : t("store.subterm.forMonths").replace("{n}", String(term.months))
                : t("store.sub.perMonth")}
            </span>
          </div>

          {(term && (term.months > 1 || term.savePercent > 0 || offTerm)) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {term.months > 1 && (
                <span className="text-[11px] text-white/40">
                  {t("subs.perMonthEq").replace(
                    "{price}",
                    formatPrice(pkg.total_price / term.months, pkg.currency),
                  )}
                </span>
              )}
              {term.savePercent > 0 && (
                <span className="rounded-sm bg-[#FF3B3B] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                  {t("store.subterm.save").replace("{pct}", String(term.savePercent))}
                </span>
              )}
              {offTerm && (
                <span className="text-[11px] text-amber-300/70">
                  {t("subs.onlyTerm").replace("{term}", termLabel(term.months))}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Subscribe */}
        <button
          type="button"
          onClick={addToCart}
          className={`group/btn relative mt-5 inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-sm text-[11px] font-bold uppercase tracking-[0.18em] transition-all ${
            featured
              ? "bg-gradient-to-r from-[#FF3B3B] to-[#C72C2C] text-white hover:shadow-[0_0_40px_rgba(255,59,59,0.5)]"
              : "border border-white/15 bg-white/[0.05] text-white hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10"
          }`}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.85)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover/btn:bg-[position:0%_0%]"
          />
          <span className="relative z-10 inline-flex items-center gap-2">
            {added ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} />
                {t("store.product.added")}
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" />
                {t("subs.subscribe").replace("{price}", formatPrice(pkg.total_price, pkg.currency))}
              </>
            )}
          </span>
        </button>

        {/* What you get */}
        {plan.perks.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              <span className="h-px flex-1 bg-white/10" />
              {t("subs.includes")}
              <span className="rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-white/60">
                {plan.perks.length}
              </span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <ul className="mt-4 space-y-1">
              {perks.map((perk, k) =>
                perk.pkg ? (
                  <li key={k}>
                    <Link
                      to="/store/$packageId"
                      params={{ packageId: String(perk.pkg.id) }}
                      preload="render"
                      className="group/perk flex items-start gap-2.5 rounded-md px-2 py-1.5 text-[13px] leading-snug text-white/75 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      <Check
                        className="mt-[2px] h-4 w-4 shrink-0 text-[#FF3B3B]"
                        strokeWidth={2.5}
                      />
                      <span className="flex-1">{perk.label}</span>
                      <ArrowRight className="mt-[2px] h-3.5 w-3.5 shrink-0 -translate-x-1 text-white/25 opacity-0 transition-all group-hover/perk:translate-x-0 group-hover/perk:opacity-100" />
                    </Link>
                  </li>
                ) : (
                  <li
                    key={k}
                    className="flex items-start gap-2.5 px-2 py-1.5 text-[13px] leading-snug text-white/70"
                  >
                    <Check
                      className="mt-[2px] h-4 w-4 shrink-0 text-[#FF3B3B]/70"
                      strokeWidth={2.5}
                    />
                    <span>{perk.label}</span>
                  </li>
                ),
              )}
            </ul>

            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="mt-3 inline-flex items-center gap-1 px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45 transition hover:text-[#FF3B3B]"
              >
                {expanded ? t("subs.showLess") : t("subs.more").replace("{n}", String(hidden))}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        )}

        <Link
          to="/store/$packageId"
          params={{ packageId: String(pkg.id) }}
          preload="render"
          className="group/link mt-auto inline-flex items-center justify-center gap-1.5 pt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 transition hover:text-white"
        >
          {t("subs.viewPlan")}
          <ArrowRight className="h-3.5 w-3.5 transition group-hover/link:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}
