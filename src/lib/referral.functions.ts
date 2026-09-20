// Public server functions for the referral program. Every call resolves the
// verified CFX identity from the authenticated basket (never trusts a
// client-supplied id) and performs all validation server-side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveBasketUser } from "./tebex-basket.server";
import { appendLog } from "./db.server";
import {
  buildDashboard,
  ensureUnlocks,
  ensureUser,
  evaluateReferrals,
  loadRewardProducts,
  newId,
  readReferralBin,
  referralsConfigured,
  successfulCount,
  pointsFor,
  writeReferralBin,
} from "./referral.server";
import {
  rewardReached,
  sortedRewards,
  type ReferralDashboard,
} from "./referral.shared";

const basketInput = z.object({ basketIdent: z.string().min(1) });

const notConfigured: ReferralDashboard = {
  configured: false,
  enabled: false,
  program: { name: "Empfehlungsprogramm", description: "" },
  allowClaims: false,
  code: "",
  hiddenFromLeaderboard: false,
  stats: { total: 0, successful: 0, pending: 0, rejected: 0, points: 0, level: 0 },
  nextReward: null,
  rewards: [],
  referrals: [],
  activity: [],
  leaderboard: null,
};

export const getReferralDashboard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<ReferralDashboard> => {
    if (!referralsConfigured()) return notConfigured;
    const { cfxId, username } = await resolveBasketUser(data.basketIdent);
    if (!cfxId) return { ...notConfigured, configured: true };

    const bin = await readReferralBin();
    const isNewUser = !bin.users[cfxId];
    const viewer = ensureUser(bin, cfxId, username ?? cfxId);
    const changedByEval = await evaluateReferrals(bin, cfxId);
    // Re-check unlocks for the viewer and for anyone whose invitee they are.
    const affected = new Set<string>([cfxId]);
    for (const r of bin.referrals) {
      if (r.referredCfxId === cfxId) affected.add(r.referrerCfxId);
    }
    let changedByUnlock = false;
    for (const id of affected) {
      if (ensureUnlocks(bin, id)) changedByUnlock = true;
    }
    // A brand-new account also needs its freshly generated code persisted.
    if (isNewUser || changedByEval || changedByUnlock) await writeReferralBin(bin);

    if (isNewUser) {
      await appendLog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        type: "referral.code_created",
        actor: null,
        cfxName: viewer.username,
        tebexId: cfxId,
        packageName: null,
        amount: null,
        currency: null,
        paymentMethod: null,
        detail: `Empfehlungscode erstellt: ${viewer.code}`,
      });
    }

    const products = await loadRewardProducts();
    return buildDashboard(bin, cfxId, products);
  });

const attributeInput = z.object({
  basketIdent: z.string().min(1),
  code: z.string().min(4).max(32),
  capturedAt: z.string().optional(),
});

export const attributeReferral = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => attributeInput.parse(input))
  .handler(
    async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
      if (!referralsConfigured()) return { ok: false, reason: "not_configured" };
      const { cfxId, username } = await resolveBasketUser(data.basketIdent);
      if (!cfxId) return { ok: false, reason: "not_authenticated" };

      const bin = await readReferralBin();
      if (!bin.settings.enabled) return { ok: false, reason: "disabled" };

      const code = data.code.trim().toUpperCase();
      const referrerCfxId = bin.codeIndex[code];
      if (!referrerCfxId) return { ok: false, reason: "invalid_code" };
      if (referrerCfxId === cfxId) return { ok: false, reason: "self_referral" };

      // Attribution window (anti-stale-link abuse).
      if (data.capturedAt) {
        const capturedMs = new Date(data.capturedAt).getTime();
        if (
          Number.isFinite(capturedMs) &&
          Date.now() - capturedMs > bin.settings.attributionDays * 86_400_000
        ) {
          return { ok: false, reason: "expired" };
        }
      }

      const isNewUser = !bin.users[cfxId];
      const viewer = ensureUser(bin, cfxId, username ?? cfxId);
      // One-time attribution: an account keeps its first referrer forever.
      if (viewer.referrerCfxId) return { ok: false, reason: "already_attributed" };

      viewer.referrerCfxId = referrerCfxId;
      bin.referrals.push({
        id: newId("ref"),
        referrerCfxId,
        referredCfxId: cfxId,
        referredUsername: viewer.username,
        code,
        status: "pending",
        pointsAwarded: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
        note: null,
      });
      bin.activity.unshift({
        id: newId("act"),
        cfxId: referrerCfxId,
        referralId: null,
        eventType: "referral_joined",
        points: null,
        rewardName: null,
        createdAt: new Date().toISOString(),
      });

      await evaluateReferrals(bin, cfxId);
      ensureUnlocks(bin, referrerCfxId);
      await writeReferralBin(bin);

      if (isNewUser) {
        await appendLog({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: new Date().toISOString(),
          type: "referral.code_created",
          actor: null,
          cfxName: viewer.username,
          tebexId: cfxId,
          packageName: null,
          amount: null,
          currency: null,
          paymentMethod: null,
          detail: `Empfehlungscode erstellt: ${viewer.code}`,
        });
      }

      await appendLog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        type: "referral.join",
        actor: null,
        cfxName: viewer.username,
        tebexId: cfxId,
        packageName: null,
        amount: null,
        currency: null,
        paymentMethod: null,
        detail: `Empfehlung über Code ${code}`,
      });
      return { ok: true };
    },
  );

const claimInput = z.object({
  basketIdent: z.string().min(1),
  rewardId: z.string().min(1),
});

export const claimReferralReward = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => claimInput.parse(input))
  .handler(
    async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
      if (!referralsConfigured()) return { ok: false, reason: "not_configured" };
      const { cfxId, username } = await resolveBasketUser(data.basketIdent);
      if (!cfxId) return { ok: false, reason: "not_authenticated" };

      const bin = await readReferralBin();
      if (!bin.settings.enabled || !bin.settings.allowClaims) {
        return { ok: false, reason: "claims_disabled" };
      }
      const reward = sortedRewards(bin.rewards).find((r) => r.id === data.rewardId);
      if (!reward) return { ok: false, reason: "invalid_reward" };

      ensureUser(bin, cfxId, username ?? cfxId);
      const successful = successfulCount(bin, cfxId);
      const points = pointsFor(bin, cfxId);
      if (!rewardReached(reward, successful, points)) {
        return { ok: false, reason: "not_reached" };
      }

      ensureUnlocks(bin, cfxId);
      const claim = bin.claims.find(
        (c) => c.cfxId === cfxId && c.rewardId === reward.id,
      );
      if (!claim) return { ok: false, reason: "not_unlocked" };
      if (claim.status === "claimed") return { ok: false, reason: "already_claimed" };

      claim.status = "claimed";
      claim.claimedAt = new Date().toISOString();
      bin.activity.unshift({
        id: newId("act"),
        cfxId,
        referralId: null,
        eventType: "reward_claimed",
        points: null,
        rewardName: reward.name,
        createdAt: new Date().toISOString(),
      });
      await writeReferralBin(bin);

      await appendLog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        type: "referral.claim",
        actor: null,
        cfxName: username ?? cfxId,
        tebexId: cfxId,
        packageName: reward.name,
        amount: null,
        currency: null,
        paymentMethod: "Store Referral Programm",
        detail: `Store Referral Programm ${reward.name}`,
      });
      return { ok: true };
    },
  );

const hiddenInput = z.object({
  basketIdent: z.string().min(1),
  hidden: z.boolean(),
});

export const setReferralLeaderboardHidden = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => hiddenInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!referralsConfigured()) return { ok: false };
    const { cfxId, username } = await resolveBasketUser(data.basketIdent);
    if (!cfxId) return { ok: false };
    const bin = await readReferralBin();
    const user = ensureUser(bin, cfxId, username ?? cfxId);
    user.hidden = data.hidden;
    return { ok: await writeReferralBin(bin) };
  });
