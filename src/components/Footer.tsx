import { Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";

const legalLinks: { key: string; to: "/impressum" | "/terms" | "/privacy" | "/tos" }[] = [
  { key: "footer.impressum", to: "/impressum" },
  { key: "footer.terms", to: "/terms" },
  { key: "footer.privacy", to: "/privacy" },
  { key: "footer.tos", to: "/tos" },
];

export function Footer() {
  const t = useT();
  return (
    <footer className="bg-[#0C0C0D]">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-center gap-4 px-6 py-4 lg:flex-row lg:gap-8 lg:px-10">
        {/* Logos */}
        <div className="flex items-center gap-8 shrink-0">
          <a href="https://tebex.io" target="_blank" rel="noopener noreferrer" aria-label="Tebex">
            <img
              src="/tebex_logo.png"
              alt="Tebex"
              className="h-9 w-auto object-contain invert transition-opacity hover:opacity-80"
            />
          </a>
          <a href="/" aria-label="LOD Studios">
            <img
              src="/favicon.png"
              alt="LOD Studios"
              className="h-9 w-auto object-contain transition-opacity hover:opacity-80"
            />
          </a>
          <a href="https://docshub.cloud" target="_blank" rel="noopener noreferrer" aria-label="DocsHub">
            <img
              src="/dochub_logo.png"
              alt="DocsHub"
              className="h-9 w-auto object-contain transition-opacity hover:opacity-80"
            />
          </a>
        </div>

        {/* Vertical divider */}
        <div className="hidden h-10 w-px bg-[#FF3B3B] lg:block" />
        <div className="h-px w-24 bg-[#FF3B3B] lg:hidden" />

        {/* Copyright + links */}
        <div className="flex flex-col gap-2 text-center lg:text-left">
          <p className="text-[12px] text-white/70">
            <span className="text-[#FF3B3B]">©</span> {t("footer.copyright")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 lg:justify-start">
            {legalLinks.map((link, i) => (
              <div key={link.key} className="flex items-center gap-5">
                <Link
                  to={link.to}
                  className="text-[12px] text-[#FF3B3B]/80 transition-colors hover:text-[#FF3B3B]"
                >
                  {t(link.key)}
                </Link>
                {i < legalLinks.length - 1 && <span className="text-white/15">|</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
