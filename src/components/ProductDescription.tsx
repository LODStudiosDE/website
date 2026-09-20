import { AlertTriangle, Check, FileText, Play, Sparkles, Video } from "lucide-react";
import { useT } from "@/lib/i18n";
import { parseDescription } from "@/lib/description-parser";

// Parsing lives in src/lib/description-parser.ts (pure, testable); re-exported
// here so existing imports keep working.
export { parseDescription, type ParsedDescription } from "@/lib/description-parser";

function SectionHeading({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-[#FF3B3B]/30 bg-[#FF3B3B]/10 text-[#FF3B3B]">
        {icon}
      </span>
      <h3 className="font-display text-[15px] font-bold uppercase tracking-[0.18em] text-white">
        {text}
      </h3>
      <span className="h-px flex-1 bg-gradient-to-r from-[#FF3B3B]/40 to-transparent" />
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item, k) => (
        <li
          key={k}
          className="group flex items-start gap-3 rounded-sm border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[14px] leading-snug text-white/75 transition-colors hover:border-[#FF3B3B]/35 hover:bg-[#FF3B3B]/[0.05] hover:text-white"
        >
          <Check className="mt-[2px] h-4 w-4 shrink-0 text-[#FF3B3B]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function VideoCard({ url, label, sub }: { url: string; label: string; sub: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative flex items-center gap-4 overflow-hidden rounded-sm border border-white/10 bg-gradient-to-r from-[#FF3B3B]/[0.12] to-transparent px-5 py-4 transition-colors hover:border-[#FF3B3B]/50"
    >
      <span className="absolute -inset-x-8 -inset-y-16 -translate-x-full rotate-12 bg-white/10 blur-md transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#FF3B3B] text-white shadow-[0_0_30px_rgba(255,59,59,0.35)]">
        <Play className="ml-[2px] h-4 w-4 fill-current" />
      </span>
      <span className="relative min-w-0">
        <span className="block font-display text-[14px] font-bold uppercase tracking-[0.18em] text-white">
          {label}
        </span>
        <span className="block truncate text-[12px] text-white/50">{sub}</span>
      </span>
    </a>
  );
}

const CHANNEL_URL = "https://www.youtube.com/@LODStudios";

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-dashed border-white/10 bg-white/[0.015] px-5 py-6 text-center text-[13px] text-white/40">
      {text}
    </div>
  );
}

export function ProductDescription({ html, title }: { html: string; title?: string }) {
  const t = useT();
  const { blocks, features, notes, showcase, walkthrough } = parseDescription(html, title);

  // Only paragraphs belong to the description — lists are reserved for the marker sections.
  const visibleBlocks = blocks.filter((b) => b.kind === "p");
  const firstP = 0;

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <SectionHeading icon={<FileText className="h-4 w-4" />} text={t("store.description.heading")} />
        {visibleBlocks.length > 0 ? (
          visibleBlocks.map((b, i) => (
            <p
              key={i}
              className={
                i === firstP
                  ? "relative border-l-2 border-[#FF3B3B]/60 pl-5 text-[17px] leading-[1.7] text-white/85 [&_a]:text-[#FF3B3B] [&_a]:underline [&_a]:underline-offset-4"
                  : "text-[15px] leading-[1.8] text-white/65 [&_a]:text-[#FF3B3B] [&_a]:underline [&_a]:underline-offset-4"
              }
              dangerouslySetInnerHTML={{ __html: (b as { html: string }).html }}
            />
          ))
        ) : (
          <EmptyBox text={t("store.description.empty")} />
        )}
      </div>

      <div className="space-y-4">
        <SectionHeading icon={<Sparkles className="h-4 w-4" />} text={t("store.features.heading")} />
        {features.length > 0 ? (
          <BulletList items={features} />
        ) : (
          <EmptyBox text={t("store.features.empty")} />
        )}
      </div>

      <div className="space-y-4">
        <SectionHeading icon={<AlertTriangle className="h-4 w-4" />} text={t("store.notes.heading")} />
        {notes.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {notes.map((item, k) => (
              <li
                key={k}
                className="group flex items-start gap-3 rounded-sm border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[14px] leading-snug text-white/75 transition-colors hover:border-[#FF3B3B]/35 hover:bg-[#FF3B3B]/[0.05] hover:text-white"
              >
                <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0 text-[#FF3B3B]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBox text={t("store.notes.empty")} />
        )}
      </div>

      <div className="space-y-4">
        <SectionHeading icon={<Video className="h-4 w-4" />} text={t("store.videos.heading")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <VideoCard
            url={showcase ?? CHANNEL_URL}
            label={t("store.videos.showcase")}
            sub={showcase ? t("store.videos.showcaseSub") : t("store.videos.showcaseSubEmpty")}
          />
          <VideoCard
            url={walkthrough ?? CHANNEL_URL}
            label={t("store.videos.walkthrough")}
            sub={walkthrough ? t("store.videos.walkthroughSub") : t("store.videos.walkthroughSubEmpty")}
          />
        </div>
      </div>
    </div>
  );
}

