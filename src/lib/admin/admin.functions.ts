// Server functions for the admin panel.
//
// SECURITY MODEL
//  - The client only ever sends its own `basketIdent` (the authenticated Tebex
//    session token). The server resolves the *verified* CFX/username id from
//    that basket — it never trusts a client-supplied id (prevents IDOR).
//  - The resolved CFX id is matched against the server-only roster
//    (`roster.server.ts`). Only `{ isAdmin, role, permissions }` is returned.
//  - Every mutating action re-checks the permission server-side via `requireAccess`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveBasketUser } from "../tebex-basket.server";
import { gmailConfigured, gmailSender, sendGmail, type MailAttachment } from "../gmail.server";
import {
  accessHas,
  addRosterEntry,
  createRole,
  deleteRole,
  listRoles,
  listRoster,
  removeRosterEntry,
  resolveAccess,
  type ResolvedAccess,
} from "./roster.server";
import type { AdminSession, Permission } from "./permissions";
import {
  appendLog,
  adminsConfigured,
  dbConfigured,
  deleteSubscriber,
  deleteTemplate,
  deleteWishlist,
  findWishlist,
  readAllWishlists,
  readLogs,
  readTemplates,
  readSubscribers,
  saveWishlist,
  setSubscriberHidden,
  templatesConfigured,
  subscribersConfigured,
  upsertTemplate,
  type EmailTemplate,
  type LogEntry,
  type SubscriberEntry,
} from "../db.server";

// ── Tebex plugin API ────────────────────────────────────────────────────────

const PLUGIN_BASE = "https://plugin.tebex.io";

type TebexPayment = {
  id?: number | string;
  txn_id?: string;
  amount?: number | string;
  price?: number | string;
  date?: string | number;
  time?: string | number;
  status?: string | number;
  currency?: string | { iso_4217?: string };
  gateway?: { name?: string } | null;
  packages?: { id?: number; name?: string }[];
  player?: { id?: number | string; name?: string; uuid?: string } | null;
  name?: string;
};

// ── Tebex coupons / gift cards / packages (management panel) ────────────────

type RawCoupon = {
  id?: number | string;
  code?: string;
  discount?: { type?: string; percentage?: number; value?: number };
  expire?: {
    expire_never?: string | boolean;
    redeem_unlimited?: string | boolean;
    limit?: number | string;
    date?: string | null;
  };
  basket_type?: string;
  note?: string;
};
type CouponsPage = { data?: RawCoupon[]; pagination?: { next?: string | null } };

export type AdminCoupon = {
  id: number | string;
  code: string;
  discountType: "percentage" | "value";
  discountValue: number;
  expireNever: boolean;
  expireDate: string | null;
  redeemUnlimited: boolean;
  redeemLimit: number;
  basketType: string | null;
  note: string;
};

type RawGiftcard = {
  id?: number | string;
  code?: string;
  balance?: { starting?: string | number; remaining?: string | number; currency?: string };
  note?: string;
  void?: boolean;
};

export type AdminGiftcard = {
  id: number | string;
  code: string;
  starting: number;
  remaining: number;
  currency: string;
  note: string;
  void: boolean;
};

type RawPackage = {
  id?: number | string;
  name?: string;
  price?: number | string;
  total_price?: number | string;
  currency?: string | { iso_4217?: string };
};

export type StorePackage = {
  id: number;
  name: string;
  price: number;
  currency: string;
};

async function tebexPlugin<T>(path: string): Promise<T | null> {
  const secret = process.env["TEBEX_SECRET"];
  if (!secret) return null;
  try {
    const res = await fetch(`${PLUGIN_BASE}${path}`, {
      headers: { "X-Tebex-Secret": secret, Accept: "application/json" },
    });
    if (!res.ok) return null;
    if (res.status === 204) return {} as T;
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function tebexPluginPost<T>(path: string, body: unknown): Promise<T | null> {
  const secret = process.env["TEBEX_SECRET"];
  if (!secret) return null;
  try {
    const res = await fetch(`${PLUGIN_BASE}${path}`, {
      method: "POST",
      headers: {
        "X-Tebex-Secret": secret,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    if (res.status === 204) return {} as T;
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Generic Tebex plugin request that reports success/failure instead of
// swallowing it — used for coupon / gift card mutations where the admin needs
// to know whether Tebex accepted the request.
async function tebexPluginSend(
  method: "POST" | "DELETE" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: unknown }> {
  const secret = process.env["TEBEX_SECRET"];
  if (!secret) return { ok: false, status: 0 };
  try {
    const res = await fetch(`${PLUGIN_BASE}${path}`, {
      method,
      headers: {
        "X-Tebex-Secret": secret,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let parsed: unknown;
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { ok: res.ok, status: res.status, data: parsed };
  } catch {
    return { ok: false, status: 0 };
  }
}

// Fetches the complete payment history across all pages (Tebex paginates
// /payments with 25 per page — several thousand payments = 200+ pages). Pages
// are fetched in parallel batches and cached briefly so Logs/Lookup stay fast.
type PaymentsPage = { data?: TebexPayment[]; last_page?: number; current_page?: number };

// Only a COMPLETE history is ever cached. It is served instantly for up to
// PAYMENTS_MAX_AGE and refreshed in the background once older than
// PAYMENTS_FRESH, so a lookup never has to wait for the 200+ page crawl again.
let _paymentsCache: { at: number; data: TebexPayment[] } | null = null;
let _paymentsInflight: Promise<PaymentsResult> | null = null;
const PAYMENTS_FRESH = 60_000; // 1 min: serve without refreshing
const PAYMENTS_MAX_AGE = 15 * 60_000; // 15 min: serve stale while refreshing
const PAYMENTS_CONCURRENCY = 5; // 12 parallel requests regularly tripped Tebex's rate limit
const PAGE_ATTEMPTS = 4;

type PaymentsResult = { payments: TebexPayment[]; complete: boolean };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// One page of /payments, retried on rate limits and transient errors.
// `null` means the page could NOT be loaded — never "the page is empty".
async function fetchPaymentsPage(page: number): Promise<TebexPayment[] | PaymentsPage | null> {
  const secret = process.env["TEBEX_SECRET"];
  if (!secret) return null;
  for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
    try {
      // `paged=1` only SWITCHES pagination on; the page number is `page`.
      // (`?paged=2` silently returns page 1 again — that bug made the lookup
      // see nothing but the 25 newest payments, repeated once per page.)
      const res = await fetch(`${PLUGIN_BASE}/payments?paged=1&page=${page}`, {
        headers: { "X-Tebex-Secret": secret, Accept: "application/json" },
      });
      if (res.ok) {
        const text = await res.text();
        const body = text ? (JSON.parse(text) as TebexPayment[] | PaymentsPage) : { data: [] };
        // Never accept a different page than the one we asked for.
        if (!Array.isArray(body) && body.current_page != null && Number(body.current_page) !== page) {
          console.error(`[tebex] asked for payments page ${page}, got ${body.current_page}`);
          return null;
        }
        return body;
      }
      // Client errors other than "too many requests" will not fix themselves.
      if (res.status !== 429 && res.status < 500) return null;
      const retryAfter = Number(res.headers.get("Retry-After"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 600 * attempt;
      if (attempt < PAGE_ATTEMPTS) await sleep(Math.min(wait, 5000));
    } catch {
      if (attempt < PAGE_ATTEMPTS) await sleep(400 * attempt);
    }
  }
  return null;
}

async function crawlAllPayments(): Promise<PaymentsResult> {
  const first = await fetchPaymentsPage(1);
  if (!first) return { payments: [], complete: false };
  if (Array.isArray(first)) return { payments: first, complete: true };

  const byPage = new Map<number, TebexPayment[]>([[1, first.data ?? []]]);
  const lastPage = Math.min(first.last_page ?? 1, 500); // hard cap for safety

  let pending: number[] = [];
  for (let p = 2; p <= lastPage; p++) pending.push(p);

  // Pass 1 in small parallel batches; pass 2 retries the stragglers one by one,
  // which is what gets them through when the rate limit was the problem.
  for (const concurrency of [PAYMENTS_CONCURRENCY, 1]) {
    const failed: number[] = [];
    for (let i = 0; i < pending.length; i += concurrency) {
      const batch = pending.slice(i, i + concurrency);
      const results = await Promise.all(batch.map((p) => fetchPaymentsPage(p)));
      results.forEach((r, idx) => {
        if (r === null) failed.push(batch[idx]);
        else byPage.set(batch[idx], Array.isArray(r) ? r : (r.data ?? []));
      });
    }
    pending = failed;
    if (pending.length === 0) break;
  }

  // De-duplicate by payment id: a payment must never count twice, whatever the
  // API returns (new payments arriving mid-crawl also shift rows across pages).
  const payments: TebexPayment[] = [];
  const seenIds = new Set<string>();
  for (let p = 1; p <= lastPage; p++) {
    for (const pay of byPage.get(p) ?? []) {
      const key = String(pay.id ?? pay.txn_id ?? "");
      if (key && seenIds.has(key)) continue;
      if (key) seenIds.add(key);
      payments.push(pay);
    }
  }
  if (pending.length > 0) {
    console.error(`[tebex] payment history incomplete: ${pending.length}/${lastPage} pages failed`);
  }
  return { payments, complete: pending.length === 0 };
}

// Concurrent callers share one crawl instead of each starting their own
// (which multiplied the request rate and caused more dropped pages).
function refreshPayments(): Promise<PaymentsResult> {
  if (_paymentsInflight) return _paymentsInflight;
  _paymentsInflight = crawlAllPayments()
    .then((result) => {
      // An incomplete history must never replace a complete one, and is never
      // cached — otherwise the missing buyers stay "not found" until it expires.
      if (result.complete) _paymentsCache = { at: Date.now(), data: result.payments };
      return result;
    })
    .finally(() => {
      _paymentsInflight = null;
    });
  return _paymentsInflight;
}

/** Test hook: forget the cached history and any running crawl. */
export function __resetPaymentsCacheForTests(): void {
  _paymentsCache = null;
  _paymentsInflight = null;
  _recentCache = null;
}

// The newest payments (page 1 = 25 rows, ~0.4 s). The full history takes 240+
// requests to crawl, which a serverless request can never wait for — and a
// cached history is up to 15 min old. So the newest page is fetched separately
// and merged in: the latest purchases show up at once, whatever the crawl does.
let _recentCache: { at: number; data: TebexPayment[] } | null = null;
const RECENT_FRESH = 15_000;

export async function fetchRecentPayments(): Promise<TebexPayment[]> {
  if (_recentCache && Date.now() - _recentCache.at < RECENT_FRESH) return _recentCache.data;
  const page = await fetchPaymentsPage(1);
  if (!page) return _recentCache?.data ?? [];
  const data = Array.isArray(page) ? page : (page.data ?? []);
  _recentCache = { at: Date.now(), data };
  return data;
}

const paymentKey = (p: TebexPayment) => String(p.id ?? p.txn_id ?? "");

// Payments in `recent` win over the same payment in `base` (fresher status).
function mergePayments(recent: TebexPayment[], base: TebexPayment[]): TebexPayment[] {
  const seen = new Set(recent.map(paymentKey).filter(Boolean));
  return [...recent, ...base.filter((p) => !seen.has(paymentKey(p)))];
}

// How long a request may wait for the full history before answering with what
// it has (newest payments + whatever was cached).
const HISTORY_WAIT_MS = 6_000;

export async function fetchAllPaymentsDetailed(
  opts: { waitMs?: number } = {},
): Promise<PaymentsResult> {
  const recentP = fetchRecentPayments().catch(() => [] as TebexPayment[]);
  const age = _paymentsCache ? Date.now() - _paymentsCache.at : Infinity;

  if (_paymentsCache && age < PAYMENTS_FRESH) {
    return { payments: mergePayments(await recentP, _paymentsCache.data), complete: true };
  }
  if (_paymentsCache && age < PAYMENTS_MAX_AGE) {
    void refreshPayments().catch(() => {}); // refresh in the background
    return { payments: mergePayments(await recentP, _paymentsCache.data), complete: true };
  }

  // No (usable) full history: let the crawl run, but never wait for it longer
  // than the budget — the newest payments are enough to answer.
  const crawl = refreshPayments();
  void crawl.catch(() => {});
  const waited = await Promise.race([
    crawl.catch(() => null),
    sleep(opts.waitMs ?? HISTORY_WAIT_MS).then(() => null),
  ]);
  const recent = await recentP;
  if (waited?.complete) return { payments: mergePayments(recent, waited.payments), complete: true };
  // Crawl failed / still running: an older complete history beats a holey one.
  if (_paymentsCache) return { payments: mergePayments(recent, _paymentsCache.data), complete: true };
  return { payments: recent, complete: false };
}

// Customer profiles list created / free payments from this history, so load it
// as soon as the server starts instead of on the first visitor's request.
if (typeof window === "undefined" && process.env["TEBEX_SECRET"]) {
  setTimeout(() => void fetchAllPaymentsDetailed().catch(() => {}), 3000);
}

async function fetchAllPayments(): Promise<TebexPayment[]> {
  return (await fetchAllPaymentsDetailed()).payments;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  if (typeof v === "string") {
    if (/^\d+$/.test(v)) return new Date(Number(v) * 1000).toISOString();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function currencyOf(p: TebexPayment): string {
  if (typeof p.currency === "string") return p.currency;
  return p.currency?.iso_4217 ?? "EUR";
}

function packagesOf(p: TebexPayment): { id: number | null; name: string } {
  const first = p.packages?.[0];
  const names = (p.packages ?? []).map((x) => x.name).filter(Boolean).join(", ");
  return { id: first?.id ?? null, name: names || "—" };
}

// Resolves a Tebex package id → product name using the store catalogue (cached).
let _packagesCache: { at: number; map: Map<number, string> } | null = null;
const PACKAGES_TTL = 300_000; // 5 min

async function resolvePackageName(id: number): Promise<string | null> {
  if (!_packagesCache || Date.now() - _packagesCache.at >= PACKAGES_TTL) {
    const list = await tebexPlugin<{ id?: number; name?: string }[]>(`/packages`);
    const map = new Map<number, string>();
    for (const pkg of list ?? []) {
      if (pkg.id != null && pkg.name) map.set(Number(pkg.id), pkg.name);
    }
    _packagesCache = { at: Date.now(), map };
  }
  return _packagesCache.map.get(id) ?? null;
}

// Player-lookup returns a numeric payment status; the /payments list uses text.
function statusLabel(status?: string | number | null): string | null {
  if (status == null || status === "") return null;
  if (typeof status === "number" || /^\d+$/.test(String(status))) {
    const map: Record<string, string> = { "1": "Complete", "2": "Refund", "3": "Chargeback" };
    return map[String(status)] ?? String(status);
  }
  return String(status);
}

function statusToLogType(status?: string | number): LogEntry["type"] {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("refund") || s.includes("chargeback") || s.includes("declin"))
    return "purchase.declined";
  return "purchase.success";
}

function makeLog(
  type: LogEntry["type"],
  actor: string | null,
  extra: Partial<LogEntry> = {},
): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    type,
    actor,
    cfxName: extra.cfxName ?? null,
    tebexId: extra.tebexId ?? null,
    packageName: extra.packageName ?? null,
    amount: extra.amount ?? null,
    currency: extra.currency ?? null,
    paymentMethod: extra.paymentMethod ?? null,
    detail: extra.detail ?? null,
  };
}

async function accessFor(basketIdent: string): Promise<ResolvedAccess> {
  const { cfxId } = await resolveBasketUser(basketIdent);
  return resolveAccess(cfxId);
}

/** Throws unless the basket owner holds `permission`. Returns the access. */
async function requireAccess(
  basketIdent: string,
  permission: Permission,
): Promise<ResolvedAccess> {
  const access = await accessFor(basketIdent);
  if (!accessHas(access, permission)) {
    throw new Error("FORBIDDEN");
  }
  return access;
}

async function actorName(basketIdent: string): Promise<string | null> {
  const { username } = await resolveBasketUser(basketIdent);
  return username;
}

// ── session ─────────────────────────────────────────────────────────────────

const basketInput = z.object({ basketIdent: z.string().min(1) });

export const fetchAdminSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<AdminSession> => {
    const access = await accessFor(data.basketIdent);
    return {
      isAdmin: access.isAdmin,
      role: access.role,
      roleLabel: access.roleLabel,
      permissions: access.permissions,
    };
  });

// ── config flags (which live integrations are available) ────────────────────

function config() {
  return {
    tebexSecret: !!process.env["TEBEX_SECRET"],
    tebexPrivateKey: !!process.env["TEBEX_PRIVATE_KEY"],
    email: gmailConfigured(),
    ai: true, // free tokenless AI (Pollinations)
    store: dbConfigured(), // Supabase (partners, logs, wishlists, roster, …)
  };
}

export const fetchAdminConfig = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }) => {
    const access = await accessFor(data.basketIdent);
    if (!access.isAdmin) throw new Error("FORBIDDEN");
    return config();
  });

// ── roles (read) ────────────────────────────────────────────────────────────

export const fetchAdminRoles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }) => {
    await requireAccess(data.basketIdent, "roles.view");
    return listRoles();
  });

const roleCreateInput = z.object({
  basketIdent: z.string().min(1),
  label: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string().min(1)).max(64),
});

export const createAdminRole = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => roleCreateInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string; key?: string }> => {
    await requireAccess(data.basketIdent, "roles.create");
    const res = await createRole({
      label: data.label,
      description: data.description,
      permissions: data.permissions as Permission[],
    });
    if (res.ok) {
      await appendLog(
        makeLog("roles.manage", await actorName(data.basketIdent), {
          detail: `Rolle erstellt: ${data.label}`,
        }),
      );
    }
    return res;
  });

const roleDeleteInput = z.object({
  basketIdent: z.string().min(1),
  key: z.string().min(1).max(60),
});

export const deleteAdminRole = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => roleDeleteInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "roles.delete");
    const res = await deleteRole(data.key);
    if (res.ok) {
      await appendLog(
        makeLog("roles.manage", await actorName(data.basketIdent), {
          detail: `Rolle gelöscht: ${data.key}`,
        }),
      );
    }
    return res;
  });

// ── roster (admins in lod-admins bin) ────────────────────────────────────

export const fetchAdminRoster = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }) => {
    await requireAccess(data.basketIdent, "roster.view");
    return { configured: adminsConfigured(), roster: await listRoster() };
  });

const rosterUpsertInput = z.object({
  basketIdent: z.string().min(1),
  cfxId: z.string().min(1).max(40),
  role: z.string().min(1).max(40),
  label: z.string().max(80).optional(),
});

export const upsertRosterEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => rosterUpsertInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "roster.manage");
    const res = await addRosterEntry({
      cfxId: data.cfxId,
      role: data.role,
      label: data.label,
    });
    if (res.ok) {
      await appendLog(
        makeLog("roster.manage", await actorName(data.basketIdent), {
          detail: `Admin ${data.label?.trim() || data.cfxId} → Rolle ${data.role}`,
        }),
      );
    }
    return res;
  });

const rosterDeleteInput = z.object({
  basketIdent: z.string().min(1),
  cfxId: z.string().min(1).max(40),
});

export const deleteRosterEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => rosterDeleteInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "roster.manage");
    const res = await removeRosterEntry(data.cfxId);
    if (res.ok) {
      await appendLog(
        makeLog("roster.manage", await actorName(data.basketIdent), {
          detail: `Admin ${data.cfxId} entfernt`,
        }),
      );
    }
    return res;
  });

// ── lookup ──────────────────────────────────────────────────────────────────

const lookupInput = z.object({
  basketIdent: z.string().min(1),
  query: z.string().max(120).optional().default(""),
});

export type LookupPurchase = {
  txnId: string;
  date: string | null;
  amount: number | null;
  currency: string | null;
  status: string | number | null;
  packageId: number | null;
  packageName: string;
  buyer: string | null;
  cfxId: string | null;
};

export type LookupResult = {
  configured: boolean;
  username: string | null;
  cfxId: string | null;
  purchases: LookupPurchase[];
  /** true when Tebex could not deliver the full payment history even after
   *  retries — "nothing found" is then not reliable and worth retrying. */
  incomplete?: boolean;
};

// Comparison form for names: case, accents and spacing must not decide whether
// a buyer is found ("Jörg  Müller" == "jorg muller").
export function normName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mapLookup(p: TebexPayment): LookupPurchase {
  const pkg = packagesOf(p);
  return {
    txnId: String(p.txn_id ?? p.id ?? ""),
    date: toIso(p.date ?? p.time),
    amount: toNumber(p.amount ?? p.price),
    currency: currencyOf(p),
    status: statusLabel(p.status),
    packageId: pkg.id,
    packageName: pkg.name,
    buyer: p.player?.name ?? p.name ?? null,
    cfxId: p.player?.uuid != null ? String(p.player.uuid) : p.player?.id != null ? String(p.player.id) : null,
  };
}

// Manual payments / gifts we recorded ourselves (audit log table) → lookup rows.
// Created payments carry the CFX id inside their key ("manual-<id>-<ts>" /
// "gift-<id>-<ts>") and in their detail text ("… für CFX <id> …").
function createdForCfxId(l: LogEntry): string | null {
  const fromKey = /^(?:manual|gift)-(.+)-\d+$/.exec(l.tebexId ?? "")?.[1];
  if (fromKey) return fromKey;
  return /\bCFX\s+([A-Za-z0-9_:-]+)/.exec(l.detail ?? "")?.[1] ?? null;
}

/**
 * Payments an admin created (manual payments, gifts) that belong to the search.
 * `idents` are normalised names AND CFX ids the query resolved to, so a search
 * by FiveM name also finds payments that were stored with the CFX id only.
 * Ids are compared against the CFX id the payment was created for — never
 * against the whole key, whose timestamp would match short numbers by accident.
 */
export function filterCreatedPayments(
  logs: LogEntry[],
  idents: string[],
  hasQuery: boolean,
): LogEntry[] {
  return logs.filter((l) => {
    if (l.paymentMethod == null && l.amount == null) return false; // not a payment
    if (!hasQuery) return true; // browsing everything
    const name = normName(l.cfxName ?? "");
    const forId = normName(createdForCfxId(l) ?? "");
    const key = normName(l.tebexId ?? "");
    return idents.some(
      (id) => name.includes(id) || (forId !== "" && forId.includes(id)) || key === id,
    );
  });
}

function logToPurchase(l: LogEntry): LookupPurchase {
  return {
    txnId: l.tebexId ?? l.id,
    date: l.at,
    amount: l.amount,
    currency: l.currency,
    status: l.paymentMethod ?? (l.type === "admin.action" ? "Admin-Zahlung" : l.type),
    packageId: null,
    packageName: l.packageName ?? l.detail ?? "Manuelle Zahlung",
    buyer: l.cfxName ?? null,
    cfxId: createdForCfxId(l), // who the payment was created for
  };
}

/**
 * Everything ONE customer received, for their own profile: real Tebex payments
 * (including free / 0 € ones the shop owner created in Tebex) plus payments and
 * gifts created in our admin panel. Matching is EXACT on the verified CFX id —
 * never by name — so nobody can see another customer's rows.
 */
export async function paymentsForCfxId(
  cfxId: string,
  opts: { waitMs?: number } = {},
): Promise<{ purchases: LookupPurchase[]; complete: boolean }> {
  const id = cfxId.trim().toLowerCase();
  if (!id) return { purchases: [], complete: true };
  const out: LookupPurchase[] = [];
  let complete = true;

  if (config().tebexSecret) {
    const history = await fetchAllPaymentsDetailed(opts);
    complete = history.complete;
    for (const p of history.payments) {
      if (String(p.player?.uuid ?? "").toLowerCase() !== id) continue;
      if (/declin/i.test(String(statusLabel(p.status) ?? ""))) continue; // never went through
      out.push(mapLookup(p));
    }
  }

  if (config().store) {
    const logs = await readLogs().catch(() => [] as LogEntry[]);
    for (const l of logs ?? []) {
      if (l.paymentMethod == null && l.amount == null) continue; // not a payment
      if ((createdForCfxId(l) ?? "").trim().toLowerCase() !== id) continue;
      out.push(logToPurchase(l));
    }
  }
  return { purchases: out, complete };
}

// ── recent purchases (admin overview) ───────────────────────────────────────

export type RecentPurchase = {
  txnId: string;
  date: string | null;
  buyer: string;
  packageName: string;
  amount: number | null;
  currency: string;
  status: string | null;
};

/** The newest purchases of the whole store: real Tebex payments + admin-created ones. */
export const fetchRecentPurchases = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<{ configured: boolean; purchases: RecentPurchase[] }> => {
    const access = await accessFor(data.basketIdent);
    if (!accessHas(access, "logs.view") && !accessHas(access, "lookup.view")) {
      throw new Error("FORBIDDEN");
    }
    const cfg = config();
    const rows: RecentPurchase[] = [];

    if (cfg.tebexSecret) {
      for (const p of await fetchRecentPayments()) {
        const row = mapLookup(p);
        if (!row.txnId || /declin/i.test(String(row.status ?? ""))) continue;
        rows.push({
          txnId: row.txnId,
          date: row.date,
          buyer: row.buyer ?? "—",
          packageName: row.packageName,
          amount: row.amount,
          currency: row.currency ?? "EUR",
          status: row.status == null ? null : String(row.status),
        });
      }
    }
    if (cfg.store) {
      const logs = await readLogs().catch(() => [] as LogEntry[]);
      for (const l of logs ?? []) {
        if (l.paymentMethod == null && l.amount == null) continue; // not a payment
        const row = logToPurchase(l);
        rows.push({
          txnId: row.txnId,
          date: row.date,
          buyer: row.buyer ?? "—",
          packageName: row.packageName,
          amount: row.amount,
          currency: row.currency ?? "EUR",
          status: row.status == null ? null : String(row.status),
        });
      }
    }
    rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { configured: cfg.tebexSecret || cfg.store, purchases: rows.slice(0, 10) };
  });

export const adminLookup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lookupInput.parse(input))
  .handler(async ({ data }): Promise<LookupResult> => {
    await requireAccess(data.basketIdent, "lookup.view");
    const cfg = config();
    if (!cfg.tebexSecret && !cfg.store) {
      return { configured: false, username: null, cfxId: null, purchases: [] };
    }
    const q = data.query.trim();
    const needle = q.toLowerCase();

    let username: string | null = null;
    let cfxId: string | null = null;
    let purchases: LookupPurchase[] = [];
    let incomplete = false;
    // Every CFX id / name the query resolves to. Payments an admin CREATED are
    // stored with the CFX id only, so a search by FiveM name has to be
    // translated into ids first or those payments would never be found.
    const resolved = new Set<string>();

    // 1) Live purchases from Tebex — complete history incl. declined/refunds.
    if (cfg.tebexSecret) {
      const seen = new Set<string>();
      const push = (list: TebexPayment[]) => {
        for (const p of list) {
          const row = mapLookup(p);
          const dedupe = row.txnId || `${row.date}-${row.packageName}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          purchases.push(row);
        }
      };

      // Direct user lookup (resolves the player), then a full-history scan so
      // declined/refunded payments and operator-created (free) payments show too.
      if (q) {
        const user = await tebexPlugin<{
          player?: {
            id?: number | string;
            username?: string;
            name?: string;
            plugin_username_id?: number | string;
          };
          payments?: TebexPayment[];
        }>(`/user/${encodeURIComponent(q)}`);
        if (user?.player) {
          username = user.player.username ?? user.player.name ?? q;
          cfxId = user.player.id != null ? String(user.player.id) : null;
        }
        // Player-lookup's player.id is the CFX id (== uuid in /payments);
        // plugin_username_id is the internal Tebex player id.
        const pluginId =
          user?.player?.plugin_username_id != null
            ? String(user.player.plugin_username_id)
            : null;

        // Rich rows from the full /payments history (buyer, product, amount).
        // Match on the resolved CFX uuid / plugin id so results are exact even
        // when the raw query doesn't textually match the stored name.
        const history = await fetchAllPaymentsDetailed();
        if (!history.complete) incomplete = true;
        const all = history.payments;
        const nameNeedle = normName(q);
        const matched = all.filter((p) => {
          const name = normName(p.player?.name ?? p.name ?? "");
          const uuid = String(p.player?.uuid ?? "").toLowerCase();
          const pid = String(p.player?.id ?? "").toLowerCase();
          const txn = String(p.txn_id ?? p.id ?? "").toLowerCase();
          const email = (p as { email?: string }).email?.toLowerCase() ?? "";
          return (
            (cfxId != null && uuid === cfxId.toLowerCase()) ||
            (pluginId != null && pid === pluginId.toLowerCase()) ||
            (nameNeedle !== "" && name.includes(nameNeedle)) ||
            txn.includes(needle) ||
            email.includes(needle) ||
            uuid.includes(needle) ||
            pid.includes(needle)
          );
        });
        if (!username && matched[0]) username = matched[0].player?.name ?? matched[0].name ?? null;
        if (!cfxId && matched[0]?.player?.uuid != null) cfxId = String(matched[0].player!.uuid);
        push(matched);

        // Name → CFX ids, from everyone the payment scan matched …
        for (const p of matched) {
          if (p.player?.uuid != null) resolved.add(String(p.player.uuid));
          const n = p.player?.name ?? p.name;
          if (n) resolved.add(n);
        }
        // … and from our own records, so people who never bought through Tebex
        // (but have a wishlist / newsletter entry) can be resolved as well.
        if (cfg.store && nameNeedle !== "") {
          const [wishlists, subscribers] = await Promise.all([readAllWishlists(), readSubscribers()]);
          for (const w of wishlists ?? []) {
            if (normName(w.username).includes(nameNeedle)) resolved.add(w.cfxId);
          }
          for (const s of subscribers) {
            if (normName(s.username).includes(nameNeedle)) resolved.add(s.cfxId);
          }
        }
        // A one-letter query matches half the store; don't let that turn the
        // created-payments search into "show everything".
        if (resolved.size > 40) resolved.clear();

        // Fallback only when the history scan found nothing: enrich each
        // player-lookup stub via its single-payment detail (has packages).
        if (matched.length === 0 && user?.payments?.length) {
          const details = await Promise.all(
            user.payments.map((lp) => {
              const txn = String(lp.txn_id ?? lp.id ?? "");
              return txn ? tebexPlugin<TebexPayment>(`/payments/${txn}`) : Promise.resolve(null);
            }),
          );
          user.payments.forEach((lp, i) => {
            const base = details[i] ?? lp;
            push([
              {
                ...base,
                player: base.player ?? { id: user.player?.id, name: username ?? undefined },
              },
            ]);
          });
        }
      } else {
        // No query → show the entire store history.
        const history = await fetchAllPaymentsDetailed();
        if (!history.complete) incomplete = true;
        push(history.payments);
      }
    }

    // 2) Manual payments & gifts we made ourselves (audit log in the database).
    if (cfg.store) {
      const bin = { logs: await readLogs() };
      // Same comparison form as the payment scan (case, accents, spacing).
      const idents = [
        ...new Set(
          [q, cfxId, username, ...resolved].map((x) => normName(x ?? "")).filter((x) => x !== ""),
        ),
      ];
      const logPurchases = filterCreatedPayments(bin?.logs ?? [], idents, q !== "").map(
        logToPurchase,
      );

      if (logPurchases.length > 0) {
        if (!username && q) {
          username =
            (bin?.logs ?? []).find((l) => normName(l.cfxName ?? "").includes(normName(q)))
              ?.cfxName ?? null;
        }
        purchases = [...logPurchases, ...purchases];
      }
    }

    purchases.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));

    return { configured: cfg.tebexSecret || cfg.store, username, cfxId, purchases, incomplete };
  });

// Called when the lookup page opens: starts loading the payment history in the
// background and returns at once, so the history is usually ready by the time
// the admin has typed a name. Safe to call repeatedly (crawls are shared).
export const warmLookupCache = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    await requireAccess(data.basketIdent, "lookup.view");
    if (config().tebexSecret) void fetchAllPaymentsDetailed().catch(() => {});
    return { ok: true };
  });

// ── wishlists (cross-user) ──────────────────────────────────────────────────

export type AdminWishlistEntry = {
  cfxId: string;
  username: string;
  packageId: number;
  packageName: string;
  image: string | null;
  price: number;
  currency: string;
  addedAt: string; // ISO
};

export const fetchAdminWishlists = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(
    async ({ data }): Promise<{ configured: boolean; entries: AdminWishlistEntry[] }> => {
      await requireAccess(data.basketIdent, "wishlist.view");
      if (!config().store) return { configured: false, entries: [] };

      const all = (await readAllWishlists()) ?? [];
      const entries: AdminWishlistEntry[] = [];
      const nameCache = new Map<string, string>();
      for (const bucket of all) {
        const cfxId = bucket.cfxId;
        let username = bucket.username;
        if (!username || username === "Unknown") {
          const cached = nameCache.get(cfxId);
          if (cached) {
            username = cached;
          } else {
            const u = await tebexPlugin<{ player?: { username?: string; name?: string } }>(
              `/user/${encodeURIComponent(cfxId)}`,
            );
            username = u?.player?.username ?? u?.player?.name ?? cfxId;
            nameCache.set(cfxId, username);
          }
        }
        for (const it of bucket.items ?? []) {
          const addedAt = toIso(it.addedAt) ?? new Date().toISOString();
          entries.push({
            cfxId,
            username,
            packageId: it.packageId,
            packageName: it.packageName,
            image: it.image,
            price: it.price,
            currency: it.currency,
            addedAt,
          });
        }
      }
      entries.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
      return { configured: true, entries };
    },
  );

const wishlistActionInput = z.object({
  basketIdent: z.string().min(1),
  cfxId: z.string().min(1),
  packageId: z.number().int().positive(),
});

// Removes one wish from one user's wishlist. Only that user's row is touched.
async function removeFromWishlistBin(cfxId: string, packageId: number): Promise<boolean> {
  const found = await findWishlist(cfxId); // case-insensitive
  if (!found) return false; // no wishlist, or the lookup failed
  const items = found.items.filter((i) => i.packageId !== packageId);
  return items.length === 0
    ? deleteWishlist(found.cfxId)
    : saveWishlist({ ...found, items });
}

export const removeWishlistEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => wishlistActionInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "wishlist.remove");
    if (!config().store) return { ok: false, reason: "store_not_configured" };
    const ok = await removeFromWishlistBin(data.cfxId, data.packageId);
    if (ok) {
      await appendLog(
        makeLog("admin.action", await actorName(data.basketIdent), {
          cfxName: data.cfxId,
          detail: `Wunsch #${data.packageId} entfernt`,
        }),
      );
    }
    return { ok };
  });

// Gift = deliver the package free of charge. Logs the action and clears the wish.
export const giftWishlistEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => wishlistActionInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "wishlist.gift");
    if (!config().tebexSecret) return { ok: false, reason: "tebex_secret_missing" };

    // Only this user's wishlist row is needed (case-insensitive lookup).
    const wishlist = config().store ? ((await findWishlist(data.cfxId)) ?? null) : null;
    const item = wishlist?.items.find((i) => i.packageId === data.packageId) ?? null;

    const lookup = await tebexPlugin<{ player?: { username?: string; name?: string } }>(
      `/user/${encodeURIComponent(data.cfxId)}`,
    );
    const ign =
      lookup?.player?.username ??
      lookup?.player?.name ??
      wishlist?.username ??
      data.cfxId;

    const fields =
      (await tebexPlugin<Array<{ name?: string; type?: string; options?: Array<{ value?: unknown }> | false }>>(
        `/payments/fields/${data.packageId}`,
      )) ?? [];

    const options: Record<string, unknown> = {};
    for (const f of fields) {
      const name = f.name?.trim();
      if (!name) continue;
      if (f.type === "username") options[name] = ign;
      else if (Array.isArray(f.options) && f.options.length > 0) options[name] = f.options[0]?.value;
      else if (f.type === "numeric") options[name] = 0;
    }

    const paymentCreated = await tebexPluginPost<{}>("/payments", {
      note: `Admin gift from wishlist for CFX ${data.cfxId}`,
      ign,
      price: 0,
      packages: [{ id: data.packageId, options }],
    });
    if (!paymentCreated) return { ok: false, reason: "tebex_payment_failed" };

    const manualTxn = `gift-${data.cfxId}-${Date.now()}`;

    await appendLog(
      makeLog("purchase.success", await actorName(data.basketIdent), {
        cfxName: wishlist?.username ?? data.cfxId,
        tebexId: manualTxn,
        packageName: item?.packageName ?? `Paket #${data.packageId}`,
        amount: 0,
        currency: item?.currency ?? "EUR",
        paymentMethod: "Gratis (Admin-Gift)",
        detail: "Wunschlisten-Produkt als 0€-Gift vergeben",
      }),
    );

    await appendLog(
      makeLog("admin.action", await actorName(data.basketIdent), {
        cfxName: wishlist?.username ?? data.cfxId,
        packageName: item?.packageName ?? String(data.packageId),
        amount: 0,
        currency: item?.currency ?? "EUR",
        paymentMethod: "Gift (0 €)",
        detail: "Kostenlos verschenkt",
      }),
    );

    if (config().store) await removeFromWishlistBin(data.cfxId, data.packageId);
    return { ok: true };
  });

// ── logs ────────────────────────────────────────────────────────────────────

export type AdminLog = LogEntry;

export const fetchAdminLogs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<{ configured: boolean; logs: AdminLog[] }> => {
    await requireAccess(data.basketIdent, "logs.view");

    const logs: AdminLog[] = [];

    // Purchases pulled live from Tebex — complete history (all pages).
    if (config().tebexSecret) {
      const payments = await fetchAllPayments();
      for (const p of payments) {
        const pkg = packagesOf(p);
        logs.push({
          id: String(p.txn_id ?? p.id ?? Math.random()),
          at: toIso(p.date ?? p.time) ?? new Date().toISOString(),
          type: statusToLogType(p.status),
          actor: null,
          cfxName: p.player?.name ?? p.name ?? null,
          tebexId: String(p.txn_id ?? p.id ?? ""),
          packageName: pkg.name,
          amount: toNumber(p.amount ?? p.price),
          currency: currencyOf(p),
          paymentMethod: p.gateway?.name ?? null,
          detail: p.status != null ? String(p.status) : null,
        });
      }
    }

    // Admin actions & wishlist events stored in the database.
    if (config().store) {
      for (const l of await readLogs()) logs.push(l);
    }

    logs.sort((a, b) => (a.at < b.at ? 1 : -1));
    return { configured: config().tebexSecret || config().store, logs };
  });

// ── e-mail subscribers (admin) ──────────────────────────────────────────────

export type AdminSubscriber = SubscriberEntry;

export const fetchSubscribers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(
    async ({ data }): Promise<{ configured: boolean; subscribers: AdminSubscriber[] }> => {
      await requireAccess(data.basketIdent, "contact.send");
      if (!subscribersConfigured()) return { configured: false, subscribers: [] };
      const subs = await readSubscribers();
      subs.sort((a, b) => (a.at < b.at ? 1 : -1));
      return { configured: true, subscribers: subs };
    },
  );

const subscriberActionInput = z.object({
  basketIdent: z.string().min(1),
  cfxId: z.string().min(1),
});

export const removeSubscriber = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => subscriberActionInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "contact.send");
    if (!subscribersConfigured()) return { ok: false, reason: "store_not_configured" };
    // Single-row delete; the removed row comes back so it can be logged.
    const target = await deleteSubscriber(data.cfxId);
    if (target === false) return { ok: false, reason: "store_unavailable" };
    if (target) {
      await appendLog(
        makeLog("email.remove", await actorName(data.basketIdent), {
          cfxName: target.username,
          tebexId: target.cfxId,
          detail: `E-Mail entfernt (Admin): ${target.email}`,
        }),
      );
    }
    return { ok: true };
  });

export const toggleSubscriberHidden = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => subscriberActionInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; hidden?: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "contact.send");
    if (!subscribersConfigured()) return { ok: false, reason: "store_not_configured" };
    const current = (await readSubscribers()).find((s) => s.cfxId === data.cfxId);
    if (!current) return { ok: false, reason: "not_found" };
    // Single-row update of one column; no other subscriber is written.
    const target = await setSubscriberHidden(data.cfxId, !current.hidden);
    if (target === false) return { ok: false, reason: "store_unavailable" };
    if (!target) return { ok: false, reason: "not_found" };
    const ok = true;
    if (ok) {
      await appendLog(
        makeLog("email.hide", await actorName(data.basketIdent), {
          cfxName: target.username,
          tebexId: target.cfxId,
          detail: target.hidden
            ? `E-Mail vom Versand ausgeblendet: ${target.email}`
            : `E-Mail wieder aktiviert: ${target.email}`,
        }),
      );
    }
    return { ok, hidden: target.hidden };
  });

// ── e-mail templates (lod-emails bin) ───────────────────────────────────────

export type AdminEmailTemplate = EmailTemplate;

export const fetchTemplates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<{ configured: boolean; templates: AdminEmailTemplate[] }> => {
    await requireAccess(data.basketIdent, "contact.send");
    if (!templatesConfigured()) return { configured: false, templates: [] };
    const templates = await readTemplates();
    templates.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
    return { configured: true, templates };
  });

const saveTemplateInput = z.object({
  basketIdent: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  subject: z.string().max(200).optional().default(""),
  body: z.string().max(20000).optional().default(""),
});

// Saves a template by name: overwrites an existing template with the same
// (case-insensitive) name, otherwise creates a new one.
export const saveTemplate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => saveTemplateInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; replaced?: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "contact.send");
    if (!templatesConfigured()) return { ok: false, reason: "store_not_configured" };
    const templates = await readTemplates();
    const now = new Date().toISOString();
    const existing = templates.find(
      (t) => t.name.toLowerCase() === data.name.toLowerCase(),
    );
    const replaced = !!existing;
    // Single-row upsert: only this template is written.
    const ok = await upsertTemplate({
      id: existing?.id ?? `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      name: existing?.name ?? data.name,
      subject: data.subject,
      body: data.body,
      at: now,
    });
    if (ok) {
      await appendLog(
        makeLog("email.template.save", await actorName(data.basketIdent), {
          detail: `${replaced ? "Vorlage ersetzt" : "Vorlage gespeichert"}: ${data.name}`,
        }),
      );
    }
    return { ok, replaced };
  });

const templateIdInput = z.object({
  basketIdent: z.string().min(1),
  id: z.string().min(1),
});

export const removeTemplate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => templateIdInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "contact.send");
    if (!templatesConfigured()) return { ok: false, reason: "store_not_configured" };
    // Single-row delete; the removed row comes back so it can be logged.
    const target = await deleteTemplate(data.id);
    if (target === false) return { ok: false, reason: "store_unavailable" };
    if (target) {
      await appendLog(
        makeLog("email.template.remove", await actorName(data.basketIdent), {
          detail: `Vorlage gelöscht: ${target.name}`,
        }),
      );
    }
    return { ok: true };
  });

// ── contact / email broadcast ───────────────────────────────────────────────

const aiDraftInput = z.object({
  basketIdent: z.string().min(1),
  prompt: z.string().min(1).max(2000),
});

const AI_SYSTEM =
  "Du bist ein Marketing-Assistent für LODStudios (FiveM Asset Store). " +
  "Erstelle eine professionelle E-Mail auf Deutsch. Antworte ausschließlich " +
  'als reines JSON: {"subject": string, "body": string}. Der body ist ' +
  "Klartext mit Absätzen (Leerzeile = neuer Absatz).";

function parseAiJson(content: string): { subject: string; body: string } {
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = match
    ? (JSON.parse(match[0]) as { subject?: string; body?: string })
    : {};
  return { subject: parsed.subject ?? "", body: parsed.body ?? content };
}

// Primary provider: Google Gemini (free tier). Falls back to OpenAI
// (if the account has credits) and finally the tokenless Pollinations endpoint.
async function geminiDraft(prompt: string): Promise<{ subject: string; body: string } | null> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return null;
  const model = process.env["GEMINI_MODEL"] || "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai] Gemini ${res.status}: ${detail.slice(0, 300)}`);
    return null;
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  return content ? parseAiJson(content) : null;
}

async function openaiDraft(prompt: string): Promise<{ subject: string; body: string } | null> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env["OPENAI_MODEL"] || "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: AI_SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai] OpenAI ${res.status}: ${detail.slice(0, 300)}`);
    // 429 without spend usually means the account has no credits/quota.
    throw new Error(res.status === 429 ? "openai_quota" : "openai_error");
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  return content ? parseAiJson(content) : null;
}

async function pollinationsDraft(
  prompt: string,
): Promise<{ subject: string; body: string } | null> {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages: [
        { role: "system", content: AI_SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai] Pollinations ${res.status}: ${detail.slice(0, 200)}`);
    return null;
  }
  const text = await res.text();
  let content = text;
  try {
    const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    content = json.choices?.[0]?.message?.content ?? text;
  } catch {
    // pollinations may return raw text
  }
  return parseAiJson(content);
}

export const generateEmailDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => aiDraftInput.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      subject?: string;
      body?: string;
      provider?: string;
      reason?: string;
    }> => {
      await requireAccess(data.basketIdent, "contact.send");
      let reason = "ai_error";
      try {
        const viaGemini = await geminiDraft(data.prompt);
        if (viaGemini) return { ok: true, provider: "gemini", ...viaGemini };
      } catch {
        // fall through to next provider
      }
      try {
        const viaOpenai = await openaiDraft(data.prompt);
        if (viaOpenai) return { ok: true, provider: "chatgpt", ...viaOpenai };
      } catch (err) {
        reason = err instanceof Error && err.message === "openai_quota" ? "openai_quota" : "openai_error";
      }
      try {
        const viaFree = await pollinationsDraft(data.prompt);
        if (viaFree) return { ok: true, provider: "pollinations", ...viaFree };
      } catch {
        // all providers failed
      }
      return { ok: false, reason };
    },
  );

const mailAttachmentInput = z.object({
  name: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  // Raw base64 (no data: prefix). ~6 MB per file after decoding.
  dataBase64: z.string().min(1).max(8_400_000),
});

const broadcastInput = z.object({
  basketIdent: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  attachments: z.array(mailAttachmentInput).max(10).optional().default([]),
});

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Wraps the plain-text body into a branded HTML shell (paragraphs on blank line).
// `inlineImages` are rendered at the bottom via cid references so they show up
// as embedded images in the email client.
function broadcastHtml(
  subject: string,
  body: string,
  inlineImages: { cid: string; name: string }[] = [],
): string {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font:400 15px/1.7 Arial,sans-serif;color:#1a1a1a;">${escapeHtml(
          p,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
  const gallery =
    inlineImages.length > 0
      ? `<div style="margin-top:8px;">${inlineImages
          .map(
            (img) =>
              `<img src="cid:${img.cid}" alt="${escapeHtml(img.name)}" style="display:block;max-width:100%;height:auto;margin:0 0 12px;border-radius:8px;" />`,
          )
          .join("")}</div>`
      : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
    <tr><td style="padding:26px 28px;background:#0C0C0D;">
      <div style="font:700 11px/1.4 Arial,sans-serif;letter-spacing:4px;text-transform:uppercase;color:#FF3B3B;">LODStudios</div>
      <div style="margin-top:8px;font:700 22px/1.3 Arial,sans-serif;color:#ffffff;">${escapeHtml(subject)}</div>
    </td></tr>
    <tr><td style="padding:28px;">${paragraphs}${gallery}</td></tr>
    <tr><td style="padding:18px 28px;background:#fafafa;border-top:1px solid #ececec;font:400 12px/1.6 Arial,sans-serif;color:#8a8a8a;">
      Du erhältst diese E-Mail, weil du dich bei LODStudios registriert hast. Du kannst deine Adresse jederzeit im Profil widerrufen.
    </td></tr>
  </table></body></html>`;
}

export const sendBroadcastEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => broadcastInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; sent?: number; failed?: number; reason?: string }> => {
    await requireAccess(data.basketIdent, "contact.send");
    if (!config().email) return { ok: false, reason: "email_not_configured" };
    if (!subscribersConfigured()) return { ok: false, reason: "no_subscriber_store" };

    const recipients = (await readSubscribers()).filter((s) => !s.hidden);
    if (recipients.length === 0) return { ok: true, sent: 0 };

    // Inline images get a cid and are embedded in the HTML; other files ride
    // along as regular attachments.
    const mailAttachments: MailAttachment[] = [];
    const inlineImages: { cid: string; name: string }[] = [];
    (data.attachments ?? []).forEach((att, i) => {
      const isImage = att.contentType.startsWith("image/");
      const cid = isImage ? `att${i}@lodstudios` : undefined;
      if (isImage && cid) inlineImages.push({ cid, name: att.name });
      mailAttachments.push({
        filename: att.name,
        contentType: att.contentType,
        contentBase64: att.dataBase64,
        cid,
      });
    });

    const html = broadcastHtml(data.subject, data.body, inlineImages);
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      try {
        await sendGmail({
          to: r.email,
          subject: data.subject,
          html,
          fromName: "LODStudios",
          attachments: mailAttachments,
        });
        sent++;
      } catch {
        failed++;
      }
    }

    await appendLog(
      makeLog("email.broadcast", await actorName(data.basketIdent), {
        detail: `Broadcast „${data.subject}" an ${sent} Empfänger${failed ? ` (${failed} fehlgeschlagen)` : ""}`,
      }),
    );

    return { ok: true, sent, failed };
  });

// ── management actions (refund / payment / coupon / giftcard / roster) ───────

const refundInput = z.object({
  basketIdent: z.string().min(1),
  transactionId: z.string().min(1),
});

export const createRefund = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => refundInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "management.refund");
    if (!config().tebexSecret) return { ok: false, reason: "tebex_secret_missing" };
    return { ok: false, reason: "not_implemented" };
  });

export type AdminSale = {
  txnId: string;
  date: string | null;
  buyer: string;
  packageName: string;
  amount: number | null;
  currency: string;
  status: string | null;
};

export const fetchAllSales = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<AdminSale[]> => {
    await requireAccess(data.basketIdent, "management.refund");
    if (!config().tebexSecret) return [];
    const payments = await fetchAllPayments();
    return payments
      .map((p) => {
        const pkg = packagesOf(p);
        return {
          txnId: String(p.txn_id ?? p.id ?? ""),
          date: toIso(p.date ?? p.time),
          buyer: p.player?.name ?? p.name ?? "—",
          packageName: pkg.name,
          amount: toNumber(p.amount ?? p.price),
          currency: currencyOf(p),
          status: statusLabel(p.status),
        };
      })
      .filter((s) => s.txnId)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  });

const paymentInput = z.object({
  basketIdent: z.string().min(1),
  cfxId: z.string().min(1),
  packageId: z.number().int().positive(),
  price: z.number().min(0),
});

export const createManualPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => paymentInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    await requireAccess(data.basketIdent, "management.payment");
    if (!config().store) return { ok: false, reason: "store_not_configured" };

    // Best-effort: resolve a friendly buyer name from the CFX id.
    let buyer = data.cfxId;
    const u = await tebexPlugin<{ player?: { username?: string; name?: string } }>(
      `/user/${encodeURIComponent(data.cfxId)}`,
    );
    if (u?.player) buyer = u.player.username ?? u.player.name ?? data.cfxId;

    // Resolve the real product name from the Tebex package catalogue.
    const packageName = (await resolvePackageName(data.packageId)) ?? `Paket #${data.packageId}`;

    // Recorded as a real payment so it appears in Lookup & Logs. The CFX id is
    // embedded in tebexId so it stays searchable while keeping a unique key.
    await appendLog(
      makeLog("purchase.success", await actorName(data.basketIdent), {
        cfxName: buyer,
        tebexId: `manual-${data.cfxId}-${Date.now()}`,
        packageName,
        amount: data.price,
        currency: "EUR",
        paymentMethod: data.price === 0 ? "Gratis (Admin)" : "Manuell (Admin)",
        detail: `Manuelle Zahlung durch Admin für CFX ${data.cfxId}, ${packageName}`,
      }),
    );
    return { ok: true };
  });

const couponInput = z.object({
  basketIdent: z.string().min(1),
  code: z.string().min(1).max(60).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  note: z.string().max(200).optional(),
  expireDate: z.string().max(10).optional(),
  redeemUnlimited: z.boolean().optional(),
  redeemLimit: z.number().int().min(0).max(1_000_000).optional(),
  couponId: z.union([z.string(), z.number()]).optional(),
  action: z.enum(["create", "delete"]),
});

export const manageCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => couponInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const perm: Permission = data.action === "create" ? "coupon.create" : "coupon.delete";
    await requireAccess(data.basketIdent, perm);
    if (!config().tebexSecret) return { ok: false, reason: "tebex_secret_missing" };

    if (data.action === "create") {
      if (!data.code?.trim()) return { ok: false, reason: "invalid_input" };
      const pct = data.discountPercent ?? 0;
      const unlimited = data.redeemUnlimited ?? true;
      const redeemLimit = unlimited ? 0 : Math.max(1, data.redeemLimit ?? 1);
      const body = {
        code: data.code.trim(),
        effective_on: "cart",
        discount_type: "percentage",
        discount_percentage: pct,
        discount_amount: 0,
        redeem_unlimited: unlimited,
        expire_never: !data.expireDate,
        expire_limit: redeemLimit,
        ...(data.expireDate ? { expire_date: data.expireDate } : {}),
        basket_type: "both",
        minimum: 0,
        note: data.note?.trim() || "",
      };
      const res = await tebexPluginSend("POST", "/coupons", body);
      if (!res.ok) return { ok: false, reason: "tebex_error" };
      const usesLabel = unlimited ? "unbegrenzt" : `${redeemLimit}x`;
      await appendLog(
        makeLog("coupon.manage", await actorName(data.basketIdent), {
          detail: `Coupon erstellt: ${data.code.trim()} (${pct}%, ${usesLabel})${data.note ? `, ${data.note.trim()}` : ""}`,
        }),
      );
      return { ok: true };
    }

    // delete
    if (data.couponId == null) return { ok: false, reason: "invalid_input" };
    const res = await tebexPluginSend("DELETE", `/coupons/${encodeURIComponent(String(data.couponId))}`);
    if (!res.ok) return { ok: false, reason: "tebex_error" };
    await appendLog(
      makeLog("coupon.manage", await actorName(data.basketIdent), {
        detail: `Coupon gelöscht: ${data.code?.trim() || data.couponId}`,
      }),
    );
    return { ok: true };
  });

export const fetchCoupons = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<AdminCoupon[]> => {
    await requireAccess(data.basketIdent, "coupon.view");
    if (!config().tebexSecret) return [];
    const all: RawCoupon[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await tebexPlugin<CouponsPage>(`/coupons?page=${page}`);
      if (!res?.data?.length) break;
      all.push(...res.data);
      if (!res.pagination?.next) break;
    }
    return all.map((c) => ({
      id: c.id ?? 0,
      code: c.code ?? "—",
      discountType: c.discount?.type === "percentage" ? "percentage" : "value",
      discountValue: c.discount?.type === "percentage" ? c.discount?.percentage ?? 0 : c.discount?.value ?? 0,
      expireNever: String(c.expire?.expire_never) === "true",
      expireDate: c.expire?.date ?? null,
      redeemUnlimited: String(c.expire?.redeem_unlimited) === "true",
      redeemLimit: Number(c.expire?.limit ?? 0) || 0,
      basketType: c.basket_type ?? null,
      note: c.note ?? "",
    }));
  });

const giftcardInput = z.object({
  basketIdent: z.string().min(1),
  amount: z.number().min(0).optional(),
  note: z.string().max(200).optional(),
  expiresAt: z.string().max(20).optional(),
  cardId: z.union([z.string(), z.number()]).optional(),
  code: z.string().min(1).max(60).optional(),
  action: z.enum(["create", "delete"]),
});

export const manageGiftcard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => giftcardInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const perm: Permission = data.action === "create" ? "giftcard.create" : "giftcard.delete";
    await requireAccess(data.basketIdent, perm);
    if (!config().tebexSecret) return { ok: false, reason: "tebex_secret_missing" };

    if (data.action === "create") {
      const amount = data.amount ?? 0;
      if (amount <= 0) return { ok: false, reason: "invalid_input" };
      const body = {
        amount,
        note: data.note?.trim() || "",
        ...(data.expiresAt ? { expires_at: `${data.expiresAt} 23:59:59` } : {}),
      };
      const res = await tebexPluginSend("POST", "/gift-cards", body);
      if (!res.ok) return { ok: false, reason: "tebex_error" };
      await appendLog(
        makeLog("giftcard.manage", await actorName(data.basketIdent), {
          detail: `Giftcard erstellt: ${amount.toFixed(2)}€${data.note ? `, ${data.note.trim()}` : ""}`,
        }),
      );
      return { ok: true };
    }

    // delete = void
    if (data.cardId == null) return { ok: false, reason: "invalid_input" };
    const res = await tebexPluginSend("DELETE", `/gift-cards/${encodeURIComponent(String(data.cardId))}`);
    if (!res.ok) return { ok: false, reason: "tebex_error" };
    await appendLog(
      makeLog("giftcard.manage", await actorName(data.basketIdent), {
        detail: `Giftcard entwertet: ${data.code?.trim() || data.cardId}`,
      }),
    );
    return { ok: true };
  });

export const fetchGiftcards = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<AdminGiftcard[]> => {
    await requireAccess(data.basketIdent, "giftcard.view");
    if (!config().tebexSecret) return [];
    const res = await tebexPlugin<{ data?: RawGiftcard[] }>(`/gift-cards`);
    const list = res?.data ?? [];
    return list.map((g) => ({
      id: g.id ?? 0,
      code: g.code ?? "—",
      starting: Number(g.balance?.starting ?? 0),
      remaining: Number(g.balance?.remaining ?? 0),
      currency: g.balance?.currency ?? "EUR",
      note: g.note ?? "",
      void: g.void === true,
    }));
  });

export const fetchStorePackages = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<StorePackage[]> => {
    await requireAccess(data.basketIdent, "management.payment");
    if (!config().tebexSecret) return [];
    const list = await tebexPlugin<RawPackage[]>(`/packages`);
    return (list ?? [])
      .filter((p) => p.id != null)
      .map((p) => ({
        id: Number(p.id),
        name: p.name ?? `Paket #${p.id}`,
        price: toNumber(p.price ?? p.total_price) ?? 0,
        currency:
          typeof p.currency === "string" ? p.currency : p.currency?.iso_4217 ?? "EUR",
      }));
  });
