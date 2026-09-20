import { useEffect, useRef, useState } from "react";
import { ShoppingCart, User, Users, Youtube, LogOut, ChevronDown, Shield } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { RegionPicker } from "@/components/RegionPicker";
import { useCart } from "@/lib/cart-store";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import { useT } from "@/lib/i18n";

const navItems: { key: string; to: "/" | "/store" | "/team" | "/jobs" }[] = [
  { key: "nav.home", to: "/" },
  { key: "nav.store", to: "/store" },
  { key: "nav.team", to: "/team" },
  { key: "nav.jobs", to: "/jobs" },
];

const socialClass =
  "grid h-10 w-10 place-items-center border border-white/10 bg-white/[0.04] text-white/50 transition-all duration-300 hover:border-[#FF3B3B]/60 hover:bg-[#FF3B3B]/10 hover:text-[#FF3B3B]";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function Navigation() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { count } = useCart();
  const { user, isAuthed, loading, login, logout } = useTebexAuth();
  const { isAdmin } = useAdminSession();
  const t = useT();

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-[110px] max-w-[1720px] items-center justify-between px-6 lg:px-12">
        {/* Left: logo + socials */}
        <div className="flex items-center gap-5">
          <Link to="/" className="group focus:outline-none">
            <img
              src="/lod-studios-logo.png"
              alt="LOD Studios"
              className="h-14 w-auto object-contain transition-opacity duration-300 group-hover:opacity-80"
              draggable={false}
            />
          </Link>

          <span
            aria-hidden
            className="hidden h-9 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent sm:block"
          />

          <div className="hidden items-center gap-2 sm:flex">
            <a
              href="https://www.youtube.com/@LODStudios"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
              className={socialClass}
            >
              <Youtube className="h-[16px] w-[16px]" strokeWidth={1.8} />
            </a>
            <a
              href="https://discord.gg/lodstudio"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className={socialClass}
            >
              <DiscordIcon className="h-[15px] w-[15px]" />
            </a>
          </div>
        </div>

        {/* Center nav */}
        <nav className="hidden flex-1 items-center justify-center gap-10 lg:flex">
          {navItems.map((item) => {
            const active =
              (item.to === "/" && pathname === "/") ||
              (item.to !== "/" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.key}
                to={item.to}
                className={`group relative py-2 text-[13px] font-bold uppercase tracking-[0.18em] transition-colors duration-300 ${
                  active ? "text-white" : "text-white/45 hover:text-white"
                }`}
              >
                {t(item.key)}
                <span
                  aria-hidden
                  className={`absolute -bottom-1 left-0 h-[2px] bg-[#FF3B3B] transition-transform duration-300 ${
                    active ? "w-full scale-x-100" : "w-full scale-x-0 group-hover:scale-x-100"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <RegionPicker />

          {isAuthed ? (
            <ProfileMenu
              username={user?.username ?? ""}
              isAdmin={isAdmin}
              onLogout={logout}
              profileLabel={t("profile.title")}
              logoutLabel={t("nav.logout")}
            />
          ) : (
            <button
              onClick={login}
              disabled={loading}
              className="hidden h-11 items-center gap-2 border border-white/10 bg-white/[0.04] px-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:flex"
            >
              <User className="h-[15px] w-[15px]" strokeWidth={2} />
              {loading ? t("nav.loggingIn") : t("nav.login")}
            </button>
          )}

          <Link
            to="/cart"
            aria-label={t("nav.cart")}
            className="group relative flex h-11 items-center gap-2.5 overflow-hidden border border-white/10 bg-gradient-to-r from-[#FF3B3B] to-[#C72C2C] px-5 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_8px_28px_-12px_rgba(255,59,59,0.5)] transition-transform duration-300 hover:scale-[1.03]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <ShoppingCart className="relative h-[15px] w-[15px]" strokeWidth={2.2} />
            <span className="relative">{count}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function ProfileMenu({
  username,
  isAdmin,
  onLogout,
  profileLabel,
  logoutLabel,
}: {
  username: string;
  isAdmin: boolean;
  onLogout: () => void;
  profileLabel: string;
  logoutLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-11 items-center gap-2 border bg-white/[0.04] pl-4 pr-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80 transition-all duration-300 hover:text-white ${
          open ? "border-[#FF3B3B]/60" : "border-white/10 hover:border-white/25"
        }`}
      >
        <User className="h-[15px] w-[15px] text-[#FF3B3B]" strokeWidth={2} />
        <span className="max-w-[140px] truncate normal-case tracking-normal">{username}</span>
        <ChevronDown
          className={`h-[14px] w-[14px] text-white/40 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 border border-white/10 bg-[#0C0C0D]/95 p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        >
          <Link
            to="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 text-[12px] font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <User className="h-[15px] w-[15px] text-[#FF3B3B]" strokeWidth={2} />
            {profileLabel}
          </Link>

          <Link
            to="/referral"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 text-[12px] font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Users className="h-[15px] w-[15px] text-[#FF3B3B]" strokeWidth={2} />
            Empfehlungen
          </Link>

          {isAdmin && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-[12px] font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <Shield className="h-[15px] w-[15px] text-[#FF3B3B]" strokeWidth={2} />
              Admin
            </Link>
          )}

          <div className="my-1 h-px bg-white/[0.08]" />

          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-[12px] font-semibold text-white/60 transition-colors hover:bg-[#FF3B3B]/10 hover:text-[#FF3B3B]"
          >
            <LogOut className="h-[15px] w-[15px]" strokeWidth={2} />
            {logoutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
