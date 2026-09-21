import { createServerFn } from "@tanstack/react-start";

export type DiscordMember = {
  id: string;
  name: string;
  avatar: string;
  roleName: string;
  roleId: string;
  group: "Head" | "Artist" | "Support";
};

export type TeamGroup = {
  label: DiscordMember["group"];
  members: DiscordMember[];
};

const GROUP_ROLES: Record<DiscordMember["group"], string[]> = {
  Head: [
    "909107100377042974",
    "1426299040269865062",
    "1101739984509214781",
    "1426299246252134411",
  ],
  Artist: [
    "1351989916619243713",
    "1102948657650749470",
    "1378064041699971264",
  ],
  Support: [
    "1378065315388461136",
    "1132134848107118712",
    "1378065166037680129",
  ],
};

function defaultAvatar(userId: string) {
  const idx = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

type GuildMember = {
  user?: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
};

type Role = { id: string; name: string; position: number };

async function discordFetch(url: string, token: string): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
    if (res.status === 429) {
      let wait = 1000;
      try {
        const body = (await res.clone().json()) as { retry_after?: number };
        if (typeof body.retry_after === "number") wait = body.retry_after * 1000 + 250;
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
      continue;
    }
    return res;
  }
  throw new Error("Discord rate limit: retries exhausted");
}

async function fetchAllMembers(guildId: string, token: string): Promise<GuildMember[]> {
  const all: GuildMember[] = [];
  let after = "0";
  // paginate up to ~10k members
  for (let i = 0; i < 10; i++) {
    const res = await discordFetch(
      `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`,
      token,
    );
    if (!res.ok) {
      throw new Error(`Discord members fetch failed: ${res.status} ${await res.text()}`);
    }
    const batch = (await res.json()) as GuildMember[];
    if (batch.length === 0) break;
    all.push(...batch);
    const last = batch[batch.length - 1]?.user?.id;
    if (!last || batch.length < 1000) break;
    after = last;
  }
  return all;
}

async function fetchRoles(guildId: string, token: string): Promise<Role[]> {
  const res = await discordFetch(
    `https://discord.com/api/v10/guilds/${guildId}/roles`,
    token,
  );
  if (!res.ok) throw new Error(`Discord roles fetch failed: ${res.status}`);
  return (await res.json()) as Role[];
}

let cache: { at: number; data: { groups: TeamGroup[] } } | null = null;

// The last REAL roster is kept on disk, so a server restart (or a Discord
// outage) still shows the actual team. Invented placeholder people are never
// shown: without real data the page renders loading cards instead.
const SNAPSHOT_FILE = ".cache/discord-team.json";

async function readSnapshot(): Promise<{ groups: TeamGroup[] } | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const data = JSON.parse(await readFile(SNAPSHOT_FILE, "utf8")) as { groups?: TeamGroup[] };
    if (Array.isArray(data.groups) && data.groups.some((g) => g.members?.length > 0)) {
      return { groups: data.groups };
    }
  } catch {
    /* no snapshot yet */
  }
  return null;
}

async function writeSnapshot(data: { groups: TeamGroup[] }): Promise<void> {
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(".cache", { recursive: true });
    await writeFile(SNAPSHOT_FILE, JSON.stringify(data), "utf8");
  } catch (err) {
    console.error("[discord-team] snapshot write failed", err);
  }
}

// Crawling the whole guild member list takes several seconds (paginated,
// sequential, rate-limited). The page must never wait for that, so:
//  - answer immediately with the last known real roster (memory, else disk snapshot),
//  - refresh in the background once the data is older than FRESH_MS,
//  - never run two crawls at once.
const FRESH_MS = 5 * 60 * 1000;
let refreshing: Promise<void> | null = null;

function refreshTeam(guildId: string, token: string): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = buildTeam(guildId, token)
    .then(async (result) => {
      cache = { at: Date.now(), data: result };
      await writeSnapshot(result);
    })
    .catch((err) => console.error("[discord-team]", err))
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export type TeamResponse = {
  groups: TeamGroup[];
  /** true while no real Discord roster has been fetched yet (loading cards shown);
   *  the client keeps polling until this turns false. */
  provisional?: boolean;
};

export const getDiscordTeam = createServerFn({ method: "GET" }).handler(
  async (): Promise<TeamResponse> => {
    const token = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!cache) {
      // at: 0 → counts as stale, so a refresh starts right away
      const snap = await readSnapshot();
      if (snap && !cache) cache = { at: 0, data: snap };
    }
    if (!token || !guildId) return cache ? cache.data : { groups: [] };

    const stale = !cache || Date.now() - cache.at >= FRESH_MS;
    const refresh = stale ? refreshTeam(guildId, token) : null;
    if (cache) return cache.data; // fresh or stale-but-real: answer at once

    // Cold start: give Discord a short moment, but never hold the page longer.
    if (refresh) {
      await Promise.race([refresh, new Promise((r) => setTimeout(r, 2000))]);
      if (cache) return (cache as { data: TeamResponse }).data;
    }
    return { groups: [], provisional: true };
  },
);

// Warm the roster as soon as the server starts so the first visitor already
// gets the real Discord data instead of loading cards.
if (typeof window === "undefined") {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (token && guildId) void refreshTeam(guildId, token);
}

async function buildTeam(guildId: string, token: string): Promise<{ groups: TeamGroup[] }> {
  {
    // sequential to avoid hitting Discord's rate limit
    const members: GuildMember[] = await fetchAllMembers(guildId, token);
    const roles: Role[] = await fetchRoles(guildId, token);

    const roleMap = new Map(roles.map((r) => [r.id, r]));

    const out: TeamGroup[] = [];
    const seen = new Set<string>();

    for (const label of Object.keys(GROUP_ROLES) as DiscordMember["group"][]) {
      const roleIds = GROUP_ROLES[label];
      const groupMembers: DiscordMember[] = [];

      for (const m of members) {
        if (!m.user || m.user.id === undefined) continue;
        if (seen.has(m.user.id)) continue;

        // pick the highest-priority configured role this member holds in this group
        const matchedRoleId = roleIds.find((rid) => m.roles.includes(rid));
        if (!matchedRoleId) continue;

        seen.add(m.user.id);

        const u = m.user;
        const name = u.global_name || u.username;

        let avatar: string;
        if (u.avatar) {
          avatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=512`;
        } else {
          avatar = defaultAvatar(u.id);
        }

        const role = roleMap.get(matchedRoleId);
        groupMembers.push({
          id: u.id,
          name,
          avatar,
          roleName: role?.name ?? "Member",
          roleId: matchedRoleId,
          group: label,
        });
      }

      // sort by role priority within group (order of GROUP_ROLES list)
      groupMembers.sort(
        (a, b) => roleIds.indexOf(a.roleId) - roleIds.indexOf(b.roleId),
      );

      out.push({ label, members: groupMembers });
    }

    // An empty result is a failed crawl (missing intent, outage), never the
    // truth — keep whatever real roster we already have.
    if (out.every((g) => g.members.length === 0)) throw new Error("Discord returned no team members");
    return { groups: out };
  }
}
