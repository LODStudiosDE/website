// Server function: create a Tebex basket, add a package, return the hosted checkout URL.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TEBEX_BASE, TEBEX_TOKEN } from "./tebex";
import { resolveBasketUser } from "./tebex-basket.server";

const PLUGIN_BASE = "https://plugin.tebex.io";

const checkoutInput = z.object({
  packageId: z.number().int().positive(),
  quantity: z.number().int().positive().max(99).default(1),
  returnOrigin: z.string().url(),
});

type Basket = {
  ident: string;
  links: { checkout: string; payment?: string };
};

export const createTebexCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => checkoutInput.parse(input))
  .handler(async ({ data }) => {
    // 1. Create basket
    const basketRes = await fetch(`${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        complete_url: `${data.returnOrigin}/store?checkout=success`,
        cancel_url: `${data.returnOrigin}/store?checkout=cancel`,
        complete_auto_redirect: true,
      }),
    });
    if (!basketRes.ok) {
      throw new Error(`Tebex basket failed: ${basketRes.status} ${await basketRes.text()}`);
    }
    const basketJson = (await basketRes.json()) as { data: Basket };
    const basket = basketJson.data;

    // 2. Add package to basket
    const addRes = await fetch(
      `${TEBEX_BASE}/baskets/${encodeURIComponent(basket.ident)}/packages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          package_id: data.packageId,
          quantity: data.quantity,
          type: "single",
        }),
      },
    );
    if (!addRes.ok) {
      throw new Error(`Tebex add-package failed: ${addRes.status} ${await addRes.text()}`);
    }

    return { checkoutUrl: basket.links.checkout, basketIdent: basket.ident };
  });

// Multi-item checkout: create a basket, add every cart line, return the hosted
// checkout URL. The hosted Tebex page collects the Cfx.re username + payment.
const cartCheckoutInput = z.object({
  basketIdent: z.string().min(1),
  items: z
    .array(
      z.object({
        packageId: z.number().int().positive(),
        quantity: z.number().int().positive().max(99).default(1),
      }),
    )
    .min(1)
    .max(50),
  creatorCode: z.string().min(1).max(64).optional(),
  couponCode: z.string().min(1).max(64).optional(),
  returnOrigin: z.string().url(),
});

export const createCartCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => cartCheckoutInput.parse(input))
  .handler(async ({ data }) => {
    const sourceBasketIdent = data.basketIdent.trim();
    const sourceRes = await fetch(
      `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(sourceBasketIdent)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!sourceRes.ok) {
      throw new Error(
        `Tebex source basket fetch failed: ${sourceRes.status} ${await sourceRes.text()}`,
      );
    }
    const sourceBasket =
      ((await sourceRes.json()) as {
        data: Basket & {
          username?: string | null;
          username_id?: number | null;
          complete?: boolean;
          packages?: Array<{ id: number; in_basket?: { quantity: number } }>;
        };
      }).data;
    if (!sourceBasket.username) {
      throw new Error("Tebex basket is not authenticated yet");
    }
    if (sourceBasket.complete) {
      throw new Error("Tebex basket already paid");
    }
    const basketIdent = sourceBasketIdent;

    // The basket is reused across checkout attempts for as long as the user
    // stays logged in, but our add-loop below is additive-only. Without this
    // step, a package removed inside the hosted Tebex checkout (or left over
    // from an abandoned attempt) stays attached to the basket forever and
    // resurfaces on the next, unrelated checkout. Sync the basket to the
    // current cart first: drop anything Tebex still has that isn't in
    // `data.items` any more.
    const wantedIds = new Set(data.items.map((it) => it.packageId));
    const stalePackages = (sourceBasket.packages ?? []).filter(
      (pkg) => !wantedIds.has(pkg.id),
    );
    for (const pkg of stalePackages) {
      const removeRes = await fetch(
        `${TEBEX_BASE}/baskets/${encodeURIComponent(basketIdent)}/packages/remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ package_id: String(pkg.id) }),
        },
      );
      // 404/422 = already gone; anything else is a real failure worth surfacing.
      if (!removeRes.ok && removeRes.status !== 404 && removeRes.status !== 422) {
        throw new Error(
          `Tebex remove-package ${pkg.id} failed: ${removeRes.status} ${await removeRes.text()}`,
        );
      }
    }

    const creatorCode = data.creatorCode?.trim();
    if (creatorCode) {
      const creatorRes = await fetch(
        `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(basketIdent)}/creator-codes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ creator_code: creatorCode }),
        },
      );
      if (!creatorRes.ok && creatorRes.status !== 422) {
        throw new Error(
          `Tebex creator-code failed: ${creatorRes.status} ${await creatorRes.text()}`,
        );
      }
    }

    const couponCode = data.couponCode?.trim();
    if (couponCode) {
      const couponRes = await fetch(
        `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(basketIdent)}/coupons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ coupon_code: couponCode }),
        },
      );
      // 422 = invalid/not applicable coupon; ignore so checkout still proceeds.
      if (!couponRes.ok && couponRes.status !== 422) {
        throw new Error(
          `Tebex coupon failed: ${couponRes.status} ${await couponRes.text()}`,
        );
      }
    }

    for (const item of data.items) {
      let addRes = await fetch(
        `${TEBEX_BASE}/baskets/${encodeURIComponent(basketIdent)}/packages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            package_id: String(item.packageId),
            quantity: item.quantity,
          }),
        },
      );
      if (!addRes.ok && addRes.status === 422 && item.quantity > 1) {
        addRes = await fetch(
          `${TEBEX_BASE}/baskets/${encodeURIComponent(basketIdent)}/packages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              package_id: String(item.packageId),
              quantity: 1,
            }),
          },
        );
      }
      if (!addRes.ok) {
        throw new Error(
          `Tebex add-package ${item.packageId} failed: ${addRes.status} ${await addRes.text()}`,
        );
      }
    }

    const finalBasketRes = await fetch(
      `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(basketIdent)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!finalBasketRes.ok) {
      throw new Error(
        `Tebex basket re-fetch failed: ${finalBasketRes.status} ${await finalBasketRes.text()}`,
      );
    }
    const finalBasket = ((await finalBasketRes.json()) as { data: Basket }).data;

    return { checkoutUrl: finalBasket.links.checkout, basketIdent: basketIdent };
  });

// After returning from checkout: resolve the purchased products + Tebex
// transaction id so the thank-you screen can show real order details.
const checkoutResultInput = z.object({ basketIdent: z.string().min(1) });

export const getCheckoutResult = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => checkoutResultInput.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{
      paid: boolean;
      txnId: string | null;
      products: string[];
      total: number | null;
      currency: string | null;
      date: string | null;
    }> => {
      const ident = data.basketIdent.trim();

      // Basket details (packages + paid flag).
      let paid = false;
      let products: string[] = [];
      let total: number | null = null;
      let currency: string | null = null;
      try {
        const res = await fetch(
          `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(ident)}`,
          { headers: { Accept: "application/json" } },
        );
        if (res.ok) {
          const basket = ((await res.json()) as {
            data: {
              complete?: boolean;
              total_price?: number;
              currency?: string;
              packages?: Array<{ name?: string }>;
            };
          }).data;
          paid = basket.complete === true;
          total = typeof basket.total_price === "number" ? basket.total_price : null;
          currency = basket.currency ?? null;
          products = (basket.packages ?? [])
            .map((p) => p?.name ?? "")
            .filter((n): n is string => !!n);
        }
      } catch {
        // ignore — fall back to plugin lookup below
      }

      // Latest payment via the Game Server plugin API (real txn id).
      let txnId: string | null = null;
      let date: string | null = null;
      const secret = process.env["TEBEX_SECRET"];
      const { cfxId } = await resolveBasketUser(ident);
      if (secret && cfxId) {
        try {
          const res = await fetch(`${PLUGIN_BASE}/user/${encodeURIComponent(cfxId)}`, {
            headers: { "X-Tebex-Secret": secret, Accept: "application/json" },
          });
          if (res.ok) {
            const body = (await res.json()) as {
              payments?: Array<Record<string, unknown>>;
            };
            const payments = Array.isArray(body.payments) ? body.payments : [];
            const latest = payments
              .map((p) => ({ p, sort: Number(p.time ?? 0) }))
              .sort((a, b) => b.sort - a.sort)[0]?.p;
            if (latest) {
              txnId = String(latest.txnId ?? latest.txn_id ?? latest.id ?? "") || null;
              const t = latest.time ?? latest.date;
              if (typeof t === "number") date = new Date(t * 1000).toISOString();
              else if (typeof t === "string") {
                const d = new Date(t);
                date = Number.isNaN(d.getTime()) ? null : d.toISOString();
              }
              if (products.length === 0) {
                const raw = (latest.packages ?? latest.package) as unknown;
                if (Array.isArray(raw)) {
                  products = raw
                    .map((pkg) =>
                      typeof pkg === "string"
                        ? pkg
                        : ((pkg as Record<string, unknown>)?.name as string) ?? "",
                    )
                    .filter(Boolean);
                }
              }
              if (txnId) paid = true;
            }
          }
        } catch {
          // ignore
        }
      }

      return { paid, txnId, products, total, currency, date };
    },
  );
// Docs: https://docs.tebex.io/developers/headless-api/endpoints (Get auth links for basket)

const authInput = z.object({ returnUrl: z.string().url() });

type AuthLink = { name: string; url: string };

// Creates a fresh basket and returns the Cfx.re/FiveM auth URL the player is sent to.
export const createTebexAuthLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => authInput.parse(input))
  .handler(async ({ data }) => {
    const origin = new URL(data.returnUrl).origin;

    const basketRes = await fetch(`${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        complete_url: `${origin}/cart?checkout=success`,
        cancel_url: `${origin}/cart?checkout=cancel`,
        complete_auto_redirect: true,
      }),
    });
    if (!basketRes.ok) {
      throw new Error(`Tebex basket failed: ${basketRes.status} ${await basketRes.text()}`);
    }
    const basket = ((await basketRes.json()) as { data: Basket }).data;

    const authRes = await fetch(
      `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(basket.ident)}/auth?returnUrl=${encodeURIComponent(data.returnUrl)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!authRes.ok) {
      throw new Error(`Tebex auth link failed: ${authRes.status} ${await authRes.text()}`);
    }
    const links = (await authRes.json()) as AuthLink[];
    const authUrl = links[0]?.url;
    if (!authUrl) throw new Error("Tebex returned no auth link for this basket.");

    return { authUrl, basketIdent: basket.ident };
  });

const basketIdentInput = z.object({ basketIdent: z.string().min(1) });

type AuthedBasket = { ident: string; username: string | null; username_id?: number | null };

// Reads a basket after the auth redirect to resolve the logged-in FiveM username.
export const fetchTebexBasketUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketIdentInput.parse(input))
  .handler(async ({ data }) => {
    const res = await fetch(
      `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(data.basketIdent)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const basket = ((await res.json()) as { data: AuthedBasket }).data;
    if (!basket.username) return null;
    return { username: basket.username, usernameId: basket.username_id ?? null };
  });
