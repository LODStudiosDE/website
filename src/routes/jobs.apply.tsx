import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { submitJobApplication } from "@/lib/job-application.functions";

import { z } from "zod";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Globe2,
  Heart,
  Mail,
  MapPinned,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { useT } from "@/lib/i18n";

const POSITION_OPTIONS = [
  { id: "support-mod", label: "Community & Support Manager", labelKey: "jobs.pos.supportMod.title" },
  { id: "artist-env", label: "3D Artist Mapping & Vehicles", labelKey: "jobs.pos.artistEnv.title" },
  { id: "dev-fullstack", label: "Fullstack Developer", labelKey: "jobs.pos.devFullstack.title" },
  { id: "media-producer", label: "Media Producer Cinematic Editor", labelKey: "jobs.pos.mediaProducer.title" },
  { id: "open", label: "Open application", labelKey: "jobs.apply.positionOption.open" },
] as const;

// Which extra field the last form section shows for each position:
//  - "experience": prior stations / where and how long (Community & Support Manager)
//  - "references": portfolio & reference links (3D Artist, Fullstack Developer, Media Producer, open application)
type ExtraField = "experience" | "references";
const EXTRA_FIELD_BY_POSITION: Record<string, ExtraField> = {
  "support-mod": "experience",
  "artist-env": "references",
  "dev-fullstack": "references",
  "media-producer": "references",
  open: "references",
};

function extraFieldFor(positionId: string): ExtraField | null {
  return EXTRA_FIELD_BY_POSITION[positionId] ?? null;
}

const searchSchema = z.object({
  position: z.string().optional(),
});

export const Route = createFileRoute("/jobs/apply")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "LODStudios | Apply" },
      { name: "description", content: "Apply for an open position at LODStudios." },
      { property: "og:title", content: "LODStudios | Apply" },
      { property: "og:description", content: "Apply for an open position at LODStudios." },
    ],
  }),
  component: ApplyPage,
});

function buildApplicationSchema(t: (key: string) => string, positionId: string) {
  const extra = extraFieldFor(positionId);
  return z.object({
    firstName: z.string().trim().min(1, t("jobs.apply.error.firstName")).max(60),
    lastName: z.string().trim().min(1, t("jobs.apply.error.lastName")).max(60),
    email: z.string().trim().email(t("jobs.apply.error.email")).max(255),
    origin: z.string().trim().min(2, t("jobs.apply.error.origin")).max(80),
    birthdate: z.string().min(1, t("jobs.apply.error.birthdate")),
    hobbies: z.string().trim().min(3, t("jobs.apply.error.hobbies")).max(500),
    experience:
      extra === "experience"
        ? z.string().trim().min(10, t("jobs.apply.error.experience")).max(1500)
        : z.string().trim().max(1500),
    references:
      extra === "references"
        ? z.string().trim().min(3, t("jobs.apply.error.references")).max(1500)
        : z.string().trim().max(1500),
    position: z.string().min(1, t("jobs.apply.error.position")),
  });
}

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  origin: string;
  birthdate: string;
  hobbies: string;
  experience: string;
  references: string;
  position: string;
};

function ApplyPage() {
  const t = useT();
  const { position: presetPosition } = Route.useSearch();
  const safePreset = POSITION_OPTIONS.some((o) => o.id === presetPosition) ? presetPosition : "";
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitApplication = useServerFn(submitJobApplication);
  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    email: "",
    origin: "",
    birthdate: "",
    hobbies: "",
    experience: "",
    references: "",
    position: safePreset ?? "",
  });

  const applicationSchema = useMemo(() => buildApplicationSchema(t, form.position), [t, form.position]);
  const extraField = extraFieldFor(form.position);

  const selectedPosition = useMemo(
    () => {
      const opt = POSITION_OPTIONS.find((o) => o.id === form.position);
      return opt ? t(opt.labelKey) : t("jobs.apply.roleNotSelected");
    },
    [form.position, t],
  );

  function set<K extends keyof FormState>(key: K, val: string) {
    setForm((c) => ({ ...c, [key]: val }));
    setErrors((c) => {
      if (!c[key]) return c;
      const next = { ...c };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = applicationSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as string] = issue.message;
      setErrors(next);
      const first = document.querySelector<HTMLElement>("[data-has-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});
    setSendError(null);
    setSending(true);
    try {
      const activeExtra = extraFieldFor(parsed.data.position);
      await submitApplication({
        data: {
          ...parsed.data,
          // Only send the extra field that applies to the chosen position.
          experience: activeExtra === "experience" ? parsed.data.experience : "",
          references: activeExtra === "references" ? parsed.data.references : "",
          position: POSITION_OPTIONS.find((o) => o.id === parsed.data.position)?.label ?? parsed.data.position,
        },
      });
      setSubmitted(true);
    } catch {
      setSendError(t("jobs.apply.error.generic"));
    } finally {
      setSending(false);
    }
  }


  return (
    <div className="relative min-h-screen bg-[#0C0C0D] text-white overflow-hidden">
      <Navigation />

      {/* HERO */}
      <section className="relative h-[480px] w-full overflow-hidden">
        <HeroVideo
          src={import.meta.env.VITE_JOBS_VIDEO_URL as string | undefined}
          loopEnd={52}
          videoId="_vbgxAowWJM"
          variant="store"
        />
        <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col items-center justify-center px-8 pt-20 text-center">
          <h1 className="font-display max-w-4xl text-[clamp(2.6rem,6vw,5rem)] font-bold leading-[1] tracking-tighter text-foreground drop-shadow-[0_4px_40px_rgba(0,0,0,0.55)]">
            {t("jobs.apply.hero.title.pre")} <span className="text-[#FF3B3B]">LODStudios</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-foreground/80">
            {t("jobs.apply.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* FORM */}
      <section className="relative py-20 md:py-28" style={{ background: "#0C0C0D" }}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 -left-40 h-[500px] w-[500px] rounded-full bg-[#FF3B3B]/[0.05] blur-[140px]" />
          <div className="absolute bottom-0 -right-40 h-[500px] w-[500px] rounded-full bg-[#FF3B3B]/[0.03] blur-[140px]" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6">
          <div className="mb-8 flex items-center justify-between gap-4">
            <Link to="/jobs" className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase text-white/55 transition-colors hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("jobs.apply.backToCareers")}
            </Link>
            <span className="text-[11px] tracking-[0.25em] uppercase text-white/40">
              {t("jobs.apply.role")} <span className="text-white/70">{selectedPosition}</span>
            </span>
          </div>

          {submitted ? (
            <SuccessPanel />
          ) : (
            <form
              onSubmit={onSubmit}
              className="relative overflow-hidden border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] md:p-12"
            >
              <SectionTitle>{t("jobs.apply.section.aboutYou")}</SectionTitle>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label={t("jobs.apply.field.firstName")} icon={UserRound} value={form.firstName} onChange={(v) => set("firstName", v)} error={errors.firstName} placeholder={t("jobs.apply.field.firstName.placeholder")} />
                <Field label={t("jobs.apply.field.lastName")} icon={UserRound} value={form.lastName} onChange={(v) => set("lastName", v)} error={errors.lastName} placeholder={t("jobs.apply.field.lastName.placeholder")} />
                <Field label={t("jobs.apply.field.email")} icon={Mail} type="email" value={form.email} onChange={(v) => set("email", v)} error={errors.email} placeholder={t("jobs.apply.field.email.placeholder")} />
                <Field label={t("jobs.apply.field.birthdate")} icon={CalendarDays} type="date" value={form.birthdate} onChange={(v) => set("birthdate", v)} error={errors.birthdate} />
                <div className="md:col-span-2">
                  <Field label={t("jobs.apply.field.origin")} icon={MapPinned} value={form.origin} onChange={(v) => set("origin", v)} error={errors.origin} placeholder={t("jobs.apply.field.origin.placeholder")} />
                </div>
              </div>

              <div className="my-10 h-px bg-white/[0.06]" />

              <SectionTitle>{t("jobs.apply.section.role")}</SectionTitle>
              <SelectField label={t("jobs.apply.field.position")} icon={BriefcaseBusiness} value={form.position} onChange={(v) => set("position", v)} error={errors.position} />

              <div className="my-10 h-px bg-white/[0.06]" />

              <SectionTitle>{t("jobs.apply.section.ownWords")}</SectionTitle>
              <div className="grid gap-5">
                <TextareaField label={t("jobs.apply.field.hobbies")} icon={Heart} value={form.hobbies} onChange={(v) => set("hobbies", v)} error={errors.hobbies} placeholder={t("jobs.apply.field.hobbies.placeholder")} rows={3} />
                {extraField === "experience" && (
                  <TextareaField label={t("jobs.apply.field.experience")} icon={Globe2} value={form.experience} onChange={(v) => set("experience", v)} error={errors.experience} placeholder={t("jobs.apply.field.experience.placeholder")} rows={6} />
                )}
                {extraField === "references" && (
                  <TextareaField label={t("jobs.apply.field.references")} icon={Globe2} value={form.references} onChange={(v) => set("references", v)} error={errors.references} placeholder={t("jobs.apply.field.references.placeholder")} rows={6} />
                )}
              </div>

              {sendError && (
                <p className="mt-8 border border-[#FF3B3B]/40 bg-[#FF3B3B]/[0.07] px-4 py-3 text-sm text-[#ff8a8a]">
                  {sendError}
                </p>
              )}

              <div className="mt-10 flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
                <p className="max-w-md text-xs leading-6 text-white/45">
                  {t("jobs.apply.disclaimer")}
                </p>
                <button
                  type="submit"
                  disabled={sending}
                  className="group relative inline-flex items-center justify-center gap-3 overflow-hidden bg-[#FF3B3B] px-8 py-4 text-sm font-semibold text-white transition-all hover:bg-[#ff5050] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.45)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]" />
                  <span className="relative">{sending ? t("jobs.apply.sending") : t("jobs.applyNow")}</span>

                  <ArrowUpRight className="relative h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="text-[11px] tracking-[0.4em] uppercase text-[#FF3B3B]">{children}</span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function SuccessPanel() {
  const t = useT();
  return (
    <div className="relative overflow-hidden border border-[#FF3B3B]/25 bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-12 text-center md:p-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,59,59,0.18),transparent_45%)]" />
      <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#FF3B3B]">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="font-display relative mt-7 text-4xl font-bold tracking-tight md:text-5xl">
        {t("jobs.apply.success.title.pre")} <span className="text-[#FF3B3B]">{t("jobs.apply.success.title.accent")}</span>
      </h2>
      <p className="relative mx-auto mt-4 max-w-xl text-[15px] leading-7 text-white/60">
        {t("jobs.apply.success.text")}
      </p>
      <Link
        to="/jobs"
        className="relative mt-8 inline-flex items-center justify-center gap-2 border border-white/15 px-7 py-3 text-sm font-medium text-white/80 transition-all hover:border-[#FF3B3B]/60 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("jobs.apply.backToCareers")}
      </Link>
    </div>
  );
}

type FieldProps = {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
};

function Field({ label, icon: Icon, value, onChange, error, placeholder, type = "text" }: FieldProps) {
  return (
    <label data-has-error={!!error} className="block">
      <span className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase text-white/55 mb-2">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-[#FF3B3B]" />
          {label}
        </span>
        {error && <span className="text-[#FF3B3B] normal-case tracking-normal">{error}</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border bg-white/[0.02] px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/25 transition-colors focus:bg-white/[0.04] ${
          error ? "border-[#FF3B3B]/50" : "border-white/[0.08] focus:border-[#FF3B3B]/40"
        }`}
      />
    </label>
  );
}

function TextareaField({ label, icon: Icon, value, onChange, error, placeholder, rows }: FieldProps & { rows: number }) {
  return (
    <label data-has-error={!!error} className="block">
      <span className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase text-white/55 mb-2">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-[#FF3B3B]" />
          {label}
        </span>
        {error && <span className="text-[#FF3B3B] normal-case tracking-normal">{error}</span>}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-none border bg-white/[0.02] px-4 py-3 text-[15px] leading-7 text-white outline-none placeholder:text-white/25 transition-colors focus:bg-white/[0.04] ${
          error ? "border-[#FF3B3B]/50" : "border-white/[0.08] focus:border-[#FF3B3B]/40"
        }`}
      />
    </label>
  );
}

function SelectField({ label, icon: Icon, value, onChange, error }: Omit<FieldProps, "placeholder" | "type">) {
  const t = useT();
  return (
    <label data-has-error={!!error} className="block">
      <span className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase text-white/55 mb-2">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-[#FF3B3B]" />
          {label}
        </span>
        {error && <span className="text-[#FF3B3B] normal-case tracking-normal">{error}</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none border bg-white/[0.02] px-4 py-3 text-[15px] text-white outline-none transition-colors focus:bg-white/[0.04] ${
          error ? "border-[#FF3B3B]/50" : "border-white/[0.08] focus:border-[#FF3B3B]/40"
        }`}
      >
        <option value="" className="bg-[#0C0C0D]">{t("jobs.apply.field.position.placeholder")}</option>
        {POSITION_OPTIONS.map((o) => (
          <option key={o.id} value={o.id} className="bg-[#0C0C0D]">{t(o.labelKey)}</option>
        ))}
      </select>
    </label>
  );
}
