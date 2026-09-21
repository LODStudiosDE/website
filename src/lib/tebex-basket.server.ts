// Server-only helper: resolve the verified FiveM/CFX identity from an
// authenticated Tebex basket. Never trusts a client-supplied id (prevents IDOR).
import "./load-env.server";
import { TEBEX_BASE, TEBEX_TOKEN } from "./tebex";

type AuthedBasket = {
  ident: string;
  username: string | null;
  username_id?: number | string | null;
};

export async function resolveBasketUser(
  basketIdent: string,
): Promise<{ username: string | null; cfxId: string | null }> {
  try {
    const res = await fetch(
      `${TEBEX_BASE}/accounts/${TEBEX_TOKEN}/baskets/${encodeURIComponent(basketIdent)}`,
      {
      headers: { Accept: "application/json" },
      },
    );
    if (!res.ok) return { username: null, cfxId: null };
    const basket = ((await res.json()) as { data: AuthedBasket }).data;
    const rawId = basket?.username_id;
    return {
      username: basket?.username ?? null,
      cfxId: rawId === null || rawId === undefined ? null : String(rawId),
    };
  } catch {
    return { username: null, cfxId: null };
  }
}
