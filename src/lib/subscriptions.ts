// Maps single products to the subscription(s) that include them.
//
// Subscriptions live in the Tebex "Subscriptions" category as packages of
// `type === "subscription"`. There is no native "this plan includes these
// products" relation in the Tebex data, so we match by product-name keywords.
// The subscription's name, price, description and image are always pulled from
// the live Tebex package (see findSubscriptionsForProduct) — only the coverage
// rules live here.
import type { TebexPackage } from "./tebex";
import { parseDescription } from "./description-parser";

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

/**
 * "Estates - 3 months" / "LOD Plus 3 Months" → { base, months }; null if the name
 * carries no term suffix. The separator is optional: the shop names these packages
 * by hand and both spellings occur.
 */
export function parseSubscriptionName(name: string): { base: string; months: number } | null {
  const m = /^(.*?)\s*(?:[-–—:]\s*)?(\d{1,2})\s*(?:months?|monate?|mois)\s*$/i.exec(name.trim());
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
  /**
   * True when Tebex bills this term MONTHLY at a (possibly reduced) monthly
   * price, false when its price covers the whole term. Decided from the two
   * real prices: a whole-term price is always above the 1-month price, so a
   * multi-month package priced at or below it can only be a per-month price.
   */
  perMonth: boolean;
  /** What this term would cost at the 1-month price — the whole term, or one month when `perMonth`. */
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
    // A 3-month package with the SAME price as the 1-month one is billed per
    // month: reading it as a whole-term price would show a 67 % "saving" that
    // does not exist. Only a price above the monthly one covers the whole term.
    const perMonth = pkg != null && months > 1 && monthly != null && pkg.total_price <= monthly;
    const regularTotal =
      monthly == null ? null : perMonth ? monthly : Math.round(monthly * months * 100) / 100;
    let savePercent = 0;
    if (pkg && regularTotal && months > 1 && pkg.total_price < regularTotal) {
      savePercent = Math.round((1 - pkg.total_price / regularTotal) * 100);
    }
    return { months, pkg, perMonth, regularTotal, savePercent };
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

/**
 * The subscription plans that include `product`, as their shortest-term package.
 * Found by scanning every plan's description for the product (see
 * subscriptionPlanGroups), so a new product or plan needs no upkeep here.
 * Subscription packages never match themselves.
 */
export function findSubscriptionsForProduct(
  product: Pick<TebexPackage, "id" | "type">,
  all: TebexPackage[],
): TebexPackage[] {
  if (product.type === "subscription") return [];
  return subscriptionPlanGroups(all)
    .filter((g) => g.included.some((p) => p.id === product.id))
    .map((g) => g.anchor);
}

// ── what a plan includes ────────────────────────────────────────────────────

/** One line of "what you get". Entries that name a store product carry it in `pkg`. */
export type Perk = { label: string; pkg: TebexPackage | null };

/** Comparison form for product names: case, accents and punctuation must not decide a match. */
export const normName = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Turns one line of a plan description into a perk. A line that names a store
 * product ("Pillbox Medical Department") is linked to it; the shop writes these
 * lists by hand, so the names are close but rarely exact ("Carmeet" vs.
 * "Carmeet Autopia") — hence the contains-match on top of the exact one.
 */
export function toPerk(label: string, singles: TebexPackage[]): Perk {
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

/** The perks of the plan whose sold packages are `coveredIds`, built from `anchor`'s description. */
export function subscriptionPerks(
  anchor: TebexPackage,
  coveredIds: Set<number>,
  singles: TebexPackage[],
): Perk[] {
  // What the shop wrote into the Tebex description is authoritative.
  const written = parseDescription(anchor.description ?? "", anchor.name).features;
  if (written.length > 0) return written.map((f) => toPerk(f, singles));
  // No list in the description: fall back to the keyword coverage rules.
  const rule = SUBSCRIPTION_RULES.find((r) => coveredIds.has(r.packageId));
  if (!rule) return [];
  return singles
    .filter((s) => rule.keywords.some((k) => s.name.toLowerCase().includes(k.toLowerCase())))
    .map((p) => ({ label: p.name, pkg: p }));
}

export type SubscriptionPlanGroup = {
  base: string;
  /** The plan's shortest-term package. */
  anchor: TebexPackage;
  /** Every package (all terms) that belongs to the plan. */
  ids: Set<number>;
  /** The store products the plan includes. */
  included: TebexPackage[];
};

/** Every plan (all its terms folded together) with the products it includes. */
export function subscriptionPlanGroups(all: TebexPackage[]): SubscriptionPlanGroup[] {
  const subs = all.filter((p) => p.type === "subscription");
  const singles = all.filter((p) => p.type === "single");
  const groups = new Map<string, { base: string; pkgs: { pkg: TebexPackage; months: number }[] }>();
  for (const pkg of subs) {
    const info = subscriptionTerm(pkg.name);
    const key = normName(info.base);
    const g = groups.get(key) ?? { base: info.base, pkgs: [] };
    g.pkgs.push({ pkg, months: info.months });
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .map((g): SubscriptionPlanGroup => {
      const anchor = [...g.pkgs].sort((a, b) => a.months - b.months)[0].pkg;
      const ids = new Set(g.pkgs.map((x) => x.pkg.id));
      const seen = new Set<number>();
      const included: TebexPackage[] = [];
      for (const perk of subscriptionPerks(anchor, ids, singles)) {
        if (perk.pkg && !seen.has(perk.pkg.id)) {
          seen.add(perk.pkg.id);
          included.push(perk.pkg);
        }
      }
      return { base: g.base, anchor, ids, included };
    })
    .sort((a, b) => a.anchor.order - b.anchor.order || a.anchor.total_price - b.anchor.total_price);
}
