import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  
  Zap,
  Truck,
  CreditCard,
  ChevronRight,
  Heart,
  RefreshCw,
  Ticket,
  CheckCircle2,
  XCircle,
  Copy,
  PartyPopper,
  Loader2,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { useT } from "@/lib/i18n";
import { Footer } from "@/components/Footer";
import { useCart, formatPrice } from "@/lib/cart-store";
import { useTebexAuth } from "@/lib/tebex-auth";
import { notify as toast } from "@/components/Notify";
import { createCartCheckout, getCheckoutResult } from "@/lib/tebex.functions";
import { attributeReferral } from "@/lib/referral.functions";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "LODStudios | Cart" },
      { name: "description", content: "Review your cart and continue to checkout." },
    ],
  }),
  component: CartPage,
});

type OrderScreen =
  | {
      status: "success";
      loading: boolean;
      products: string[];
      txnId: string | null;
      total: number | null;
      currency: string | null;
      date: string | null;
      creatorCode: string | null;
    }
  | {
      status: "error";
      title: string;
      message: string;
      products: string[];
    };

// Automatic order-value discounts. Reaching a threshold unlocks the tier's
// percentage. Set `couponCode` to a real Tebex coupon so it also applies to the
// actual charge; leave it empty to only preview the discount in the summary.
type DiscountTier = { threshold: number; percent: number; couponCode?: string };

const DISCOUNT_TIERS: DiscountTier[] = [
  { threshold: 130, percent: 10, couponCode: "" },
  { threshold: 200, percent: 15, couponCode: "" },
];

function activeDiscountTier(subtotal: number): DiscountTier | null {
  let active: DiscountTier | null = null;
  for (const tier of DISCOUNT_TIERS) {
    if (subtotal >= tier.threshold) active = tier;
  }
  return active;
}

function CartPage() {
  const { items, subtotal, tax, total, count, updateQuantity, removeItem, clear } =
    useCart();
  const currency = items[0]?.currency ?? "EUR";
  const t = useT();
  const { user, isAuthed, login, loading: authLoading } = useTebexAuth();

  const discountTier = activeDiscountTier(subtotal);
  const discountAmount = discountTier ? (subtotal * discountTier.percent) / 100 : 0;
  const discountedTotal = Math.max(0, total - discountAmount);

  const [refCode, setRefCode] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [orderScreen, setOrderScreen] = useState<OrderScreen | null>(null);
  const handledReturn = useRef(false);
  const resumedAfterAuth = useRef(false);

  // Prefill the referral code from a captured ?ref= link, if any.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lod_ref_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as { code?: string };
        if (parsed.code) setRefCode(parsed.code);
      }
    } catch {
      // ignore
    }
  }, []);

  // Handle the redirect back from the hosted Tebex checkout.
  useEffect(() => {
    if (handledReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return;
    handledReturn.current = true;

    // Read the order snapshot we saved right before redirecting.
    let snapshot: {
      products: string[];
      basketIdent: string | null;
      creatorCode: string | null;
    } = {
      products: [],
      basketIdent: null,
      creatorCode: null,
    };
    try {
      const raw = localStorage.getItem("lod_last_order_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          products?: string[];
          basketIdent?: string;
          creatorCode?: string | null;
        };
        snapshot = {
          products: Array.isArray(parsed.products) ? parsed.products : [],
          basketIdent: parsed.basketIdent ?? null,
          creatorCode: parsed.creatorCode ?? null,
        };
      }
    } catch {
      // ignore
    }

    if (status === "success") {
      clear();
      setOrderScreen({
        status: "success",
        loading: true,
        products: snapshot.products,
        txnId: null,
        total: null,
        currency: null,
        date: null,
        creatorCode: snapshot.creatorCode,
      });
      // Fetch the real Tebex transaction details for the thank-you screen.
      const ident = snapshot.basketIdent;
      if (ident) {
        getCheckoutResult({ data: { basketIdent: ident } })
          .then((res) => {
            setOrderScreen((prev) =>
              prev && prev.status === "success"
                ? {
                    ...prev,
                    loading: false,
                    products: res.products.length > 0 ? res.products : prev.products,
                    txnId: res.txnId,
                    total: res.total,
                    currency: res.currency,
                    date: res.date,
                  }
                : prev,
            );
          })
          .catch(() => {
            setOrderScreen((prev) =>
              prev && prev.status === "success" ? { ...prev, loading: false } : prev,
            );
          });
      } else {
        setOrderScreen((prev) =>
          prev && prev.status === "success" ? { ...prev, loading: false } : prev,
        );
      }
      try {
        localStorage.removeItem("lod_last_order_v1");
      } catch {
        // ignore
      }
    } else if (status === "cancel") {
      setOrderScreen({
        status: "error",
        title: t("cart.order.cancelTitle"),
        message: t("cart.order.cancelMessage"),
        products: snapshot.products,
      });
    }
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, [clear, t]);

  useEffect(() => {
    if (resumedAfterAuth.current) return;
    if (!isAuthed || !user?.basketIdent || items.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tebexAuth") !== "return") return;
    let pending = false;
    try {
      pending = localStorage.getItem("lod_checkout_after_auth_v1") === "1";
    } catch {
      // ignore
    }
    if (!pending) return;
    resumedAfterAuth.current = true;
    try {
      localStorage.removeItem("lod_checkout_after_auth_v1");
    } catch {
      // ignore
    }
    handleCheckout();
  }, [isAuthed, user?.basketIdent, items.length]);

  const handleCheckout = async () => {
    if (items.length === 0 || checkoutLoading) return;
    setCheckoutLoading(true);
    try {
      const code = refCode.trim().toUpperCase();

      if (!user?.basketIdent || !isAuthed) {
        try {
          localStorage.setItem("lod_checkout_after_auth_v1", "1");
        } catch {
          // ignore
        }
        if (code) {
          try {
            localStorage.setItem(
              "lod_ref_v1",
              JSON.stringify({ code, capturedAt: new Date().toISOString() }),
            );
          } catch {
            // ignore
          }
        }
        toast.info(t("cart.checkout.loginRequired"));
        setCheckoutLoading(false);
        if (!authLoading) await login();
        return;
      }

      if (code) {
        const res = await attributeReferral({
          data: { basketIdent: user.basketIdent, code },
        });
        if (!res.ok) {
          if (res.reason === "invalid_code") {
            toast.error(t("cart.checkout.invalidCode"));
            setCheckoutLoading(false);
            return;
          }
          if (res.reason === "self_referral") {
            toast.error(t("cart.checkout.selfReferral"));
            setCheckoutLoading(false);
            return;
          } else if (res.reason === "already_attributed") {
            toast.info(t("cart.checkout.alreadyAttributed"));
          }
        } else {
          toast.success(t("cart.checkout.codeSaved"));
        }
      }

      const { checkoutUrl } = await createCartCheckout({
        data: {
          basketIdent: user.basketIdent,
          items: items.map((it) => ({ packageId: it.id, quantity: it.quantity })),
          creatorCode: code || undefined,
          couponCode: discountTier?.couponCode?.trim() || undefined,
          returnOrigin: window.location.origin,
        },
      });
      // Snapshot the order so the thank-you screen can show it after the
      // cart is cleared on return.
      try {
        localStorage.setItem(
          "lod_last_order_v1",
          JSON.stringify({
            products: items.map((it) => it.name),
            basketIdent: user.basketIdent,
            creatorCode: code || null,
            at: new Date().toISOString(),
          }),
        );
      } catch {
        // ignore
      }
      window.location.href = checkoutUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("already paid")) {
        try {
          localStorage.setItem("lod_checkout_after_auth_v1", "1");
        } catch {
          // ignore
        }
        toast.info(t("cart.checkout.renewSession"));
        setCheckoutLoading(false);
        if (!authLoading) await login();
        return;
      }
      setOrderScreen({
        status: "error",
        title: t("cart.order.errorTitle"),
        message: t("cart.order.errorMessage"),
        products: items.map((it) => it.name),
      });
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0C0C0D] text-white">
      <Navigation />

      {orderScreen ? (
        <OrderResultScreen
          screen={orderScreen}
          currency={currency}
          onDismiss={() => setOrderScreen(null)}
        />
      ) : (
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-24 pt-32 lg:px-10">
        {/* Header */}
        <div className="mb-10 flex items-end justify-between gap-4">
          <h1 className="font-display text-[clamp(2rem,3.5vw,2.75rem)] font-bold tracking-tight text-white">
            {t("cart.title")}
            {items.length > 0 && (
              <span className="ml-3 align-middle text-[16px] font-medium text-white/40">
                ({count})
              </span>
            )}
          </h1>
        </div>

        {items.length === 0 ? (
          <EmptyCart t={t} />
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
            {/* LEFT: Items */}
            <section>
              {/* Toolbar */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="grid grid-cols-[100px_1fr_auto_auto] items-center gap-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  <span></span>
                  <span>{t("cart.colProduct")}</span>
                  <span className="pr-4 text-center">{t("cart.colQuantity")}</span>
                  <span className="text-right">{t("cart.colPrice")}</span>
                </div>
                <button
                  onClick={clear}
                  className="ml-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-white/50 transition hover:text-store-accent"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  {t("cart.clear")}
                </button>
              </div>

              {/* Rows */}
              <ul className="divide-y divide-white/10">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[100px_1fr_auto_auto] items-center gap-5 py-6"
                  >
                    {/* Image */}
                    <Link
                      to="/store/$packageId"
                      params={{ packageId: String(item.id) }}
                      className="group relative block aspect-[4/3] overflow-hidden rounded-lg bg-white/[0.03]"
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-white/25">
                          <ShoppingBag className="h-6 w-6" />
                        </div>
                      )}
                    </Link>

                    {/* Info */}
                    <div className="min-w-0">
                      <Link
                        to="/store/$packageId"
                        params={{ packageId: String(item.id) }}
                        className="line-clamp-2 font-display text-[17px] font-semibold leading-snug text-white transition hover:text-store-accent"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-1 text-[12px] text-white/45">
                        {item.category}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-white/55">
                        <span className="inline-flex items-center gap-1.5">
                          <Zap className="h-3 w-3 text-store-accent" strokeWidth={2.5} />
                          {t("cart.instantDelivery")}
                        </span>
                        <span className="text-white/15">·</span>
                        <button className="inline-flex items-center gap-1.5 transition hover:text-white">
                          <Heart className="h-3 w-3" strokeWidth={2} />
                          {t("cart.saveForLater")}
                        </button>
                        <span className="text-white/15">·</span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="inline-flex items-center gap-1.5 transition hover:text-store-accent"
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2} />
                          {t("cart.remove")}
                        </button>
                      </div>
                    </div>

                    {/* Qty */}
                    <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.02]">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label={t("cart.decrease")}
                        className="grid h-9 w-9 place-items-center rounded-full text-white/65 transition hover:text-white disabled:opacity-30"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                      <span className="min-w-[28px] text-center text-[13px] font-semibold tabular-nums text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        aria-label={t("cart.increase")}
                        className="grid h-9 w-9 place-items-center rounded-full text-white/65 transition hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <p className="font-display text-[16px] font-semibold tabular-nums text-white">
                        {formatPrice(
                          (item.unitPrice + item.taxPerUnit) * item.quantity,
                          item.currency,
                        )}
                      </p>
                      {item.quantity > 1 && (
                        <p className="mt-0.5 text-[11px] text-white/35">
                          {formatPrice(
                            item.unitPrice + item.taxPerUnit,
                            item.currency,
                          )}{" "}
                          {t("cart.each")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Continue shopping */}
              <Link
                to="/store"
                className="mt-2 inline-flex items-center gap-2 text-[13px] font-medium text-white/60 transition hover:text-white"
              >
                <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2.25} />
                {t("cart.continueShopping")}
              </Link>
            </section>

            {/* RIGHT: Summary */}
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <h2 className="font-display text-[18px] font-semibold text-white">
                  {t("cart.orderSummary")}
                </h2>


                <dl className="mt-6 space-y-3 text-[13px]">
                  <Row label={t("cart.subtotal")} value={formatPrice(subtotal, currency)} />
                  <Row
                    label={<span className="inline-flex items-center gap-1.5">{t("cart.tax")} <span className="text-[10px] uppercase tracking-wider text-white/30">{t("cart.vat")}</span></span>}
                    value={formatPrice(tax, currency)}
                  />
                  <Row
                    label={<span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-white/40" strokeWidth={2} /> {t("cart.delivery")}</span>}
                    value={<span className="text-store-accent">{t("cart.free")}</span>}
                  />
                  {discountTier && (
                    <Row
                      label={
                        <span className="inline-flex items-center gap-1.5 text-store-accent">
                          <Ticket className="h-3.5 w-3.5" strokeWidth={2} /> Mengenrabatt {discountTier.percent}%
                        </span>
                      }
                      value={<span className="text-store-accent">−{formatPrice(discountAmount, currency)}</span>}
                    />
                  )}
                </dl>

                <div className="my-5 border-t border-white/10" />

                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/60">
                    {t("cart.total")}
                  </span>
                  <span className="font-display text-[26px] font-bold tabular-nums text-white">
                    {formatPrice(discountedTotal, currency)}
                  </span>
                </div>

                {/* Referral code */}
                <div className="mt-5">
                  <label
                    htmlFor="refcode"
                    className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45"
                  >
                    <Ticket className="h-3.5 w-3.5 text-store-accent" strokeWidth={2} />
                    Empfehlungscode
                  </label>
                  <input
                    id="refcode"
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                    placeholder="LOD-XXXXXX"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-lg border border-white/12 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium tracking-wide text-white outline-none transition placeholder:text-white/25 focus:border-store-accent/60"
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
                    Optional. Trage den Code deines Werbers ein. Er wird beim Checkout gespeichert.
                  </p>
                </div>

                {/* Progressive discount */}
                <ProgressiveDiscount subtotal={subtotal} currency={currency} />

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="group relative mt-5 inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-[#FF3B3B] text-[12px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[#D63030] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,1)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
                  />
                  <span className="relative z-10 inline-flex items-center gap-2">
                    <CreditCard className="h-4 w-4" strokeWidth={2.25} />
                    {checkoutLoading ? t("cart.checkout.redirecting") : t("cart.checkout")}
                    {!checkoutLoading && (
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                    )}
                  </span>
                </button>

              </div>

              {/* Trust strip */}
              <div className="mt-4 grid grid-cols-1 gap-2">
                <TrustRow icon={ShieldCheck} text={t("cart.trustSecure")} />
                <TrustRow icon={Zap} text={t("cart.trustInstant")} />
                <TrustRow icon={RefreshCw} text={t("cart.trustUpdates")} />
              </div>
            </aside>
          </div>
        )}
      </main>
      )}

      <Footer />
    </div>
  );
}

/* ---------- helpers ---------- */

function OrderResultScreen({
  screen,
  currency,
  onDismiss,
}: {
  screen: OrderScreen;
  currency: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const t = useT();

  const copyTxn = async (txn: string) => {
    try {
      await navigator.clipboard.writeText(txn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const isSuccess = screen.status === "success";

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-[720px] flex-1 flex-col items-center justify-center px-6 pb-24 pt-32 text-center lg:px-10">
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          isSuccess
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-[#FF3B3B]/10 text-[#FF3B3B]"
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="h-10 w-10" strokeWidth={1.75} />
        ) : (
          <XCircle className="h-10 w-10" strokeWidth={1.75} />
        )}
      </div>

      <h1 className="mt-8 flex items-center gap-3 font-display text-[clamp(1.9rem,3.5vw,2.6rem)] font-bold tracking-tight text-white">
        {isSuccess ? (
          <>
            <PartyPopper className="h-7 w-7 text-emerald-400" />
            {t("cart.order.thankYou")}
          </>
        ) : (
          (screen as Extract<OrderScreen, { status: "error" }>).title
        )}
      </h1>

      <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-white/55">
        {isSuccess
          ? t("cart.order.successMessage")
          : (screen as Extract<OrderScreen, { status: "error" }>).message}
      </p>

      {/* Order card */}
      <div className="mt-10 w-full rounded-2xl border border-white/10 bg-[#151516] p-6 text-left">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {isSuccess ? t("cart.order.yourOrder") : t("cart.order.affectedProducts")}
        </h2>

        {screen.products.length > 0 ? (
          <ul className="mt-4 divide-y divide-white/5">
            {screen.products.map((name, i) => (
              <li key={`${name}-${i}`} className="flex items-center gap-3 py-3">
                <ShoppingBag className="h-4 w-4 shrink-0 text-white/40" />
                <span className="text-[15px] font-medium text-white">{name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[14px] text-white/40">
            {t("cart.order.noProductDetails")}
          </p>
        )}

        {isSuccess && (
          <div className="mt-5 space-y-3 border-t border-white/5 pt-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] font-medium uppercase tracking-wide text-white/40">
                {t("cart.order.txnId")}
              </span>
              {(screen as Extract<OrderScreen, { status: "success" }>).loading ? (
                <span className="flex items-center gap-2 text-[13px] text-white/40">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("cart.order.loading")}…
                </span>
              ) : (screen as Extract<OrderScreen, { status: "success" }>).txnId ? (
                <button
                  type="button"
                  onClick={() =>
                    copyTxn(
                      (screen as Extract<OrderScreen, { status: "success" }>).txnId!,
                    )
                  }
                  className="group flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 font-mono text-[13px] text-white transition hover:bg-white/10"
                  title={t("cart.order.copy")}
                >
                  {(screen as Extract<OrderScreen, { status: "success" }>).txnId}
                  <Copy className="h-3.5 w-3.5 text-white/40 group-hover:text-white/70" />
                </button>
              ) : (
                <span className="text-[13px] text-white/40">{t("cart.order.notAvailable")}</span>
              )}
            </div>
            {copied && (
              <p className="text-right text-[12px] text-emerald-400">{t("cart.order.copied")}</p>
            )}
            {(screen as Extract<OrderScreen, { status: "success" }>).total != null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] font-medium uppercase tracking-wide text-white/40">
                  {t("cart.order.total")}
                </span>
                <span className="text-[15px] font-semibold text-white">
                  {formatPrice(
                    (screen as Extract<OrderScreen, { status: "success" }>).total!,
                    (screen as Extract<OrderScreen, { status: "success" }>).currency ??
                      currency,
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Creator code thank-you */}
      {isSuccess &&
        ((screen as Extract<OrderScreen, { status: "success" }>).creatorCode ? (
          <div className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[#FF3B3B]/25 bg-[#FF3B3B]/10 p-5 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF3B3B]/15 text-[#FF3B3B]">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-white">
                {t("cart.order.creatorThanksPre")}{" "}
                <span className="font-mono text-[#FF3B3B]">
                  {(screen as Extract<OrderScreen, { status: "success" }>).creatorCode}
                </span>{" "}
                {t("cart.order.creatorThanksPost")}
              </p>
              <p className="mt-0.5 text-[13px] text-white/55">
                {t("cart.order.creatorThanksSub")}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/40">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-white">
                {t("cart.order.noCreatorTitle")}
              </p>
              <p className="mt-0.5 text-[13px] text-white/55">
                {t("cart.order.noCreatorSub")}
              </p>
            </div>
          </div>
        ))}

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {isSuccess ? (
          <>
            <Link
              to="/purchases"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF3B3B] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#D63030]"
            >
              {t("cart.order.myPurchases")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/store"
              onClick={onDismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10"
            >
              {t("cart.order.continueShopping")}
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF3B3B] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#D63030]"
            >
              {t("cart.order.backToCart")}
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              to="/store"
              onClick={onDismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10"
            >
              {t("cart.order.toStore")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-white/55">{label}</dt>
      <dd className="font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}

function ProgressiveDiscount({
  subtotal,
  currency,
}: {
  subtotal: number;
  currency: string;
}) {
  const maxThreshold = DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1]?.threshold ?? 0;
  const active = activeDiscountTier(subtotal);
  const next = DISCOUNT_TIERS.find((tier) => subtotal < tier.threshold) ?? null;
  const fillPct = maxThreshold > 0 ? Math.min(100, (subtotal / maxThreshold) * 100) : 0;
  const fullyUnlocked = active && !next;

  return (
    <div className="mt-5 rounded-xl border border-store-accent/25 bg-store-accent/[0.06] p-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white">
          <PartyPopper className="h-3.5 w-3.5 text-store-accent" strokeWidth={2.25} />
          Progressiver Rabatt
        </span>
        {active && (
          <span className="rounded-full bg-store-accent/20 px-2 py-0.5 text-[11px] font-bold text-store-accent">
            {active.percent}% aktiv
          </span>
        )}
      </div>

      {/* Animated progress bar */}
      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-store-accent/70 to-store-accent transition-[width] duration-700 ease-out"
          style={{ width: `${fillPct}%` }}
        >
          <span
            aria-hidden="true"
            className="animate-bar-shimmer absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]"
          />
        </div>
        {/* Tier markers */}
        {DISCOUNT_TIERS.map((tier) => {
          const pos = maxThreshold > 0 ? (tier.threshold / maxThreshold) * 100 : 0;
          const reached = subtotal >= tier.threshold;
          return (
            <span
              key={tier.threshold}
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-500 ${
                reached
                  ? "border-store-accent bg-white"
                  : "border-white/30 bg-store-panel"
              }`}
              style={{ left: `${pos}%` }}
            />
          );
        })}
      </div>

      {/* Threshold labels */}
      <div className="mt-2 flex justify-between text-[10px] font-medium tabular-nums text-white/40">
        {DISCOUNT_TIERS.map((tier) => (
          <span key={tier.threshold} className={subtotal >= tier.threshold ? "text-store-accent" : ""}>
            {formatPrice(tier.threshold, currency)} · {tier.percent}%
          </span>
        ))}
      </div>

      <p className="mt-3 text-center text-[12px] font-medium text-white/70">
        {fullyUnlocked ? (
          <span className="text-store-accent">Maximaler Rabatt freigeschaltet: {active!.percent}%</span>
        ) : next ? (
          <>
            Noch{" "}
            <span className="font-bold text-store-accent">
              {formatPrice(next.threshold - subtotal, currency)}
            </span>{" "}
            bis {next.percent}% Rabatt
          </>
        ) : null}
      </p>
    </div>
  );
}

function TrustRow({
  icon: Icon,
  text,
}: {
  icon: React.ElementType;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[12px] text-white/55">
      <Icon className="h-3.5 w-3.5 text-store-accent" strokeWidth={2.25} />
      {text}
    </div>
  );
}

function EmptyCart({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="grid place-items-center py-20 text-center">
      <div className="relative grid h-24 w-24 place-items-center rounded-full border border-white/10 bg-white/[0.03]">
        <ShoppingBag className="h-10 w-10 text-white/70" strokeWidth={1.5} />
        <span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-store-accent text-[11px] font-bold text-white">
          0
        </span>
      </div>
      <h2 className="mt-8 font-display text-[28px] font-semibold tracking-tight text-white">
        {t("cart.emptyTitle")}
      </h2>
      <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-white/50">
        {t("cart.emptyLead")}
      </p>
      <Link
        to="/store"
        className="group relative mt-8 inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-lg bg-[#FF3B3B] px-8 text-[12px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[#D63030]"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,1)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
        />
        <span className="relative z-10 inline-flex items-center gap-2">
          {t("cart.startShopping")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
        </span>
      </Link>
    </div>
  );
}

