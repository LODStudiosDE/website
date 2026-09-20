// Server functions for the admin referral management. Mirrors the security
// model of admin.functions.ts: the client only sends its own basketIdent; the
// server resolves the verified access and re-checks the permission for every
// mutating action.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveBasketUser } from "../tebex-basket.server";
import { accessHas, resolveAccess } from "./roster.server";
import type { Permission } from "./permissions";
import { appendLog } from "../db.server";
import {
  newId,
  pointsFor,
  readReferralBin,
  referralsConfigured,
  successfulCount,
  writeReferralBin,
} from "../referral.server";
import {
  computeLevel,
  DEFAULT_REFERRAL_SETTINGS,
  type ReferralReward,
  type ReferralSettings,
} from "../referral.shared";

async function requireReferral(
  basketIdent: string,
  permission: Permission,
): Promise<{ cfxId: string | null; username: string | null }> {
  const { cfxId, username } = await resolveBasketUser(basketIdent);
  const access = await resolveAccess(cfxId);
  if (!accessHas(access, permission)) throw new Error("FORBIDDEN");
  return { cfxId, username };
}

const basketInput = z.object({ basketIdent: z.string().min(1) });

export type AdminReferralOverview = {
  configured: boolean;
  settings: ReferralSettings;
  rewards: ReferralReward[];
  stats: {
    totalReferrals: number;
    successful: number;
    pending: number;
    rejected: number;
    conversionRate: number;
    pointsIssued: number;
    rewardsUnlocked: number;
    rewardsClaimed: number;
  };
  referrals: Array<{
    id: string;
    referrer: string;
    referred: string;
    createdAt: string;
    status: string;
    completedAt: string | null;
    points: number;
  }>;
  topReferrers: Array<{
    username: string;
    successful: number;
    points: number;
    level: number;
  }>;
};

export const fetchAdminReferralOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => basketInput.parse(input))
  .handler(async ({ data }): Promise<AdminReferralOverview> => {
    await requireReferral(data.basketIdent, "referral.view");
    const empty: AdminReferralOverview = {
      configured: referralsConfigured(),
      settings: { ...DEFAULT_REFERRAL_SETTINGS },
      rewards: [],
      stats: {
        totalReferrals: 0,
        successful: 0,
        pending: 0,
        rejected: 0,
        conversionRate: 0,
        pointsIssued: 0,
        rewardsUnlocked: 0,
        rewardsClaimed: 0,
      },
      referrals: [],
      topReferrers: [],
    };
    if (!referralsConfigured()) return empty;

    const bin = await readReferralBin();
    const nameOf = (cfxId: string) => bin.users[cfxId]?.username ?? cfxId;

    const total = bin.referrals.length;
    const successful = bin.referrals.filter((r) => r.status === "completed").length;
    const pending = bin.referrals.filter((r) => r.status === "pending").length;
    const rejected = bin.referrals.filter((r) => r.status === "rejected").length;
    const pointsIssued = bin.referrals
      .filter((r) => r.status === "completed")
      .reduce((s, r) => s + (r.pointsAwarded || 0), 0);

    const topReferrers = Object.values(bin.users)
      .map((u) => {
        const s = successfulCount(bin, u.cfxId);
        return {
          username: u.username,
          successful: s,
          points: pointsFor(bin, u.cfxId),
          level: computeLevel(bin.rewards, s, pointsFor(bin, u.cfxId)),
        };
      })
      .filter((u) => u.successful > 0)
      .sort((a, b) => b.successful - a.successful || b.points - a.points)
      .slice(0, 10);

    return {
      configured: true,
      settings: bin.settings,
      rewards: [...bin.rewards].sort((a, b) => a.sortOrder - b.sortOrder),
      stats: {
        totalReferrals: total,
        successful,
        pending,
        rejected,
        conversionRate: total > 0 ? Math.round((successful / total) * 100) : 0,
        pointsIssued,
        rewardsUnlocked: bin.claims.length,
        rewardsClaimed: bin.claims.filter((c) => c.status === "claimed").length,
      },
      referrals: [...bin.referrals]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 200)
        .map((r) => ({
          id: r.id,
          referrer: nameOf(r.referrerCfxId),
          referred: r.referredUsername,
          createdAt: r.createdAt,
          status: r.status,
          completedAt: r.completedAt,
          points: r.pointsAwarded,
        })),
      topReferrers,
    };
  });

const settingsInput = z.object({
  basketIdent: z.string().min(1),
  settings: z.object({
    enabled: z.boolean(),
    programName: z.string().min(1).max(80),
    programDescription: z.string().max(300),
    pointsPerReferral: z.number().int().min(0).max(100_000),
    completion: z.enum(["signup", "purchase"]),
    allowClaims: z.boolean(),
    showLeaderboard: z.boolean(),
    attributionDays: z.number().int().min(1).max(365),
  }),
});

export const saveReferralSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => settingsInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { username } = await requireReferral(data.basketIdent, "referral.manage");
    if (!referralsConfigured()) return { ok: false };
    const bin = await readReferralBin();
    bin.settings = { ...bin.settings, ...data.settings };
    const ok = await writeReferralBin(bin);
    if (ok) {
      await appendLog(makeReferralLog("referral.settings", username, "Einstellungen aktualisiert"));
    }
    return { ok };
  });

const rewardInput = z.object({
  basketIdent: z.string().min(1),
  reward: z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(80),
    description: z.string().max(300),
    image: z.string().max(500).nullable(),
    requiredReferrals: z.number().int().min(0).max(100_000),
    requiredPoints: z.number().int().min(0).max(1_000_000),
    rewardType: z.enum(["map", "discount", "role", "custom"]),
    rewardValue: z.string().max(120),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  }),
});

export const upsertReferralReward = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => rewardInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; id: string }> => {
    const { username } = await requireReferral(data.basketIdent, "referral.manage");
    if (!referralsConfigured()) return { ok: false, id: "" };
    const bin = await readReferralBin();
    const now = new Date().toISOString();
    const input = data.reward;

    if (input.id) {
      const existing = bin.rewards.find((r) => r.id === input.id);
      if (!existing) return { ok: false, id: "" };
      Object.assign(existing, {
        name: input.name,
        description: input.description,
        image: input.image,
        requiredReferrals: input.requiredReferrals,
        requiredPoints: input.requiredPoints,
        rewardType: input.rewardType,
        rewardValue: input.rewardValue,
        active: input.active,
        sortOrder: input.sortOrder,
        updatedAt: now,
      });
      const ok = await writeReferralBin(bin);
      if (ok) await appendLog(makeReferralLog("referral.reward", username, `Reward bearbeitet: ${input.name}`));
      return { ok, id: existing.id };
    }

    const reward: ReferralReward = {
      id: newId("rwd"),
      name: input.name,
      description: input.description,
      image: input.image,
      requiredReferrals: input.requiredReferrals,
      requiredPoints: input.requiredPoints,
      rewardType: input.rewardType,
      rewardValue: input.rewardValue,
      active: input.active,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    bin.rewards.push(reward);
    const ok = await writeReferralBin(bin);
    if (ok) await appendLog(makeReferralLog("referral.reward", username, `Reward erstellt: ${input.name}`));
    return { ok, id: reward.id };
  });

const deleteRewardInput = z.object({
  basketIdent: z.string().min(1),
  id: z.string().min(1),
});

export const deleteReferralReward = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => deleteRewardInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { username } = await requireReferral(data.basketIdent, "referral.manage");
    if (!referralsConfigured()) return { ok: false };
    const bin = await readReferralBin();
    const removed = bin.rewards.find((r) => r.id === data.id);
    bin.rewards = bin.rewards.filter((r) => r.id !== data.id);
    bin.claims = bin.claims.filter((c) => c.rewardId !== data.id);
    const ok = await writeReferralBin(bin);
    if (ok && removed) {
      await appendLog(makeReferralLog("referral.reward", username, `Reward gelöscht: ${removed.name}`));
    }
    return { ok };
  });

const statusInput = z.object({
  basketIdent: z.string().min(1),
  referralId: z.string().min(1),
  status: z.enum(["pending", "completed", "rejected"]),
});

export const setReferralStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => statusInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { username } = await requireReferral(data.basketIdent, "referral.manage");
    if (!referralsConfigured()) return { ok: false };
    const bin = await readReferralBin();
    const referral = bin.referrals.find((r) => r.id === data.referralId);
    if (!referral) return { ok: false };

    referral.status = data.status;
    if (data.status === "completed") {
      referral.completedAt = referral.completedAt ?? new Date().toISOString();
      referral.pointsAwarded = bin.settings.pointsPerReferral;
    } else {
      referral.completedAt = null;
      referral.pointsAwarded = 0;
    }
    referral.note = `manuell: ${data.status} (${username ?? "admin"})`;
    const ok = await writeReferralBin(bin);
    if (ok) {
      await appendLog(
        makeReferralLog(
          "referral.status",
          username,
          `Referral ${referral.referredUsername} → ${data.status}`,
        ),
      );
    }
    return { ok };
  });

function makeReferralLog(type: string, actor: string | null, detail: string) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    type,
    actor,
    cfxName: actor,
    tebexId: null,
    packageName: null,
    amount: null,
    currency: null,
    paymentMethod: null,
    detail,
  };
}
