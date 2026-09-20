import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag,
  Star,
  Heart,
  BookOpen,
  Youtube,
  Mail,
  ExternalLink,
  ArrowRight,
  ShoppingCart,
  Trash2,
  LogIn,
  ShieldCheck,
  Clock,
  Users,
  MapPin,
} from "lucide-react";
import { notify as toast } from "@/components/Notify";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { showCartToast } from "@/components/CartToast";
import { useCart } from "@/lib/cart-store";
import { useWishlist, type WishlistItem } from "@/lib/wishlist-store";
import { useTebexAuth } from "@/lib/tebex-auth";
import {
  getMySubscription,
  revokeMySubscription,
} from "@/lib/subscription.functions";
import {
  fetchTebexProfile,
  type ProfileCategory,
  type ProfilePurchase,
  type ProfileResult,
} from "@/lib/tebex-account.functions";
import { formatPrice } from "@/lib/cart-store";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "LODStudios | Profile" },
      { name: "description", content: "Deine Käufe und aktiven Abos bei LODStudios." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

type Tr = ReturnType<typeof useT>;

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function formatSince(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "seit heute";
  if (days === 1) return "seit 1 Tag";
  if (days < 30) return `seit ${days} Tagen`;
  const months = Math.floor(days / 30);
  if (months === 1) return "seit 1 Monat";
  if (months < 12) return `seit ${months} Monaten`;
  const years = Math.floor(months / 12);
  return years === 1 ? "seit 1 Jahr" : `seit ${years} Jahren`;
}

function EmailSection() {
  const t = useT();
  const { user } = useTebexAuth();
  const qc = useQueryClient();
  const basketIdent = user?.basketIdent;

  const subQuery = useQuery({
    queryKey: ["my-subscription", basketIdent],
    queryFn: () => getMySubscription({ data: { basketIdent: basketIdent! } }),
    enabled: !!basketIdent,
    staleTime: 30_000,
  });

  const revokeMut = useMutation({
    mutationFn: () => revokeMySubscription({ data: { basketIdent: basketIdent! } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(t("profile.emailRevoked"));
        void qc.invalidateQueries({ queryKey: ["my-subscription", basketIdent] });
      } else {
        toast.error(t("profile.emailRevokeFailed"));
      }
    },
    onError: () => toast.error(t("profile.emailRevokeFailed")),
  });

  const sub = subQuery.data;

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
          <Mail className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-white">E-Mail</h2>
          <p className="truncate text-xs text-white/40">
            Deine hinterlegte Adresse für Updates & Neuigkeiten.
          </p>
        </div>
      </div>

      {subQuery.isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-white/5" />
      ) : sub ? (
        <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="truncate font-medium text-white">{sub.email}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                hinterlegt am {formatDateTime(sub.at)}
              </span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/60">
                {formatSince(sub.at)}
              </span>
            </div>
          </div>
          <button
            onClick={() => revokeMut.mutate()}
            disabled={revokeMut.isPending}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#FF3B3B]/40 px-4 py-2.5 text-sm font-semibold text-[#FF3B3B] transition hover:bg-[#FF3B3B]/10 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {revokeMut.isPending ? "Wird widerrufen…" : "E-Mail widerrufen"}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-white/60">
            Du hast noch keine E-Mail hinterlegt.
          </p>
          <p className="mt-1 text-xs text-white/40">
            Trage sie unten auf der Startseite im Newsletter-Feld ein, um Updates zu erhalten.
          </p>
        </div>
      )}
    </>
  );
}

function ProfilePage() {
  const t = useT();
  const { user, isAuthed, login, loading } = useTebexAuth();

  const profileQuery = useQuery({
    queryKey: ["tebex-profile", user?.basketIdent],
    queryFn: () => fetchTebexProfile({ data: { basketIdent: user!.basketIdent } }),
    enabled: !!user?.basketIdent,
    staleTime: 60_000,
    // Free / created payments come from the full store history, which may still
    // be loading right after a server start: ask again until it is complete.
    refetchInterval: (query) =>
      query.state.data?.purchasesPending && query.state.dataUpdateCount < 10 ? 3_000 : false,
  });

  const data = profileQuery.data;

  if (!isAuthed) {
    return (
      <div className="relative min-h-screen bg-[#0A0A0B] text-white">
        <Navigation />
        <main className="mx-auto flex max-w-[900px] flex-col items-center justify-center gap-6 px-6 pb-24 pt-40 text-center">
          <h1 className="font-display text-[clamp(2rem,3.5vw,2.75rem)] font-bold tracking-tight">
            {t("profile.title")}
          </h1>
          <p className="max-w-sm text-white/60">{t("profile.loginRequired")}</p>
          <button
            onClick={() => void login()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF3B3B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ff5252] disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {loading ? t("nav.loggingIn") : t("nav.login")}
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const username = user?.username ?? "";

  return (
    <div className="relative min-h-screen bg-[#0A0A0B] text-white">
      <Navigation />

      <main className="mx-auto w-full max-w-[1080px] px-5 pb-24 pt-32 lg:px-8 lg:pt-36">
        <header className="mb-8">
          <p className="text-sm font-semibold text-[#FF3B3B]">{t("profile.welcome")},</p>
          <h1 className="mt-1 font-headline text-3xl text-white sm:text-4xl">{username}</h1>
          <p className="mt-2 max-w-md text-sm text-white/45">{t("profile.welcomeSub")}</p>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Referral program */}
          <section className="lg:col-span-2">
            <Link
              to="/referral"
              className="group flex flex-col gap-4 rounded-2xl border border-[#FF3B3B]/20 bg-gradient-to-br from-[#FF3B3B]/[0.08] to-transparent p-6 transition duration-300 hover:border-[#FF3B3B]/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
                  <Users className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-white">Empfehlungsprogramm</h2>
                  <p className="text-sm text-white/45">
                    Lade neue Creator ein und schalte exklusive Map-Belohnungen frei.
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#FF3B3B] px-4 py-2.5 text-sm font-semibold text-white transition group-hover:bg-[#ff5252]">
                <MapPin className="h-4 w-4" />
                Zum Programm
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </section>

          {/* Subscriptions (active/inactive) */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 lg:col-span-2">
            <CardHeader
              accent
              icon={<Star className="h-[18px] w-[18px]" />}
              title={t("profile.subsTitle")}
              sub={t("profile.subsSub")}
              actionLabel={t("profile.viewAllSubs")}
            />
            {profileQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : (data?.categories.length ?? 0) > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data!.categories.map((cat) => (
                  <CategoryCard key={cat.id} cat={cat} label={t} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Star className="h-7 w-7" />}
                title={t("profile.noSubscription")}
                text={t("profile.subsEmptyHint")}
                button={t("profile.discoverSubs")}
              />
            )}
          </section>

          {/* Recent purchases */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <CardHeader
              icon={<ShoppingBag className="h-[18px] w-[18px]" />}
              title={t("profile.recentPurchases")}
              sub={t("profile.recentSub")}
              actionLabel={t("profile.viewAllPurchases")}
              actionTo="/purchases"
            />
            <PurchasesList query={profileQuery} data={data} label={t} />
          </section>

          {/* Wishlist */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <CardHeader
              accent
              icon={<Heart className="h-[18px] w-[18px]" />}
              title={t("profile.wishlist")}
              sub={t("profile.wishlistSub")}
              actionLabel={t("profile.toWishlist")}
              actionTo="/wishlist"
            />
            <WishlistList label={t} />
          </section>

          {/* E-Mail subscription */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 lg:col-span-2">
            <EmailSection />
          </section>

          {/* Support & links */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 lg:col-span-2">
            <CardHeader
              icon={<BookOpen className="h-[18px] w-[18px]" />}
              title={t("profile.support")}
              sub={t("profile.supportSub")}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <SupportLink
                href="https://discord.gg/lodstudio"
                icon={<DiscordIcon className="h-[18px] w-[18px]" />}
                label="Discord"
                color="text-[#5865F2]"
              />
              <SupportLink
                href="https://www.youtube.com/@LODStudios"
                icon={<Youtube className="h-[18px] w-[18px]" />}
                label="YouTube"
                color="text-[#FF0000]"
              />
              <SupportLink
                href="mailto:contact.lodstudios@gmail.com"
                icon={<Mail className="h-[18px] w-[18px]" />}
                label="E-Mail"
                color="text-[#FF3B3B]"
              />
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function CardHeader({
  icon,
  title,
  sub,
  actionLabel,
  actionTo = "/store",
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  actionLabel?: string;
  actionTo?: "/store" | "/wishlist" | "/purchases";
  accent?: boolean;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${
            accent
              ? "bg-[#FF3B3B]/12 text-[#FF3B3B] ring-[#FF3B3B]/20"
              : "bg-white/5 text-white/70 ring-white/10"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-white">{title}</h2>
          <p className="truncate text-xs text-white/40">{sub}</p>
        </div>
      </div>
      {actionLabel ? (
        <Link
          to={actionTo}
          className="hidden shrink-0 items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-[#FF3B3B]/40 hover:text-white sm:inline-flex"
        >
          {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function CategoryCard({ cat, label }: { cat: ProfileCategory; label: Tr }) {
  return (
    <div className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition duration-300 hover:border-[#FF3B3B]/30 hover:bg-white/[0.05]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-display font-bold text-white">{cat.name}</span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
            cat.active
              ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25"
              : "bg-white/5 text-white/40 ring-1 ring-inset ring-white/10"
          }`}
        >
          {cat.active ? label("profile.active") : label("profile.inactive")}
        </span>
      </div>
      {cat.active ? (
        <>
          <p className="text-sm font-medium text-white">
            {cat.packageName ?? cat.name}
          </p>
          <p className="mb-3 text-xs text-white/40">
            {cat.nextPaymentDate
              ? `${label("profile.nextPayment")}: ${formatDateTime(cat.nextPaymentDate)}`
              : cat.amount != null
                ? formatPrice(cat.amount, cat.currency ?? "EUR")
                : ""}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-white/60">{label("profile.noActivePlan")}</p>
          <p className="mb-3 text-xs text-white/40">
            {label("profile.unlock").replace("{name}", cat.name)}
          </p>
        </>
      )}
      <Link
        to="/store"
        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-xs font-semibold text-white/80 transition group-hover:border-[#FF3B3B]/50 hover:bg-[#FF3B3B]/10 hover:text-white"
      >
        {label("profile.viewPlans")}
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function PurchasesList({
  query,
  data,
  label,
}: {
  query: { isLoading: boolean };
  data: ProfileResult | undefined;
  label: Tr;
}) {
  if (query.isLoading) return <SkeletonCard />;
  if (!data?.purchasesConfigured)
    return (
      <EmptyState
        icon={<ShoppingBag className="h-7 w-7" />}
        title={label("profile.purchasesUnavailable")}
      />
    );
  if (data.purchases.length === 0)
    return (
      <EmptyState
        icon={<ShoppingBag className="h-7 w-7" />}
        title={label("profile.noPurchase")}
        text={label("profile.purchasesEmptyHint")}
        button={label("profile.discoverProducts")}
      />
    );

  return (
    <ul className="flex flex-col divide-y divide-white/5">
      {data.purchases.slice(0, 5).map((p, i) => (
        <PurchaseRow key={`${p.txnId}-${i}`} purchase={p} />
      ))}
    </ul>
  );
}

function PurchaseRow({ purchase }: { purchase: ProfilePurchase }) {
  const t = useT();
  // Payments created in the Tebex panel often carry no package: name the
  // payment method instead of showing a dash.
  const title =
    purchase.products.length > 0 ? purchase.products.join(", ") : (purchase.method ?? "—");
  const flagged = purchase.status && !/^complete$/i.test(purchase.status) ? purchase.status : null;
  return (
    <li className="flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-white/[0.03]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/10 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/15">
        <ShoppingBag className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        <p className="truncate text-[11px] text-white/40">
          {formatDateTime(purchase.date)} · {purchase.txnId || "—"}
          {flagged ? ` · ${flagged}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-[#FF3B3B]">
        {purchase.amount == null
          ? "—"
          : purchase.amount === 0
            ? t("cart.free")
            : formatPrice(purchase.amount, purchase.currency ?? "EUR")}
      </span>
    </li>
  );
}

function WishlistList({ label }: { label: Tr }) {
  const { items, removeItem, identity } = useWishlist();
  const { addItem } = useCart();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-7 w-7" />}
        title={label("profile.wishlistEmpty")}
        text={label("profile.wishlistEmptyHint")}
        button={label("profile.discoverItems")}
      />
    );
  }

  const buy = (item: WishlistItem) => {
    addItem({
      id: item.id,
      name: item.name,
      image: item.image,
      category: item.category,
      unitPrice: item.basePrice,
      taxPerUnit: item.taxPerUnit,
      currency: item.currency,
    });
    showCartToast({
      name: item.name,
      image: item.image,
      category: item.category,
      unitPrice: item.price,
      currency: item.currency,
    });
  };

  return (
    <>
      {identity ? (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/55">
          <span className="font-semibold text-white/75">{identity.username}</span>
          <span className="mx-2 text-white/30">•</span>
          <span>CFX {identity.cfxId}</span>
        </div>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.slice(0, 5).map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
        >
          <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {item.image ? (
              <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-white/30">
                <Heart className="h-5 w-5" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{item.name}</p>
            <p className="truncate text-[11px] text-white/40">
              {item.category}
              {item.addedAt ? ` · ${formatDateTime(item.addedAt)}` : ""}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[#FF3B3B]">
              {formatPrice(item.price, item.currency)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => buy(item)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF3B3B] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#D63030]"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {label("profile.wishlistBuy")}
            </button>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label={label("profile.wishlistRemoveItem")}
              title={label("profile.wishlistRemoveItem")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:border-red-500/40 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </li>
        ))}
      </ul>
    </>
  );
}

function SupportLink({
  href,
  icon,
  label,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition duration-300 hover:border-white/25 hover:bg-white/[0.05]"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 transition duration-300 group-hover:scale-105 ${color}`}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium text-white/80 group-hover:text-white">
        {label}
      </span>
      <ExternalLink className="h-4 w-4 text-white/30 transition group-hover:text-white/70" />
    </a>
  );
}

function EmptyState({
  icon,
  title,
  text,
  button,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  button?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
        {icon}
      </span>
      <p className="font-display text-base font-bold text-white">{title}</p>
      {text ? (
        <p className="max-w-xs text-xs leading-relaxed text-white/45">{text}</p>
      ) : null}
      {button ? (
        <Link
          to="/store"
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#FF3B3B] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#ff5252]"
        >
          {button}
        </Link>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-32 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
  );
}

