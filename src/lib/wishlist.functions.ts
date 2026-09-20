// Public server functions that mirror a user's wishlist into the database so
// admins can see it. The user's own browser (localStorage) stays the source of
// truth for their UI; these keep the shared copy in sync.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  deleteWishlist,
  findWishlist,
  saveWishlist,
  storedWishlistItem,
  wishlistsConfigured,
  type WishlistRecord,
} from "./db.server";

const PLUGIN_BASE = "https://plugin.tebex.io";

async function tebexPlugin<T>(path: string): Promise<T | null> {
  const secret = process.env["TEBEX_SECRET"];
  if (!secret) return null;
  try {
    const res = await fetch(`${PLUGIN_BASE}${path}`, {
      headers: { "X-Tebex-Secret": secret, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeCfxId(cfxId: string): string {
  return cfxId.trim();
}

async function resolveIdentity(cfxId: string, username: string): Promise<{ cfxId: string; username: string }> {
  const inputId = normalizeCfxId(cfxId);
  const inputName = username.trim();
  const user = await tebexPlugin<{ player?: { id?: string | number; username?: string; name?: string } }>(
    `/user/${encodeURIComponent(inputId)}`,
  );
  const canonicalId = user?.player?.id != null ? String(user.player.id) : inputId;
  const canonicalName =
    user?.player?.username ?? user?.player?.name ?? (inputName || inputId);
  return { cfxId: canonicalId, username: canonicalName };
}

/**
 * Finds the stored wishlist for a user: fast path on the raw id, else the
 * canonical Tebex id. `undefined` = the database lookup failed (callers must
 * not write), `null` = the user has no stored wishlist.
 */
async function locateWishlist(
  cfxId: string,
  username: string,
): Promise<WishlistRecord | null | undefined> {
  const direct = await findWishlist(normalizeCfxId(cfxId));
  if (direct !== null) return direct; // found, or lookup failed
  const identity = await resolveIdentity(cfxId, username);
  if (identity.cfxId.toLowerCase() === normalizeCfxId(cfxId).toLowerCase()) return null;
  return findWishlist(identity.cfxId);
}

// Identity is passed directly from the client (verified at login by Tebex CFX
// auth — no need to re-call the Tebex basket API which expires quickly).
const identity = z.object({
  cfxId: z.string().min(1).max(64),
  username: z.string().min(1).max(120),
});

const addInput = identity.extend({ item: storedWishlistItem.omit({ addedAt: true }) });

export const syncWishlistAdd = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => addInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!wishlistsConfigured()) return { ok: false };

    const who = await resolveIdentity(data.cfxId, data.username);
    const existing = await findWishlist(who.cfxId);
    if (existing === undefined) return { ok: false };

    const items = existing?.items ?? [];
    if (!items.some((i) => i.packageId === data.item.packageId)) {
      items.push({ ...data.item, addedAt: new Date().toISOString() });
    }
    // Only this user's row is written.
    const ok = await saveWishlist({
      cfxId: existing?.cfxId ?? who.cfxId,
      username: who.username,
      items,
    });
    return { ok };
  });

const removeInput = identity.extend({ packageId: z.number().int().positive() });

export const syncWishlistRemove = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => removeInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!wishlistsConfigured()) return { ok: false };

    const found = await locateWishlist(data.cfxId, data.username);
    if (found === undefined) return { ok: false };
    if (!found) return { ok: true };

    const items = found.items.filter((i) => i.packageId !== data.packageId);
    const ok =
      items.length === 0
        ? await deleteWishlist(found.cfxId)
        : await saveWishlist({ ...found, items });
    return { ok };
  });

const replaceInput = identity.extend({
  items: z.array(storedWishlistItem.omit({ addedAt: true })).max(200),
});

const fetchInput = identity;

export const fetchMyWishlist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => fetchInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; items: z.infer<typeof storedWishlistItem>[] }> => {
    if (!wishlistsConfigured()) return { ok: false, items: [] };
    const found = await locateWishlist(data.cfxId, data.username);
    if (found === undefined) return { ok: false, items: [] };
    return { ok: true, items: found?.items ?? [] };
  });

export const syncWishlistReplace = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => replaceInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!wishlistsConfigured()) return { ok: false };

    const who = await resolveIdentity(data.cfxId, data.username);
    const existing = await findWishlist(who.cfxId);
    if (existing === undefined) return { ok: false };
    const key = existing?.cfxId ?? who.cfxId;

    if (data.items.length === 0) {
      return { ok: existing ? await deleteWishlist(key) : true };
    }

    const previous = existing?.items ?? [];
    const addedAtOf = (id: number) =>
      previous.find((i) => i.packageId === id)?.addedAt ?? new Date().toISOString();
    const ok = await saveWishlist({
      cfxId: key,
      username: who.username,
      items: data.items.map((it) => ({ ...it, addedAt: addedAtOf(it.packageId) })),
    });
    return { ok };
  });
