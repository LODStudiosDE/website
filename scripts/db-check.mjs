// Verifies the Supabase connection and that every table from
// supabase/schema.sql exists and is reachable with the service role key.
//
//   npm run db:check
//
// Read-only: it never writes anything.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "✗ SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY fehlen in der .env.\n" +
      "  Supabase → Project Settings → API: „Project URL“ und „service_role“ eintragen.",
  );
  process.exit(1);
}

// A service_role JWT carries role=service_role. Catch the classic mistake of
// pasting the anon key, which would make every table look empty / forbidden.
try {
  const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"));
  if (payload.role && payload.role !== "service_role") {
    console.error(
      `✗ In SUPABASE_SERVICE_ROLE_KEY steht der „${payload.role}“-Key. Benötigt wird der „service_role“-Key.`,
    );
    process.exit(1);
  }
} catch {
  // New-style (non-JWT) secret keys can't be inspected — that's fine.
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const TABLES = [
  "partners",
  "subscribers",
  "email_templates",
  "logs",
  "admin_roster",
  "admin_roles",
  "wishlists",
  "referral_state",
];

let failed = 0;
console.log(`Supabase: ${url}\n`);
for (const table of TABLES) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) {
    failed++;
    const missing = error.code === "42P01" || error.code === "PGRST205" || /does not exist|not find the table/i.test(error.message);
    console.log(
      `✗ ${table.padEnd(16)} ${missing ? "Tabelle fehlt → supabase/schema.sql im SQL-Editor ausführen" : error.message}`,
    );
  } else {
    console.log(`✓ ${table.padEnd(16)} ${String(count ?? 0).padStart(5)} Zeilen`);
  }
}

if (failed === 0) {
  const { count } = await db
    .from("admin_roster")
    .select("*", { count: "exact", head: true })
    .eq("protected", true);
  if (!count) {
    console.log(
      "\n⚠ Es gibt noch KEINEN geschützten Standard-Account (LODStudios) in der Datenbank.\n" +
        "  Entweder alte Daten übernehmen:   npm run db:migrate\n" +
        "  oder neu anlegen:                 npm run db:founder -- DEINE_CFX_ID",
    );
  } else {
    console.log("\n✓ Geschützter Standard-Account ist in der Datenbank vorhanden.");
  }
  console.log("\nAlles erreichbar. ✔");
} else {
  console.log(`\n${failed} Problem(e) gefunden.`);
  process.exit(1);
}
