import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useReferralStatus } from "@/lib/referral-status";
import { ReferralMaintenance } from "@/components/ReferralMaintenance";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  Gift,
  Lock,
  LogIn,
  Link2,
  Map as MapIcon,
  MapPin,
  Plus,
  Share2,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { notify as toast } from "@/components/Notify";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useT } from "@/lib/i18n";
import {
  claimReferralReward,
  getReferralDashboard,
  setReferralLeaderboardHidden,
} from "@/lib/referral.functions";
import type {
  DashboardActivityRow,
  DashboardReferralRow,
  DashboardReward,
  ReferralDashboard,
} from "@/lib/referral.shared";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "LODStudios | Referral" },
      {
        name: "description",
        content: "Invite new creators to LODStudios and unlock map rewards.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReferralPage,
});

const REFERRAL_STEPS = [
  {
    icon: Trophy,
    title: "Collect points",
    text: "Every successful referred purchase earns you referral points.",
  },
  {
    icon: Gift,
    title: "Unlock rewards",
    text: "Level up step by step and unlock new rewards.",
  },
  {
    icon: Users,
    title: "Grow the community",
    text: "Use your link to bring new creators into the LODStudios community.",
  },
] as const;

const REFERRAL_FAQS = [
  {
    q: "Where do I find my referral code?",
    a: "Your code and personal link are shown right at the top in the hero area of this page.",
  },
  {
    q: "When does a referral count?",
    a: "A referral counts as soon as the program requirement is met (e.g. a completed purchase).",
  },
  {
    q: "How do I redeem a reward?",
    a: "Once a tier is unlocked, you can redeem the reward directly from the reward card.",
  },
  {
    q: "Can I share my link multiple times?",
    a: "Yes. You can share your link on Discord, socials or directly via message.",
  },
] as const;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);
}

function ReferralPage() {
  const t = useT();
  const { user, isAuthed, login, loading } = useTebexAuth();
  const referralStatus = useReferralStatus();
  const qc = useQueryClient();
  const basketIdent = user?.basketIdent;

  const query = useQuery({
    queryKey: ["referral-dashboard", basketIdent],
    queryFn: () => getReferralDashboard({ data: { basketIdent: basketIdent! } }),
    enabled: !!basketIdent,
    staleTime: 30_000,
  });

  const claimMut = useMutation({
    mutationFn: (rewardId: string) =>
      claimReferralReward({ data: { basketIdent: basketIdent!, rewardId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Reward claimed");
        void qc.invalidateQueries({ queryKey: ["referral-dashboard", basketIdent] });
      } else {
        toast.error("Reward could not be claimed");
      }
    },
    onError: () => toast.error("Reward could not be claimed"),
  });

  const hiddenMut = useMutation({
    mutationFn: (hidden: boolean) =>
      setReferralLeaderboardHidden({ data: { basketIdent: basketIdent!, hidden } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["referral-dashboard", basketIdent] });
    },
  });

  if (referralStatus.maintenance) return <ReferralMaintenance />;

  if (!isAuthed) {
    return (
      <div className="relative min-h-screen bg-[#0A0A0B] text-white">
        <Navigation />
        <main className="mx-auto flex max-w-[900px] flex-col items-center justify-center gap-6 px-6 pb-24 pt-40 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
            <Users className="h-7 w-7" />
          </span>
          <h1 className="font-headline text-3xl text-white sm:text-4xl">Referral Program</h1>
          <p className="max-w-sm text-white/60">{t("profile.loginRequired")}</p>
          <button
            onClick={() => void login()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF3B3B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ff5252] disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {loading ? t("nav.loggingIn") : t("nav.login")}
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="relative min-h-screen bg-[#0A0A0B] text-white">
      <Navigation />
      <main className="mx-auto w-full max-w-[1080px] px-5 pb-24 pt-32 lg:px-8 lg:pt-36">
        <Link
          to="/profile"
          className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("profile.title")}
        </Link>

        {query.isLoading ? (
          <LoadingState />
        ) : !data || !data.configured ? (
          <NotConfigured />
        ) : !data.enabled ? (
          <Disabled name={data.program.name} />
        ) : (
          <Dashboard
            data={data}
            origin={typeof window !== "undefined" ? window.location.origin : ""}
            onClaim={(id) => claimMut.mutate(id)}
            claiming={claimMut.isPending}
            onToggleHidden={(h) => hiddenMut.mutate(h)}
            togglingHidden={hiddenMut.isPending}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

function Dashboard({
  data,
  origin,
  onClaim,
  claiming,
  onToggleHidden,
  togglingHidden,
}: {
  data: ReferralDashboard;
  origin: string;
  onClaim: (rewardId: string) => void;
  claiming: boolean;
  onToggleHidden: (hidden: boolean) => void;
  togglingHidden: boolean;
}) {
  const link = data.code ? `${origin}/?ref=${data.code}` : "";
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);

  const recruits = data.stats.successful;
  const tiers = data.rewards;
  const detail = detailIdx === null ? null : tiers[detailIdx] ?? null;
  const cardsPerPage = 4;
  const pageCount = Math.max(1, Math.ceil(Math.max(1, tiers.length) / cardsPerPage));

  const nextTier =
    tiers.find((tier) => (tier.requiredReferrals || 0) > recruits) ?? tiers[tiers.length - 1] ?? null;

  const copyValue = async (value: string, kind: "code" | "link") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.success(kind === "code" ? "Code copied" : "Link copied");
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Copy failed");
    }
  };

  const scrollRail = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const onRailScroll = () => {
    const el = railRef.current;
    if (!el) return;
    const page = Math.round(el.scrollLeft / el.clientWidth);
    setActivePage(Math.max(0, Math.min(page, pageCount - 1)));
  };

  return (
    <>
      <section className="relative min-h-[460px] overflow-hidden rounded-3xl border border-white/10">
        <HeroVideo
          src={import.meta.env.VITE_REFERRAL_VIDEO_URL as string | undefined}
          videoId="_vbgxAowWJM"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0B]/65 via-[#0A0A0B]/55 to-[#0A0A0B]/85" />
        <div className="relative z-10 mx-auto flex w-full max-w-[960px] flex-col items-center px-6 pb-16 pt-24 text-center sm:pt-28">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center border border-[#FF3B3B]/40 bg-[#FF3B3B]/10">
              <Gift className="h-8 w-8 text-[#FF3B3B]" />
            </div>
            <div className="text-left">
              <p className="font-display text-[13px] font-bold uppercase tracking-[0.44em] text-white/70">Referral</p>
              <p className="font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-bold uppercase leading-[0.95] tracking-[0.14em] text-white">Rewards</p>
            </div>
          </div>

          <h1 className="mt-8 font-display text-[clamp(1.8rem,3.4vw,3rem)] font-bold leading-[1.05] tracking-tight">
            Invite friends and <span className="text-[#FF3B3B]">earn rewards.</span>
          </h1>
          <p className="mt-5 max-w-[640px] text-[15px] leading-relaxed text-white/65">{data.program.description}</p>
          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.24em] text-white/45">Share your personal code</p>

          <div className="mt-8 inline-flex w-full max-w-[760px] flex-col overflow-hidden rounded-[3px] border border-white/10 bg-[#151516]/85 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md sm:flex-row">
            <button
              onClick={() => void copyValue(data.code, "code")}
              className="group relative flex h-[62px] flex-1 items-center justify-center px-8 transition-colors hover:bg-white/[0.04]"
              aria-label="Copy code"
            >
              <span className="relative font-display text-[20px] font-bold tracking-[0.06em] text-white">
                {data.code}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-[9px] left-0 h-[3px] w-full origin-center scale-x-100 bg-[#FF3B3B] transition-transform duration-500 ease-out group-hover:scale-x-[1.12]"
                />
              </span>
              {copied === "code" ? <Check className="ml-3 h-[16px] w-[16px] text-[#FF3B3B]" strokeWidth={2.4} /> : null}
            </button>

            <button
              onClick={() => void copyValue(link, "link")}
              className="group relative flex h-[62px] items-center justify-center gap-2.5 bg-white/[0.06] px-8 text-[16px] font-semibold text-white/90 transition-colors hover:bg-[#FF3B3B] hover:text-white"
              aria-label="Copy link"
            >
              <span className="relative z-10 inline-flex items-center gap-2.5">
                {copied === "link" ? <Check className="h-[17px] w-[17px]" strokeWidth={2.2} /> : <Link2 className="h-[17px] w-[17px]" strokeWidth={2.2} />}
                Copy link
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="relative -mt-8 w-full px-4 pb-8 sm:px-8">
        <div className="mx-auto max-w-[1200px] rounded-2xl border border-white/10 bg-[#151516] p-6">
          <h2 className="font-display text-3xl font-bold text-white">How it works</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {REFERRAL_STEPS.map((step, i) => (
              <div key={step.title} className="border border-white/10 bg-[#101011] p-5">
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center border border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#FF3B3B]">
                    <step.icon className="h-4 w-4" strokeWidth={2.2} />
                  </div>
                  <span className="font-display text-2xl font-bold text-white/10">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-white">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative w-full pb-14">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
          <h2 className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-bold uppercase tracking-[0.06em] text-white">Your rewards</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
            <div className="flex flex-col items-center justify-center text-center lg:border-r lg:border-white/10 lg:pr-6">
              <div className="relative grid h-[150px] w-[150px] place-items-center">
                <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 150 150">
                  <circle cx="75" cy="75" r="70" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" strokeDasharray="4 6" />
                  <circle
                    cx="75"
                    cy="75"
                    r="62"
                    fill="none"
                    stroke="#FF3B3B"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 62}
                    strokeDashoffset={2 * Math.PI * 62 * (1 - recruits / Math.max(1, nextTier?.requiredReferrals || 1))}
                    className="transition-all duration-700"
                  />
                </svg>
                <span className="font-display text-[56px] font-bold leading-none text-white">{recruits}</span>
              </div>
              <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.22em] text-white/45">Creator</p>
              <p className="font-display text-[20px] font-bold uppercase tracking-[0.04em] text-white">Recruited</p>
            </div>

            <div className="relative min-w-0">
              {tiers.length === 0 ? (
                <EmptyBox icon={<Gift className="h-7 w-7" />} text="No rewards have been set up yet." />
              ) : (
                <>
                  <div
                    ref={railRef}
                    onScroll={onRailScroll}
                    className="flex snap-x snap-mandatory gap-5 overflow-x-auto py-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {tiers.map((tier, tierIdx) => {
                      const required = Math.max(1, tier.requiredReferrals || tierIdx + 1);
                      const unlocked = tier.status === "unlocked" || tier.status === "claimed";
                      const isNext = nextTier?.id === tier.id;
                      return (
                        <article
                          key={tier.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetailIdx(tierIdx)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDetailIdx(tierIdx);
                            }
                          }}
                          className={`group relative flex w-[280px] shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(255,59,59,0.18)] ${
                            isNext
                              ? "border-[#FF3B3B]/60 bg-gradient-to-br from-[#FF3B3B]/20 via-[#FF3B3B]/[0.06] to-[#151516]"
                              : "border-white/10 bg-gradient-to-b from-white/[0.06] to-[#151516] hover:border-[#FF3B3B]/40"
                          }`}
                        >
                          <div className="relative flex items-start justify-between gap-3 p-4 pb-0">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">Reward</p>
                              <div className="mt-1 flex items-baseline gap-1.5">
                                <p className="font-display text-[44px] font-bold leading-none text-white">{required}</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Referrals</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailIdx(tierIdx);
                              }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80 transition-colors hover:border-[#FF3B3B]/50 hover:bg-white/[0.14] hover:text-white"
                            >
                              Details
                              <ArrowUpRight className="h-3 w-3" strokeWidth={2.6} />
                            </button>
                          </div>

                          <div className="relative mx-4 mt-2.5 h-[170px] overflow-hidden rounded-xl border border-white/10 bg-[#0C0C0D]">
                            {tier.image ? (
                              <img src={tier.image} alt={tier.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            ) : (
                              <div className="absolute inset-0 grid place-items-center text-white/30">
                                <MapIcon className="h-8 w-8" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <div className="absolute bottom-2.5 left-2.5 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/70 text-white/70 backdrop-blur-sm">
                              {unlocked ? <Check className="h-3.5 w-3.5 text-[#FF3B3B]" strokeWidth={2.6} /> : <Lock className="h-3.5 w-3.5" strokeWidth={2.4} />}
                            </div>
                          </div>

                          <p className="px-4 pb-4 pt-3 text-[13px] font-bold leading-snug text-white/90">{tier.name}</p>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex justify-center">
                    <div className="flex w-fit items-center gap-4 border border-white/10 bg-[#151516] px-5 py-2.5">
                      <button
                        aria-label="Previous"
                        onClick={() => scrollRail(-1)}
                        className="grid h-8 w-8 place-items-center border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10 hover:text-white"
                      >
                        <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
                      </button>
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: pageCount }).map((_, i) => (
                          <span key={i} className={i === activePage ? "h-[3px] w-5 rounded-full bg-[#FF3B3B]" : "h-1.5 w-1.5 rounded-full bg-white/20"} />
                        ))}
                      </div>
                      <button
                        aria-label="Next"
                        onClick={() => scrollRail(1)}
                        className="grid h-8 w-8 place-items-center border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10 hover:text-white"
                      >
                        <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {detail && detailIdx !== null ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setDetailIdx(null)}>
          <div className="w-full max-w-[720px] overflow-hidden rounded-2xl border border-white/10 bg-[#151516] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 bg-[#101011] px-6 py-4">
              <h3 className="font-display text-[20px] font-bold text-white">Reward Details</h3>
              <button onClick={() => setDetailIdx(null)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 text-white/70 transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-white">
                <X className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4">
                <p className="font-display text-[22px] font-bold text-white">{Math.max(1, detail.requiredReferrals || detailIdx + 1)} Referrals</p>
                <span className="h-px flex-1 bg-gradient-to-r from-[#FF3B3B]/60 to-white/10" />
              </div>
              <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0C0C0D]">
                {detail.image ? <img src={detail.image} alt={detail.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} /> : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              </div>
              <h4 className="mt-4 font-display text-[20px] font-bold text-white">{detail.name}</h4>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">{detail.description || "Reward for your successful referrals."}</p>
              <div className="mt-6 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{detailIdx + 1} / {tiers.length}</span>
                {detail.claimable ? (
                  <button onClick={() => onClaim(detail.id)} disabled={claiming} className="inline-flex items-center gap-2 bg-[#FF3B3B] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#ff5252] disabled:opacity-50">
                    <Gift className="h-3.5 w-3.5" /> Redeem reward
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="relative w-full pb-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="rounded-2xl border border-white/10 bg-[#151516] p-6">
            <SectionHeader icon={<Crown className="h-[18px] w-[18px]" />} title="Top Recruiters" sub="The most active referrers in the community." />
            <Leaderboard rows={data.leaderboard} hidden={data.hiddenFromLeaderboard} onToggleHidden={onToggleHidden} toggling={togglingHidden} />
          </div>
        </div>
      </section>

      <section className="relative w-full pb-14">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">FAQ</span>
          <h2 className="mt-3 font-display text-[clamp(1.8rem,3.4vw,3rem)] font-bold leading-[0.98] tracking-tight">Referral questions</h2>
          <div className="mt-8 divide-y divide-white/[0.07] border border-white/10 bg-[#151516]">
            {REFERRAL_FAQS.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q}>
                  <button onClick={() => setOpenFaq(open ? null : i)} className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left transition-colors hover:bg-white/[0.03]">
                    <span className="text-[14.5px] font-bold text-white">{item.q}</span>
                    <Plus className={`h-4 w-4 shrink-0 text-[#FF3B3B] transition-transform duration-300 ${open ? "rotate-45" : ""}`} strokeWidth={2.4} />
                  </button>
                  {open ? <p className="px-6 pb-6 text-[13.5px] leading-relaxed text-white/60">{item.a}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 lg:col-span-2">
          <SectionHeader icon={<Users className="h-[18px] w-[18px]" />} title="My referrals" sub="All creators you invited." />
          <ReferralsTable rows={data.referrals} />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <SectionHeader icon={<TrendingUp className="h-[18px] w-[18px]" />} title="Activity" sub="Your latest events." accent />
          <ActivityFeed rows={data.activity} />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <SectionHeader icon={<Gift className="h-[18px] w-[18px]" />} title="Program status" sub="All key figures at a glance." accent />
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Users className="h-4 w-4" />} label="Referrals" value={data.stats.total} />
            <StatCard icon={<Check className="h-4 w-4" />} label="Successful" value={data.stats.successful} accent />
            <StatCard icon={<Clock className="h-4 w-4" />} label="Pending" value={data.stats.pending} />
            <StatCard icon={<Sparkles className="h-4 w-4" />} label="Points" value={data.stats.points} accent />
          </div>
        </section>
      </div>
    </>
  );
}

function ReferralLinkCard({
  link,
  code,
  compact = false,
}: {
  link: string;
  code: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const share = async () => {
    if (!link) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: "LODStudios",
          text: "Discover the maps by LODStudios:",
          url: link,
        });
        return;
      } catch {
        // fall through to copy
      }
    }
    void copy();
  };

  return (
    <section
      className={`rounded-2xl border border-[#FF3B3B]/20 bg-gradient-to-br from-[#FF3B3B]/[0.08] via-[#281516]/30 to-transparent ${
        compact ? "p-4" : "p-5"
      }`}
    >
      {!compact ? (
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/25">
            <MapPin className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-white">Your personal invite link</h2>
            <p className="truncate text-xs text-white/40">
              Share it. Every successful referral brings you closer to the next map reward.
            </p>
          </div>
        </div>
      ) : null}

      <div className={`${compact ? "" : "mt-4"} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
          <p className="truncate font-mono text-sm font-semibold text-white/90">{link || "—"}</p>
          {code ? (
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-white/35">
              Code: <span className="font-semibold text-[#FF3B3B]">{code}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={copy}
            disabled={!link}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF3B3B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#ff5252] disabled:opacity-60"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            onClick={share}
            disabled={!link}
            aria-label="Share"
            className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-lg border border-white/10 text-white/70 transition hover:border-[#FF3B3B]/40 hover:text-white disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${
            accent
              ? "bg-[#FF3B3B]/12 text-[#FF3B3B] ring-[#FF3B3B]/20"
              : "bg-white/5 text-white/60 ring-white/10"
          }`}
        >
          {icon}
        </span>
        <span className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
          {label}
        </span>
      </div>
      <p
        className={`mt-2 font-display font-bold text-white ${
          small ? "truncate text-sm" : "text-2xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function NextRewardCard({ next }: { next: NonNullable<ReferralDashboard["nextReward"]> }) {
  const pct = Math.round(next.progress * 100);
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
            <Gift className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/40">
              Next reward
            </p>
            <h3 className="font-display text-base font-bold text-white">{next.name}</h3>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-[#FF3B3B]">{pct}%</span>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#FF3B3B] to-[#C72C2C] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
        <span>{next.remainingText}</span>
        <span className="flex items-center gap-3">
          {next.requiredReferrals > 0 ? (
            <span>
              {next.currentReferrals} / {next.requiredReferrals} Referrals
            </span>
          ) : null}
          {next.requiredPoints > 0 ? (
            <span>
              {next.currentPoints} / {next.requiredPoints} Points
            </span>
          ) : null}
        </span>
      </div>
    </section>
  );
}

const REWARD_TYPE_LABEL: Record<DashboardReward["rewardType"], string> = {
  map: "Map",
  discount: "Discount",
  role: "Role",
  custom: "Reward",
};

function RewardCard({
  reward,
  index,
  onClaim,
  claiming,
}: {
  reward: DashboardReward;
  index: number;
  onClaim: (rewardId: string) => void;
  claiming: boolean;
}) {
  const locked = reward.status === "locked";
  const claimed = reward.status === "claimed";
  const unlocked = reward.status === "unlocked";

  return (
    <div
      className={`group relative flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border p-0 transition duration-300 ${
        claimed
          ? "border-emerald-500/30 bg-emerald-500/[0.05]"
          : unlocked
            ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/[0.06]"
            : locked
              ? "border-white/[0.08] bg-white/[0.015] opacity-85"
              : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="absolute left-0 right-0 top-0 z-[1] flex items-center justify-between px-3 pt-3">
        <span className="rounded-md bg-black/45 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white/90 backdrop-blur">
          {reward.requiredReferrals > 0 ? `${reward.requiredReferrals} Referrals` : `Level ${index + 1}`}
        </span>
        <RewardStatusBadge status={reward.status} />
      </div>

      <div className="relative grid h-36 w-full place-items-center overflow-hidden bg-[#131416]">
        {reward.image ? (
          <img
            src={reward.image}
            alt={reward.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <MapIcon className={`h-10 w-10 ${locked ? "text-white/20" : "text-[#FF3B3B]/80"}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
            {REWARD_TYPE_LABEL[reward.rewardType]}
          </span>
        </div>
        <h4 className="font-display text-sm font-bold text-white">{reward.name}</h4>
        {reward.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/45">{reward.description}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
          {reward.requiredReferrals > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {reward.requiredReferrals}
            </span>
          ) : null}
          {reward.requiredPoints > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {reward.requiredPoints}
            </span>
          ) : null}
        </div>

        <div className="mt-4">
          {claimed ? (
            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 py-2.5 text-xs font-semibold text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Claimed
            </span>
          ) : reward.claimable ? (
            <button
              onClick={() => onClaim(reward.id)}
              disabled={claiming}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#FF3B3B] py-2.5 text-xs font-semibold text-white transition hover:bg-[#ff5252] disabled:opacity-60"
            >
              <Gift className="h-3.5 w-3.5" /> Redeem reward
            </button>
          ) : (
            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs font-medium text-white/40">
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RewardStatusBadge({ status }: { status: DashboardReward["status"] }) {
  const map = {
    claimed: { label: "Claimed", cls: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25" },
    unlocked: { label: "Unlocked", cls: "bg-[#FF3B3B]/15 text-[#FF3B3B] ring-[#FF3B3B]/25" },
    in_progress: { label: "In progress", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/25" },
    locked: { label: "Locked", cls: "bg-white/5 text-white/40 ring-white/10" },
  } as const;
  const { label, cls } = map[status];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

const STATUS_LABEL: Record<DashboardReferralRow["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/25" },
  completed: { label: "Successful", cls: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25" },
  rejected: { label: "Rejected", cls: "bg-red-500/15 text-red-300 ring-red-500/25" },
};

function ReferralsTable({ rows }: { rows: DashboardReferralRow[] }) {
  const [filter, setFilter] = useState<"all" | DashboardReferralRow["status"]>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!needle || r.username.toLowerCase().includes(needle)),
    );
  }, [rows, filter, search]);

  if (rows.length === 0) {
    return (
      <EmptyBox
        icon={<Users className="h-7 w-7" />}
        text="No referrals yet. Share your link to get started."
      />
    );
  }

  const filters: { key: "all" | DashboardReferralRow["status"]; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Successful" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                filter === f.key
                  ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-white"
                  : "border-white/10 text-white/50 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#FF3B3B]/40 focus:outline-none sm:w-48"
        />
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.12em] text-white/40">
              <th className="py-2.5 pr-4 font-bold">Creator</th>
              <th className="py-2.5 pr-4 font-bold">Joined</th>
              <th className="py-2.5 pr-4 font-bold">Status</th>
              <th className="py-2.5 pr-4 font-bold">Points</th>
              <th className="py-2.5 font-bold">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.map((r) => (
              <tr key={r.id} className="transition hover:bg-white/[0.02]">
                <td className="py-3 pr-4 font-medium text-white">{r.username}</td>
                <td className="py-3 pr-4 text-white/50">{formatDate(r.joinedAt)}</td>
                <td className="py-3 pr-4">
                  <StatusPill status={r.status} />
                </td>
                <td className="py-3 pr-4 text-[#FF3B3B]">{r.points > 0 ? `+${r.points}` : "—"}</td>
                <td className="py-3 text-white/50">{formatDate(r.completedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-2.5 sm:hidden">
        {filtered.map((r) => (
          <li key={r.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-white">{r.username}</span>
              <StatusPill status={r.status} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/40">
              <span>{formatDate(r.joinedAt)}</span>
              <span className="text-[#FF3B3B]">{r.points > 0 ? `+${r.points} points` : ""}</span>
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No entries for this filter.</p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: DashboardReferralRow["status"] }) {
  const { label, cls } = STATUS_LABEL[status];
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

const EVENT_LABEL: Record<DashboardActivityRow["eventType"], string> = {
  referral_joined: "New referral joined",
  referral_completed: "Referral successful",
  points_received: "Points received",
  reward_unlocked: "Reward unlocked",
  reward_claimed: "Reward claimed",
};

function ActivityFeed({ rows }: { rows: DashboardActivityRow[] }) {
  if (rows.length === 0) {
    return <EmptyBox icon={<TrendingUp className="h-7 w-7" />} text="No activity yet." />;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#FF3B3B]/10 text-[#FF3B3B]">
            <ActivityIcon type={a.eventType} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {EVENT_LABEL[a.eventType]}
              {a.rewardName ? <span className="text-white/50"> · {a.rewardName}</span> : null}
            </p>
            <p className="text-[11px] text-white/35">{formatDateTime(a.createdAt)}</p>
          </div>
          {a.points ? (
            <span className="shrink-0 text-sm font-semibold text-[#FF3B3B]">+{a.points}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ActivityIcon({ type }: { type: DashboardActivityRow["eventType"] }) {
  const cls = "h-4 w-4";
  if (type === "reward_claimed") return <Check className={cls} />;
  if (type === "reward_unlocked") return <Gift className={cls} />;
  if (type === "points_received") return <Sparkles className={cls} />;
  if (type === "referral_completed") return <Trophy className={cls} />;
  return <Users className={cls} />;
}

function Leaderboard({
  rows,
  hidden,
  onToggleHidden,
  toggling,
}: {
  rows: ReferralDashboard["leaderboard"];
  hidden: boolean;
  onToggleHidden: (hidden: boolean) => void;
  toggling: boolean;
}) {
  if (rows === null) {
    return <EmptyBox icon={<Crown className="h-7 w-7" />} text="The leaderboard is disabled." />;
  }
  return (
    <div>
      {rows.length === 0 ? (
        <EmptyBox icon={<Crown className="h-7 w-7" />} text="No rankings yet." />
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.rank}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
                r.you
                  ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/[0.06]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                  r.rank <= 3 ? "bg-[#FF3B3B]/15 text-[#FF3B3B]" : "bg-white/5 text-white/50"
                }`}
              >
                {r.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                {r.username}
                {r.you ? <span className="ml-1.5 text-[11px] text-[#FF3B3B]">(You)</span> : null}
              </span>
              <span className="shrink-0 text-xs text-white/45">Lvl {r.level}</span>
              <span className="shrink-0 text-sm font-semibold text-[#FF3B3B]">{r.successful}</span>
            </li>
          ))}
        </ol>
      )}
      <label className="mt-4 flex items-center gap-2.5 text-xs text-white/50">
        <input
          type="checkbox"
          checked={hidden}
          disabled={toggling}
          onChange={(e) => onToggleHidden(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#FF3B3B] focus:ring-[#FF3B3B]"
        />
        Do not show me publicly on the leaderboard
      </label>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${
          accent
            ? "bg-[#FF3B3B]/12 text-[#FF3B3B] ring-[#FF3B3B]/20"
            : "bg-white/5 text-white/70 ring-white/10"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold text-white">{title}</h2>
        <p className="truncate text-xs text-white/40">{sub}</p>
      </div>
    </div>
  );
}

function EmptyBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
        {icon}
      </span>
      <p className="max-w-xs text-sm text-white/45">{text}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-8 text-center">
      <h1 className="font-display text-xl font-bold text-white">Referral Program</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
        The referral program is not configured yet. An admin needs to set up the
        database connection.
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <code className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-amber-200/80">
          SUPABASE_URL
        </code>
        <code className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-amber-200/80">
          SUPABASE_SERVICE_ROLE_KEY
        </code>
      </div>
    </div>
  );
}

function Disabled({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-white/40">
        <Lock className="h-7 w-7" />
      </span>
      <h1 className="font-display text-xl font-bold text-white">{name}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
        The referral program is currently disabled. Check back soon.
      </p>
    </div>
  );
}
