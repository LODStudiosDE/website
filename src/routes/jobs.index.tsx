import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Code2,
  Headphones,
  MapPin,
  Palette,
  Video,
  X,
  Check,
  Sparkles,
  Briefcase,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/jobs/")({
  head: () => ({
    meta: [
      { title: "LODStudios | Jobs" },
      { name: "description", content: "Open positions at LODStudios, a remote first team building premium FiveM content." },
      { property: "og:title", content: "LODStudios | Jobs" },
      { property: "og:description", content: "Open positions at LODStudios, a remote first team building premium FiveM content." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JobsPage,
});

type Department = "Support" | "Artist" | "Development" | "Media";

type Position = {
  id: string;
  title: string;
  titleKey: string;
  department: Department;
  typeKey: string;
  locationKey: string;
  introKey: string;
  requirementKeys: string[];
  offerKeys: string[];
};

const DEPT_META: Record<Department, { icon: LucideIcon; labelKey: string }> = {
  Support: { icon: Headphones, labelKey: "jobs.dept.support" },
  Artist: { icon: Palette, labelKey: "jobs.dept.artist" },
  Development: { icon: Code2, labelKey: "jobs.dept.development" },
  Media: { icon: Video, labelKey: "jobs.dept.media" },
};

const POSITIONS: Position[] = [
  {
    id: "support-mod",
    title: "Community & Support Manager",
    titleKey: "jobs.pos.supportMod.title",
    department: "Support",
    typeKey: "jobs.pos.supportMod.type",
    locationKey: "jobs.pos.supportMod.location",
    introKey: "jobs.pos.supportMod.intro",
    requirementKeys: [
      "jobs.pos.supportMod.req1",
      "jobs.pos.supportMod.req2",
      "jobs.pos.supportMod.req3",
      "jobs.pos.supportMod.req4",
    ],
    offerKeys: [
      "jobs.pos.supportMod.offer1",
      "jobs.pos.supportMod.offer2",
      "jobs.pos.supportMod.offer3",
      "jobs.pos.supportMod.offer4",
    ],
  },
  {
    id: "artist-env",
    title: "3D Artist Mapping & Vehicles",
    titleKey: "jobs.pos.artistEnv.title",
    department: "Artist",
    typeKey: "jobs.pos.artistEnv.type",
    locationKey: "jobs.pos.artistEnv.location",
    introKey: "jobs.pos.artistEnv.intro",
    requirementKeys: [
      "jobs.pos.artistEnv.req1",
      "jobs.pos.artistEnv.req2",
      "jobs.pos.artistEnv.req3",
      "jobs.pos.artistEnv.req4",
    ],
    offerKeys: [
      "jobs.pos.artistEnv.offer1",
      "jobs.pos.artistEnv.offer2",
      "jobs.pos.artistEnv.offer3",
      "jobs.pos.artistEnv.offer4",
    ],
  },
  {
    id: "dev-fullstack",
    title: "Fullstack Developer",
    titleKey: "jobs.pos.devFullstack.title",
    department: "Development",
    typeKey: "jobs.pos.devFullstack.type",
    locationKey: "jobs.pos.devFullstack.location",
    introKey: "jobs.pos.devFullstack.intro",
    requirementKeys: [
      "jobs.pos.devFullstack.req1",
      "jobs.pos.devFullstack.req2",
      "jobs.pos.devFullstack.req3",
      "jobs.pos.devFullstack.req4",
      "jobs.pos.devFullstack.req5",
    ],
    offerKeys: [
      "jobs.pos.devFullstack.offer1",
      "jobs.pos.devFullstack.offer2",
      "jobs.pos.devFullstack.offer3",
      "jobs.pos.devFullstack.offer4",
      "jobs.pos.devFullstack.offer5",
    ],
  },
  {
    id: "media-producer",
    title: "Media Producer Cinematic Editor",
    titleKey: "jobs.pos.mediaProducer.title",
    department: "Media",
    typeKey: "jobs.pos.mediaProducer.type",
    locationKey: "jobs.pos.mediaProducer.location",
    introKey: "jobs.pos.mediaProducer.intro",
    requirementKeys: [
      "jobs.pos.mediaProducer.req1",
      "jobs.pos.mediaProducer.req2",
      "jobs.pos.mediaProducer.req3",
      "jobs.pos.mediaProducer.req4",
      "jobs.pos.mediaProducer.req5",
    ],
    offerKeys: [
      "jobs.pos.mediaProducer.offer1",
      "jobs.pos.mediaProducer.offer2",
      "jobs.pos.mediaProducer.offer3",
    ],
  },
];

const WARM_BG = "#0C0C0D";

function GridTexture({ id }: { id: string }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-[0.10] mix-blend-overlay">
      <defs>
        <pattern id={`jgrid-${id}`} width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" stroke="white" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#jgrid-${id})`} />
    </svg>
  );
}

function CornerTicks() {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-20 h-4 w-4 border-l border-t border-[#FF3B3B]/0 transition-colors duration-500 group-hover:border-[#FF3B3B]/70" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 z-20 h-4 w-4 border-b border-r border-[#FF3B3B]/0 transition-colors duration-500 group-hover:border-[#FF3B3B]/70" />
    </>
  );
}

function JobsPage() {
  const t = useT();
  const [active, setActive] = useState<Position | null>(null);
  const navigate = useNavigate();

  const goApply = (positionId?: string) => {
    setActive(null);
    navigate({ to: "/jobs/apply", search: positionId ? { position: positionId } : {} });
  };

  return (
    <div className="relative min-h-screen bg-[#0C0C0D] text-white overflow-hidden">
      <Navigation />

      {/* HERO */}
      <section className="relative h-[640px] w-full overflow-hidden">
        <HeroVideo
          src={import.meta.env.VITE_JOBS_VIDEO_URL as string | undefined}
          loopEnd={52}
          videoId="_vbgxAowWJM"
          variant="store"
        />
        <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col items-center justify-center px-8 pt-20 text-center">
          <h1 className="font-display max-w-5xl text-[clamp(3rem,7vw,6.5rem)] font-bold leading-[1] tracking-tighter text-foreground drop-shadow-[0_4px_40px_rgba(0,0,0,0.55)]">
            {t("jobs.hero.title.pre")} <span className="text-[#FF3B3B]">{t("jobs.hero.title.accent")}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-foreground/80">
            {t("jobs.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* OPEN ROLES */}
      <section className="relative py-24 md:py-32" style={{ background: WARM_BG }}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 -left-40 h-[500px] w-[500px] rounded-full bg-[#FF3B3B]/[0.03] blur-[180px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between gap-4 mb-10 pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-4">
              <span className="relative flex h-11 w-11 items-center justify-center border border-[#FF3B3B]/30 bg-[#FF3B3B]/[0.07]">
                <Briefcase className="h-5 w-5 text-[#FF3B3B]" />
                <span aria-hidden className="absolute -top-px -left-px h-2 w-2 border-t border-l border-[#FF3B3B]" />
                <span aria-hidden className="absolute -bottom-px -right-px h-2 w-2 border-b border-r border-[#FF3B3B]" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] tracking-[0.4em] uppercase text-[#FF3B3B]">{t("jobs.openRoles.eyebrow")}</span>
                <span className="text-sm text-white/40">{t("jobs.openRoles.hint")}</span>
              </div>
            </div>
            <span className="text-[11px] tracking-[0.3em] uppercase text-white/30">
              {String(POSITIONS.length).padStart(2, "0")}
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {POSITIONS.map((p, i) => {
              const meta = DEPT_META[p.department];
              const Icon = meta.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setActive(p)}
                  className="group relative overflow-hidden border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-7 text-left shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] transition-all duration-500 hover:-translate-y-1 hover:border-[#FF3B3B]/40 hover:shadow-[0_30px_80px_-30px_rgba(255,59,59,0.18)]"
                >
                  <GridTexture id={p.id} />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.14)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
                  />
                  <CornerTicks />

                  <span className="absolute right-5 top-5 z-20 font-display text-[11px] tracking-[0.25em] text-white/20">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="relative z-10">
                    <div className="mb-4 inline-flex items-center gap-2 border border-white/10 bg-black/30 px-2 py-1 transition-colors duration-500 group-hover:border-[#FF3B3B]/40">
                      <Icon className="h-3.5 w-3.5 text-[#FF3B3B]" />
                      <span className="text-[10px] tracking-[0.25em] uppercase text-white/65">{t(meta.labelKey)}</span>
                    </div>
                    <h3 className="font-display text-2xl font-bold tracking-tight leading-tight">{t(p.titleKey)}</h3>
                    <span className="mt-3 block h-px w-10 bg-gradient-to-r from-[#FF3B3B] to-transparent transition-all duration-500 group-hover:w-full" />
                    <p className="mt-3 text-sm leading-6 text-white/55">{t(p.introKey)}</p>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Tag icon={CalendarDays}>{t(p.typeKey)}</Tag>
                      <Tag icon={MapPin}>{t(p.locationKey)}</Tag>
                      <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] tracking-[0.25em] uppercase text-white/50 transition-colors group-hover:text-[#FF3B3B]">
                        {t("jobs.viewRole")} <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Open application CTA */}
          <div className="group relative mt-16 overflow-hidden border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] md:p-12">
            <GridTexture id="cta" />
            <CornerTicks />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 border border-white/10 bg-black/30 px-2 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-[#FF3B3B]" />
                  <span className="text-[10px] tracking-[0.25em] uppercase text-white/65">{t("jobs.cta.eyebrow")}</span>
                </div>
                <h3 className="font-display text-3xl font-bold tracking-tight">{t("jobs.cta.title")}</h3>
                <p className="mt-2 max-w-lg text-sm text-white/55">
                  {t("jobs.cta.text")}
                </p>
              </div>
              <button
                onClick={() => goApply()}
                className="group/btn relative inline-flex items-center justify-center gap-3 overflow-hidden bg-[#FF3B3B] px-8 py-4 text-sm font-semibold text-white transition-all hover:bg-[#ff5050]"
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.45)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover/btn:bg-[position:0%_0%]" />
                <span className="relative">{t("jobs.applyNow")}</span>
                <ArrowUpRight className="relative h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <PositionDialog position={active} onClose={() => setActive(null)} onApply={goApply} />
      <Footer />
    </div>
  );
}

function Tag({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] tracking-[0.2em] uppercase text-white/65">
      <Icon className="h-3 w-3 text-[#FF3B3B]" />
      {children}
    </span>
  );
}

function PositionDialog({
  position,
  onClose,
  onApply,
}: {
  position: Position | null;
  onClose: () => void;
  onApply: (id: string) => void;
}) {
  const t = useT();
  return (
    <Dialog open={!!position} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl rounded-none border-white/[0.08] bg-[#101011] p-0 text-white shadow-[0_40px_140px_rgba(0,0,0,0.8)] overflow-hidden [&>button]:hidden">
        {position && (
          <div className="relative max-h-[88vh] overflow-y-auto scrollbar-brand">
            <button
              onClick={onClose}
              className="absolute right-5 top-5 z-30 grid h-9 w-9 place-items-center border border-white/10 bg-[#0C0C0D]/80 text-white/70 backdrop-blur transition-all hover:border-[#FF3B3B]/60 hover:text-[#FF3B3B]"
              aria-label={t("jobs.dialog.close")}
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="relative border-b border-white/[0.06] p-8 md:p-10"
              style={{ background: "radial-gradient(600px 220px at 0% 0%, rgba(255,59,59,0.10), transparent 70%)" }}
            >
              <GridTexture id="dialog" />
              <div className="relative z-10">
                <div className="mb-4 inline-flex items-center gap-2 border border-white/10 bg-black/30 px-2 py-1">
                  {(() => {
                    const Icon = DEPT_META[position.department].icon;
                    return <Icon className="h-3.5 w-3.5 text-[#FF3B3B]" />;
                  })()}
                  <span className="text-[10px] tracking-[0.25em] uppercase text-white/65">
                    {t(DEPT_META[position.department].labelKey)}
                  </span>
                </div>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">{t(position.titleKey)}</h2>
                <span className="mt-3 block h-px w-24 bg-gradient-to-r from-[#FF3B3B] to-transparent" />
                <p className="mt-4 max-w-2xl text-[15px] leading-7 text-white/65">{t(position.introKey)}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Tag icon={CalendarDays}>{t(position.typeKey)}</Tag>
                  <Tag icon={MapPin}>{t(position.locationKey)}</Tag>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
              <Column title={t("jobs.dialog.requirementsTitle")} itemKeys={position.requirementKeys} />
              <Column title={t("jobs.dialog.offersTitle")} itemKeys={position.offerKeys} />
            </div>

            <div className="flex flex-col gap-5 border-t border-white/[0.06] bg-[#0C0C0D] p-8 md:flex-row md:items-center md:justify-between md:p-10">
              <div>
                <h3 className="font-display text-xl font-bold tracking-tight">{t("jobs.dialog.readyTitle")}</h3>
                <p className="mt-1 text-sm text-white/55">{t("jobs.dialog.readyText")}</p>
              </div>
              <button
                onClick={() => onApply(position.id)}
                className="group relative inline-flex items-center justify-center gap-3 overflow-hidden bg-[#FF3B3B] px-7 py-4 text-sm font-semibold text-white transition-all hover:bg-[#ff5050]"
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.45)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]" />
                <span className="relative">{t("jobs.applyNow")}</span>
                <ArrowUpRight className="relative h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Column({ title, itemKeys }: { title: string; itemKeys: string[] }) {
  const t = useT();
  return (
    <section className="p-8 md:p-10">
      <h3 className="mb-5 text-[11px] tracking-[0.3em] uppercase text-[#FF3B3B]">{title}</h3>
      <ul className="grid gap-3">
        {itemKeys.map((key) => (
          <li key={key} className="flex items-start gap-3 text-sm leading-6 text-white/75">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border border-[#FF3B3B]/30 bg-[#FF3B3B]/10 text-[#FF3B3B]">
              <Check className="h-3 w-3" />
            </span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
