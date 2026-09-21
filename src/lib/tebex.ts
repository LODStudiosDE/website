// Public Tebex Headless API helpers (no secrets — the webstore token is public-safe).
// Docs: https://docs.tebex.io/developers/headless-api/overview

export const TEBEX_TOKEN = "vt4a-029a1eae84bc288ac163544138a18bfe0ba85108";
export const TEBEX_BASE = "https://headless.tebex.io/api";

export type TebexMedia = { type: string; name: string; url: string; primary: boolean };

export type TebexPackage = {
  id: number;
  name: string;
  description: string;
  image: string | null;
  media?: TebexMedia[];
  type: "single" | "subscription";
  category: { id: number; name: string };
  base_price: number;
  sales_tax: number;
  total_price: number;
  currency: string;
  discount: number;
  disable_quantity: boolean;
  disable_gifting: boolean;
  expiration_date: string | null;
  created_at: string;
  updated_at: string;
  order: number;
};

export type TebexCategory = {
  id: number;
  name: string;
  slug: string | null;
  description: string;
  parent: { id: number; name: string } | null;
  tiered: boolean;
  packages: TebexPackage[];
  order?: number;
};

// ── In-memory stale-while-revalidate cache ─────────────────────────────────
// Lives for the lifetime of the process: on the server that means SSR of every
// page after the first one answers from memory instead of waiting ~0.5–1s on
// Tebex; in the browser it de-duplicates repeat requests within a session.
const FRESH_MS = 5 * 60 * 1000; // serve without revalidating
const MAX_AGE_MS = 60 * 60 * 1000; // serve stale (while refreshing) up to this age

type Entry = { at: number; data: unknown };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

async function tebexFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${TEBEX_BASE}/accounts/${TEBEX_TOKEN}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Tebex ${path} ${res.status}`);
  const json = (await res.json()) as { data: T };
  cache.set(path, { at: Date.now(), data: json.data });
  return json.data;
}

function tebexGet<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  const age = hit ? Date.now() - hit.at : Infinity;

  if (hit && age < FRESH_MS) return Promise.resolve(hit.data as T);

  // Either no entry or it's stale: fetch, but de-duplicate concurrent callers.
  let p = inflight.get(path) as Promise<T> | undefined;
  if (!p) {
    p = tebexFetch<T>(path).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }

  // Stale but still usable → answer immediately, refresh in the background.
  if (hit && age < MAX_AGE_MS) {
    p.catch(() => {});
    return Promise.resolve(hit.data as T);
  }
  return p;
}

export function fetchCategories(includePackages = true) {
  return tebexGet<TebexCategory[]>(
    `/categories${includePackages ? "?includePackages=1" : ""}`,
  );
}

export function fetchPackages() {
  return tebexGet<TebexPackage[]>(`/packages`);
}

export function fetchPackage(id: number) {
  return tebexGet<TebexPackage>(`/packages/${id}`);
}

/** Look a package up in the already-cached categories payload (no network). */
export function peekPackage(id: number): TebexPackage | undefined {
  const cats = cache.get("/categories?includePackages=1")?.data as TebexCategory[] | undefined;
  if (!cats) return undefined;
  for (const c of cats) for (const p of c.packages ?? []) if (p.id === id) return p;
  return undefined;
}

// Strip HTML for short descriptions in cards.
export function stripHtml(html: string, max = 110): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
