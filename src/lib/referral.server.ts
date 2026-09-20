// Server-only store & business logic for the referral program. All point/reward
// awards are computed here — never trusting the client. Persistence: one JSON
// document in the Supabase table `referral_state`, saved with optimistic
// locking (see db.server.ts).
import "./load-env.server";
import { readReferralDoc, referralsStoreConfigured, writeReferralDoc } from "./db.server";
import { fetchPackages, stripHtml } from "./tebex";
import {
  DEFAULT_REFERRAL_SETTINGS,
  buildRemainingText,
  computeLevel,
  rewardReached,
  sortedRewards,
  type ReferralReward,
  type ReferralActivity,
  type ReferralBin,
  type ReferralClaim,
  type ReferralDashboard,
  type ReferralEventType,
  type ReferralRecord,
  type ReferralSettings,
  type ReferralUser,
} from "./referral.shared";

const PLUGIN_BASE = "https://plugin.tebex.io";

export function referralsConfigured(): boolean {
  return referralsStoreConfigured();
}

function emptyBin(): ReferralBin {
  return {
    settings: { ...DEFAULT_REFERRAL_SETTINGS },
    rewards: [],
    users: {},
    codeIndex: {},
    referrals: [],
    claims: [],
    activity: [],
  };
}

// Remembers which database version each loaded state came from, so the save
// can verify nobody else changed it in between. Keyed by the object itself, so
// the callers' read → mutate → write flow stays exactly as it was.
const loadedVersion = new WeakMap<ReferralBin, number>();

/**
 * Loads the referral state. THROWS when the database cannot be read: returning
 * an empty program here would let the next save wipe every user, referral and
 * claim. A failed request is always better than that.
 */
export async function readReferralBin(): Promise<ReferralBin> {
  const doc = await readReferralDoc();
  if (!doc) throw new Error("REFERRAL_STORE_UNAVAILABLE");

  const stored = (doc.data ?? {}) as Partial<ReferralBin>;
  const bin: ReferralBin = {
    ...emptyBin(),
    settings: { ...DEFAULT_REFERRAL_SETTINGS, ...(stored.settings ?? {}) },
    rewards: stored.rewards ?? [],
    users: stored.users ?? {},
    codeIndex: stored.codeIndex ?? {},
    referrals: stored.referrals ?? [],
    claims: stored.claims ?? [],
    activity: stored.activity ?? [],
  };
  loadedVersion.set(bin, doc.version);
  return bin;
}

/**
 * Saves the state only if it is still based on the latest version. Returns
 * false on a conflict (another request saved first) or a database error — the
 * caller's change is then NOT applied and nothing is overwritten.
 */
export async function writeReferralBin(bin: ReferralBin): Promise<boolean> {
  const version = loadedVersion.get(bin);
  if (version === undefined) {
    console.error("[referral] refusing to save a state that was not loaded via readReferralBin()");
    return false;
  }
  const result = await writeReferralDoc(bin, version);
  if (result === "ok") {
    // Same object may be saved again later in the request.
    loadedVersion.set(bin, version < 0 ? 1 : version + 1);
    return true;
  }
  if (result === "conflict") {
    console.warn("[referral] save skipped: state changed concurrently (optimistic lock)");
  }
  return false;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Random, non-guessable invite code, always prefixed with "LOD-".
function generateCode(bin: ReferralBin): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = "LOD-";
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!bin.codeIndex[code]) return code;
  }
  return `LOD-${Date.now().toString(36).toUpperCase()}`;
}

/** Ensures a referral user record + code exists for this cfx id. Mutates bin. */
export function ensureUser(
  bin: ReferralBin,
  cfxId: string,
  username: string,
): ReferralUser {
  let user = bin.users[cfxId];
  if (!user) {
    const code = generateCode(bin);
    user = {
      cfxId,
      username,
      code,
      referrerCfxId: null,
      hidden: false,
      createdAt: new Date().toISOString(),
    };
    bin.users[cfxId] = user;
    bin.codeIndex[code] = cfxId;
  } else if (username && user.username !== username) {
    user.username = username;
  }
  return user;
}

function pushActivity(
  bin: ReferralBin,
  cfxId: string,
  eventType: ReferralEventType,
  extra: { referralId?: string | null; points?: number | null; rewardName?: string | null } = {},
): void {
  bin.activity.unshift({
    id: newId("act"),
    cfxId,
    referralId: extra.referralId ?? null,
    eventType,
    points: extra.points ?? null,
    rewardName: extra.rewardName ?? null,
    createdAt: new Date().toISOString(),
  });
  bin.activity = bin.activity.slice(0, 2000);
}

// A referral only completes on a *real, fully paid* purchase: the payment must
// be 100% complete (status Complete) AND have a paid amount > 0. Free deliveries
// and pending/refunded/chargeback payments never count toward the program.
async function tebexUserHasCompletedPurchase(cfxId: string): Promise<boolean> {
  const secret = process.env["TEBEX_SECRET"];
  if (!secret) return false;
  try {
    const res = await fetch(`${PLUGIN_BASE}/user/${encodeURIComponent(cfxId)}`, {
      headers: { "X-Tebex-Secret": secret, Accept: "application/json" },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      payments?: { status?: string | number; amount?: string | number; price?: string | number }[];
    };
    const payments = data.payments ?? [];
    if (payments.length === 0) return false;
    return payments.some((p) => {
      const s = String(p.status ?? "").toLowerCase();
      const complete = s === "1" || s === "complete" || s.includes("complete");
      const paid = Number(p.amount ?? p.price ?? 0) > 0;
      return complete && paid;
    });
  } catch {
    return false;
  }
}

/** Sum of points from completed referrals for a referrer. */
export function pointsFor(bin: ReferralBin, referrerCfxId: string): number {
  return bin.referrals
    .filter((r) => r.referrerCfxId === referrerCfxId && r.status === "completed")
    .reduce((sum, r) => sum + (r.pointsAwarded || 0), 0);
}

export function successfulCount(bin: ReferralBin, referrerCfxId: string): number {
  return bin.referrals.filter(
    (r) => r.referrerCfxId === referrerCfxId && r.status === "completed",
  ).length;
}

/** Marks a single referral completed, awards points and logs activity. */
function completeReferral(bin: ReferralBin, referral: ReferralRecord): void {
  if (referral.status === "completed") return;
  referral.status = "completed";
  referral.completedAt = new Date().toISOString();
  referral.pointsAwarded = bin.settings.pointsPerReferral;
  pushActivity(bin, referral.referrerCfxId, "referral_completed", {
    referralId: referral.id,
  });
  pushActivity(bin, referral.referrerCfxId, "points_received", {
    referralId: referral.id,
    points: referral.pointsAwarded,
  });
}

/**
 * Re-evaluates pending referrals connected to `viewerCfxId` (either as referrer
 * or as the referred user) and completes them when the configured requirement
 * is met. Returns true if anything changed.
 */
export async function evaluateReferrals(
  bin: ReferralBin,
  viewerCfxId: string,
): Promise<boolean> {
  const pending = bin.referrals.filter(
    (r) =>
      r.status === "pending" &&
      (r.referrerCfxId === viewerCfxId || r.referredCfxId === viewerCfxId),
  );
  if (pending.length === 0) return false;

  let changed = false;
  for (const referral of pending) {
    let done = false;
    if (bin.settings.completion === "signup") {
      done = true;
    } else {
      done = await tebexUserHasCompletedPurchase(referral.referredCfxId);
    }
    if (done) {
      completeReferral(bin, referral);
      changed = true;
    }
  }
  return changed;
}

/** Creates "unlocked" claim records for newly reached rewards. Mutates bin. */
export function ensureUnlocks(bin: ReferralBin, cfxId: string): boolean {
  const successful = successfulCount(bin, cfxId);
  const points = pointsFor(bin, cfxId);
  let changed = false;
  for (const reward of sortedRewards(bin.rewards)) {
    if (!rewardReached(reward, successful, points)) continue;
    const exists = bin.claims.some((c) => c.cfxId === cfxId && c.rewardId === reward.id);
    if (exists) continue;
    bin.claims.push({
      id: newId("clm"),
      cfxId,
      rewardId: reward.id,
      unlockedAt: new Date().toISOString(),
      claimedAt: null,
      status: "unlocked",
    });
    pushActivity(bin, cfxId, "reward_unlocked", { rewardName: reward.name });
    changed = true;
  }
  return changed;
}

export type RewardProduct = {
  id: number;
  name: string;
  image: string | null;
  description: string;
};

type RewardRecipe =
  | { kind: "final" }
  | { kind: "product" }
  | { kind: "discount" }
  | { kind: "giftcard" };

// Rotation of distinct reward kinds so every tier grants something different.
// Discount/giftcard amounts are scaled by tier below; product tiers pull a
// unique real shop product (assigned in buildDashboard).
const RECIPE_ROTATION: RewardRecipe[] = [
  { kind: "discount" },
  { kind: "product" },
  { kind: "giftcard" },
  { kind: "discount" },
  { kind: "product" },
  { kind: "giftcard" },
  { kind: "discount" },
  { kind: "product" },
  { kind: "giftcard" },
];

function recipeForPosition(position: number): RewardRecipe {
  return RECIPE_ROTATION[position % RECIPE_ROTATION.length]!;
}

// Amounts grow with the referral requirement so low tiers never grant a high
// value (e.g. no 50 EUR giftcard at 5 referrals). Tables are checked top-down.
const GIFTCARD_TIERS: { min: number; value: number }[] = [
  { min: 75, value: 50 },
  { min: 50, value: 35 },
  { min: 25, value: 25 },
  { min: 10, value: 15 },
  { min: 5, value: 10 },
  { min: 0, value: 5 },
];

const DISCOUNT_TIERS: { min: number; value: number }[] = [
  { min: 75, value: 25 },
  { min: 50, value: 20 },
  { min: 25, value: 15 },
  { min: 10, value: 12 },
  { min: 5, value: 10 },
  { min: 0, value: 5 },
];

function scaledValue(tiers: { min: number; value: number }[], referrals: number): number {
  return (tiers.find((t) => referrals >= t.min) ?? tiers[tiers.length - 1]!).value;
}

function remixRewardContent(
  reward: ReferralReward,
  recipe: RewardRecipe,
  product: RewardProduct | null,
): {
  name: string;
  description: string;
  rewardType: ReferralReward["rewardType"];
  rewardValue: string;
  image: string | null;
} {
  // Keep the final milestone exactly as configured.
  if (recipe.kind === "final") {
    return {
      name: reward.name,
      description: reward.description,
      rewardType: reward.rewardType,
      rewardValue: reward.rewardValue,
      image: reward.image,
    };
  }

  const referrals = Math.max(0, reward.requiredReferrals);
  const requirementText =
    referrals > 0 ? `bei ${referrals} erfolgreichen Empfehlungen` : "auf dieser Stufe";

  if (recipe.kind === "discount") {
    const value = scaledValue(DISCOUNT_TIERS, referrals);
    return {
      name: `${value}% Store Rabatt`,
      description: `Du erhältst einen ${value}% Store-Rabattcode ${requirementText}.`,
      rewardType: "discount",
      rewardValue: `${value}%`,
      image: null,
    };
  }

  if (recipe.kind === "giftcard") {
    const value = scaledValue(GIFTCARD_TIERS, referrals);
    return {
      name: `Giftcard ${value} EUR`,
      description: `Du erhältst eine ${value} EUR Giftcard ${requirementText}.`,
      rewardType: "custom",
      rewardValue: `giftcard_${value}_eur`,
      image: null,
    };
  }

  // Product tier — use a real product from the shop.
  if (product) {
    return {
      name: product.name,
      description:
        product.description ||
        `Du erhältst "${product.name}" gratis aus dem Store ${requirementText}.`,
      rewardType: "custom",
      rewardValue: `package_${product.id}`,
      image: product.image,
    };
  }

  return {
    name: "Store Produkt nach Wahl",
    description: `Du erhältst ein Produkt aus dem Store ${requirementText}.`,
    rewardType: "custom",
    rewardValue: "store_product_choice",
    image: null,
  };
}

function sanitizeRewardLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  if (/banking\s*system/i.test(label)) return "Creator Reward";
  return label;
}

// Swaps specific products out of the referral reward pool for chosen ones.
const REWARD_PRODUCT_REPLACEMENTS: Record<string, string> = {
  "vinewood ammunation": "Little Seoul Gardens",
  "la mesa hood exterior": "South Side Medical Center",
  "tow star": "Richman Villa",
  "highway sheriff": "Whitmore Estate",
};

// Loads real shop products for product-tier rewards. Excludes maps, exteriors
// and scripts so those never appear as referral rewards.
export async function loadRewardProducts(): Promise<RewardProduct[]> {
  try {
    const packages = await fetchPackages();
    const toRewardProduct = (p: (typeof packages)[number]): RewardProduct => ({
      id: p.id,
      name: p.name,
      image:
        p.image ??
        p.media?.find((m) => m.primary)?.url ??
        p.media?.[0]?.url ??
        null,
      description: stripHtml(p.description ?? "", 160),
    });
    const byName = new Map(packages.map((p) => [p.name.trim().toLowerCase(), p]));
    const excluded = /map|exterior|script/i;
    const pool = packages
      .filter((p) => p.type === "single")
      .filter((p) => !excluded.test(p.category?.name ?? ""))
      .sort((a, b) => a.total_price - b.total_price)
      .map((p) => {
        const replacementName = REWARD_PRODUCT_REPLACEMENTS[p.name.trim().toLowerCase()];
        const replacement = replacementName
          ? byName.get(replacementName.trim().toLowerCase())
          : undefined;
        return toRewardProduct(replacement ?? p);
      });
    // Drop duplicates that can appear after a swap targets an existing product.
    const seen = new Set<number>();
    return pool.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  } catch {
    return [];
  }
}

// ── dashboard projection ─────────────────────────────────────────────────────

export function buildDashboard(
  bin: ReferralBin,
  cfxId: string,
  products: RewardProduct[] = [],
): ReferralDashboard {
  const user = bin.users[cfxId];
  const settings = bin.settings;
  const mine = bin.referrals.filter((r) => r.referrerCfxId === cfxId);
  const successful = mine.filter((r) => r.status === "completed").length;
  const pendingCount = mine.filter((r) => r.status === "pending").length;
  const rejectedCount = mine.filter((r) => r.status === "rejected").length;
  const points = pointsFor(bin, cfxId);
  const level = computeLevel(bin.rewards, successful, points);

  const ladder = sortedRewards(bin.rewards);
  const claims = bin.claims.filter((c) => c.cfxId === cfxId);
  const claimById = new Map(claims.map((c) => [c.rewardId, c]));

  // Assign a distinct recipe per tier (rotating) so each reward differs, and
  // give every product tier its own unique real shop product. The last tier
  // (100 referrals) always keeps its configured reward.
  const recipeByRewardId = new Map<string, RewardRecipe>();
  const productByRewardId = new Map<string, RewardProduct | null>();
  let position = 0;
  let productCursor = 0;
  for (const reward of ladder) {
    if (reward.requiredReferrals === 100) {
      recipeByRewardId.set(reward.id, { kind: "final" });
      continue;
    }
    const recipe = recipeForPosition(position);
    recipeByRewardId.set(reward.id, recipe);
    position += 1;
    if (recipe.kind === "product") {
      const assigned = products.length > 0 ? products[productCursor % products.length] : null;
      productByRewardId.set(reward.id, assigned ?? null);
      productCursor += 1;
    }
  }

  const rewards = ladder.map((reward) => {
    const reached = rewardReached(reward, successful, points);
    const claim = claimById.get(reward.id);
    const recipe = recipeByRewardId.get(reward.id) ?? { kind: "final" as const };
    const mixed = remixRewardContent(reward, recipe, productByRewardId.get(reward.id) ?? null);
    let status: "locked" | "in_progress" | "unlocked" | "claimed";
    if (claim?.status === "claimed") status = "claimed";
    else if (reached) status = "unlocked";
    else if (successful > 0 || points > 0) status = "in_progress";
    else status = "locked";
    return {
      id: reward.id,
      name: mixed.name,
      description: mixed.description,
      image: mixed.image,
      rewardType: mixed.rewardType,
      rewardValue: mixed.rewardValue,
      requiredReferrals: reward.requiredReferrals,
      requiredPoints: reward.requiredPoints,
      status,
      claimable: settings.allowClaims && reached && claim?.status !== "claimed",
    };
  });

  const next = ladder.find((r) => !rewardReached(r, successful, points)) ?? null;
  const nextReward = next
    ? (() => {
        const nextRecipe = recipeByRewardId.get(next.id) ?? { kind: "final" as const };
        const mixed = remixRewardContent(
          next,
          nextRecipe,
          productByRewardId.get(next.id) ?? null,
        );
        return {
          name: mixed.name,
          requiredReferrals: next.requiredReferrals,
          requiredPoints: next.requiredPoints,
          currentReferrals: successful,
          currentPoints: points,
          ...buildRemainingText(next, successful, points),
        };
      })()
    : null;

  const referrals = [...mine]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((r) => ({
      id: r.id,
      username: r.referredUsername,
      joinedAt: r.createdAt,
      status: r.status,
      points: r.pointsAwarded,
      completedAt: r.completedAt,
    }));

  const activity = bin.activity
    .filter((a) => a.cfxId === cfxId)
    .slice(0, 30)
    .map((a) => ({
      id: a.id,
      eventType: a.eventType,
      points: a.points,
      rewardName: sanitizeRewardLabel(a.rewardName),
      createdAt: a.createdAt,
    }));

  let leaderboard: ReferralDashboard["leaderboard"] = null;
  if (settings.showLeaderboard) {
    const rows = Object.values(bin.users)
      .filter((u) => !u.hidden)
      .map((u) => {
        const s = successfulCount(bin, u.cfxId);
        const p = pointsFor(bin, u.cfxId);
        return {
          cfxId: u.cfxId,
          username: u.username,
          successful: s,
          points: p,
          level: computeLevel(bin.rewards, s, p),
        };
      })
      .filter((u) => u.successful > 0)
      .sort((a, b) => b.successful - a.successful || b.points - a.points)
      .slice(0, 10);
    leaderboard = rows.map((u, i) => ({
      rank: i + 1,
      username: u.username,
      successful: u.successful,
      points: u.points,
      level: u.level,
      you: u.cfxId === cfxId,
    }));
  }

  return {
    configured: true,
    enabled: settings.enabled,
    program: { name: settings.programName, description: settings.programDescription },
    allowClaims: settings.allowClaims,
    code: user?.code ?? "",
    hiddenFromLeaderboard: user?.hidden ?? false,
    stats: {
      total: mine.length,
      successful,
      pending: pendingCount,
      rejected: rejectedCount,
      points,
      level,
    },
    nextReward,
    rewards,
    referrals,
    activity,
    leaderboard,
  };
}

export type { ReferralSettings, ReferralClaim, ReferralActivity };
