// Crawls the COMPLETE Tebex payment history and stores it as the snapshot the
// server tops up on demand (Supabase Storage: payments-cache/history-v1.json).
//
//   npm run db:payments
//
// Run it once after deploying (and again any time you want a full refresh, e.g.
// to pick up refunds of old payments). Safe to repeat.
import { createClient } from "@supabase/supabase-js";

const secret = process.env.TEBEX_SECRET;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!secret || !url || !key) {
  console.error("✗ TEBEX_SECRET, SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen in der .env stehen.");
  process.exit(1);
}

const BUCKET = "payments-cache";
const FILE = "history-v1.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(n) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(`https://plugin.tebex.io/payments?paged=1&page=${n}`, {
        headers: { "X-Tebex-Secret": secret, Accept: "application/json" },
      });
      if (res.ok) {
        const body = await res.json();
        if (Number(body.current_page) !== n) throw new Error(`got page ${body.current_page}`);
        return body;
      }
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 6) throw e;
    }
    await sleep(800 * attempt);
  }
}

const first = await page(1);
const last = first.last_page;
console.log(`Tebex: ${first.total} Zahlungen auf ${last} Seiten`);
const pages = new Map([[1, first.data]]);
const todo = Array.from({ length: last - 1 }, (_, i) => i + 2);
for (let i = 0; i < todo.length; i += 4) {
  const batch = todo.slice(i, i + 4);
  const res = await Promise.all(batch.map(page));
  res.forEach((b, j) => pages.set(batch[j], b.data));
  process.stdout.write(`\r  ${pages.size}/${last} Seiten`);
}
console.log();

const seen = new Set();
const payments = [];
for (let n = 1; n <= last; n++) {
  for (const p of pages.get(n) ?? []) {
    const id = String(p.id ?? p.txn_id ?? "");
    if (id && seen.has(id)) continue;
    seen.add(id);
    payments.push(p);
  }
}
console.log(`${payments.length} eindeutige Zahlungen (${payments.filter((p) => Number(p.amount) === 0).length} kostenlos)`);
if (payments.length < first.total * 0.98) {
  console.error(`✗ Nur ${payments.length} von ${first.total} geladen – nichts gespeichert. Bitte nochmal ausführen.`);
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const body = new Blob([JSON.stringify({ at: Date.now(), payments })], { type: "application/json" });
let { error } = await db.storage.from(BUCKET).upload(FILE, body, { upsert: true, contentType: "application/json" });
if (error && /not found|bucket/i.test(error.message)) {
  const created = await db.storage.createBucket(BUCKET, { public: false });
  if (created.error) throw created.error;
  ({ error } = await db.storage.from(BUCKET).upload(FILE, body, { upsert: true, contentType: "application/json" }));
}
if (error) {
  console.error("✗ Speichern fehlgeschlagen:", error.message);
  process.exit(1);
}
console.log(`✓ Snapshot gespeichert (${(body.size / 1e6).toFixed(1)} MB)`);
