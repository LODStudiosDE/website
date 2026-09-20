import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Gift,
  Trophy,
  Rocket,
  Users,
  Crown,
  Medal,
  Plus,
  ArrowUpRight,
  Lock as LockIcon,
  ChevronLeft,
  ChevronRight,
  Link2,
  LogIn,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { useTebexAuth } from "@/lib/tebex-auth";
import { notify as toast } from "@/components/Notify";
import { getReferralDashboard, claimReferralReward } from "@/lib/referral.functions";
import type { DashboardReward } from "@/lib/referral.shared";

export const Route = createFileRoute("/referral")({
  head: () => ({
    meta: [
      { title: "LODStudios | Referral" },
      {
        name: "description",
        content:
          "Invite server owners to LODStudios, collect points for every purchase and unlock exclusive assets, discounts and custom rewards.",
      },
      { property: "og:title", content: "LODStudios | Referral" },
      {
        property: "og:description",
        content:
          "Share your personal referral code and unlock exclusive LODStudios rewards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralPage,
});

type Tier = {
  id: string;
  count: number;
  reward: string;
  image: string | null;
  description: string;
  unlocked: boolean;
  claimable: boolean;
};

function toTier(r: DashboardReward): Tier {
  return {
    id: r.id,
    count: r.requiredReferrals,
    reward: r.name,
    image: r.image,
    description: r.description,
    unlocked: r.status === "unlocked" || r.status === "claimed",
    claimable: r.claimable,
  };
}

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Trophy,
    title: "Earn Points",
    text: "Every time a new customer purchases a package worth $20 USD or more with your code, you earn one point.",
  },
  {
    icon: Gift,
    title: "Unlock Rewards",
    text: "Climb the ranks and unlock exclusive assets, discounts and custom work as you bring more people to LODStudios.",
  },
  {
    icon: Rocket,
    title: "Kick-start Your Recruits",
    text: "New customers who join with your code instantly receive 10% off their very first LODStudios order.",
  },
];

type Board = "Weekly" | "Monthly" | "All time";

const FAQS: { q: string; a: string; icon: LucideIcon }[] = [
  {
    icon: Link2,
    q: "How do I find my referral code?",
    a: "Your personal referral code is displayed at the top of this page. You can also find it any time inside your account area once you are logged in.",
  },
  {
    icon: Users,
    q: "How do I share my referral code?",
    a: "The easiest way is your personal link. Anyone who opens it lands in our store with your code already applied at checkout. Alternatively your friend can enter the code manually in the referral field during checkout.",
  },
  {
    icon: Trophy,
    q: "When does a referral point count?",
    a: "A point is credited once your recruit completes a purchase of at least $20 USD through Tebex. Refunded or chargeback orders are removed again.",
  },
  {
    icon: Crown,
    q: "Can I change my referral code?",
    a: "Codes are permanent once linked to an account. If you need a custom vanity code, open a ticket on our Discord and we will check it for you.",
  },
  {
    icon: Medal,
    q: "What if my friend forgot to use my code?",
    a: "There is a 24 hour grace period after the order. Open a ticket with the order ID and we will attach the referral retroactively.",
  },
  {
    icon: Gift,
    q: "How do I claim an unlocked reward?",
    a: "Open a ticket in the Referral category on our Discord. Our team verifies your points and hands out the reward directly to your Cfx.re portal account.",
  },
];

function ReferralPage() {
  const { user, isAuthed, login, loading } = useTebexAuth();
  const basketIdent = user?.basketIdent;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["referral", "dashboard", basketIdent],
    queryFn: () => getReferralDashboard({ data: { basketIdent: basketIdent! } }),
    enabled: !!basketIdent,
    staleTime: 30_000,
  });

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [board, setBoard] = useState<Board>("All time");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [activeTier, setActiveTier] = useState(0);
  const [showRecruits, setShowRecruits] = useState(false);

  const tiers = useMemo<Tier[]>(() => (data?.rewards ?? []).map(toTier), [data?.rewards]);
  const detail = detailIdx === null ? null : tiers[detailIdx] ?? null;

  const referralCode = data?.code ?? "";
  const referralLink =
    referralCode && typeof window !== "undefined"
      ? `${window.location.origin}/store?ref=${referralCode}`
      : "";

  const recruits = data?.stats.successful ?? 0;
  const nextTier = tiers.find((t) => !t.unlocked) ?? tiers[tiers.length - 1];

  const CARDS_PER_PAGE = 4;
  const pageCount = Math.max(1, Math.ceil(tiers.length / CARDS_PER_PAGE));

  const scrollRail = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const onRailScroll = () => {
    const el = railRef.current;
    if (!el) return;
    const page = Math.round(el.scrollLeft / el.clientWidth);
    setActiveTier(Math.max(0, Math.min(page, pageCount - 1)));
  };

  const copy = async (value: string, kind: "code" | "link") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  const claim = (rewardId: string) => {
    if (!basketIdent) return;
    claimReferralReward({ data: { basketIdent, rewardId } })
      .then((res) => {
        if (res.ok) {
          toast.success("Reward claimed! We will reach out on Discord.");
          setDetailIdx(null);
          qc.invalidateQueries({ queryKey: ["referral", "dashboard", basketIdent] });
        } else {
          toast.error("Reward could not be claimed.");
        }
      })
      .catch(() => toast.error("Something went wrong."));
  };

  const boardRows = (data?.leaderboard ?? []).map((r) => ({
    name: r.username,
    tag: r.you ? "You" : `Level ${r.level}`,
    recruits: r.successful,
    you: r.you,
  }));

  const recruitRows = data?.referrals ?? [];
  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isAuthed) {
    return <ReferralLoginGate onLogin={login} loading={loading} />;
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0C0C0D] text-white">
      <Navigation />

      {/* HERO */}
      <section className="relative flex min-h-[460px] w-full items-center justify-center overflow-hidden">
        <HeroVideo
          src={import.meta.env.VITE_REFERRAL_VIDEO_URL as string | undefined}
          videoId="_vbgxAowWJM"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-[900px] flex-col items-center px-6 pb-16 pt-40 text-center">
          {/* Lockup */}
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center border border-[#FF3B3B]/40 bg-[#FF3B3B]/10">
              <img src="/lod-studios-logo.png" alt="LODStudios" className="h-9 w-auto" />
            </div>
            <div className="text-left">
              <p className="font-display text-[13px] font-bold uppercase tracking-[0.44em] text-white/70">
                Referral
              </p>
              <p className="font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-bold uppercase leading-[0.95] tracking-[0.14em] text-white">
                Rewards
              </p>
            </div>
          </div>

          <h1 className="mt-8 font-display text-[clamp(1.8rem,3.4vw,3rem)] font-bold leading-[1.05] tracking-tight">
            Recruit a friend and <span className="text-[#FF3B3B]">earn rewards.</span>
          </h1>
          <p className="mt-5 max-w-[640px] text-[15px] leading-relaxed text-white/65">
            Looking to expand your crew? When a new server owner buys with your referral
            code, they get a discount on their first order and you unlock exclusive
            LODStudios assets, coupons and custom work.
          </p>
          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.24em] text-white/45">
            Share your personal code today
          </p>

          {/* Code bar — two connected segments */}
          <div className="mt-8 inline-flex items-stretch overflow-hidden rounded-[3px] border border-white/10 bg-[#151516]/85 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md">
            {/* Code segment */}
            <button
              onClick={() => copy(referralCode, "code")}
              className="group relative flex h-[62px] items-center justify-center px-10 transition-colors hover:bg-white/[0.04]"
              aria-label="Copy referral code"
            >
              <span className="relative font-display text-[20px] font-bold tracking-[0.06em] text-white">
                {referralCode || (isLoading ? "…" : "—")}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-[9px] left-0 h-[3px] w-full origin-center scale-x-100 bg-[#FF3B3B] transition-transform duration-500 ease-out group-hover:scale-x-[1.12]"
                />
              </span>
              {copied === "code" && (
                <Check className="ml-3 h-[16px] w-[16px] text-[#FF3B3B]" strokeWidth={2.4} />
              )}
            </button>

            {/* Copy link segment */}
            <button
              onClick={() => copy(referralLink, "link")}
              className="group relative flex h-[62px] items-center gap-2.5 overflow-hidden bg-white/[0.06] px-8 text-[16px] font-semibold text-white/90 transition-colors hover:bg-[#FF3B3B] hover:text-white"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.5)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
              />
              <span className="relative z-10 inline-flex items-center gap-2.5">
                {copied === "link" ? (
                  <Check className="h-[17px] w-[17px]" strokeWidth={2.2} />
                ) : (
                  <Link2 className="h-[17px] w-[17px]" strokeWidth={2.2} />
                )}
                Copy Link
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative w-full bg-[#0C0C0D] py-24">
        <div className="mx-auto max-w-[1200px] px-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
            How it works
          </span>
          <h2 className="mt-3 font-display text-[clamp(1.8rem,3.4vw,3rem)] font-bold leading-[0.98] tracking-tight">
            Three steps to your
            <span className="text-[#FF3B3B]"> first reward.</span>
          </h2>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="group relative overflow-hidden border border-white/10 bg-[#151516] p-7 transition-colors hover:border-[#FF3B3B]/40"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
                <div className="flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center border border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#FF3B3B]">
                    <step.icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <span className="font-display text-[28px] font-bold text-white/10">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-[18px] font-bold tracking-tight text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/60">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* YOUR REWARDS */}
      <section className="relative w-full bg-[#0C0C0D] pb-24">
        <div className="mx-auto max-w-[1400px] px-8">
          <h2 className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-bold uppercase tracking-[0.06em] text-white">
            Your rewards
          </h2>

          <div className="mt-8 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
            {/* Recruited counter */}
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
                    strokeDashoffset={2 * Math.PI * 62 * (1 - recruits / (nextTier?.count || 1))}
                    className="transition-all duration-700"
                  />
                </svg>
                <span className="font-display text-[56px] font-bold leading-none text-white">
                  {recruits}
                </span>
              </div>
              <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.22em] text-white/45">
                Customers
              </p>
              <p className="font-display text-[20px] font-bold uppercase tracking-[0.04em] text-white">
                Invited
              </p>
              <svg className="mt-3 h-3 w-6 text-white/20" viewBox="0 0 24 12" fill="none" aria-hidden>
                <path d="M1 1L12 10L23 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Reward rail */}
            <div className="relative min-w-0">
              <div
                ref={railRef}
                onScroll={onRailScroll}
                className="flex snap-x snap-mandatory gap-5 overflow-x-auto py-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {tiers.length === 0 && (
                  <div className="flex w-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center text-[13px] text-white/50">
                    Es wurden noch keine Belohnungen eingerichtet.
                  </div>
                )}
                {tiers.map((tier, tierIdx) => {
                  const unlocked = tier.unlocked;
                  const isNext = nextTier ? tier.id === nextTier.id : false;
                  const isBonus = false;
                  const isUnlockedCard = unlocked && !isNext && !isBonus;
                  return (
                    <article
                      key={tier.count}
                      data-reward-card
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailIdx(tierIdx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailIdx(tierIdx);
                        }
                      }}
                      className={`group relative flex w-[calc((100%-3*1.25rem)/4)] shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(255,59,59,0.18)] ${
                        isNext
                          ? "border-[#FF3B3B]/60 bg-gradient-to-br from-[#FF3B3B]/20 via-[#FF3B3B]/[0.06] to-[#151516]"
                          : isUnlockedCard
                          ? "border-[#FF3B3B]/45 bg-gradient-to-br from-[#FF3B3B]/26 via-[#B22B2B]/10 to-[#151516]"
                          : isBonus
                          ? "border-white/20 bg-gradient-to-br from-white/[0.09] to-[#151516]"
                          : "border-white/10 bg-gradient-to-b from-white/[0.06] to-[#151516] hover:border-[#FF3B3B]/40"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent transition-transform duration-700 group-hover:translate-x-full"
                      />

                      {/* Header row */}
                      <div className="relative flex items-start justify-between gap-3 p-4 pb-0">
                        <div>
                          {isNext ? (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
                                Your next
                              </p>
                              <p className="text-[18px] font-black uppercase tracking-[0.08em] text-white">
                                Reward
                              </p>
                              <div className="mt-1 flex items-baseline gap-1.5">
                                <p className="font-display text-[44px] font-bold leading-none text-white">
                                  {tier.count}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                                  Customers
                                </p>
                              </div>
                            </>
                          ) : isBonus ? (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
                                Bonus
                              </p>
                              <p className="text-[18px] font-black uppercase tracking-[0.08em] text-white">
                                Reward
                              </p>
                              <p className="mt-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
                                With Your Next Recruit
                              </p>
                            </>
                          ) : isUnlockedCard ? (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
                                Unlocked
                              </p>
                              <p className="text-[18px] font-black uppercase tracking-[0.08em] text-white">
                                Recruit Reward
                              </p>
                              <div className="mt-1 flex items-baseline gap-1.5">
                                <p className="font-display text-[44px] font-bold leading-none text-white">
                                  {tier.count}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
                                  Customers
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
                                Reward
                              </p>
                              <div className="mt-1 flex items-baseline gap-1.5">
                                <p className="font-display text-[44px] font-bold leading-none text-white">
                                  {tier.count}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                                  Customers
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailIdx(tierIdx);
                          }}
                          className={`inline-flex shrink-0 items-center gap-1 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                            isUnlockedCard
                              ? "rounded-md border-[#FF3B3B]/35 bg-white/85 text-[#231515] hover:border-[#FF3B3B]/70 hover:bg-white"
                              : "rounded-full border-white/15 bg-white/[0.08] text-white/80 hover:border-[#FF3B3B]/50 hover:bg-white/[0.14] hover:text-white"
                          }`}
                        >
                          Details
                          <ArrowUpRight className="h-3 w-3" strokeWidth={2.6} />
                        </button>
                      </div>

                      {/* Visual slab */}
                      <div
                        className={`relative mx-4 mt-2.5 h-[170px] overflow-hidden rounded-xl border bg-[#0C0C0D] ${
                          isUnlockedCard ? "border-[#FF3B3B]/35" : "border-white/10"
                        }`}
                      >
                        {tier.image ? (
                          <img
                            src={tier.image}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-white/[0.06] to-[#0C0C0D] text-white/20">
                            <Gift className="h-9 w-9" strokeWidth={1.5} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div
                          className={`absolute bottom-2.5 left-2.5 grid place-items-center rounded-full backdrop-blur-sm ${
                            isUnlockedCard
                              ? "h-10 w-10 border-2 border-[#FF3B3B]/55 bg-white text-[#FF3B3B]"
                              : "h-8 w-8 border border-white/15 bg-black/70 text-white/70"
                          }`}
                        >
                          {unlocked ? (
                            <Check
                              className={`${isUnlockedCard ? "h-4.5 w-4.5" : "h-3.5 w-3.5 text-[#FF3B3B]"}`}
                              strokeWidth={2.6}
                            />
                          ) : (
                            <LockIcon className="h-3.5 w-3.5" strokeWidth={2.4} />
                          )}
                        </div>
                      </div>

                      <p className="px-4 pb-4 pt-3 text-[13px] font-bold leading-snug text-white/90">
                        {tier.reward}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Rail controls */}
            <div className="col-start-2 mt-6 flex justify-center">
              <div
                data-referral-controls
                className="flex w-fit items-center gap-4 border border-white/10 bg-[#151516] px-5 py-2.5"
              >
                <button
                  aria-label="Scroll left"
                  onClick={() => scrollRail(-1)}
                  className="group grid h-8 w-8 place-items-center border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
                </button>
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: pageCount }).map((_, i) => (
                    <span
                      key={i}
                      className={`transition-all ${
                        i === activeTier
                          ? "h-[3px] w-5 rounded-full bg-[#FF3B3B]"
                          : "h-1.5 w-1.5 rounded-full bg-white/20"
                      }`}
                    />
                  ))}
                </div>
                <button
                  aria-label="Scroll right"
                  onClick={() => scrollRail(1)}
                  className="group grid h-8 w-8 place-items-center border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10 hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* REWARD DETAIL DIALOG */}
      {detail && detailIdx !== null && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setDetailIdx(null)}
        >
          <div
            className="w-full max-w-[720px] overflow-hidden rounded-2xl border border-white/10 bg-[#151516] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-[#101011] px-6 py-4">
              <h3 className="font-display text-[20px] font-bold text-white">
                Check all the rewards
              </h3>
              <button
                onClick={() => setDetailIdx(null)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 text-white/70 transition hover:border-[#FF3B3B] hover:bg-[#FF3B3B]/10 hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>

            <div className="p-6">
              {/* Recruit line */}
              <div className="flex items-center gap-4">
                <p className="font-display text-[22px] font-bold text-white">
                  {detail.count} {detail.count === 1 ? "Referral" : "Referrals"}
                </p>
                <span className="h-px flex-1 bg-gradient-to-r from-[#FF3B3B]/60 to-white/10" />
              </div>

              {/* Image */}
              <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0C0C0D]">
                {detail.image ? (
                  <img
                    src={detail.image}
                    alt={detail.reward}
                    className="absolute inset-0 h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-white/[0.06] to-[#0C0C0D] text-white/20">
                    <Gift className="h-12 w-12" strokeWidth={1.5} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/70 text-white/80 backdrop-blur-sm">
                    {detail.unlocked ? (
                      <Check className="h-4 w-4 text-[#FF3B3B]" strokeWidth={2.6} />
                    ) : (
                      <LockIcon className="h-4 w-4" strokeWidth={2.4} />
                    )}
                  </span>
                  <span className="text-[15px] font-bold text-white">
                    {detail.unlocked ? "Unlocked" : "Locked"}
                  </span>
                </div>
              </div>

              <h4 className="mt-4 font-display text-[20px] font-bold text-white">
                {detail.reward}
              </h4>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
                {detail.description
                  ? detail.description
                  : `Unlocks once ${detail.count} ${
                      detail.count === 1 ? "customer" : "customers"
                    } ${
                      detail.count === 1 ? "completes" : "complete"
                    } a purchase with your referral code.`}
              </p>

              {detail.claimable && (
                <button
                  onClick={() => claim(detail.id)}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF3B3B] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#D63030]"
                >
                  <Gift className="h-4 w-4" strokeWidth={2.2} />
                  Claim reward
                </button>
              )}

              {/* Pager */}
              <div className="mt-6 flex items-center justify-center gap-6">
                <button
                  aria-label="Previous reward"
                  disabled={detailIdx === 0}
                  onClick={() => setDetailIdx((i) => Math.max(0, (i ?? 0) - 1))}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/70 transition hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
                </button>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
                  {detailIdx + 1} / {tiers.length}
                </span>
                <button
                  aria-label="Next reward"
                  disabled={detailIdx === tiers.length - 1}
                  onClick={() =>
                    setDetailIdx((i) => Math.min(tiers.length - 1, (i ?? 0) + 1))
                  }
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/70 transition hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recruits list modal */}
      {showRecruits && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setShowRecruits(false)}
        >
          <div
            className="relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden border border-white/10 bg-[#151516] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center border border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#FF3B3B]">
                  <Users className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <p className="font-display text-[17px] font-bold text-white">Your recruits</p>
                  <p className="text-[12px] text-white/50">
                    {recruitRows.length} {recruitRows.length === 1 ? "person" : "people"} used your code
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRecruits(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-[#FF3B3B]/50 hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {recruitRows.length === 0 ? (
                <div className="px-6 py-16 text-center text-[13px] text-white/45">
                  Noch niemand hat deinen Code benutzt. Teile deinen Link und leg los!
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  <div className="grid grid-cols-[1fr_auto_110px] gap-4 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
                    <span>Cfx Name</span>
                    <span>Datum &amp; Uhrzeit</span>
                    <span className="text-right">Status</span>
                  </div>
                  {recruitRows.map((r) => {
                    const status =
                      r.status === "completed"
                        ? { label: "Completed", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" }
                        : r.status === "rejected"
                        ? { label: "Rejected", cls: "border-white/15 bg-white/5 text-white/45" }
                        : { label: "Pending", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
                    return (
                      <div
                        key={r.id}
                        className="grid grid-cols-[1fr_auto_110px] items-center gap-4 px-6 py-4 transition-colors hover:bg-white/[0.03]"
                      >
                        <span className="min-w-0 truncate text-[14px] font-bold text-white">
                          {r.username}
                        </span>
                        <span className="whitespace-nowrap text-[12.5px] tabular-nums text-white/55">
                          {fmtDateTime(r.joinedAt)}
                        </span>
                        <span className="flex justify-end">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${status.cls}`}
                          >
                            {status.label}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LEADERBOARD */}
      <section className="relative w-full bg-[#0C0C0D] pb-24">
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
                Leaderboard
              </span>
              <h2 className="mt-3 font-display text-[clamp(1.8rem,3.4vw,3rem)] font-bold leading-[0.98] tracking-tight">
                Top recruiters
              </h2>
            </div>
            <div className="flex border border-white/10 bg-[#151516]">
              {(["Weekly", "Monthly", "All time"] as Board[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setBoard(b)}
                  className={`px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                    board === b
                      ? "bg-[#FF3B3B] text-white"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 border border-white/10 bg-[#151516]">
            <div className="grid grid-cols-[70px_1fr_110px] border-b border-white/10 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
              <span>Rank</span>
              <span>Player</span>
              <span className="text-right">Recruits</span>
            </div>
            {boardRows.length === 0 && (
              <div className="px-6 py-10 text-center text-[13px] text-white/45">
                Noch keine Empfehlungen. Sei der Erste auf dem Board.
              </div>
            )}
            {boardRows.map((row, i) => (
              <div
                key={`${row.name}-${i}`}
                className={`grid grid-cols-[70px_1fr_110px] items-center border-b border-white/[0.06] px-6 py-4 transition-colors last:border-b-0 hover:bg-white/[0.03] ${
                  row.you ? "bg-[#FF3B3B]/[0.06]" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  {i === 0 ? (
                    <Crown className="h-4 w-4 text-[#FF3B3B]" strokeWidth={2.2} />
                  ) : i < 3 ? (
                    <Medal className="h-4 w-4 text-white/40" strokeWidth={2.2} />
                  ) : null}
                  <span className="font-display text-[15px] font-bold text-white/70">
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-white">
                    {row.name}
                  </span>
                  <span className="block truncate text-[12px] text-white/40">{row.tag}</span>
                </span>
                <span className="text-right font-display text-[16px] font-bold text-[#FF3B3B]">
                  {row.recruits}
                </span>
              </div>
            ))}
          </div>

          {/* Your recruits */}
          <div className="mt-5 flex flex-col items-start gap-4 border border-white/10 bg-[#151516] p-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-11 w-11 place-items-center border border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#FF3B3B]">
                <Users className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="font-display text-[17px] font-bold text-white">Your recruits</p>
                <p className="text-[13px] text-white/55">
                  {recruitRows.length > 0
                    ? `${recruitRows.length} ${recruitRows.length === 1 ? "person has" : "people have"} used your code.`
                    : "Share your code and start building your crew."}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowRecruits(true)}
              className="group relative inline-flex items-center gap-2 overflow-hidden bg-[#FF3B3B] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:bg-[#D63030]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,1)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
              />
              <span className="relative z-10 inline-flex items-center gap-2">
                See your recruits
                <ArrowUpRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative w-full bg-[#0C0C0D] py-28">
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="mb-16 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
                FAQ
              </span>
              <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[0.95] tracking-tight text-white">
                Referral
                <span className="block text-[#FF3B3B]">questions</span>
              </h2>
            </div>
            <p className="max-w-sm text-[14px] leading-relaxed text-white/60">
              Everything you need to know about your referral code, points and how
              to claim your unlocked rewards.
            </p>
          </div>

          <div className="divide-y divide-white/10 border-y border-white/10">
            {FAQS.map((item, i) => {
              const isOpen = openFaq === i;
              const Icon = item.icon;
              return (
                <div key={item.q} className="group">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left transition-colors hover:text-[#FF3B3B]"
                  >
                    <span className="flex items-center gap-4">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-all duration-300 ${
                          isOpen
                            ? "border-[#FF3B3B] bg-[#FF3B3B]/10 text-[#FF3B3B]"
                            : "border-white/10 bg-white/[0.03] text-white/70 group-hover:border-[#FF3B3B]/60 group-hover:text-[#FF3B3B]"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                      </span>
                      <span className="font-display text-[18px] font-semibold tracking-tight text-white transition-colors group-hover:text-[#FF3B3B] md:text-[20px]">
                        {item.q}
                      </span>
                    </span>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white transition-all duration-300 ${
                        isOpen
                          ? "rotate-45 border-[#FF3B3B] bg-[#FF3B3B] text-white"
                          : "group-hover:border-[#FF3B3B] group-hover:text-[#FF3B3B]"
                      }`}
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-500 ease-out ${
                      isOpen ? "grid-rows-[1fr] pb-6 opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-2xl pl-14 text-[15px] leading-relaxed text-white/65">
                        {item.a}
                      </p>
                    </div>
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

function ReferralLoginGate({
  onLogin,
  loading,
}: {
  onLogin: () => void;
  loading: boolean;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0C0C0D] text-white">
      <Navigation />

      <section className="relative flex min-h-[70vh] w-full items-center justify-center overflow-hidden">
        <HeroVideo
          src={import.meta.env.VITE_REFERRAL_VIDEO_URL as string | undefined}
          videoId="_vbgxAowWJM"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-[560px] flex-col items-center px-6 pb-16 pt-40 text-center">
          <div className="grid h-16 w-16 shrink-0 place-items-center border border-[#FF3B3B]/40 bg-[#FF3B3B]/10">
            <img src="/lod-studios-logo.png" alt="LODStudios" className="h-9 w-auto" />
          </div>
          <h1 className="mt-8 font-display text-[clamp(1.8rem,3.4vw,3rem)] font-bold leading-[1.05] tracking-tight">
            Melde dich mit <span className="text-[#FF3B3B]">FiveM</span> an
          </h1>
          <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-white/65">
            Sobald du dich mit deinem FiveM-/Cfx.re-Account anmeldest, wird
            automatisch dein persönlicher Empfehlungscode erstellt. Teile ihn und
            sammle Belohnungen für jeden geworbenen Kauf.
          </p>
          <button
            onClick={onLogin}
            disabled={loading}
            className="mt-8 inline-flex items-center gap-2.5 rounded-lg bg-[#FF3B3B] px-7 py-3.5 text-[12px] font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#D63030] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" strokeWidth={2.2} />
            {loading ? "Loading…" : "Sign in with FiveM"}
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
