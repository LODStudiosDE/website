import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Star,
  ScrollText,
  Mail,
  Search,
  SlidersHorizontal,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminPageHeader, EmptyNotice, Panel, PanelTitle } from "@/components/admin/ui";
import { fetchRecentPurchases } from "@/lib/admin/admin.functions";
import { formatPrice } from "@/lib/cart-store";
import { useAdminSession } from "@/lib/admin/use-admin";
import { useTebexAuth } from "@/lib/tebex-auth";
import { PERMISSIONS, type Permission } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

type Card = {
  to: string;
  title: string;
  desc: string;
  icon: ReactNode;
  perms: Permission[];
};

const CARDS: Card[] = [
  {
    to: "/admin/wishlists",
    title: "Wunschlisten",
    desc: "Sieh, welcher User was gewünscht hat. Entfernen oder gratis verschenken.",
    icon: <Star className="h-5 w-5" />,
    perms: ["wishlist.view"],
  },
  {
    to: "/admin/logs",
    title: "Logs",
    desc: "Käufe, Abos, Ablehnungen und alle Admin-Aktionen lückenlos protokolliert.",
    icon: <ScrollText className="h-5 w-5" />,
    perms: ["logs.view"],
  },
  {
    to: "/admin/contact",
    title: "Kontakt",
    desc: "E-Mails mit Live-Vorschau, Anhängen und KI-Assistent versenden.",
    icon: <Mail className="h-5 w-5" />,
    perms: ["contact.send"],
  },
  {
    to: "/admin/lookup",
    title: "Lookup",
    desc: "Nach Username, Discord oder Tebex-ID suchen und Käufe einsehen.",
    icon: <Search className="h-5 w-5" />,
    perms: ["lookup.view"],
  },
  {
    to: "/admin/management",
    title: "Management",
    desc: "Rückerstattungen, Zahlungen, Coupons, Giftcards, Rollen & CFX-IDs.",
    icon: <SlidersHorizontal className="h-5 w-5" />,
    perms: [
      "management.refund",
      "management.payment",
      "coupon.view",
      "giftcard.view",
      "roster.view",
      "roles.view",
    ],
  },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function RecentPurchases({ basketIdent }: { basketIdent: string }) {
  const query = useQuery({
    queryKey: ["admin-recent-purchases", basketIdent],
    queryFn: () => fetchRecentPurchases({ data: { basketIdent } }),
    refetchInterval: 30_000,
  });
  const purchases = query.data?.purchases ?? [];

  return (
    <Panel className="mb-8">
      <PanelTitle
        icon={<ShoppingBag className="h-5 w-5" />}
        title="Letzte Käufe"
        sub="Die neuesten Käufe im Shop, inklusive manuell erstellter Zahlungen."
        right={
          <Link
            to="/admin/logs"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF3B3B] hover:underline"
          >
            Alle Logs
          </Link>
        }
      />
      {query.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
      ) : query.isError ? (
        <EmptyNotice>Käufe konnten nicht geladen werden.</EmptyNotice>
      ) : purchases.length === 0 ? (
        <EmptyNotice>Noch keine Käufe vorhanden.</EmptyNotice>
      ) : (
        <ul className="divide-y divide-white/5">
          {purchases.map((p, i) => (
            <li key={`${p.txnId}-${i}`} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{p.packageName}</p>
                <p className="truncate text-[11px] text-white/40">
                  {p.buyer} · {formatDateTime(p.date)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-[#FF3B3B]">
                {p.amount != null ? formatPrice(p.amount, p.currency) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AdminOverview() {
  const { session, can } = useAdminSession();
  const { user } = useTebexAuth();
  const name = user?.username?.trim() || session.roleLabel || "Admin";
  const grantedCount =
    session.permissions === "*" ? PERMISSIONS.length : session.permissions.length;

  const cards = CARDS.filter((c) => c.perms.some((p) => can(p)));
  const basketIdent = user?.basketIdent;

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Panel"
        title={`Willkommen zurück, ${name}`}
        subtitle="Zentrale Steuerung für Support, Management und Founder."
        icon={<LayoutDashboard className="h-5 w-5" />}
      />

      <Panel className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-[#FF3B3B]/30 bg-[#FF3B3B]/10 text-[#FF3B3B]">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
                Deine Rolle
              </div>
              <div className="font-display text-xl font-bold text-white">
                {session.roleLabel ?? "Admin"}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-bold text-white">
              {session.permissions === "*" ? "Alle" : grantedCount}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
              Berechtigungen
            </div>
          </div>
        </div>
      </Panel>

      {(can("logs.view") || can("lookup.view")) && basketIdent && (
        <RecentPurchases basketIdent={basketIdent} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-[#FF3B3B]/30 hover:bg-white/[0.04]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-[#FF3B3B] transition-colors group-hover:border-[#FF3B3B]/30">
              {card.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-white">{card.title}</h3>
                <ArrowRight className="h-4 w-4 -translate-x-1 text-white/30 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-white/45">{card.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
