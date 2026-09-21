import { useState } from "react";
import {
  FileText,
  KeyRound,
  Ban,
  CreditCard,
  Copyright,
  ShieldAlert,
  RefreshCw,
  Mail,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

type Chip =
  | { kind: "copy"; label: string; value: string; icon?: LucideIcon }
  | { kind: "link"; label: string; href: string; icon?: LucideIcon };

type Section = {
  icon: LucideIcon;
  title: string;
  body?: string[];
  list?: string[];
  chips?: Chip[];
};

function ChipButton({ chip }: { chip: Chip }) {
  const [copied, setCopied] = useState(false);
  const Icon = chip.icon;

  if (chip.kind === "link") {
    return (
      <a
        href={chip.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11.5px] text-white/85 transition-colors hover:border-[#FF3B3B]/40 hover:bg-[#FF3B3B]/[0.06] hover:text-white"
      >
        {Icon && <Icon className="h-3.5 w-3.5 text-white/40 group-hover:text-[#FF3B3B]" />}
        <span className="truncate font-mono">{chip.label}</span>
        <ArrowUpRight className="h-3 w-3 text-white/30 group-hover:text-[#FF3B3B]" />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(chip.value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11.5px] text-white/85 transition-colors hover:border-[#FF3B3B]/40 hover:bg-[#FF3B3B]/[0.06] hover:text-white"
    >
      {Icon && <Icon className="h-3.5 w-3.5 text-white/40 group-hover:text-[#FF3B3B]" />}
      <span className="truncate font-mono">{chip.label}</span>
      {copied ? (
        <Check className="h-3 w-3 text-[#FF3B3B]" />
      ) : (
        <Copy className="h-3 w-3 text-white/30 group-hover:text-[#FF3B3B]" />
      )}
    </button>
  );
}

const sections: Section[] = [
  {
    icon: FileText,
    title: "Introduction",
    body: [
      "By accessing and using LODStudios' digital content and services, you agree to comply with these Terms of Service.",
      "If you do not agree to these terms, please refrain from using our services.",
    ],
  },
  {
    icon: KeyRound,
    title: "License for Digital Content",
    body: [
      "All digital content and resources offered by LODStudios are licensed, not sold. By purchasing a product, you receive a limited, non-transferable right of use subject to the following conditions.",
    ],
    list: [
      "The license is exclusively tied to the Cfx.re account through which the purchase was made.",
      "Sharing, copying, renting, selling or otherwise distributing the purchased content to third parties is strictly prohibited.",
      "The content may only be used on servers for which the licensee holds the required usage and administration rights.",
      "Reverse engineering, decompiling, decrypting or otherwise analyzing the product or its components is not permitted.",
      "A license may be transferred to another Cfx.re account once. After the transfer has been completed, there is no claim to any further transfer or reverse transfer.",
      "LODStudios assumes no liability for technical, organizational or other issues arising in connection with a license transfer or a requested reverse transfer. In particular, there is no claim that a transferred license can be returned to the original account.",
    ],
  },
  {
    icon: Ban,
    title: "Prohibited Actions",
    body: [
      "When using LODStudios' products and services, the following actions in particular are prohibited:",
    ],
    list: [
      "Sharing, distributing, renting, publishing or reselling purchased products or their components.",
      "Creating, editing or publishing derivative works, unless explicitly permitted by the product license.",
      "Using the products outside the licensed scope or on unauthorized servers.",
      "Attempting to bypass, manipulate or disable license, authentication or security systems.",
      "Removing or altering copyright, license or ownership notices.",
      "Using the products for unlawful purposes or in a manner that violates applicable laws, regulations or the Cfx.re guidelines.",
    ],
  },
  {
    icon: CreditCard,
    title: "Payments and Refunds",
    body: [
      "All purchases are final. Due to the digital nature of our products, refunds are generally excluded.",
      "Exceptions may only be granted in the case of technical issues that permanently prevent proper use of the product.",
    ],
  },
  {
    icon: Copyright,
    title: "Intellectual Property",
    body: [
      "All products and content of LODStudios, including scripts, models, textures and documentation, remain the property of LODStudios and are protected by copyright.",
    ],
  },
  {
    icon: ShieldAlert,
    title: "Limitation of Liability",
    body: [
      "LODStudios assumes no liability for indirect damages, consequential damages, data loss, lost profits or any other disadvantages arising from the use of or inability to use our products and services.",
    ],
  },
  {
    icon: RefreshCw,
    title: "Changes to the Terms of Service",
    body: [
      "LODStudios reserves the right to amend or update these Terms of Service at any time. By continuing to use our products and services, you agree to the terms in effect at that time.",
    ],
  },
  {
    icon: Mail,
    title: "Contact Information",
    body: ["If you have any questions about these Terms of Service or our services, you can reach us at:"],
    chips: [
      {
        kind: "copy",
        label: "contact.lodstudios@gmail.com",
        value: "contact.lodstudios@gmail.com",
        icon: Mail,
      },
      {
        kind: "link",
        label: "discord.gg/lodstudio",
        href: "https://discord.gg/lodstudio",
        icon: ExternalLink,
      },
    ],
  },
];

export function TermsOfServiceContent() {
  return (
    <div className="space-y-3">
      {sections.map(({ icon: Icon, title, body, list, chips }) => (
        <section
          key={title}
          className="relative overflow-hidden rounded-lg border border-[#FF3B3B]/10 bg-[#1C1516]/70 p-4 before:absolute before:inset-y-3 before:left-0 before:w-[2px] before:rounded-r-full before:bg-[#FF3B3B]/70"
        >
          <div className="mb-2 flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-[#FF3B3B]" />
            <h3 className="text-[13px] font-semibold tracking-tight text-white">
              {title}
            </h3>
          </div>
          <div className="space-y-1.5 pl-6">
            {body?.map((p, i) => (
              <p key={i} className="text-[12.5px] leading-relaxed text-white/60">
                {p}
              </p>
            ))}
            {list && list.length > 0 && (
              <ul className="space-y-1 pt-1">
                {list.map((item, i) => (
                  <li
                    key={i}
                    className="relative pl-4 text-[12.5px] leading-relaxed text-white/60 before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:rounded-full before:bg-[#FF3B3B]/70"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {chips && chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {chips.map((chip, i) => (
                  <ChipButton key={i} chip={chip} />
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
