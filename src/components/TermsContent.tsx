import { useState } from "react";
import {
  FileText,
  Building2,
  Mail,
  Globe,
  Handshake,
  AlertCircle,
  ShoppingBag,
  Ban,
  Lock,
  ShieldCheck,
  CreditCard,
  RefreshCw,
  Scale,
  Truck,
  Tag,
  Wallet,
  AlertTriangle,
  Award,
  ExternalLink,
  Gavel,
  Undo2,
  Check,
  Copy,
  ArrowUpRight,
  Hash,
  type LucideIcon,
} from "lucide-react";

type Chip =
  | { kind: "copy"; label: string; value: string; icon?: LucideIcon }
  | { kind: "link"; label: string; href: string; icon?: LucideIcon };

type Section = { icon: LucideIcon; title: string; body: string[]; chips?: Chip[] };

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
      'This page, together with our Privacy Policy and General Website Terms & Conditions, informs you of the legal terms ("Terms") which govern your use of our ("Seller", "We", "Us") webstore (the "Webstore").',
      'These Terms apply to any contract between you and Us in respect of your purchase of video game related products, items and other content ("Products") on the Webstore ("Contract").',
      "Before placing an order you will be asked to agree to these Terms. If you refuse to accept these Terms, you will not be able to place an order.",
      "These Terms were most recently updated on 12th June 2023 and are only available in the English language.",
    ],
  },
  {
    icon: Building2,
    title: "1. Information about us",
    body: [
      "We are a Licensed seller for goods for this game, game server or Discord server (the Platform). We are Tebex Limited t/a Tebex, registered in England and Wales. Registered office: Levy Cohen & Co, 5.2 Central House, 1 Ballards Lane, London, N3 1LQ.",
    ],
    chips: [
      { kind: "copy", label: "Company No. 08129184", value: "08129184", icon: FileText },
      { kind: "copy", label: "VAT GB167189962", value: "GB167189962", icon: Hash },
      { kind: "copy", label: "VAT EU372035465", value: "EU372035465", icon: Hash },
    ],
  },
  {
    icon: Mail,
    title: "2. Contacting us",
    body: [
      "For technical support, fraud reports, or AUP breaches you can contact us via the form below.",
      "If we have to contact you, we will do so by e-mail or by pre-paid post.",
    ],
    chips: [
      {
        kind: "link",
        label: "tebex.io/contact/checkout",
        href: "https://www.tebex.io/contact/checkout",
        icon: ExternalLink,
      },
    ],
  },
  {
    icon: Globe,
    title: "3. Use of the Webstore",
    body: [
      "Your use of the Webstore is governed by our General Website Terms & Conditions. Please take the time to read this document, as it includes important terms which apply to you.",
    ],
  },
  {
    icon: Handshake,
    title: "4. Our relationship with the Platform",
    body: [
      "Our Webstore will guide you through the steps you need to take to place an order. You should check and amend any errors before submitting.",
      "We license assets and software from the Platform and resell licenses as the merchant. We may decline to conclude a sale for any reason, including suspected fraud.",
      "When you buy Products on the Webstore, you enter into a Contract with Us, not with the Platform.",
      "All digital software and items are licensed, not sold. The license grants you limited personal rights tied to the account used at purchase.",
    ],
  },
  {
    icon: AlertCircle,
    title: "5. Problems with the Products",
    body: [
      "We will make every reasonable effort to resolve any product queries. For ancillary services (e.g. server access) we may refer you to specialised external support, but you should always contact us first.",
    ],
  },
  {
    icon: ShoppingBag,
    title: "6. The Webstore and Products",
    body: [
      "All IP rights in the Webstore are owned by Us. IP rights in the Products are owned by the Platform.",
      "We do not guarantee continuous, error-free, virus-free or secure operation of the Webstore.",
      "Purchases are payments for licenses to digital virtual items. Transactions are final and there are no refunds. Bans are at the Platform's discretion. Virtual items have no real-world value.",
      "Virtual Currency awarded has no physical value, can only be redeemed on the relevant Platform, and may be forfeit if unusual use patterns are detected.",
    ],
  },
  {
    icon: Ban,
    title: "7. Restrictions on use of Webstore",
    body: [
      "You shall not use the Webstore for any purpose other than personal, non-commercial purchases.",
      "You shall not copy, reproduce, distribute, modify, disassemble, decompile or reverse engineer the Webstore.",
    ],
  },
  {
    icon: Lock,
    title: "8. How we use your personal information",
    body: ["We only use your personal information in accordance with our Privacy Policy."],
  },
  {
    icon: ShieldCheck,
    title: "9. Age restriction",
    body: ["You may only purchase Products from the Webstore if you are at least 16 years old."],
  },
  {
    icon: CreditCard,
    title: "10. Order process",
    body: [
      "All sales are processed through our checkout platform. Payment methods, taxes and fees are detailed during checkout.",
      "Orders are subject to these Terms in addition to any publisher terms. In case of conflict, these Terms take priority.",
    ],
    chips: [
      {
        kind: "link",
        label: "checkout.tebex.io",
        href: "https://checkout.tebex.io/",
        icon: ExternalLink,
      },
    ],
  },
  {
    icon: RefreshCw,
    title: "11. Our right to vary these Terms",
    body: [
      "We amend these Terms from time to time. The Terms in force at the time of your order will apply.",
      "If we revise them, we will give you reasonable advance notice and let you know how to cancel if you are not happy with the changes.",
    ],
  },
  {
    icon: Undo2,
    title: "12. Right of Withdrawal for EU Customers",
    body: [
      "EU law provides a right of withdrawal on software sales. This can be excluded for digitally provided content once delivery begins.",
      "The EU statutory right of withdrawal ends 14 days after purchase or when you start downloading the content for the first time, whichever is sooner.",
      "Full detail is provided in Schedule 1 below.",
    ],
  },
  {
    icon: Scale,
    title: "13. Further Rights",
    body: [
      "As a consumer, you have legal rights in relation to Products that are faulty, not as described, or not provided with reasonable skill and care. Advice is available from your local Citizens' Advice Bureau or Trading Standards office.",
    ],
  },
  {
    icon: Truck,
    title: "14. Delivery",
    body: ["Delivery of Products from the Webstore is performed by Us. Contact Us with any queries or issues."],
  },
  {
    icon: Tag,
    title: "15. Price of Products",
    body: [
      "Prices are set by Us and quoted on the Webstore at the time you submit your order.",
      "Changes to prices will not affect orders we have already accepted.",
      "Where chargeable, VAT or similar sales tax will be added to the price.",
    ],
  },
  {
    icon: Wallet,
    title: "16. How to pay",
    body: [
      "Only payment methods specified during checkout can be used.",
      "You represent that you are the authorised user of the card or account associated with payment.",
      "You agree not to use IP proxying or other methods to disguise your place of residence.",
      "Some payment methods may attract additional fees (currency conversion, gateway, originator).",
    ],
  },
  {
    icon: AlertTriangle,
    title: "17. Our liability",
    body: [
      "We are responsible for loss or damage you suffer that is a foreseeable result of our breach or negligence, but not for unforeseeable loss or damage.",
      "We do not exclude or limit liability for death or personal injury caused by our negligence, fraud or fraudulent misrepresentation.",
    ],
  },
  {
    icon: Award,
    title: "18. Affiliated brands",
    body: [
      "We are not affiliated with any third-party brands unless stated below.",
      "List of affiliated brands: Overwolf, Curseforge.",
      "Third-party names, marks and emblems are registered trademarks of their respective owners.",
    ],
  },
  {
    icon: ExternalLink,
    title: "19. Third-Party Sites",
    body: [
      "The Webstore may link to third-party sites or vendors. Any obligation you incur in dealings with them is your responsibility.",
    ],
  },
  {
    icon: Gavel,
    title: "20. Other important terms",
    body: [
      "We may transfer our rights and obligations under these Terms to another organisation without affecting your rights.",
      "You may only transfer your rights or obligations if we agree in writing.",
      "These Terms are governed by English law. The courts of England and Wales have non-exclusive jurisdiction.",
      "Ancillary services (servers, game clients) may be subject to additional third-party terms. Your acceptance or disagreement with those terms does not affect your purchase, and no refunds will be given.",
    ],
  },
  {
    icon: FileText,
    title: "Schedule 1, Right of Withdrawal for EU Customers",
    body: [
      "This Schedule only applies to EU customers.",
      "You have the right to withdraw from any purchase without giving any reason.",
      "For digital content, the withdrawal period expires 14 days after purchase or when downloading begins, whichever is sooner.",
      "To exercise this right, inform Us in writing by email with an unequivocal statement.",
      "We will reimburse all payments without undue delay, no later than 14 days from notification, using the same means of payment as the original transaction.",
      "The statutory right of withdrawal does not apply to digital content where performance has begun with your prior express consent and acknowledgment that you thereby lose this right.",
    ],
  },
];

export function TermsContent() {
  return (
    <div className="space-y-3">
      {sections.map(({ icon: Icon, title, body, chips }) => (
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
          <div className="space-y-1 pl-6">
            {body.map((p, i) =>
              body.length > 1 ? (
                <p
                  key={i}
                  className="relative pl-4 text-[12.5px] leading-relaxed text-white/60 before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:rounded-full before:bg-[#FF3B3B]/70"
                >
                  {p}
                </p>
              ) : (
                <p key={i} className="text-[12.5px] leading-relaxed text-white/60">
                  {p}
                </p>
              ),
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
