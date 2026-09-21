import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, ExternalLink, User, FileText, Hash, Check, Copy } from "lucide-react";
import { LegalPageShell } from "@/components/LegalPageShell";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "LODStudios | Imprint" },
      { name: "description", content: "Company information and legal disclosures." },
    ],
  }),
  component: ImpressumPage,
});

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.02] text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[#FF3B3B]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  copy,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  copy?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#FF3B3B]/10 bg-[#1C1516]/70 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-[#FF3B3B]" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">{label}</p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm text-white hover:text-[#FF3B3B]"
          >
            {value}
          </a>
        ) : (
          <p className="truncate text-sm text-white">{value}</p>
        )}
      </div>
      {copy && <CopyButton value={copy} />}
    </div>
  );
}

function ImpressumPage() {
  return (
    <LegalPageShell
      eyebrow="Legal Notice"
      title="Imprint"
      description="Company information and legal disclosures."
      icon={Building2}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[#FF3B3B]/10 bg-[#1C1516]/70 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#FF3B3B]" />
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
              Service Provider
            </p>
          </div>
          <p className="text-sm font-medium text-white">Tebex Limited</p>
          <p className="mt-0.5 text-sm text-white/60">
            201 Haverstock Hill, Second Floor C/O Fkgb<br />
            London, England, NW3 4QG
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <InfoRow
            icon={Mail}
            label="Email"
            value="checkout-support@tebex.io"
            copy="checkout-support@tebex.io"
            href="mailto:checkout-support@tebex.io"
          />
          <InfoRow
            icon={ExternalLink}
            label="Support"
            value="Contact Form"
            href="https://www.tebex.io/contact"
          />
          <InfoRow icon={User} label="Management" value="Liam Wiltshire" />
          <InfoRow icon={FileText} label="Company No." value="08129184" copy="08129184" />
          <InfoRow icon={Hash} label="VAT (GB)" value="GB167189962" copy="GB167189962" />
          <InfoRow icon={Hash} label="VAT (EU)" value="EU372035465" copy="EU372035465" />
        </div>

        <p className="pt-1 text-xs leading-relaxed text-white/40">
          Tebex Limited is a company registered under the laws of England and Wales.
        </p>
      </div>
    </LegalPageShell>
  );
}
