import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogIn, ShoppingBag } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useTebexAuth } from "@/lib/tebex-auth";
import {
  fetchTebexProfile,
  type ProfilePurchase,
} from "@/lib/tebex-account.functions";
import { formatPrice } from "@/lib/cart-store";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/purchases")({
  head: () => ({
    meta: [
      { title: "LODStudios | Purchases" },
      { name: "description", content: "Deine Käufe bei LODStudios." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PurchasesPage,
});

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function PurchasesPage() {
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
      <div className="relative flex min-h-screen flex-col bg-[#0A0A0B] text-white">
        <Navigation />
        <main className="mx-auto flex max-w-[900px] flex-1 flex-col items-center justify-center gap-6 px-6 pb-24 pt-40 text-center">
          <h1 className="font-display text-[clamp(2rem,3.5vw,2.75rem)] font-bold tracking-tight">
            {t("profile.recentPurchases")}
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

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0A0A0B] text-white">
      <Navigation />

      <main className="mx-auto w-full max-w-[880px] flex-1 px-5 pb-24 pt-32 lg:px-8 lg:pt-36">
        <Link
          to="/profile"
          className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("profile.title")}
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-headline text-3xl text-white sm:text-4xl">
              {t("profile.recentPurchases")}
            </h1>
            <p className="mt-1 text-sm text-white/45">{t("profile.recentSub")}</p>
          </div>
        </header>

        {profileQuery.isLoading ? (
          <div className="h-32 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
        ) : !data?.purchasesConfigured ? (
          <EmptyBox title={t("profile.purchasesUnavailable")} />
        ) : data.purchases.length === 0 ? (
          <EmptyBox
            title={t("profile.noPurchase")}
            text={t("profile.purchasesEmptyHint")}
            button={t("profile.discoverProducts")}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-white/5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2">
            {data.purchases.slice(0, 5).map((p, i) => (
              <PurchaseRow key={`${p.txnId}-${i}`} purchase={p} />
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}

function PurchaseRow({ purchase }: { purchase: ProfilePurchase }) {
  return (
    <li className="flex items-center gap-4 px-2 py-4 transition hover:bg-white/[0.02]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/10 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/15">
        <ShoppingBag className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {purchase.products.length > 0 ? purchase.products.join(", ") : "—"}
        </p>
        <p className="truncate text-[11px] text-white/40">
          {formatDateTime(purchase.date)} · {purchase.txnId || "—"}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-[#FF3B3B]">
        {purchase.amount != null
          ? formatPrice(purchase.amount, purchase.currency ?? "EUR")
          : "—"}
      </span>
    </li>
  );
}

function EmptyBox({
  title,
  text,
  button,
}: {
  title: string;
  text?: string;
  button?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
        <ShoppingBag className="h-7 w-7" />
      </span>
      <p className="font-display text-lg font-bold text-white">{title}</p>
      {text ? (
        <p className="max-w-xs text-sm leading-relaxed text-white/45">{text}</p>
      ) : null}
      {button ? (
        <Link
          to="/store"
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#FF3B3B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D63030]"
        >
          {button}
        </Link>
      ) : null}
    </div>
  );
}
