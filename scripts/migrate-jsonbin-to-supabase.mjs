// One-time data migration: JSONBin → Supabase.
//
//   npm run db:migrate            copy everything
//   npm run db:migrate -- --dry   show what WOULD be copied, write nothing
//
// • Needs the OLD values (JSONBIN_KEY + JSONBIN_*_BIN) and the NEW values
//   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) in .env at the same time.
// • Safe to run more than once: rows are upserted by their id, nothing is
//   duplicated and nothing in JSONBin is changed or deleted.
// • The referral program is only written while the Supabase copy is still
//   empty, so a second run can never roll back live referral data.
// • When it reports success you can delete every JSONBIN_* line from .env
//   and delete this script.
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");
const env = process.env;

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in der .env.");
  process.exit(1);
}
if (!env.JSONBIN_KEY) {
  console.error("✗ JSONBIN_KEY fehlt in der .env — ohne ihn können die alten Daten nicht gelesen werden.");
  process.exit(1);
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Reads one bin. Returns null when the bin id is not set. THROWS on failure —
 *  a bin that cannot be read must never be mistaken for an empty one. */
async function readBin(name, binId) {
  if (!binId) {
    console.log(`– ${name}: keine Bin-ID in der .env, übersprungen`);
    return null;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": env.JSONBIN_KEY, "X-Bin-Meta": "false" },
    });
    if (res.ok) return res.json();
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`${name}: JSONBin antwortet mit ${res.status} ${res.statusText}`);
  }
}

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return console.log(`✓ ${table}: nichts zu übernehmen`);
  if (DRY) return console.log(`• ${table}: ${rows.length} Zeilen würden übernommen (dry run)`);
  // Chunked so a large log history stays well inside request limits.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✓ ${table}: ${rows.length} Zeilen übernommen`);
}

const iso = (v) => {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};
const normalizeCfx = (v) => String(v).trim().toLowerCase().replace(/^fivem:/, "");
const newId = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

console.log(DRY ? "DRY RUN — es wird nichts geschrieben.\n" : "Migration JSONBin → Supabase\n");

try {
  // ── partners ──────────────────────────────────────────────────────────────
  const partners = await readBin("Partner", env.JSONBIN_PARTNERS_BIN);
  if (partners) {
    await upsert(
      "partners",
      (partners.partners ?? []).map((p) => ({
        id: p.id || newId("ptr"),
        name: p.name ?? "",
        image: p.image ?? "",
        link: p.link ?? "",
        created_at: iso(p.at),
      })),
      "id",
    );
  }

  // ── subscribers ───────────────────────────────────────────────────────────
  const subs = await readBin("Abonnenten", env.JSONBIN_SUBSCRIBERS_BIN);
  if (subs) {
    await upsert(
      "subscribers",
      (subs.subscribers ?? [])
        .filter((s) => s?.cfxId && s?.email)
        .map((s) => ({
          cfx_id: String(s.cfxId),
          username: s.username ?? "Unbekannt",
          email: s.email,
          hidden: s.hidden === true,
          created_at: iso(s.at),
        })),
      "cfx_id",
    );
  }

  // ── e-mail templates ──────────────────────────────────────────────────────
  const tpl = await readBin("E-Mail-Vorlagen", env.JSONBIN_EMAILS_BIN);
  if (tpl) {
    await upsert(
      "email_templates",
      (tpl.templates ?? []).map((t) => ({
        id: t.id || newId("tpl"),
        name: t.name ?? "",
        subject: t.subject ?? "",
        body: t.body ?? "",
        updated_at: iso(t.at),
      })),
      "id",
    );
  }

  // ── logs ──────────────────────────────────────────────────────────────────
  const logs = await readBin("Logs", env.JSONBIN_LOGS_BIN);
  if (logs) {
    const seen = new Set();
    const rows = [];
    for (const l of logs.logs ?? []) {
      let id = l.id || newId("log");
      while (seen.has(id)) id = newId("log"); // ids must be unique in the table
      seen.add(id);
      rows.push({
        id,
        at: iso(l.at),
        type: l.type ?? "unknown",
        actor: l.actor ?? null,
        cfx_name: l.cfxName ?? null,
        tebex_id: l.tebexId ?? null,
        package_name: l.packageName ?? null,
        amount: typeof l.amount === "number" ? l.amount : null,
        currency: l.currency ?? null,
        payment_method: l.paymentMethod ?? null,
        detail: l.detail ?? null,
      });
    }
    await upsert("logs", rows, "id");
  }

  // ── admin roster + custom roles ───────────────────────────────────────────
  const admins = await readBin("Admin-Liste", env.JSONBIN_ADMINS_BIN);
  if (admins) {
    const byId = new Map();
    for (const a of admins.admins ?? []) {
      if (!a?.cfxId || !a?.role) continue;
      const cfx_id = normalizeCfx(a.cfxId);
      const prev = byId.get(cfx_id);
      // If an id exists twice, a protected entry always wins.
      if (prev?.protected) continue;
      byId.set(cfx_id, {
        cfx_id,
        role: a.role,
        label: a.label ?? cfx_id,
        protected: a.protected === true,
        updated_at: iso(a.at),
      });
    }
    await upsert("admin_roster", [...byId.values()], "cfx_id");
    await upsert(
      "admin_roles",
      Object.entries(admins.roles ?? {}).map(([key, def]) => ({
        key,
        label: def?.label ?? key,
        description: def?.description ?? "",
        permissions: def?.permissions === "*" ? "*" : (def?.permissions ?? []),
      })),
      "key",
    );
  }

  // ── wishlists ─────────────────────────────────────────────────────────────
  const wl = await readBin("Wunschlisten", env.JSONBIN_WISHLIST_BIN);
  if (wl) {
    // Keys that differ only by case are the same user → merge them.
    const merged = new Map();
    for (const [cfxId, bucket] of Object.entries(wl.wishlists ?? {})) {
      const k = cfxId.trim().toLowerCase();
      const cur = merged.get(k) ?? { cfx_id: cfxId.trim(), username: "", items: [] };
      cur.username = bucket?.username || cur.username;
      for (const it of bucket?.items ?? []) {
        if (!cur.items.some((x) => x.packageId === it.packageId)) cur.items.push(it);
      }
      merged.set(k, cur);
    }
    await upsert(
      "wishlists",
      [...merged.values()]
        .filter((w) => w.items.length > 0)
        .map((w) => ({ ...w, updated_at: new Date().toISOString() })),
      "cfx_id",
    );
  }

  // ── referral program (single document) ────────────────────────────────────
  const ref = await readBin("Empfehlungsprogramm", env.JSONBIN_REFERRALS_BIN);
  if (ref) {
    const { data: current, error } = await db
      .from("referral_state")
      .select("data,version")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`referral_state: ${error.message}`);

    const alreadyUsed =
      current && (Number(current.version) > 0 || Object.keys(current.data ?? {}).length > 0);
    if (alreadyUsed) {
      console.log("– referral_state: in Supabase bereits in Benutzung, NICHT überschrieben");
    } else if (DRY) {
      const users = Object.keys(ref.users ?? {}).length;
      console.log(`• referral_state: würde übernommen (${users} Nutzer, ${(ref.referrals ?? []).length} Empfehlungen)`);
    } else {
      const { error: wErr } = await db
        .from("referral_state")
        .upsert({ id: 1, data: ref, version: 1, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (wErr) throw new Error(`referral_state: ${wErr.message}`);
      console.log(
        `✓ referral_state: übernommen (${Object.keys(ref.users ?? {}).length} Nutzer, ${(ref.referrals ?? []).length} Empfehlungen)`,
      );
    }
  }

  console.log(
    DRY
      ? "\nDry run beendet — nichts wurde geschrieben."
      : "\nFertig. ✔  Prüfe mit „npm run db:check“. Danach kannst du alle JSONBIN_*-Zeilen aus der .env löschen.",
  );
} catch (err) {
  console.error(`\n✗ Abgebrochen: ${err.message}`);
  console.error("  Es wurde nichts gelöscht. Behebe das Problem und starte das Skript einfach erneut.");
  process.exit(1);
}
