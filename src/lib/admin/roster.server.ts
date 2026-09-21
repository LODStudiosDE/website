// ============================================================================
//  SERVER-ONLY  —  ADMIN ROSTER + ROLLEN
// ============================================================================
//
//  ⚠️  Diese Datei enthält KEINE CFX-IDs und KEINE Rollen-Daten. Wer Admin ist
//      und welche eigenen Rollen existieren, wird ausschließlich im
//      in der Supabase-Datenbank (Tabellen admin_roster / admin_roles)
//      gespeichert, auf die nur der Server zugreifen kann — niemals im
//      Client-Bundle, im Seitenquelltext oder in einer einsehbaren Datei.
//
//  ➕  Admins & Rollen werden über das Admin-Panel verwaltet
//      (Management → CFX-IDs / Rollen). Der Standard-Account „LODStudios" ist
//      eine normale Zeile in `admin_roster` mit `protected = true`. Dass er nie
//      gelöscht oder geändert werden kann, erzwingt die Datenbank selbst
//      (Trigger `admin_roster_protect`, siehe supabase/schema.sql).
// ============================================================================

import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  hasPermission,
  type Permission,
  type PermissionGrant,
  type RoleDefinition,
} from "./permissions";
import {
  adminsConfigured,
  deleteAdminEntry,
  deleteAdminRole,
  insertAdminRole,
  readAdminsStore,
  upsertAdminEntry,
  type AdminRoleDefinition,
  type AdminRosterEntry,
} from "../db.server";

// Defensive: falls dieses Modul jemals versehentlich clientseitig importiert
// wird, sofort laut fehlschlagen statt Daten zu leaken.
if (typeof window !== "undefined") {
  throw new Error("roster.server.ts darf nicht im Client importiert werden.");
}

export type RosterEntry = {
  /** CFX/FiveM usernameId (als String). */
  cfxId: string;
  role: string;
  label?: string;
  /** Geschützter Standard-Account — kann nie bearbeitet/entfernt werden. */
  protected?: boolean;
};

// Es gibt bewusst KEINE weitere Quelle für Admins (kein Env-Fallback, keine
// IDs im Code): Wer Zugriff hat, steht ausschließlich in der Datenbank.

// Normalisiert eine CFX-ID: entfernt ein optionales "fivem:"-Präfix und Whitespace,
// damit "fivem:92773" und "92773" gleich behandelt werden.
function normalizeCfx(value: string | number): string {
  return String(value).trim().toLowerCase().replace(/^fivem:/, "");
}

type Store = { admins: AdminRosterEntry[]; roles: Record<string, AdminRoleDefinition> };

// Liest Admins + eigene Rollen aus der Datenbank. Für die ZUGRIFFSPRÜFUNG:
// Ist die Datenbank nicht lesbar, gibt es keine Admins ("fail closed").
async function readStore(): Promise<Store> {
  return (await readStoreStrict()) ?? { admins: [], roles: {} };
}

// Für ÄNDERUNGEN: `null` = Datenbank nicht lesbar → Aufrufer muss abbrechen,
// statt auf Basis einer scheinbar leeren Liste zu entscheiden.
async function readStoreStrict(): Promise<Store | null> {
  if (!adminsConfigured()) return { admins: [], roles: {} };
  return readAdminsStore();
}

// Führt Standard-Rollen mit den im Bin gespeicherten eigenen Rollen zusammen.
// Standard-Rollen sind unveränderlich und gewinnen bei Namenskollision.
function mergeRoles(custom: Record<string, AdminRoleDefinition>): Record<string, RoleDefinition> {
  const out: Record<string, RoleDefinition> = { ...DEFAULT_ROLES };
  for (const [key, def] of Object.entries(custom ?? {})) {
    if (key in DEFAULT_ROLES) continue;
    out[key] = {
      label: def.label,
      description: def.description,
      permissions: def.permissions === "*" ? ALL_PERMISSIONS : (def.permissions as Permission[]),
    };
  }
  return out;
}

// Die Admin-Liste kommt ausschließlich aus der Datenbank (Tabelle admin_roster).
// Doppelte IDs werden zusammengeführt; ein geschützter Eintrag gewinnt immer.
function combineRoster(admins: AdminRosterEntry[]): RosterEntry[] {
  const map = new Map<string, RosterEntry>();
  for (const e of admins) {
    const id = normalizeCfx(e.cfxId);
    if (map.get(id)?.protected) continue;
    map.set(id, {
      cfxId: e.cfxId,
      role: e.role,
      label: e.label,
      protected: e.protected === true,
    });
  }
  return [...map.values()];
}

export type ResolvedAccess = {
  isAdmin: boolean;
  role: string | null;
  roleLabel: string | null;
  permissions: PermissionGrant;
};

const NO_ACCESS: ResolvedAccess = {
  isAdmin: false,
  role: null,
  roleLabel: null,
  permissions: [],
};

/** Löst die Rolle + Berechtigungen für eine verifizierte CFX-ID auf. */
export async function resolveAccess(
  cfxId: string | number | null | undefined,
): Promise<ResolvedAccess> {
  if (cfxId === null || cfxId === undefined) return NO_ACCESS;
  const id = normalizeCfx(cfxId);
  if (!id) return NO_ACCESS;

  const { admins, roles } = await readStore();
  const entry = combineRoster(admins).find((e) => normalizeCfx(e.cfxId) === id);
  if (!entry) return NO_ACCESS;

  const def = mergeRoles(roles)[entry.role];
  if (!def) return NO_ACCESS;

  return {
    isAdmin: true,
    role: entry.role,
    roleLabel: def.label,
    permissions: def.permissions === ALL_PERMISSIONS ? ALL_PERMISSIONS : [...def.permissions],
  };
}

/** Prüft serverseitig, ob eine aufgelöste Rolle eine bestimmte Berechtigung hat. */
export function accessHas(access: ResolvedAccess, needed: Permission): boolean {
  return access.isAdmin && hasPermission(access.permissions, needed);
}

/** Liste aller bekannten Rollen (Standard + eigene aus dem Bin). */
export async function listRoles() {
  const { roles } = await readStore();
  const merged = mergeRoles(roles);
  return Object.entries(merged).map(([key, def]) => ({
    key,
    label: def.label,
    description: def.description,
    permissions: def.permissions === ALL_PERMISSIONS ? ALL_PERMISSIONS : [...def.permissions],
    builtin: key in DEFAULT_ROLES,
  }));
}

// ── Roster-Verwaltung (lod-admins Bin) ──────────────────────────────────────

export type RosterListEntry = {
  cfxId: string;
  role: string;
  roleLabel: string;
  label: string | null;
  /** Geschützter Standard-Account — kann nicht bearbeitet/entfernt werden. */
  protected: boolean;
};

/** Alle Admins (inkl. geschütztem Standard) für die Management-Seite. */
export async function listRoster(): Promise<RosterListEntry[]> {
  const { admins, roles } = await readStore();
  const merged = mergeRoles(roles);
  return combineRoster(admins).map((e) => ({
    cfxId: normalizeCfx(e.cfxId),
    role: e.role,
    roleLabel: merged[e.role]?.label ?? e.role,
    label: e.label ?? null,
    protected: e.protected === true,
  }));
}

export type RosterMutationResult = { ok: boolean; reason?: string };

/** Fügt einen Admin hinzu oder aktualisiert dessen Rolle im lod-admins Bin. */
export async function addRosterEntry(input: {
  cfxId: string;
  role: string;
  label?: string;
}): Promise<RosterMutationResult> {
  if (!adminsConfigured()) return { ok: false, reason: "store_not_configured" };
  const id = normalizeCfx(input.cfxId);
  if (!id) return { ok: false, reason: "invalid_cfx" };

  const store = await readStoreStrict();
  if (!store) return { ok: false, reason: "store_unavailable" };
  const { admins, roles } = store;
  if (!(input.role in mergeRoles(roles))) return { ok: false, reason: "unknown_role" };

  const existing = admins.find((a) => normalizeCfx(a.cfxId) === id);
  if (existing?.protected) return { ok: false, reason: "protected" };

  // Single-row write. The query itself refuses to touch a protected account,
  // so that rule holds even if the read above was stale.
  const result = await upsertAdminEntry({
    cfxId: id,
    role: input.role,
    label: input.label?.trim() || existing?.label || id,
  });
  if (result === "protected") return { ok: false, reason: "protected" };
  return { ok: result === "ok" };
}

/** Entfernt einen Admin aus dem lod-admins Bin (geschützte bleiben erhalten). */
export async function removeRosterEntry(cfxId: string): Promise<RosterMutationResult> {
  if (!adminsConfigured()) return { ok: false, reason: "store_not_configured" };
  const id = normalizeCfx(cfxId);
  if (!id) return { ok: false, reason: "invalid_cfx" };

  const store = await readStoreStrict();
  if (!store) return { ok: false, reason: "store_unavailable" };
  const target = store.admins.find((a) => normalizeCfx(a.cfxId) === id);
  if (target?.protected) return { ok: false, reason: "protected" };

  // Single-row delete; protected accounts are excluded by the query itself.
  const ok = await deleteAdminEntry(target?.cfxId ?? id);
  return { ok };
}

// ── Rollen-Verwaltung (lod-admins Bin) ──────────────────────────────────────

function slugifyRole(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || `role-${Date.now().toString(36)}`;
}

/** Legt eine eigene Rolle im lod-admins Bin an. */
export async function createRole(input: {
  label: string;
  description?: string;
  permissions: Permission[];
}): Promise<RosterMutationResult & { key?: string }> {
  if (!adminsConfigured()) return { ok: false, reason: "store_not_configured" };
  const label = input.label.trim();
  if (!label) return { ok: false, reason: "invalid_role" };

  const store = await readStoreStrict();
  if (!store) return { ok: false, reason: "store_unavailable" };
  const { roles } = store;
  let key = slugifyRole(label);
  if (key in DEFAULT_ROLES) return { ok: false, reason: "role_exists" };
  const base = key;
  let n = 2;
  while (roles[key]) key = `${base}-${n++}`;

  // INSERT, not upsert: if another request created the same key in the
  // meantime, the database reports it instead of overwriting that role.
  const result = await insertAdminRole(key, {
    label,
    description: input.description?.trim() || "",
    permissions: input.permissions,
  });
  if (result === "exists") return { ok: false, reason: "role_exists" };
  return result === "ok" ? { ok: true, key } : { ok: false };
}

/** Löscht eine eigene Rolle (Standard-Rollen & benutzte Rollen bleiben). */
export async function deleteRole(key: string): Promise<RosterMutationResult> {
  if (!adminsConfigured()) return { ok: false, reason: "store_not_configured" };
  if (key in DEFAULT_ROLES) return { ok: false, reason: "builtin_role" };

  const store = await readStoreStrict();
  if (!store) return { ok: false, reason: "store_unavailable" };
  const { admins, roles } = store;
  if (!roles[key]) return { ok: false, reason: "unknown_role" };
  if (admins.some((a) => a.role === key)) return { ok: false, reason: "role_in_use" };

  const ok = await deleteAdminRole(key);
  return { ok };
}

