import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Star,
  ScrollText,
  Mail,
  Search,
  SlidersHorizontal,
  Shield,
  LogIn,
  LogOut,
  ArrowLeft,
  Gift,
  Handshake,
} from "lucide-react";
import type { ReactNode } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import type { Permission } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "LODStudios | Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  perms: Permission[]; // visible if the user holds ANY of these
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Übersicht", icon: <LayoutDashboard className="h-[18px] w-[18px]" />, perms: [] },
  {
    to: "/admin/wishlists",
    label: "Wunschlisten",
    icon: <Star className="h-[18px] w-[18px]" />,
    perms: ["wishlist.view"],
  },
  {
    to: "/admin/referrals",
    label: "Empfehlungen",
    icon: <Gift className="h-[18px] w-[18px]" />,
    perms: ["referral.view"],
  },
  {
    to: "/admin/partners",
    label: "Partner",
    icon: <Handshake className="h-[18px] w-[18px]" />,
    perms: ["partners.view"],
  },
  {
    to: "/admin/logs",
    label: "Logs",
    icon: <ScrollText className="h-[18px] w-[18px]" />,
    perms: ["logs.view"],
  },
  {
    to: "/admin/contact",
    label: "Kontakt",
    icon: <Mail className="h-[18px] w-[18px]" />,
    perms: ["contact.send"],
  },
  {
    to: "/admin/lookup",
    label: "Lookup",
    icon: <Search className="h-[18px] w-[18px]" />,
    perms: ["lookup.view"],
  },
  {
    to: "/admin/management",
    label: "Management",
    icon: <SlidersHorizontal className="h-[18px] w-[18px]" />,
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

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#0A0A0B] text-white">
      <Navigation />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 pb-24 pt-32 lg:px-8 lg:pt-36">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAuthed, login, logout, user, loading: authLoading } = useTebexAuth();
  const { isAdmin, loading, can, session } = useAdminSession();

  if (!isAuthed) {
    return (
      <Shell>
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-20 text-center">
          <Shield className="h-10 w-10 text-[#FF3B3B]" strokeWidth={1.5} />
          <h1 className="font-display text-2xl font-bold">Admin-Bereich</h1>
          <p className="text-sm text-white/45">
            Bitte melde dich mit deinem FiveM-Account an, um fortzufahren.
          </p>
          <button
            onClick={login}
            disabled={authLoading}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-5 text-[12px] font-bold uppercase tracking-[0.14em] text-white/80 transition-all hover:border-white/25 hover:text-white disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" /> Anmelden
          </button>
        </div>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#FF3B3B]" />
        </div>
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg py-16 sm:py-20">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center sm:p-10">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#FF3B3B]/25 bg-[#FF3B3B]/10 text-[#FF3B3B]">
              <Shield className="h-7 w-7" strokeWidth={1.5} />
            </span>

            <div className="mt-6 text-[11px] font-bold uppercase tracking-[0.25em] text-[#FF3B3B]">
              Geschützter Bereich
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              Zugriff nicht freigegeben
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/50">
              Der Verwaltungsbereich ist autorisierten Teammitgliedern vorbehalten. Für dieses
              Konto ist aktuell keine Berechtigung hinterlegt.
            </p>

            {user?.username && (
              <div className="mx-auto mt-6 flex max-w-xs items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-left">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    Angemeldet als
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-white">
                    {user.username}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/45">
                  Ohne Freigabe
                </span>
              </div>
            )}

            <div className="mt-7 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row">
              <Link
                to="/"
                className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-r from-[#FF3B3B] to-[#C72C2C] px-5 text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-[filter] hover:brightness-110"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" /> Zur Startseite
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.04] px-5 text-[12px] font-bold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/25 hover:text-white"
              >
                <LogOut className="h-4 w-4 shrink-0" /> Konto wechseln
              </button>
            </div>

            <p className="mt-7 border-t border-white/[0.06] pt-5 text-xs leading-relaxed text-white/35">
              Sie benötigen Zugriff für Ihre Tätigkeit im Team? Die Freigabe erfolgt intern durch
              die Administration.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const visible = NAV.filter((n) => n.perms.length === 0 || n.perms.some((p) => can(p)));

  return (
    <Shell>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        {/* Sidebar */}
        <aside className="lg:w-60 lg:shrink-0">
          <div className="mb-4 flex items-center gap-2.5 px-1">
            <Shield className="h-4 w-4 text-[#FF3B3B]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
              {session.roleLabel ?? "Admin"}
            </span>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {visible.map((item) => {
              const active =
                item.to === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition-all duration-200 ${
                    active
                      ? "border-[#FF3B3B]/30 bg-[#FF3B3B]/10 text-white"
                      : "border-transparent text-white/50 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <span className={active ? "text-[#FF3B3B]" : ""}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </Shell>
  );
}
