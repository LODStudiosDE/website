import { useState } from "react";
import {
  Plus,
  Boxes,
  PackageCheck,
  Server,
  Wand2,
  LifeBuoy,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n";

const FAQS: { q: string; a: string; icon: LucideIcon }[] = [
  { icon: Boxes, q: "faq.q1", a: "faq.a1" },
  { icon: PackageCheck, q: "faq.q2", a: "faq.a2" },
  { icon: Server, q: "faq.q3", a: "faq.a3" },
  { icon: Wand2, q: "faq.q4", a: "faq.a4" },
  { icon: LifeBuoy, q: "faq.q5", a: "faq.a5" },
  { icon: RefreshCcw, q: "faq.q6", a: "faq.a6" },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const t = useT();

  return (
    <section className="relative w-full bg-[#0C0C0D] py-28">
      <div className="mx-auto max-w-[1200px] px-8">
        <div className="mb-16 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
              {t("faq.eyebrow")}
            </span>
            <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[0.95] tracking-tight text-white">
              {t("faq.title")}
              <span className="block text-[#FF3B3B]">{t("faq.titleAccent")}</span>
            </h2>
          </div>
          <p className="max-w-sm text-[14px] leading-relaxed text-white/60">
            {t("faq.lead")}
          </p>
        </div>

        <div className="divide-y divide-white/10 border-y border-white/10">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            const Icon = item.icon;
            return (
              <div key={i} className="group">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
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
                      {t(item.q)}
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
                      {t(item.a)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
