// Server functions for the authenticated customer profile (last purchase + subscriptions).
//
// SECURITY: The caller only sends the `basketIdent` (their authenticated session token).
// The server resolves the *verified* `username_id` from that basket itself — it never trusts
// a client-supplied user id — which prevents reading another customer's data (IDOR).
//
// Secrets are read from server-side env vars only and are NEVER exposed to the client:
//   - TEBEX_PRIVATE_KEY : Headless API private key (active subscriptions / tiers)
//   - TEBEX_SECRET      : Game Server secret (purchase history)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TEBEX_BASE, TEBEX_TOKEN } from "./tebex";
import { paymentsForCfxId, type LookupPurchase } from "./admin/payments.server";

const profileInput = z.object({ basketIdent: z.string().min(1) });

export type ProfilePurchase = {
  txnId: string;
  date: string | null; // ISO string
  amount: number | null;
  currency: string | null;
  status: string | null;
  /** "Tebex Checkout", "Manual", "Gratis (Admin)" … — shown when there is no product name. */
  method: string | null;
  products: string[];
};

export type ProfileCategory = {
  id: string;
  name: string;
  active: boolean;
  packageName: string | null;
  amount: number | null;
  currency: string | null;
  nextPaymentDate: string | null;
  recurringReference: string | null;
};

export type ProfileResult = {
  authed: boolean;
  username: string | null;
  purchases: ProfilePurchase[];
  purchaseCount: number;
  totalSpent: number;
  totalCurrency: string;
  purchasesConfigured: boolean; // TEBEX_SECRET present
  /** true while the full payment history is still loading — ask again shortly. */
  purchasesPending?: boolean;
  categories: ProfileCategory[];
  subscriptionsConfigured: boolean; // TEBEX_PRIVATE_KEY present
};

type AuthedBasket = { ident: string; username: string | null; username_id?: number | string | null };

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // Unix seconds (Tebex plugin API) or an ISO/date string.
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string") {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && /^\d+$/.test(value)) {
      return new Date(asNum * 1000).toISOString();
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

// Resolve the verified username_id from the authenticated basket.
async function resolveBasketUser(
  basketIdent: string,
): Promise<{ username: string | null; usernameId: string | null }> {
  const res = await fetch(
    `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(basketIdent)}`,
    {
    headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) return { username: null, usernameId: null };
  const basket = ((await res.json()) as { data: AuthedBasket }).data;
  const id = basket.username_id;
  return {
    username: basket.username ?? null,
    usernameId: id === null || id === undefined ? null : String(id),
  };
}

// Everything this customer received: every row of the complete Tebex payment
// history whose player is this CFX id — regular purchases, 0 € / 100 %-coupon
// purchases and payments the shop owner created in Tebex ("Manual" gateway) —
// plus payments and gifts created in our own admin panel.
//
// The Game Server "player lookup" (/user/{id}) is deliberately NOT used any
// more: it requires the Tebex Plus plan, which this store does not have, so it
// answered HTTP 400 for every customer and the profile never got a single row
// from it. Its removal also drops the fuzzy time/amount merge that guessed
// which lookup rows matched history rows.
async function fetchPurchases(
  usernameId: string,
): Promise<{ purchases: ProfilePurchase[]; total: number; currency: string; pending?: boolean }> {
  if (!process.env.TEBEX_SECRET) return { purchases: [], total: 0, currency: "EUR" };

  // The history is served from the stored snapshot and topped up with the
  // newest pages inside this request (bounded), so the answer is complete and
  // includes purchases made moments ago. `pending` only stays true while there
  // is no stored history yet at all; the page then asks again.
  const received = await paymentsForCfxId(usernameId, { waitMs: 2000 }).catch(() => null);
  const pending = received === null || !received.complete;

  const purchases: ProfilePurchase[] = (received?.purchases ?? [])
    .map((r: LookupPurchase) => ({
      txnId: r.txnId,
      date: r.date,
      amount: r.amount ?? 0,
      currency: r.currency ?? "EUR",
      status: r.status == null ? null : String(r.status),
      method: r.method,
      products: r.packageName && r.packageName !== "—" ? r.packageName.split(", ") : [],
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const currency = purchases.find((p) => p.currency)?.currency ?? "EUR";
  // Only money the customer really paid: no refunds / chargebacks, and nothing
  // an admin created for them in the panel ("manual-…" / "gift-…").
  const total = purchases
    .filter((p) => !/refund|chargeback/i.test(p.status ?? "") && !/^(manual|gift)-/.test(p.txnId))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return { purchases, total, currency, pending };
}

// Tiered categories (subscriptions) + the user's active tier per category.
async function fetchCategories(
  usernameId: string,
  basketIdent: string,
): Promise<ProfileCategory[]> {
  const privateKey = process.env.TEBEX_PRIVATE_KEY;

  const url =
    `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/categories?includePackages=1` +
    `&basketIdent=${encodeURIComponent(basketIdent)}` +
    `&username_id=${encodeURIComponent(usernameId)}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (privateKey) {
    headers.Authorization = `Basic ${Buffer.from(`${TEBEX_TOKEN}:${privateKey}`).toString("base64")}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) return [];

  const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const categories = Array.isArray(body.data) ? body.data : [];

  return categories
    .filter((cat) => cat.tiered === true)
    .map((cat) => {
      const tier = cat.active_tier as Record<string, unknown> | null | undefined;
      const active = !!tier && tier.active !== false;
      const pkg = tier?.package as Record<string, unknown> | undefined;
      return {
        id: String(cat.id ?? ""),
        name: String(cat.name ?? ""),
        active,
        packageName: (pkg?.name as string) ?? null,
        amount: toNumber(pkg?.total_price ?? pkg?.base_price),
        currency: (pkg?.currency as string) ?? null,
        nextPaymentDate: toIso(tier?.next_payment_date),
        recurringReference: (tier?.recurring_payment_reference as string) ?? null,
      };
    });
}

export const fetchTebexProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => profileInput.parse(input))
  .handler(async ({ data }): Promise<ProfileResult> => {
    const purchasesConfigured = !!process.env.TEBEX_SECRET;
    const subscriptionsConfigured = !!process.env.TEBEX_PRIVATE_KEY;

    const { username, usernameId } = await resolveBasketUser(data.basketIdent);
    if (!username || !usernameId) {
      return {
        authed: false,
        username: null,
        purchases: [],
        purchaseCount: 0,
        totalSpent: 0,
        totalCurrency: "EUR",
        purchasesConfigured,
        categories: [],
        subscriptionsConfigured,
      };
    }

    const [purchaseData, categories] = await Promise.all([
      fetchPurchases(usernameId).catch(() => ({
        purchases: [] as ProfilePurchase[],
        total: 0,
        currency: "EUR",
        pending: false,
      })),
      fetchCategories(usernameId, data.basketIdent).catch(() => [] as ProfileCategory[]),
    ]);

    return {
      authed: true,
      username,
      purchases: purchaseData.purchases,
      purchaseCount: purchaseData.purchases.length,
      totalSpent: purchaseData.total,
      totalCurrency: purchaseData.currency,
      purchasesConfigured,
      purchasesPending: purchaseData.pending === true,
      categories,
      subscriptionsConfigured,
    };
  });
