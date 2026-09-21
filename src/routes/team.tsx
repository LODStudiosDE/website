import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Crown,
  Code2,
  Palette,
  Headphones,
  Gem,
  Hammer,
  Brush,
  Megaphone,
  LifeBuoy,
  ShieldCheck,
  HeartHandshake,
  Star,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import {
  getDiscordTeam,
  type DiscordMember,
} from "@/lib/discord-team.functions";
import { useT } from "@/lib/i18n";

const teamQuery = queryOptions({
  queryKey: ["discord-team"],
  queryFn: () => getDiscordTeam(),
  staleTime: 5 * 60_000,
  // Right after a server start the first answer is the fallback roster while
  // Discord is being fetched in the background; poll until the real one lands.
  refetchInterval: (query) => (query.state.data?.provisional ? 2_000 : false),
});

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "LODStudios | Team" },
      { name: "description", content: "The crew behind LODStudios. Creators, developers and designers crafting premium FiveM assets." },
      { property: "og:title", content: "LODStudios | Team" },
      { property: "og:description", content: "The crew behind LODStudios." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teamQuery),
  errorComponent: ({ error }) => <TeamErrorComponent error={error} />,
  notFoundComponent: () => <TeamNotFoundComponent />,
  component: TeamPage,
});

const GROUP_META: Record<DiscordMember["group"], { captionKey: string; icon: LucideIcon }> = {
  Head: { captionKey: "team.group.Head.caption", icon: Crown },
  Artist: { captionKey: "team.group.Artist.caption", icon: Palette },
  Support: { captionKey: "team.group.Support.caption", icon: Headphones },
};

const ROLE_ICONS: Record<string, LucideIcon> = {
  // Head
  "909107100377042974": Crown,
  "1426299040269865062": Gem,
  "1101739984509214781": Hammer,
  "1426299246252134411": Code2,
  // Artist
  "1351989916619243713": Palette,
  "1102948657650749470": Brush,
  "1378064041699971264": Megaphone,
  // Support
  "1378065315388461136": LifeBuoy,
  "1132134848107118712": ShieldCheck,
  "1378065166037680129": HeartHandshake,
};

const FALLBACK_GROUP_ICON: Record<DiscordMember["group"], LucideIcon> = {
  Head: Star,
  Artist: Palette,
  Support: Wrench,
};

// Shown while the real Discord roster is still being fetched — never invented
// people, so names and pictures cannot "change" once the data arrives.
const LOADING_GROUPS: { label: DiscordMember["group"]; count: number }[] = [
  { label: "Head", count: 2 },
  { label: "Artist", count: 4 },
  { label: "Support", count: 4 },
];

// Manual ordering: these names always come first, in this exact order.
// Names are normalized so spaces/capitalization don't matter.
const NAME_PRIORITY = ["lodstudios", "tretex"];

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function orderMembers(members: DiscordMember[]): DiscordMember[] {
  const rank = (m: DiscordMember) => {
    const idx = NAME_PRIORITY.indexOf(normalizeName(m.name));
    return idx === -1 ? NAME_PRIORITY.length : idx;
  };
  return [...members].sort((a, b) => rank(a) - rank(b));
}

function TeamErrorComponent({ error }: { error: Error }) {
  const t = useT();
  return (
    <div className="min-h-screen bg-[#0C0C0D] text-white flex items-center justify-center">
      <p className="text-white/60">{t("team.error").replace("{error}", error.message)}</p>
    </div>
  );
}

function TeamNotFoundComponent() {
  const t = useT();
  return <div className="text-white p-10">{t("team.notFound")}</div>;
}

function TeamPage() {
  const t = useT();
  const { data } = useSuspenseQuery(teamQuery);
  const groups = data.groups.filter((g) => g.members.length > 0);
  const loading = groups.length === 0 && !!data.provisional;

  return (
    <div className="relative min-h-screen bg-[#0C0C0D] text-white overflow-hidden">
      <Navigation />

      {/* HERO */}
      <section className="relative h-[640px] w-full overflow-hidden">
        <HeroVideo
          src={import.meta.env.VITE_TEAM_VIDEO_URL as string | undefined}
          videoId="_vbgxAowWJM"
          variant="store"
        />
        <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col items-center justify-center px-8 pt-20 text-center">
          <h1 className="font-display max-w-5xl text-[clamp(3rem,7vw,6.5rem)] font-bold leading-[1] tracking-tighter text-foreground drop-shadow-[0_4px_40px_rgba(0,0,0,0.55)]">
            {t("team.hero.title")} <span className="text-[#FF3B3B]">LODStudios</span>
          </h1>

          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-foreground/80">
            {t("team.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* CREW GRID */}
      <section className="relative py-24 md:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 -left-40 h-[500px] w-[500px] rounded-full bg-[#FF3B3B]/[0.04] blur-[140px]" />
          <div className="absolute bottom-0 -right-40 h-[500px] w-[500px] rounded-full bg-[#FF3B3B]/[0.03] blur-[140px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="space-y-24">
            {loading &&
              LOADING_GROUPS.map((g) => {
                const GroupIcon = GROUP_META[g.label].icon;
                return (
                  <div key={g.label} aria-busy="true">
                    <div className="flex items-center gap-4 mb-8 pb-4 border-b border-white/[0.06]">
                      <span className="flex h-11 w-11 items-center justify-center border border-[#FF3B3B]/30 bg-[#FF3B3B]/[0.07]">
                        <GroupIcon className="h-5 w-5 text-[#FF3B3B]" />
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[11px] tracking-[0.4em] uppercase text-[#FF3B3B]">{g.label}</span>
                        <span className="text-sm text-white/40">{t(GROUP_META[g.label].captionKey)}</span>
                      </div>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {Array.from({ length: g.count }, (_, i) => (
                        <div
                          key={i}
                          className="aspect-[4/5] animate-pulse border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.01]"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            {groups.map((g) => {
              const meta = GROUP_META[g.label];
              const GroupIcon = meta.icon;
              const members = orderMembers(g.members);
              return (
                <div key={g.label}>
                  <div className="flex items-end justify-between gap-4 mb-8 pb-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-4">
                      <span className="relative flex h-11 w-11 items-center justify-center border border-[#FF3B3B]/30 bg-[#FF3B3B]/[0.07]">
                        <GroupIcon className="h-5 w-5 text-[#FF3B3B]" />
                        <span aria-hidden className="absolute -top-px -left-px h-2 w-2 border-t border-l border-[#FF3B3B]" />
                        <span aria-hidden className="absolute -bottom-px -right-px h-2 w-2 border-b border-r border-[#FF3B3B]" />
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[11px] tracking-[0.4em] uppercase text-[#FF3B3B]">{g.label}</span>
                        <span className="text-sm text-white/40">{t(meta.captionKey)}</span>
                      </div>
                    </div>
                    <span className="text-[11px] tracking-[0.3em] uppercase text-white/30">
                      {String(members.length).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {members.map((m, i) => {
                      const Icon = ROLE_ICONS[m.roleId] ?? FALLBACK_GROUP_ICON[g.label];
                      return (
                        <article
                          key={m.id}
                          className="group relative overflow-hidden border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] transition-all duration-500 hover:border-[#FF3B3B]/40 hover:-translate-y-1"
                        >
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.18)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
                          />

                          {/* corner ticks */}
                          <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-20 h-4 w-4 border-l border-t border-[#FF3B3B]/0 transition-colors duration-500 group-hover:border-[#FF3B3B]/70" />
                          <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 z-20 h-4 w-4 border-b border-r border-[#FF3B3B]/0 transition-colors duration-500 group-hover:border-[#FF3B3B]/70" />

                          <div className="relative aspect-[4/5] overflow-hidden">
                            {/* grid texture */}
                            <svg
                              aria-hidden
                              className="pointer-events-none absolute inset-0 z-10 h-full w-full opacity-[0.12] mix-blend-overlay"
                            >
                              <defs>
                                <pattern id={`grid-${m.id}`} width="22" height="22" patternUnits="userSpaceOnUse">
                                  <path d="M22 0H0V22" fill="none" stroke="white" strokeWidth="0.5" />
                                </pattern>
                              </defs>
                              <rect width="100%" height="100%" fill={`url(#grid-${m.id})`} />
                            </svg>

                            <div
                              role="img"
                              aria-label={m.name}
                              style={{ backgroundImage: `url(${m.avatar})` }}
                              className="absolute inset-0 h-full w-full bg-cover bg-center transition-all duration-[1200ms] ease-out group-hover:scale-[1.07] grayscale group-hover:grayscale-0"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0C0C0D] via-[#0C0C0D]/75 to-transparent" />

                            <span className="absolute right-3 top-3 z-20 font-display text-[11px] tracking-[0.25em] text-white/25">
                              {String(i + 1).padStart(2, "0")}
                            </span>

                            <div className="absolute bottom-4 left-4 right-4 z-20">
                              <div className="mb-2 inline-flex items-center gap-2 border border-white/10 bg-black/40 px-2 py-1 backdrop-blur-sm transition-colors duration-500 group-hover:border-[#FF3B3B]/40">
                                <Icon className="h-3.5 w-3.5 text-[#FF3B3B]" />
                                <span className="text-[10px] tracking-[0.25em] uppercase text-white/70">{m.roleName}</span>
                              </div>
                              <h3 className="font-display text-xl font-bold tracking-tight">{m.name}</h3>
                              <span className="mt-2 block h-px w-0 bg-gradient-to-r from-[#FF3B3B] to-transparent transition-all duration-500 group-hover:w-full" />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </section>

      <Footer />
    </div>
  );
}
