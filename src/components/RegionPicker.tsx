import { useEffect, useId, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n, type Lang } from "@/lib/i18n";

const LANGUAGES = [
  { code: "EN", label: "English" },
  { code: "DE", label: "Deutsch" },
  { code: "FR", label: "Français" },
];

const CURRENCIES = [
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", label: "Swiss Franc", symbol: "CHF" },
  { code: "CZK", label: "Czech Koruna", symbol: "Kč" },
  { code: "DKK", label: "Danish Krone", symbol: "kr" },
  { code: "HKD", label: "Hong Kong Dollar", symbol: "HK$" },
  { code: "HUF", label: "Hungarian Forint", symbol: "Ft" },
  { code: "ILS", label: "Israeli Shekel", symbol: "₪" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "MXN", label: "Mexican Peso", symbol: "MX$" },
  { code: "MYR", label: "Malaysian Ringgit", symbol: "RM" },
  { code: "NOK", label: "Norwegian Krone", symbol: "kr" },
  { code: "NZD", label: "New Zealand Dollar", symbol: "NZ$" },
  { code: "PHP", label: "Philippine Peso", symbol: "₱" },
  { code: "PLN", label: "Polish Złoty", symbol: "zł" },
  { code: "RUB", label: "Russian Ruble", symbol: "₽" },
  { code: "SEK", label: "Swedish Krona", symbol: "kr" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
  { code: "THB", label: "Thai Baht", symbol: "฿" },
  { code: "TRY", label: "Turkish Lira", symbol: "₺" },
  { code: "TWD", label: "Taiwan Dollar", symbol: "NT$" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
];



function FlagIcon({ code, className = "" }: { code: string; className?: string }) {
  const id = useId();
  const clipId = `${id}-clip`;

  if (code === "DE") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <circle cx="12" cy="12" r="12" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="24" height="8" y="0" fill="#000000" />
          <rect width="24" height="8" y="8" fill="#DD0000" />
          <rect width="24" height="8" y="16" fill="#FFCE00" />
        </g>
      </svg>
    );
  }

  if (code === "FR") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <circle cx="12" cy="12" r="12" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="8" height="24" x="0" y="0" fill="#002395" />
          <rect width="8" height="24" x="8" y="0" fill="#FFFFFF" />
          <rect width="8" height="24" x="16" y="0" fill="#ED2939" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="24" height="24" fill="#012169" />
        <path d="M0 0 L24 24 M24 0 L0 24" stroke="#FFFFFF" strokeWidth="3" />
        <path d="M12 0 V24 M0 12 H24" stroke="#FFFFFF" strokeWidth="5" />
        <path d="M12 0 V24 M0 12 H24" stroke="#C8102E" strokeWidth="3" />
        <path d="M0 0 L24 24 M24 0 L0 24" stroke="#C8102E" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

export function RegionPicker() {
  const { lang, setLang, currency, setCurrency, t } = useI18n();
  const [query, setQuery] = useState("");
  const [typedText, setTypedText] = useState("");
  const [typingPhase, setTypingPhase] = useState<"typing" | "pausing" | "deleting">("typing");

  const searchPlaceholder = t("region.search");

  useEffect(() => {
    setTypedText("");
    setTypingPhase("typing");
  }, [lang]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (typingPhase === "typing") {
      if (typedText.length < searchPlaceholder.length) {
        timeout = setTimeout(
          () => setTypedText(searchPlaceholder.slice(0, typedText.length + 1)),
          90,
        );
      } else {
        timeout = setTimeout(() => setTypingPhase("pausing"), 1800);
      }
    } else if (typingPhase === "pausing") {
      timeout = setTimeout(() => setTypingPhase("deleting"), 600);
    } else {
      if (typedText.length > 0) {
        timeout = setTimeout(
          () => setTypedText(searchPlaceholder.slice(0, typedText.length - 1)),
          40,
        );
      } else {
        setTypingPhase("typing");
      }
    }
    return () => clearTimeout(timeout);
  }, [typedText, typingPhase, searchPlaceholder]);

  const pickLang = (code: string) => setLang(code as Lang);
  const pickCurrency = (code: string) => setCurrency(code);

  const filtered = CURRENCIES.filter(
    (c) =>
      c.code.toLowerCase().includes(query.toLowerCase()) ||
      c.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label={t("region.change")}
            className="flex h-11 items-center gap-2 border border-white/10 bg-white/[0.04] px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
          >
            <span className="inline-flex h-5 w-5 overflow-hidden rounded-full border border-white/10">
              <FlagIcon code={lang} className="h-full w-full" />
            </span>
            <span>{lang}</span>
            <span className="text-white/30">/</span>
            <span className="text-white/55">{currency}</span>
          </button>
        </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-[360px] overflow-hidden rounded-none border border-white/10 bg-[#0F0F10]/98 p-0 text-white shadow-[0_30px_80px_-25px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        {/* Language */}
        <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)] p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
            {t("region.language")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGES.map((l) => {
              const active = lang === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => pickLang(l.code)}
                  className={`flex flex-col items-center gap-2 border px-2 py-3 transition-all duration-200 ${
                    active
                      ? "border-[#FF3B3B]/60 bg-[#FF3B3B]/10 text-white"
                      : "border-white/10 bg-[#151516] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span className="inline-flex h-6 w-6 overflow-hidden rounded-full border border-white/10 shadow-sm">
                    <FlagIcon code={l.code} className="h-full w-full" />
                  </span>
                  <span className="text-[11px] font-semibold tracking-wide">
                    {l.code}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Currency */}
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
              {t("region.currency")}
            </p>
            <span className="text-[10px] font-semibold text-white/40">
              {filtered.length}
            </span>
          </div>
          <div className="relative mb-3">
            <Search
              className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40"
              strokeWidth={2}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={typedText || "\u00A0"}
              className="w-full rounded-none border border-white/10 bg-[#151516] py-2 pl-9 pr-3 text-[12px] text-white placeholder:text-white/30 focus:border-[#FF3B3B]/40 focus:outline-none"
            />
          </div>
          <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {filtered.map((c) => {
              const active = currency === c.code;
              return (
                <button
                  key={c.code}
                  onClick={() => pickCurrency(c.code)}
                  className={`group flex w-full items-center justify-between border-l-2 px-3 py-2 text-left transition-colors duration-200 ${
                    active
                      ? "border-l-[#FF3B3B] bg-white/[0.05] text-white"
                      : "border-l-transparent text-white/75 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${
                        active
                          ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-[#FF3B3B]"
                          : "border-white/10 bg-[#151516] text-white/70"
                      }`}
                    >
                      {c.symbol}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold leading-tight">
                        {c.code}
                      </p>
                      <p className="truncate text-[10px] text-white/40">
                        {c.label}
                      </p>
                    </div>
                  </div>
                  {active && (
                    <Check
                      className="h-4 w-4 text-[#FF3B3B]"
                      strokeWidth={2.5}
                    />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-[12px] text-white/40">
                {t("region.empty")}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
