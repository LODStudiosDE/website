// Public server functions for the newsletter e-mail subscription. A visitor can
// only subscribe while logged in (we resolve the verified CFX id + username from
// their Tebex basket — never trusting client-supplied identity). The stored
// address can be revoked by the owner from their profile.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveBasketUser } from "./tebex-basket.server";
import {
  appendLog,
  deleteSubscriber,
  getSubscriber,
  subscribersConfigured,
  upsertSubscriber,
  type LogEntry,
} from "./db.server";

function makeLog(type: string, extra: Partial<LogEntry>): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    type,
    actor: extra.actor ?? null,
    cfxName: extra.cfxName ?? null,
    tebexId: extra.tebexId ?? null,
    packageName: null,
    amount: null,
    currency: null,
    paymentMethod: null,
    detail: extra.detail ?? null,
  };
}

export type MySubscription = { email: string; at: string } | null;

const subscribeInput = z.object({
  basketIdent: z.string().min(1),
  email: z.string().email().max(200),
});

export const subscribeEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => subscribeInput.parse(input))
  .handler(
    async ({ data }): Promise<{ ok: boolean; reason?: string; at?: string }> => {
      if (!subscribersConfigured()) return { ok: false, reason: "not_configured" };
      const { username, cfxId } = await resolveBasketUser(data.basketIdent);
      if (!cfxId) return { ok: false, reason: "not_authenticated" };

      const email = data.email.trim().toLowerCase();
      const existing = await getSubscriber(cfxId);
      // Lookup failed: don't guess — otherwise we'd reset `hidden`/`at`.
      if (existing === undefined) return { ok: false, reason: "store_unavailable" };
      const at = existing?.at ?? new Date().toISOString();

      // Single-row upsert: only this subscriber is written.
      const ok = await upsertSubscriber({
        cfxId,
        username: username ?? existing?.username ?? "Unbekannt",
        email,
        at,
        hidden: existing?.hidden ?? false,
      });
      if (ok) {
        await appendLog(
          makeLog(existing ? "email.update" : "email.subscribe", {
            actor: username,
            cfxName: username ?? cfxId,
            tebexId: cfxId,
            detail: `E-Mail hinterlegt: ${email}`,
          }),
        );
      }
      return { ok, at };
    },
  );

const basketInput = z.object({ basketIdent: z.string().min(1) });

export const getMySubscription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<MySubscription> => {
    if (!subscribersConfigured()) return null;
    const { cfxId } = await resolveBasketUser(data.basketIdent);
    if (!cfxId) return null;
    const sub = await getSubscriber(cfxId);
    return sub ? { email: sub.email, at: sub.at } : null;
  });

export const revokeMySubscription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!subscribersConfigured()) return { ok: false };
    const { username, cfxId } = await resolveBasketUser(data.basketIdent);
    if (!cfxId) return { ok: false };
    // Single-row delete; returns the removed row so we can log the address.
    const removed = await deleteSubscriber(cfxId);
    if (removed === false) return { ok: false };
    if (removed) {
      await appendLog(
        makeLog("email.unsubscribe", {
          actor: username,
          cfxName: username ?? cfxId,
          tebexId: cfxId,
          detail: `E-Mail widerrufen: ${removed.email}`,
        }),
      );
    }
    return { ok: true }; // nothing stored counts as success
  });
