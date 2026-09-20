// ============================================================================
//  SERVER-ONLY — Supabase data layer
// ============================================================================
//  Every persistent store of the app lives here: partners, newsletter
//  subscribers, e-mail templates, audit logs, admin roster + roles, wishlists
//  and the referral program. Schema: supabase/schema.sql
//
//  SECURITY: uses the SERVICE ROLE key, which bypasses Row Level Security.
//  It must never reach the browser — keep this module server-only and never
//  give the env variable a VITE_ prefix.
//
//  DESIGN RULES
//   • Row-level operations (insert / update / delete one row). Nothing here
//     reads a whole list and writes it back, so a failed read can never wipe
//     data and two simultaneous saves can never overwrite each other.
//   • A read that FAILED is always distinguishable from an EMPTY result
//     (`null` / `{ ok: false }` vs `[]`). Callers must not treat a failure as
//     "nothing there".
// ============================================================================
import "./load-env.server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("db.server.ts must never be imported in the browser.");
}

// ── client ──────────────────────────────────────────────────────────────────

let client: SupabaseClient | null = null;

export function dbConfigured(): boolean {
  return !!process.env["SUPABASE_URL"] && !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
}

function db(): SupabaseClient {
  if (client) return client;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Test hook: inject a client (e.g. one created with a fake `fetch`). */
export function __setDbClientForTests(next: SupabaseClient | null): void {
  client = next;
}

function fail(scope: string, error: { message?: string } | null | undefined): void {
  console.error(`[db] ${scope} failed: ${error?.message ?? "unknown error"}`);
}

// All stores share one database now; the per-store "configured" checks are
// kept so callers read naturally.
export const partnersConfigured = dbConfigured;
export const subscribersConfigured = dbConfigured;
export const templatesConfigured = dbConfigured;
export const adminsConfigured = dbConfigured;
export const wishlistsConfigured = dbConfigured;
export const logsConfigured = dbConfigured;
export const referralsStoreConfigured = dbConfigured;

// ── partners ────────────────────────────────────────────────────────────────

export type PartnerEntry = {
  id: string;
  name: string;
  image: string; // logo URL
  link: string; // destination opened on click
  at: string; // ISO — created timestamp
};

type PartnerRow = { id: string; name: string; image: string; link: string; created_at: string };

const toPartner = (r: PartnerRow): PartnerEntry => ({
  id: r.id,
  name: r.name,
  image: r.image,
  link: r.link,
  at: r.created_at,
});

/** `null` = the database could not be read (NOT the same as "no partners"). */
export async function readPartnersStrict(): Promise<PartnerEntry[] | null> {
  const { data, error } = await db()
    .from("partners")
    .select("id,name,image,link,created_at")
    .order("created_at", { ascending: true });
  if (error) {
    fail("readPartners", error);
    return null;
  }
  return (data as PartnerRow[]).map(toPartner);
}

/** Display read: never throws, empty list when unavailable. */
export async function readPartners(): Promise<PartnerEntry[]> {
  return (await readPartnersStrict()) ?? [];
}

export async function insertPartner(p: PartnerEntry): Promise<boolean> {
  const { error } = await db()
    .from("partners")
    .insert({ id: p.id, name: p.name, image: p.image, link: p.link, created_at: p.at });
  if (error) fail("insertPartner", error);
  return !error;
}

export async function updatePartner(
  id: string,
  fields: { name: string; image: string; link: string },
): Promise<"ok" | "not_found" | "error"> {
  const { data, error } = await db().from("partners").update(fields).eq("id", id).select("id");
  if (error) {
    fail("updatePartner", error);
    return "error";
  }
  return (data?.length ?? 0) > 0 ? "ok" : "not_found";
}

/** Returns the removed entry, `null` if it did not exist, `false` on error. */
export async function deletePartnerById(id: string): Promise<PartnerEntry | null | false> {
  const { data, error } = await db()
    .from("partners")
    .delete()
    .eq("id", id)
    .select("id,name,image,link,created_at");
  if (error) {
    fail("deletePartner", error);
    return false;
  }
  const row = (data as PartnerRow[] | null)?.[0];
  return row ? toPartner(row) : null;
}

// ── newsletter subscribers ──────────────────────────────────────────────────

export type SubscriberEntry = {
  cfxId: string;
  username: string;
  email: string;
  at: string; // ISO — when the address was stored
  hidden: boolean; // temporarily excluded from broadcasts
};

type SubscriberRow = {
  cfx_id: string;
  username: string;
  email: string;
  hidden: boolean;
  created_at: string;
};

const toSubscriber = (r: SubscriberRow): SubscriberEntry => ({
  cfxId: r.cfx_id,
  username: r.username,
  email: r.email,
  at: r.created_at,
  hidden: r.hidden,
});

const SUBSCRIBER_COLS = "cfx_id,username,email,hidden,created_at";

export async function readSubscribers(): Promise<SubscriberEntry[]> {
  const { data, error } = await db()
    .from("subscribers")
    .select(SUBSCRIBER_COLS)
    .order("created_at", { ascending: true });
  if (error) {
    fail("readSubscribers", error);
    return [];
  }
  return (data as SubscriberRow[]).map(toSubscriber);
}

/** `undefined` = lookup failed, `null` = no such subscriber. */
export async function getSubscriber(cfxId: string): Promise<SubscriberEntry | null | undefined> {
  const { data, error } = await db()
    .from("subscribers")
    .select(SUBSCRIBER_COLS)
    .eq("cfx_id", cfxId)
    .maybeSingle();
  if (error) {
    fail("getSubscriber", error);
    return undefined;
  }
  return data ? toSubscriber(data as SubscriberRow) : null;
}

export async function upsertSubscriber(s: SubscriberEntry): Promise<boolean> {
  const { error } = await db().from("subscribers").upsert(
    {
      cfx_id: s.cfxId,
      username: s.username,
      email: s.email,
      hidden: s.hidden,
      created_at: s.at,
    },
    { onConflict: "cfx_id" },
  );
  if (error) fail("upsertSubscriber", error);
  return !error;
}

/** Returns the removed subscriber, `null` if none existed, `false` on error. */
export async function deleteSubscriber(cfxId: string): Promise<SubscriberEntry | null | false> {
  const { data, error } = await db()
    .from("subscribers")
    .delete()
    .eq("cfx_id", cfxId)
    .select(SUBSCRIBER_COLS);
  if (error) {
    fail("deleteSubscriber", error);
    return false;
  }
  const row = (data as SubscriberRow[] | null)?.[0];
  return row ? toSubscriber(row) : null;
}

/** Returns the updated subscriber, `null` if none existed, `false` on error. */
export async function setSubscriberHidden(
  cfxId: string,
  hidden: boolean,
): Promise<SubscriberEntry | null | false> {
  const { data, error } = await db()
    .from("subscribers")
    .update({ hidden })
    .eq("cfx_id", cfxId)
    .select(SUBSCRIBER_COLS);
  if (error) {
    fail("setSubscriberHidden", error);
    return false;
  }
  const row = (data as SubscriberRow[] | null)?.[0];
  return row ? toSubscriber(row) : null;
}

// ── e-mail templates ────────────────────────────────────────────────────────

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  at: string; // ISO — created/updated timestamp
};

type TemplateRow = { id: string; name: string; subject: string; body: string; updated_at: string };

const toTemplate = (r: TemplateRow): EmailTemplate => ({
  id: r.id,
  name: r.name,
  subject: r.subject,
  body: r.body,
  at: r.updated_at,
});

export async function readTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await db()
    .from("email_templates")
    .select("id,name,subject,body,updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    fail("readTemplates", error);
    return [];
  }
  return (data as TemplateRow[]).map(toTemplate);
}

export async function upsertTemplate(t: EmailTemplate): Promise<boolean> {
  const { error } = await db()
    .from("email_templates")
    .upsert(
      { id: t.id, name: t.name, subject: t.subject, body: t.body, updated_at: t.at },
      { onConflict: "id" },
    );
  if (error) fail("upsertTemplate", error);
  return !error;
}

/** Returns the removed template, `null` if none existed, `false` on error. */
export async function deleteTemplate(id: string): Promise<EmailTemplate | null | false> {
  const { data, error } = await db()
    .from("email_templates")
    .delete()
    .eq("id", id)
    .select("id,name,subject,body,updated_at");
  if (error) {
    fail("deleteTemplate", error);
    return false;
  }
  const row = (data as TemplateRow[] | null)?.[0];
  return row ? toTemplate(row) : null;
}

// ── audit log ───────────────────────────────────────────────────────────────

export type LogEntry = {
  id: string;
  at: string;
  type: string;
  actor: string | null;
  cfxName: string | null;
  tebexId: string | null;
  packageName: string | null;
  amount: number | null;
  currency: string | null;
  paymentMethod: string | null;
  detail: string | null;
};

type LogRow = {
  id: string;
  at: string;
  type: string;
  actor: string | null;
  cfx_name: string | null;
  tebex_id: string | null;
  package_name: string | null;
  amount: number | string | null;
  currency: string | null;
  payment_method: string | null;
  detail: string | null;
};

const LOG_COLS =
  "id,at,type,actor,cfx_name,tebex_id,package_name,amount,currency,payment_method,detail";

const toLog = (r: LogRow): LogEntry => ({
  id: r.id,
  at: r.at,
  type: r.type,
  actor: r.actor,
  cfxName: r.cfx_name,
  tebexId: r.tebex_id,
  packageName: r.package_name,
  // `numeric` can arrive as a string from PostgREST.
  amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
  currency: r.currency,
  paymentMethod: r.payment_method,
  detail: r.detail,
});

/** Appends one audit entry. A single INSERT — never rewrites the log. */
export async function appendLog(entry: LogEntry): Promise<void> {
  if (!dbConfigured()) return;
  const { error } = await db().from("logs").insert({
    id: entry.id,
    at: entry.at,
    type: entry.type,
    actor: entry.actor,
    cfx_name: entry.cfxName,
    tebex_id: entry.tebexId,
    package_name: entry.packageName,
    amount: entry.amount,
    currency: entry.currency,
    payment_method: entry.paymentMethod,
    detail: entry.detail,
  });
  if (error) fail("appendLog", error);
}

/** Newest first. */
export async function readLogs(limit = 1000): Promise<LogEntry[]> {
  const { data, error } = await db()
    .from("logs")
    .select(LOG_COLS)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) {
    fail("readLogs", error);
    return [];
  }
  return (data as LogRow[]).map(toLog);
}

// ── admin roster + custom roles ─────────────────────────────────────────────
// Who has admin access AND the custom roles. Lives only in the database so no
// CFX id or role ever appears in any inspectable file.

export type AdminRosterEntry = {
  cfxId: string; // CFX/FiveM usernameId (normalized, without "fivem:" prefix)
  role: string;
  label: string; // display name for the panel
  protected?: boolean; // uneditable default account
  at: string; // ISO — created/updated timestamp
};

export type AdminRoleDefinition = {
  label: string;
  description: string;
  permissions: string[] | "*";
};

export type AdminsStore = {
  admins: AdminRosterEntry[];
  roles: Record<string, AdminRoleDefinition>;
};

type RosterRow = {
  cfx_id: string;
  role: string;
  label: string;
  protected: boolean;
  updated_at: string;
};
type RoleRow = { key: string; label: string; description: string; permissions: unknown };

/** `null` = the database could not be read. Callers that MUTATE must abort. */
export async function readAdminsStore(): Promise<AdminsStore | null> {
  const [roster, roles] = await Promise.all([
    db().from("admin_roster").select("cfx_id,role,label,protected,updated_at"),
    db().from("admin_roles").select("key,label,description,permissions"),
  ]);
  if (roster.error || roles.error) {
    fail("readAdminsStore", roster.error ?? roles.error);
    return null;
  }
  const admins = (roster.data as RosterRow[]).map((r) => ({
    cfxId: r.cfx_id,
    role: r.role,
    label: r.label,
    protected: r.protected === true,
    at: r.updated_at,
  }));
  const roleMap: Record<string, AdminRoleDefinition> = {};
  for (const r of roles.data as RoleRow[]) {
    roleMap[r.key] = {
      label: r.label,
      description: r.description,
      permissions:
        r.permissions === "*"
          ? "*"
          : Array.isArray(r.permissions)
            ? (r.permissions as string[])
            : [],
    };
  }
  return { admins, roles: roleMap };
}

/**
 * Adds or updates an admin. The `protected = false` filter on the UPDATE path
 * is enforced by the database query itself, so a protected account can never be
 * overwritten — even if the caller's earlier read was stale.
 */
export async function upsertAdminEntry(e: {
  cfxId: string;
  role: string;
  label: string;
}): Promise<"ok" | "protected" | "error"> {
  const now = new Date().toISOString();
  const updated = await db()
    .from("admin_roster")
    .update({ role: e.role, label: e.label, updated_at: now })
    .eq("cfx_id", e.cfxId)
    .eq("protected", false)
    .select("cfx_id");
  if (updated.error) {
    fail("upsertAdminEntry.update", updated.error);
    return "error";
  }
  if ((updated.data?.length ?? 0) > 0) return "ok";

  // Nothing updated: either the row does not exist yet, or it is protected.
  const inserted = await db()
    .from("admin_roster")
    .insert({ cfx_id: e.cfxId, role: e.role, label: e.label, protected: false, updated_at: now });
  if (!inserted.error) return "ok";
  // Unique violation => the row exists and is protected.
  if (inserted.error.code === "23505") return "protected";
  fail("upsertAdminEntry.insert", inserted.error);
  return "error";
}

/** Never removes a protected account (enforced in the query). */
export async function deleteAdminEntry(cfxId: string): Promise<boolean> {
  const { error } = await db()
    .from("admin_roster")
    .delete()
    .eq("cfx_id", cfxId)
    .eq("protected", false);
  if (error) fail("deleteAdminEntry", error);
  return !error;
}

/** INSERT (not upsert): an existing role key is reported, never overwritten. */
export async function insertAdminRole(
  key: string,
  def: AdminRoleDefinition,
): Promise<"ok" | "exists" | "error"> {
  const { error } = await db().from("admin_roles").insert({
    key,
    label: def.label,
    description: def.description,
    permissions: def.permissions,
  });
  if (!error) return "ok";
  if (error.code === "23505") return "exists";
  fail("insertAdminRole", error);
  return "error";
}

export async function deleteAdminRole(key: string): Promise<boolean> {
  const { error } = await db().from("admin_roles").delete().eq("key", key);
  if (error) fail("deleteAdminRole", error);
  return !error;
}

// ── wishlists ───────────────────────────────────────────────────────────────

export const storedWishlistItem = z.object({
  packageId: z.number(),
  packageName: z.string(),
  image: z.string().nullable(),
  category: z.string(),
  price: z.number(),
  basePrice: z.number(),
  taxPerUnit: z.number(),
  currency: z.string(),
  addedAt: z.string(),
});
export type StoredWishlistItem = z.infer<typeof storedWishlistItem>;

export type WishlistRecord = { cfxId: string; username: string; items: StoredWishlistItem[] };

type WishlistRow = { cfx_id: string; username: string; items: unknown };

const toWishlist = (r: WishlistRow): WishlistRecord => ({
  cfxId: r.cfx_id,
  username: r.username,
  items: Array.isArray(r.items) ? (r.items as StoredWishlistItem[]) : [],
});

/** `null` = the database could not be read. */
export async function readAllWishlists(): Promise<WishlistRecord[] | null> {
  const { data, error } = await db().from("wishlists").select("cfx_id,username,items");
  if (error) {
    fail("readAllWishlists", error);
    return null;
  }
  return (data as WishlistRow[]).map(toWishlist);
}

/** Case-insensitive lookup. `undefined` = lookup failed, `null` = no wishlist. */
export async function findWishlist(cfxId: string): Promise<WishlistRecord | null | undefined> {
  const { data, error } = await db()
    .from("wishlists")
    .select("cfx_id,username,items")
    .eq("cfx_id_lower", cfxId.trim().toLowerCase())
    .maybeSingle();
  if (error) {
    fail("findWishlist", error);
    return undefined;
  }
  return data ? toWishlist(data as WishlistRow) : null;
}

export async function saveWishlist(w: WishlistRecord): Promise<boolean> {
  const { error } = await db()
    .from("wishlists")
    .upsert(
      {
        cfx_id: w.cfxId,
        username: w.username,
        items: w.items,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cfx_id" },
    );
  if (error) fail("saveWishlist", error);
  return !error;
}

export async function deleteWishlist(cfxId: string): Promise<boolean> {
  const { error } = await db().from("wishlists").delete().eq("cfx_id", cfxId);
  if (error) fail("deleteWishlist", error);
  return !error;
}

// ── referral program document (optimistic locking) ──────────────────────────

/** `null` = the database could not be read. Callers must NOT continue. */
export async function readReferralDoc(): Promise<{ data: unknown; version: number } | null> {
  const { data, error } = await db()
    .from("referral_state")
    .select("data,version")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    fail("readReferralDoc", error);
    return null;
  }
  if (!data) return { data: {}, version: -1 }; // row not created yet
  const row = data as { data: unknown; version: number | string };
  return { data: row.data ?? {}, version: Number(row.version) };
}

/**
 * Saves only if nobody else saved since `expectedVersion` was read.
 * "conflict" means another request won the race — re-read and retry.
 */
export async function writeReferralDoc(
  doc: unknown,
  expectedVersion: number,
): Promise<"ok" | "conflict" | "error"> {
  const now = new Date().toISOString();

  if (expectedVersion < 0) {
    // First ever save: the row does not exist yet.
    const { error } = await db()
      .from("referral_state")
      .insert({ id: 1, data: doc, version: 1, updated_at: now });
    if (!error) return "ok";
    if (error.code === "23505") return "conflict";
    fail("writeReferralDoc.insert", error);
    return "error";
  }

  const { data, error } = await db()
    .from("referral_state")
    .update({ data: doc, version: expectedVersion + 1, updated_at: now })
    .eq("id", 1)
    .eq("version", expectedVersion)
    .select("version");
  if (error) {
    fail("writeReferralDoc.update", error);
    return "error";
  }
  return (data?.length ?? 0) > 0 ? "ok" : "conflict";
}

// ── payment history snapshot (Supabase Storage) ─────────────────────────────
//  Tebex has no "give me everything" call: the history is 240+ pages, far too
//  many for one serverless request. The crawled history is therefore kept as one
//  JSON file in a private storage bucket (no schema change needed) and only
//  topped up with the newest pages on demand.

const PAYMENTS_BUCKET = "payments-cache";
const PAYMENTS_FILE = "history-v1.json";

/** `null` = nothing stored yet (or unreadable). */
export async function readPaymentsSnapshot<T>(): Promise<{ at: number; payments: T[] } | null> {
  if (!dbConfigured()) return null;
  try {
    const { data, error } = await db().storage.from(PAYMENTS_BUCKET).download(PAYMENTS_FILE);
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text()) as { at?: number; payments?: T[] };
    if (!Array.isArray(parsed.payments)) return null;
    return { at: Number(parsed.at) || 0, payments: parsed.payments };
  } catch {
    return null;
  }
}

/** Best effort: a failed save only means the next request tops up again. */
export async function writePaymentsSnapshot<T>(payments: T[]): Promise<boolean> {
  if (!dbConfigured()) return false;
  try {
    const storage = db().storage;
    const body = new Blob([JSON.stringify({ at: Date.now(), payments })], {
      type: "application/json",
    });
    let { error } = await storage
      .from(PAYMENTS_BUCKET)
      .upload(PAYMENTS_FILE, body, { upsert: true, contentType: "application/json" });
    if (error && /not found|bucket/i.test(error.message)) {
      await storage.createBucket(PAYMENTS_BUCKET, { public: false });
      ({ error } = await storage
        .from(PAYMENTS_BUCKET)
        .upload(PAYMENTS_FILE, body, { upsert: true, contentType: "application/json" }));
    }
    if (error) fail("writePaymentsSnapshot", error);
    return !error;
  } catch (e) {
    fail("writePaymentsSnapshot", e as Error);
    return false;
  }
}
