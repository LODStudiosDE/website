// Creates the protected default admin account (LODStudios) in the database.
//
//   npm run db:founder -- <CFX-ID>
//   npm run db:founder -- <CFX-ID> "Anzeigename"
//
// The CFX id is passed on the command line on purpose: it is stored ONLY in the
// database, never in the code, the repo or the .env.
//
// Not needed if you ran `npm run db:migrate` — that already copies the protected
// account over from the old data. Running this for an account that already
// exists changes nothing.
import { createClient } from "@supabase/supabase-js";

const [rawId, label = "LODStudios"] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in der .env.");
  process.exit(1);
}

const cfxId = String(rawId ?? "").trim().toLowerCase().replace(/^fivem:/, "");
if (!/^[a-z0-9_-]{1,64}$/.test(cfxId)) {
  console.error(
    "✗ Bitte die CFX-/FiveM-ID angeben, z. B.:  npm run db:founder -- 1234567\n" +
      "  (nur die ID, ohne „fivem:“)",
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: existing, error: readErr } = await db
  .from("admin_roster")
  .select("cfx_id,role,label,protected")
  .eq("cfx_id", cfxId)
  .maybeSingle();
if (readErr) {
  console.error(`✗ Datenbank nicht lesbar: ${readErr.message}`);
  process.exit(1);
}

if (existing?.protected) {
  console.log(`✓ „${existing.label}“ (${cfxId}) ist bereits als geschützter Standard-Account eingetragen.`);
  process.exit(0);
}
if (existing) {
  // A normal admin with this id exists. Promote it by replacing the row —
  // allowed, because the row is not protected yet.
  const { error } = await db.from("admin_roster").delete().eq("cfx_id", cfxId).eq("protected", false);
  if (error) {
    console.error(`✗ Konnte den bestehenden Eintrag nicht ersetzen: ${error.message}`);
    process.exit(1);
  }
}

const { error } = await db.from("admin_roster").insert({
  cfx_id: cfxId,
  role: "founder",
  label,
  protected: true,
  updated_at: new Date().toISOString(),
});
if (error) {
  console.error(`✗ Eintragen fehlgeschlagen: ${error.message}`);
  process.exit(1);
}

console.log(
  `✓ „${label}“ (${cfxId}) ist jetzt der geschützte Standard-Account.\n` +
    "  Er kann weder im Admin-Panel noch per Abfrage gelöscht oder geändert werden —\n" +
    "  das erzwingt die Datenbank selbst (Trigger admin_roster_protect).",
);
