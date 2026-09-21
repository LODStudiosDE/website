// Server-only: load the local .env into process.env during `vite dev`.
// The Lovable/Vite config only injects VITE_* vars into import.meta.env — it does
// NOT populate process.env from .env in dev. Server functions read secrets via
// process.env (TEBEX_SECRET, SUPABASE_*, GOOGLE_* …), so without this
// they are undefined locally. In production the platform injects real env vars;
// the dev-only branch below is tree-shaken out so node:fs never hits the bundle.
function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

if (import.meta.env.DEV && typeof window === "undefined") {
  try {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const [key, value] of Object.entries(parseEnv(content))) {
      // Local .env is the source of truth in dev: override any stale/empty value
      // that may linger in the shell/process environment (a wrong SUPABASE_SERVICE_ROLE_KEY
      // there makes public-bin reads succeed but writes fail with 401).
      if (value) process.env[key] = value;
    }
  } catch {
    // No .env present — nothing to load.
  }
}
