import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, ChevronRight, ShoppingCart, Check, Sparkles } from "lucide-react";

import type { TebexPackage } from "@/lib/tebex";
import { useCart } from "@/lib/cart-store";
import { showCartToast } from "@/components/CartToast";
import { useT } from "@/lib/i18n";

function priceLabel(pkg: TebexPackage): string {
  const symbol =
    pkg.currency === "EUR" ? "€" : pkg.currency === "USD" ? "$" : pkg.currency === "GBP" ? "£" : "";
  return `${symbol}${pkg.total_price.toFixed(2)}`;
}

function Thumb({ pkg }: { pkg: TebexPackage }) {
  const src = pkg.image ?? pkg.media?.find((m) => m.primary)?.url ?? pkg.media?.[0]?.url ?? null;
  if (src) {
    return (
      <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-white/10">
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      </span>
    );
  }
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-sm border border-[#FF3B3B]/25 bg-[#FF3B3B]/10 text-[#FF3B3B]">
      <Crown className="h-5 w-5" />
    </span>
  );
}

export function SubscriptionOffer({
  productName,
  subscriptions,
}: {
  productName: string;
  subscriptions: TebexPackage[];
}) {
  const t = useT();
  const { addItem } = useCart();
  const [addedId, setAddedId] = useState<number | null>(null);

  if (subscriptions.length === 0) return null;

  const addToCart = (sub: TebexPackage) => {
    addItem({
      id: sub.id,
      name: sub.name,
      image: sub.image ?? sub.media?.[0]?.url ?? null,
      category: t("store.sub.badge"),
      unitPrice: sub.base_price,
      taxPerUnit: sub.sales_tax,
      currency: sub.currency,
    });
    showCartToast({
      name: sub.name,
      image: sub.image ?? sub.media?.[0]?.url ?? null,
      category: t("store.sub.badge"),
      unitPrice: sub.total_price,
      currency: sub.currency,
    });
    setAddedId(sub.id);
    window.setTimeout(() => setAddedId((id) => (id === sub.id ? null : id)), 1200);
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-sm border border-[#FF3B3B]/25 bg-gradient-to-br from-[#FF3B3B]/[0.09] via-[#151516] to-[#0C0C0D] p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FF3B3B]/20 blur-[90px]"
        />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-[#FF3B3B]/40 bg-[#FF3B3B]/12 text-[#FF3B3B]">
              <Crown className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-[#FF3B3B]">
                {t("store.sub.badge")}
              </span>
              <h3 className="font-display text-[17px] font-bold leading-tight text-white">
                {t("store.sub.title")}
              </h3>
            </div>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-white/60">
            {t("store.sub.lead").replace("{name}", productName)}
          </p>

          <div
            className={`mt-5 space-y-3 ${
              subscriptions.length > 2 ? "max-h-[300px] overflow-y-auto pr-1" : ""
            }`}
          >
            {subscriptions.map((sub) => {
              const added = addedId === sub.id;
              return (
                <div
                  key={sub.id}
                  className="rounded-sm border border-white/10 bg-white/[0.03] p-3 transition hover:border-[#FF3B3B]/40"
                >
                  <Link
                    to="/store/$packageId"
                    params={{ packageId: String(sub.id) }}
                    className="group/row flex items-center gap-3 text-left"
                  >
                    <Thumb pkg={sub} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-display text-[14px] font-bold text-white">
                          {sub.name}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition group-hover/row:translate-x-0.5 group-hover/row:text-[#FF3B3B]" />
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-1">
                        <span className="font-display text-[16px] font-bold text-white">
                          {priceLabel(sub)}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                          {t("store.sub.perMonth")}
                        </span>
                      </div>
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(sub);
                    }}
                    className="group/btn relative mt-3 inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-sm bg-[#FF3B3B] text-[10px] font-bold uppercase tracking-[0.18em] text-white transition-all hover:bg-[#D63030] hover:shadow-[0_0_30px_rgba(255,59,59,0.35)]"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.9)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover/btn:bg-[position:0%_0%]"
                    />
                    <span className="relative z-10 inline-flex items-center gap-2">
                      {added ? (
                        <>
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          {t("store.product.added")}
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {t("store.product.addToCart")}
                        </>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
            <Sparkles className="h-3 w-3 text-[#FF3B3B]" />
            {t("store.sub.hint")}
          </p>
        </div>
      </div>
    </>
  );
}
