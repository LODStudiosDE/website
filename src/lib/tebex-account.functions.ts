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

const PLUGIN_BASE = "https://plugin.tebex.io";

export type ProfilePurchase = {
  txnId: string;
  date: string | null; // ISO string
  amount: number | null;
  currency: string | null;
  status: string | null;
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

// Full purchase history via the Game Server API player lookup (X-Tebex-Secret).
async function fetchPurchases(
  usernameId: string,
): Promise<{ purchases: ProfilePurchase[]; total: number; currency: string; pending?: boolean }> {
  const secret = process.env.TEBEX_SECRET;
  if (!secret) return { purchases: [], total: 0, currency: "EUR" };

  // The player lookup only knows regular purchases. Payments the shop owner
  // created for the customer (free / 0 € ones, gifts, manual payments) only show
  // up in the full payment history, so both sources are merged below.
  // Loading that history can take a while right after a server start. The
  // profile only waits briefly for it: the newest payments are always included,
  // and the page asks again until the full list has arrived (`pending`).
  const [res, received] = await Promise.all([
    fetch(`${PLUGIN_BASE}/user/${encodeURIComponent(usernameId)}`, {
      headers: { "X-Tebex-Secret": secret, Accept: "application/json" },
    }).catch(() => null),
    paymentsForCfxId(usernameId, { waitMs: 2000 }).catch(() => null),
  ]);
  const pending = received === null || !received.complete;

  const body = res?.ok
    ? ((await res.json().catch(() => ({}))) as { payments?: Array<Record<string, unknown>> })
    : {};
  const payments = Array.isArray(body.payments) ? body.payments : [];

  const normalized = payments
    .map((p) => {
      const rawPackages = (p.packages ?? p.package) as unknown;
      const products: string[] = Array.isArray(rawPackages)
        ? rawPackages
            .map((pkg) =>
              typeof pkg === "string"
                ? pkg
                : ((pkg as Record<string, unknown>)?.name as string) ?? "",
            )
            .filter(Boolean)
        : [];
      return {
        txnId: String(p.txnId ?? p.txn_id ?? p.id ?? ""),
        date: toIso(p.time ?? p.date ?? p.created_at),
        amount: toNumber(p.price ?? p.amount),
        currency: (p.currency as string) ?? null,
        status: ((p.status as string) ?? null) as string | null,
        products,
        _sort: toNumber(p.time) ?? 0,
      };
    });

  // Merge: the history row wins (it carries product names and the real amount).
  // The two APIs name the same payment differently (txn id vs. payment id), so
  // a lookup row counts as "already there" when time and amount agree.
  const history = received?.purchases ?? [];
  const sameAsHistory = (p: (typeof normalized)[number]) =>
    history.some((r) => {
      const ms = r.date ? Date.parse(r.date) : NaN;
      return (
        r.txnId === p.txnId ||
        (Number.isFinite(ms) && Math.abs(ms / 1000 - p._sort) <= 300 && (r.amount ?? 0) === (p.amount ?? 0))
      );
    });
  const byTxn = new Map(normalized.filter((p) => !sameAsHistory(p)).map((p) => [p.txnId, p]));
  for (const r of history) {
    const ms = r.date ? Date.parse(r.date) : NaN;
    byTxn.set(r.txnId, {
      txnId: r.txnId,
      date: r.date,
      amount: r.amount ?? 0,
      currency: r.currency ?? "EUR",
      status: (r.status == null ? null : String(r.status)) as string,
      products:
        r.packageName && r.packageName !== "—"
          ? r.packageName.split(", ")
          : [],
      _sort: Number.isFinite(ms) ? ms / 1000 : 0,
    });
  }
  const merged = [...byTxn.values()].sort((a, b) => b._sort - a._sort);

  const currency = merged.find((p) => p.currency)?.currency ?? "EUR";
  // Only money the customer really paid: no refunds / chargebacks, and nothing
  // an admin created for them in the panel ("manual-…" / "gift-…").
  const total = merged
    .filter((p) => !/refund|chargeback/i.test(p.status ?? "") && !/^(manual|gift)-/.test(p.txnId))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return {
    purchases: merged.map(({ _sort, ...rest }) => rest),
    total,
    currency,
    pending,
  };
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
