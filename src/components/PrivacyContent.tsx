import { useState } from "react";
import {
  ShieldCheck,
  Info,
  Database,
  Workflow,
  Settings2,
  Share2,
  Globe2,
  Lock,
  Clock,
  Scale,
  BookOpen,
  Mail,
  FileText,
  Hash,
  ExternalLink,
  ArrowUpRight,
  Check,
  Copy,
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
    icon: ShieldCheck,
    title: "Introduction",
    body: [
      "Tebex Limited respects your privacy and is committed to protecting your personal data. This privacy notice informs you how we look after your personal data when you visit our website (regardless of where you visit it from) and tells you about your privacy rights and how the law protects you.",
      "Please also use the Glossary at the bottom to understand the meaning of some of the terms used in this notice.",
    ],
  },
  {
    icon: Info,
    title: "1. Important information and who we are",
    body: [
      "This notice covers how Tebex Limited collects and processes your personal data through www.tebex.io and www.buycraft.net, and any third-party Webstore using the Tebex Platform.",
      "This website is not intended for children and we do not knowingly collect data relating to children. We encourage minors to consult with a parent or guardian before submitting any information.",
      "Tebex Limited is the controller responsible for your personal data. A data privacy manager has been appointed to oversee questions in relation to this notice.",
      "Registered office: Levy Cohen & Co, 5.2 Central House, 1 Ballards Lane, London, N3 1LQ. Data privacy manager: Liam Wiltshire.",
      "You have the right to make a complaint at any time to the Information Commissioner's Office (ICO), but we would appreciate the chance to deal with your concerns first.",
      "This version was last updated on 11 May 2018.",
    ],
    chips: [
      { kind: "copy", label: "Company No. 08129184", value: "08129184", icon: FileText },
      {
        kind: "copy",
        label: "liam.wiltshire@overwolf.com",
        value: "liam.wiltshire@overwolf.com",
        icon: Mail,
      },
      { kind: "link", label: "ico.org.uk", href: "https://www.ico.org.uk", icon: ExternalLink },
    ],
  },
  {
    icon: Database,
    title: "2. The data we collect about you",
    body: [
      "Personal data means any information about an individual from which that person can be identified. It does not include anonymous data.",
      "Identity Data: first name, last name, username or similar identifier.",
      "Contact Data: billing address, delivery address, email address and telephone numbers.",
      "Transaction Data: details about payments to and from you, and details of products purchased.",
      "Technical Data: IP address, login data, browser type and version, time zone, location, OS and platform.",
      "Profile Data: username and password, purchases or orders, and account preferences.",
      "Usage Data: information about how you use our website, products and services.",
      "Marketing and Communications Data: your preferences in receiving marketing and communications.",
      "Aggregated Data such as statistical or demographic data may be derived from personal data but is not considered personal data in law.",
      "We do not collect Special Categories of Personal Data (race, religion, sex life, political opinions, health, biometric data) or information about criminal convictions and offences.",
      "Where we need to collect personal data by law or under contract and you fail to provide it, we may not be able to perform the contract with you.",
    ],
  },
  {
    icon: Workflow,
    title: "3. How is your personal data collected?",
    body: [
      "Direct interactions: you provide Identity and Contact Data by filling in forms, creating an account, subscribing to updates, requesting marketing, contacting us via social media, participating in live chat, reporting problems or giving feedback.",
      "Automated technologies: as you interact with our website we automatically collect Technical Data via cookies, server logs and similar technologies.",
      "Third parties or public sources: Technical Data from analytics providers such as Google and Cloudflare, as well as Contact, Financial and Transaction Data from payment and delivery partners such as Help Scout and Braintree.",
    ],
    chips: [
      {
        kind: "link",
        label: "tebex.io/legal/cookie",
        href: "https://www.tebex.io/legal/cookie",
        icon: ExternalLink,
      },
    ],
  },
  {
    icon: Settings2,
    title: "4. How we use your personal data",
    body: [
      "We will only use your personal data when the law allows us to. Most commonly: to perform a contract with you, for our legitimate interests (where your interests do not override them), or to comply with a legal obligation.",
      "We do not generally rely on consent except for third-party direct marketing via email. You can withdraw consent to marketing at any time.",
      "Purposes include: registering you as a customer; processing and delivering orders, payments and refunds; managing our relationship with you; administering and protecting our business and website; responding to regulatory enquiries; delivering relevant content and advertising; analytics to improve our services; making recommendations; and generating anonymised audience insights.",
      "You can adjust your marketing preferences from your account preference centre, or by clicking the opt-out link on any marketing message.",
      "We will get your express opt-in consent before sharing your personal data with any third parties outside the Tebex group or Webstore partner community for marketing purposes.",
      "You can refuse cookies in your browser settings, but some parts of this website may become inaccessible or stop functioning correctly.",
    ],
  },
  {
    icon: Share2,
    title: "5. Disclosures of your personal data",
    body: [
      "We may share your personal data with Internal Third Parties (other Tebex group companies), External Third Parties (service providers, professional advisers, regulators), and specific third parties such as Webstore partners and Amazon Web Services.",
      "We may also share data with parties to whom we sell, transfer or merge parts of our business.",
      "We require all third parties to respect the security of your personal data and only process it on our instructions for specified purposes.",
      "We may share anonymised and aggregated data with advertising platforms, analytics providers, and commercial partners. This data cannot identify any individual.",
    ],
  },
  {
    icon: Globe2,
    title: "6. International transfers",
    body: [
      "Many of our external third parties are based outside the European Economic Area (EEA), so their processing involves a transfer of data outside the EEA.",
      "Whenever we transfer your personal data out of the EEA we ensure a similar degree of protection by transferring only to countries deemed adequate by the European Commission, or by using Standard Contractual Clauses approved by the European Commission.",
    ],
  },
  {
    icon: Lock,
    title: "7. Data security",
    body: [
      "We have appropriate security measures in place to prevent your personal data from being accidentally lost, used, accessed, altered or disclosed in an unauthorised way.",
      "Access to your personal data is limited to those employees, agents, contractors and third parties who have a business need to know, and they are subject to a duty of confidentiality.",
      "You can help us protect your data: never confirm bank or card details in email, keep passwords private, avoid personal data in passwords, and change them regularly.",
      "We have procedures in place to deal with any suspected personal data breach and will notify you and the applicable regulator where legally required.",
    ],
  },
  {
    icon: Clock,
    title: "8. Data retention",
    body: [
      "We only retain personal data for as long as necessary to fulfil the purposes we collected it for, including legal, accounting or reporting requirements.",
      "By law we have to keep basic information about our customers (Contact, Identity, Financial and Transaction Data) for up to 10 years after they cease being customers, for tax purposes.",
      "In some circumstances we may anonymise your personal data so it can no longer be associated with you, in which case we may use this information indefinitely without further notice.",
    ],
  },
  {
    icon: Scale,
    title: "9. Your legal rights",
    body: [
      "Under data protection laws, you have the right to: request access to your personal data; request correction; request erasure; object to processing; request restriction of processing; request transfer of your data; and withdraw consent where we rely on it.",
      "You will not have to pay a fee to access your personal data or to exercise any other rights. However, we may charge a reasonable fee, or refuse to comply, if a request is clearly unfounded, repetitive or excessive.",
      "We may need to request specific information from you to confirm your identity. We try to respond to all legitimate requests within one month.",
    ],
  },
  {
    icon: BookOpen,
    title: "10. Glossary",
    body: [
      "Legitimate Interest: our interest in conducting and managing our business to give you the best service and experience, balanced against your rights and freedoms.",
      "Performance of Contract: processing your data where necessary for performing a contract with you or taking steps before entering one.",
      "Comply with a legal or regulatory obligation: processing your personal data to comply with a legal or regulatory obligation we are subject to.",
      "Aggregated Data: information derived from personal data but grouped and processed to prevent identification of individuals.",
      "Internal Third Parties: other companies in the Tebex group acting as joint controllers.",
      "External Third Parties: service providers, suppliers, professional advisers, and regulators such as HM Revenue & Customs.",
    ],
    chips: [
      { kind: "copy", label: "VAT GB 167 189 962", value: "GB167189962", icon: Hash },
    ],
  },
];

export function PrivacyContent() {
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
