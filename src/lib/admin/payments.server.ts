// ============================================================================
//  SERVER-ONLY — Tebex payment history
// ============================================================================
//  Everything that reads payments — from Tebex or from our own log table —
//  lives here rather than in admin.functions.ts.
//
//  WHY THIS IS A SEPARATE MODULE: the server functions in admin.functions.ts are
//  compiled into fetch stubs for the browser, so their imports vanish from the
//  client bundle. PLAIN exported functions are NOT compiled away. While these
//  lived next to the server functions, every page importing an admin helper (the
//  admin panel via use-admin, /profile and /purchases via tebex-account) dragged
//  db.server.ts into the client bundle, where its browser guard threw on load and
//  took the whole page down — which is why no purchases were ever rendered.
import "../load-env.server";
import {
  dbConfigured,
  readLogs,
  readPaymentsSnapshot,
  writePaymentsSnapshot,
  type LogEntry,
} from "../db.server";

const PLUGIN_BASE = "https://plugin.tebex.io";
const hasTebexSecret = () => !!process.env["TEBEX_SECRET"];

export type TebexPayment = {
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
      if (result.complete) {
        _paymentsCache = { at: Date.now(), data: result.payments };
        void writePaymentsSnapshot(result.payments);
      }
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
  const seen = new Set<string>();
  const out: TebexPayment[] = [];
  for (const p of [...recent, ...base]) {
    const key = paymentKey(p);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(p);
  }
  return out;
}

// How long a request may wait for the full history before answering with what
// it has (newest payments + whatever was cached).
const HISTORY_WAIT_MS = 6_000;

// Tops the stored history up with the newest pages: the first pages are always
// re-read (new payments, refunds of recent ones), further pages only while they
// still contain payments we did not know yet.
const TOPUP_MIN_PAGES = 4;
const TOPUP_MAX_PAGES = 30;
let _topUpInflight: Promise<TebexPayment[]> | null = null;

function topUpHistory(base: TebexPayment[]): Promise<TebexPayment[]> {
  if (_topUpInflight) return _topUpInflight;
  _topUpInflight = (async () => {
    const known = new Set(base.map(paymentKey).filter(Boolean));
    const baseById = new Map(base.map((p) => [paymentKey(p), p]));
    const fetched: TebexPayment[] = [];
    let changed = false;
    let more = true;
    for (let page = 1; more && page <= TOPUP_MAX_PAGES; ) {
      const batch = page === 1 ? TOPUP_MIN_PAGES : 1;
      const results = await Promise.all(
        Array.from({ length: batch }, (_, i) => fetchPaymentsPage(page + i)),
      );
      more = false;
      for (const r of results) {
        if (r === null) return base; // rate limited etc.: keep what we have
        const rows = Array.isArray(r) ? r : (r.data ?? []);
        const fresh = rows.filter((p) => !known.has(paymentKey(p)));
        if (fresh.length > 0) changed = true;
        fresh.forEach((p) => known.add(paymentKey(p)));
        fetched.push(...rows);
        more = fresh.length > 0 && rows.length > 0;
      }
      page += batch;
    }
    // A refund / chargeback changes the status of an already known payment.
    changed ||= fetched.some((p) => {
      const old = baseById.get(paymentKey(p));
      return old !== undefined && String(old.status) !== String(p.status);
    });
    const merged = mergePayments(fetched, base);
    _paymentsCache = { at: Date.now(), data: merged };
    if (changed) void writePaymentsSnapshot(merged);
    return merged;
  })().finally(() => {
    _topUpInflight = null;
  });
  return _topUpInflight;
}

// How long a request waits for the top-up before answering with what it has.
// The top-up has to run INSIDE the request: on a serverless host nothing keeps
// running once the response is sent, so a fire-and-forget refresh never
// finished and the history never moved past the stored snapshot. The first
// batch (the 100 newest payments) takes well under a second, so in practice
// the answer includes everything recent.
const TOPUP_WAIT_MS = 2_500;

async function toppedUp(base: TebexPayment[], waitMs: number): Promise<TebexPayment[]> {
  await Promise.race([topUpHistory(base).catch(() => base), sleep(waitMs)]);
  return _paymentsCache?.data ?? base;
}

export async function fetchAllPaymentsDetailed(
  opts: { waitMs?: number } = {},
): Promise<PaymentsResult> {
  const recentP = fetchRecentPayments().catch(() => [] as TebexPayment[]);
  const age = _paymentsCache ? Date.now() - _paymentsCache.at : Infinity;
  const topUpWait = opts.waitMs ?? TOPUP_WAIT_MS;

  if (_paymentsCache && age < PAYMENTS_FRESH) {
    return { payments: mergePayments(await recentP, _paymentsCache.data), complete: true };
  }
  if (_paymentsCache && age < PAYMENTS_MAX_AGE) {
    const data = await toppedUp(_paymentsCache.data, topUpWait);
    return { payments: mergePayments(await recentP, data), complete: true };
  }

  // Cold start: the stored history (Supabase) is the complete base — one file
  // download instead of 240+ Tebex requests — topped up with the newest pages.
  const snapshot = await readPaymentsSnapshot<TebexPayment>();
  if (snapshot) {
    _paymentsCache = { at: Date.now(), data: snapshot.payments };
    const data = await toppedUp(snapshot.payments, topUpWait);
    return { payments: mergePayments(await recentP, data), complete: true };
  }

  // Nothing stored yet: crawl everything (the result is stored for next time),
  // but never wait for it longer than the budget — the newest payments are
  // enough to answer.
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

export async function fetchAllPayments(): Promise<TebexPayment[]> {
  return (await fetchAllPaymentsDetailed()).payments;
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  if (typeof v === "string") {
    if (/^\d+$/.test(v)) return new Date(Number(v) * 1000).toISOString();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function currencyOf(p: TebexPayment): string {
  if (typeof p.currency === "string") return p.currency;
  return p.currency?.iso_4217 ?? "EUR";
}

export function packagesOf(p: TebexPayment): { id: number | null; name: string } {
  const first = p.packages?.[0];
  const names = (p.packages ?? []).map((x) => x.name).filter(Boolean).join(", ");
  return { id: first?.id ?? null, name: names || "—" };
}

// Player-lookup returns a numeric payment status; the /payments list uses text.
export function statusLabel(status?: string | number | null): string | null {
  if (status == null || status === "") return null;
  if (typeof status === "number" || /^\d+$/.test(String(status))) {
    const map: Record<string, string> = { "1": "Complete", "2": "Refund", "3": "Chargeback" };
    return map[String(status)] ?? String(status);
  }
  return String(status);
}

export function statusToLogType(status?: string | number): LogEntry["type"] {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("refund") || s.includes("chargeback") || s.includes("declin"))
    return "purchase.declined";
  return "purchase.success";
}

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
  /** Payment gateway ("Tebex Checkout", "Manual") or, for rows we created
   *  ourselves, the method recorded in the log ("Gratis (Admin)"). */
  method: string | null;
};

export function normName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function mapLookup(p: TebexPayment): LookupPurchase {
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
    method: p.gateway?.name ?? null,
  };
}

// Manual payments / gifts we recorded ourselves (audit log table) → lookup rows.
// Created payments carry the CFX id inside their key ("manual-<id>-<ts>" /
// "gift-<id>-<ts>") and in their detail text ("… für CFX <id> …").
export function createdForCfxId(l: LogEntry): string | null {
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

export function logToPurchase(l: LogEntry): LookupPurchase {
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
    method: l.paymentMethod ?? null,
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

  if (hasTebexSecret()) {
    const history = await fetchAllPaymentsDetailed(opts);
    complete = history.complete;
    for (const p of history.payments) {
      if (String(p.player?.uuid ?? "").toLowerCase() !== id) continue;
      if (/declin/i.test(String(statusLabel(p.status) ?? ""))) continue; // never went through
      out.push(mapLookup(p));
    }
  }

  if (dbConfigured()) {
    const logs = await readLogs().catch(() => [] as LogEntry[]);
    for (const l of logs ?? []) {
      if (l.paymentMethod == null && l.amount == null) continue; // not a payment
      if ((createdForCfxId(l) ?? "").trim().toLowerCase() !== id) continue;
      out.push(logToPurchase(l));
    }
  }
  return { purchases: out, complete };
}
