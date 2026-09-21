// Admin server functions for managing partners/clients. Mirrors the security
// model of the other admin modules: the client only sends its own basketIdent;
// the server resolves the verified access and re-checks the permission for
// every mutating action.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveBasketUser } from "../tebex-basket.server";
import { accessHas, resolveAccess } from "./roster.server";
import type { Permission } from "./permissions";
import { isExpiringDiscordUrl } from "../partner-url";
import {
  appendLog,
  deletePartnerById,
  insertPartner,
  partnersConfigured,
  readPartnersStrict,
  updatePartner,
  type LogEntry,
  type PartnerEntry,
} from "../db.server";

export type { PartnerEntry } from "../db.server";

async function requirePartners(
  basketIdent: string,
  permission: Permission,
): Promise<{ cfxId: string | null; username: string | null }> {
  const { cfxId, username } = await resolveBasketUser(basketIdent);
  const access = await resolveAccess(cfxId);
  if (!accessHas(access, permission)) throw new Error("FORBIDDEN");
  return { cfxId, username };
}

function makePartnersLog(actor: string | null, detail: string): LogEntry {
  return {
    id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    type: "partners.manage",
    actor,
    cfxName: null,
    tebexId: null,
    packageName: null,
    amount: null,
    currency: null,
    paymentMethod: null,
    detail,
  };
}

const basketInput = z.object({ basketIdent: z.string().min(1) });

export type AdminPartnersOverview = {
  configured: boolean;
  partners: PartnerEntry[];
  /** true when the database could not be read right now; `partners` is then
   *  empty and must not be mistaken for "there are no partners". */
  readFailed?: boolean;
};

export const fetchAdminPartners = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<AdminPartnersOverview> => {
    await requirePartners(data.basketIdent, "partners.view");
    if (!partnersConfigured()) return { configured: false, partners: [] };
    const partners = await readPartnersStrict();
    if (partners === null) return { configured: true, partners: [], readFailed: true };
    return { configured: true, partners };
  });

const upsertInput = z.object({
  basketIdent: z.string().min(1),
  partner: z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(80),
    // Backstop for the client-side check: never store a logo link that is
    // guaranteed to break within a day.
    image: z
      .string()
      .url()
      .max(500)
      .refine((v) => !isExpiringDiscordUrl(v), { message: "EXPIRING_DISCORD_URL" }),
    link: z.string().url().max(500),
  }),
});

export const upsertPartner = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => upsertInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; id: string }> => {
    const { username } = await requirePartners(data.basketIdent, "partners.manage");
    if (!partnersConfigured()) return { ok: false, id: "" };
    const input = data.partner;

    // Row-level writes: only the affected partner is touched, so a save can
    // never overwrite or wipe the other entries.
    if (input.id) {
      const result = await updatePartner(input.id, {
        name: input.name,
        image: input.image,
        link: input.link,
      });
      if (result !== "ok") return { ok: false, id: "" };
      await appendLog(makePartnersLog(username, `Partner bearbeitet: ${input.name}`));
      return { ok: true, id: input.id };
    }

    const partner: PartnerEntry = {
      id: `ptr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: input.name,
      image: input.image,
      link: input.link,
      at: new Date().toISOString(),
    };
    const ok = await insertPartner(partner);
    if (ok) await appendLog(makePartnersLog(username, `Partner hinzugefügt: ${input.name}`));
    return { ok, id: ok ? partner.id : "" };
  });

const deleteInput = z.object({
  basketIdent: z.string().min(1),
  id: z.string().min(1),
});

export const deletePartner = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => deleteInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { username } = await requirePartners(data.basketIdent, "partners.manage");
    if (!partnersConfigured()) return { ok: false };
    const removed = await deletePartnerById(data.id);
    if (removed === false) return { ok: false };
    if (removed) await appendLog(makePartnersLog(username, `Partner gelöscht: ${removed.name}`));
    return { ok: true }; // already gone counts as success
  });
