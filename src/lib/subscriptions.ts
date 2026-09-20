// Maps single products to the subscription(s) that include them.
//
// Subscriptions live in the Tebex "Subscriptions" category as packages of
// `type === "subscription"`. There is no native "this plan includes these
// products" relation in the Tebex data, so we match by product-name keywords.
// The subscription's name, price, description and image are always pulled from
// the live Tebex package (see findSubscriptionsForProduct) — only the coverage
// rules live here.
import type { TebexPackage } from "./tebex";

export type SubscriptionRule = {
  // Tebex package id of the subscription plan.
  packageId: number;
  // A product whose name contains any of these (case-insensitive) is covered.
  keywords: string[];
};

export const SUBSCRIPTION_RULES: SubscriptionRule[] = [
  // Estates – 1 month
  { packageId: 6434049, keywords: ["estate", "villa", "madrazo", "rockford royale"] },
  // Government Departments – 1 month
  {
    packageId: 6434044,
    keywords: ["police", "sheriff", "medical", "department", "pillbox", "mount zonah"],
  },
  // Parks – 1 month
  { packageId: 6434047, keywords: ["park", "garden"] },
];

// ── subscription terms (1 / 2 / 3 months) ───────────────────────────────────
//
// Tebex computes every price at checkout and these plans have quantity
// disabled, so a longer term cannot be sold as "3 × 1 month" and a discount
// cannot be invented on the page. Each term is therefore its OWN Tebex package,
// recognised by its name:
//
//     "Estates - 1 month"   "Estates - 2 months"   "Estates - 3 months"
//
// Everything shown (price, saving) is derived from the real Tebex prices, so
// the page can never promise a different amount than the customer is charged.

export const SUBSCRIPTION_TERMS = [1, 2, 3] as const;
export type SubscriptionTerm = (typeof SUBSCRIPTION_TERMS)[number];

/** "Estates -  3 months" → { base: "Estates", months: 3 }; null if no term suffix. */
export function parseSubscriptionName(name: string): { base: string; months: number } | null {
  const m = /^(.*?)\s*[-–—:]\s*(\d{1,2})\s*(?:months?|monate?|mois)\s*$/i.exec(name.trim());
  if (!m) return null;
  const months = Number(m[2]);
  const base = m[1].trim();
  if (!base || !Number.isFinite(months) || months < 1) return null;
  return { base, months };
}

/**
 * The term of ANY subscription package. One without a "- N months" suffix
 * ("LOD Plus") is the plan's base offer: 1 month. That is what lets a plain
 * "LOD Plus" and a later "LOD Plus - 3 months" find each other without
 * renaming the package that customers already subscribed to.
 */
export function subscriptionTerm(name: string): { base: string; months: number } {
  return parseSubscriptionName(name) ?? { base: name.trim(), months: 1 };
}

const sameBase = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

export type SubscriptionVariant = {
  months: number;
  /** The Tebex package for this term, or null when it does not exist (yet). */
  pkg: TebexPackage | null;
  /** What this term would cost at the 1-month price (months × monthly). */
  regularTotal: number | null;
  /** Whole-number saving vs. `regularTotal`, from the REAL prices. 0 if none. */
  savePercent: number;
};

/**
 * All terms of the plan that `product` belongs to, in SUBSCRIPTION_TERMS order.
 * Returns null when `product` is not a subscription. A subscription without a
 * "- N months" suffix counts as the 1-month term of its own plan.
 */
export function subscriptionVariants(
  product: Pick<TebexPackage, "id" | "name" | "type">,
  subscriptionPackages: TebexPackage[],
): { base: string; variants: SubscriptionVariant[] } | null {
  if (product.type !== "subscription") return null;
  const parsed = subscriptionTerm(product.name);

  const byMonths = new Map<number, TebexPackage>();
  for (const p of subscriptionPackages) {
    if (p.type !== "subscription") continue;
    const info = subscriptionTerm(p.name);
    if (sameBase(info.base, parsed.base) && !byMonths.has(info.months)) {
      byMonths.set(info.months, p);
    }
  }

  const monthly = byMonths.get(1)?.total_price ?? null;
  const variants = SUBSCRIPTION_TERMS.map((months): SubscriptionVariant => {
    const pkg = byMonths.get(months) ?? null;
    const regularTotal = monthly != null ? Math.round(monthly * months * 100) / 100 : null;
    let savePercent = 0;
    if (pkg && regularTotal && months > 1 && pkg.total_price < regularTotal) {
      savePercent = Math.round((1 - pkg.total_price / regularTotal) * 100);
    }
    return { months, pkg, regularTotal, savePercent };
  });
  return { base: parsed.base, variants };
}

/** Longer terms are reached through the selector, so lists show each plan once. */
export function isSecondarySubscriptionTerm(
  pkg: Pick<TebexPackage, "name" | "type">,
  all: Pick<TebexPackage, "name" | "type">[],
): boolean {
  if (pkg.type !== "subscription") return false;
  const info = parseSubscriptionName(pkg.name);
  if (!info || info.months === 1) return false;
  return all.some((o) => {
    if (o.type !== "subscription") return false;
    const oi = subscriptionTerm(o.name);
    return oi.months === 1 && sameBase(oi.base, info.base);
  });
}

function ruleMatchesProduct(rule: SubscriptionRule, productName: string): boolean {
  const name = productName.toLowerCase();
  return rule.keywords.some((k) => name.includes(k.toLowerCase()));
}

/**
 * Returns the live subscription packages that include the given product,
 * preserving the order of SUBSCRIPTION_RULES. Subscription products never
 * match themselves.
 */
export function findSubscriptionsForProduct(
  product: Pick<TebexPackage, "name" | "type">,
  subscriptionPackages: TebexPackage[],
): TebexPackage[] {
  if (product.type === "subscription") return [];
  const byId = new Map(subscriptionPackages.map((p) => [p.id, p]));
  const out: TebexPackage[] = [];
  for (const rule of SUBSCRIPTION_RULES) {
    if (!ruleMatchesProduct(rule, product.name)) continue;
    const pkg = byId.get(rule.packageId);
    if (pkg) out.push(pkg);
  }
  return out;
}
