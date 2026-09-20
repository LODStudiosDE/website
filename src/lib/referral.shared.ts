// Client-safe types & pure helpers for the referral / invite program.
// Contains NO secrets and NO server access — safe to ship to the browser and
// to import from both the server store and the UI. The referral program is
// themed around inviting people to discover LODStudios maps.

export type ReferralCompletion = "signup" | "purchase";

export type ReferralSettings = {
  enabled: boolean;
  programName: string;
  programDescription: string;
  pointsPerReferral: number;
  completion: ReferralCompletion;
  allowClaims: boolean;
  showLeaderboard: boolean;
  attributionDays: number;
};

export type ReferralRewardType = "map" | "discount" | "role" | "custom";

export type ReferralReward = {
  id: string;
  name: string;
  description: string;
  image: string | null;
  requiredReferrals: number;
  requiredPoints: number;
  rewardType: ReferralRewardType;
  rewardValue: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ReferralUser = {
  cfxId: string;
  username: string;
  code: string;
  referrerCfxId: string | null;
  hidden: boolean;
  createdAt: string;
};

export type ReferralStatus = "pending" | "completed" | "rejected";

export type ReferralRecord = {
  id: string;
  referrerCfxId: string;
  referredCfxId: string;
  referredUsername: string;
  code: string;
  status: ReferralStatus;
  pointsAwarded: number;
  createdAt: string;
  completedAt: string | null;
  note: string | null;
};

export type ReferralClaimStatus = "unlocked" | "claimed";

export type ReferralClaim = {
  id: string;
  cfxId: string;
  rewardId: string;
  unlockedAt: string;
  claimedAt: string | null;
  status: ReferralClaimStatus;
};

export type ReferralEventType =
  | "referral_joined"
  | "referral_completed"
  | "points_received"
  | "reward_unlocked"
  | "reward_claimed";

export type ReferralActivity = {
  id: string;
  cfxId: string;
  referralId: string | null;
  eventType: ReferralEventType;
  points: number | null;
  rewardName: string | null;
  createdAt: string;
};

export type ReferralBin = {
  settings: ReferralSettings;
  rewards: ReferralReward[];
  users: Record<string, ReferralUser>;
  codeIndex: Record<string, string>;
  referrals: ReferralRecord[];
  claims: ReferralClaim[];
  activity: ReferralActivity[];
};

// ── DTOs sent to the client (already computed, nothing hardcoded here) ───────

export type RewardCardStatus = "locked" | "in_progress" | "unlocked" | "claimed";

export type DashboardReward = {
  id: string;
  name: string;
  description: string;
  image: string | null;
  rewardType: ReferralRewardType;
  rewardValue: string;
  requiredReferrals: number;
  requiredPoints: number;
  status: RewardCardStatus;
  claimable: boolean;
};

export type DashboardNextReward = {
  name: string;
  requiredReferrals: number;
  requiredPoints: number;
  currentReferrals: number;
  currentPoints: number;
  remainingText: string;
  progress: number;
};

export type DashboardReferralRow = {
  id: string;
  username: string;
  joinedAt: string;
  status: ReferralStatus;
  points: number;
  completedAt: string | null;
};

export type DashboardActivityRow = {
  id: string;
  eventType: ReferralEventType;
  points: number | null;
  rewardName: string | null;
  createdAt: string;
};

export type LeaderboardRow = {
  rank: number;
  username: string;
  successful: number;
  points: number;
  level: number;
  you: boolean;
};

export type ReferralDashboard = {
  configured: boolean;
  enabled: boolean;
  program: { name: string; description: string };
  allowClaims: boolean;
  code: string;
  hiddenFromLeaderboard: boolean;
  stats: {
    total: number;
    successful: number;
    pending: number;
    rejected: number;
    points: number;
    level: number;
  };
  nextReward: DashboardNextReward | null;
  rewards: DashboardReward[];
  referrals: DashboardReferralRow[];
  activity: DashboardActivityRow[];
  leaderboard: LeaderboardRow[] | null;
};

// ── defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  enabled: true,
  programName: "Empfehlungsprogramm",
  programDescription:
    "Lade neue Creator zu LODStudios ein und schalte exklusive Map-Belohnungen frei.",
  pointsPerReferral: 100,
  completion: "purchase",
  allowClaims: true,
  showLeaderboard: true,
  attributionDays: 30,
};

// ── pure helpers ─────────────────────────────────────────────────────────────

/** Active rewards sorted the way the ladder should be climbed. */
export function sortedRewards(rewards: ReferralReward[]): ReferralReward[] {
  return [...rewards]
    .filter((r) => r.active)
    .sort(
      (a, b) =>
        a.requiredReferrals - b.requiredReferrals ||
        a.requiredPoints - b.requiredPoints ||
        a.sortOrder - b.sortOrder,
    );
}

/** A reward is reached when both requirements are satisfied. */
export function rewardReached(
  reward: Pick<ReferralReward, "requiredReferrals" | "requiredPoints">,
  successful: number,
  points: number,
): boolean {
  return successful >= reward.requiredReferrals && points >= reward.requiredPoints;
}

/** Current level = number of active rewards fully reached. */
export function computeLevel(
  rewards: ReferralReward[],
  successful: number,
  points: number,
): number {
  return sortedRewards(rewards).filter((r) => rewardReached(r, successful, points)).length;
}

export function buildRemainingText(
  reward: Pick<ReferralReward, "requiredReferrals" | "requiredPoints">,
  successful: number,
  points: number,
): { remainingText: string; progress: number } {
  const remReferrals = Math.max(0, reward.requiredReferrals - successful);
  const remPoints = Math.max(0, reward.requiredPoints - points);

  // Pick the requirement that is still binding (further from done).
  const useReferrals = reward.requiredReferrals > 0 && remReferrals > 0;
  if (useReferrals) {
    const progress =
      reward.requiredReferrals === 0 ? 1 : Math.min(1, successful / reward.requiredReferrals);
    const text =
      remReferrals === 1
        ? "Noch 1 erfolgreiche Empfehlung"
        : `Noch ${remReferrals} erfolgreiche Empfehlungen`;
    return { remainingText: text, progress };
  }

  if (reward.requiredPoints > 0 && remPoints > 0) {
    const progress = Math.min(1, points / reward.requiredPoints);
    return { remainingText: `Noch ${remPoints} Punkte`, progress };
  }

  return { remainingText: "Bereit zum Freischalten", progress: 1 };
}
