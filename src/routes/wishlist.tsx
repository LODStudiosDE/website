import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Heart, ShoppingCart, Trash2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { showCartToast } from "@/components/CartToast";
import { useCart, formatPrice } from "@/lib/cart-store";
import { useWishlist, type WishlistItem } from "@/lib/wishlist-store";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "LODStudios | Wishlist" },
      { name: "description", content: "Deine gespeicherten Artikel bei LODStudios." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const t = useT();
  const { items, removeItem } = useWishlist();
  const { addItem } = useCart();

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
            <Heart className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-headline text-3xl text-white sm:text-4xl">
              {t("profile.wishlist")}
            </h1>
            <p className="mt-1 text-sm text-white/45">
              {t("profile.wishlistCount").replace("{n}", String(items.length))}
            </p>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
              <Heart className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-bold text-white">
              {t("profile.wishlistEmpty")}
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-white/45">
              {t("profile.wishlistEmptyHint")}
            </p>
            <Link
              to="/store"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#FF3B3B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D63030]"
            >
              {t("profile.discoverItems")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.slice(0, 5).map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4"
              >
                <Link
                  to="/store/$packageId"
                  params={{ packageId: String(item.id) }}
                  className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5"
                >
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-white/30">
                      <Heart className="h-5 w-5" />
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/store/$packageId"
                    params={{ packageId: String(item.id) }}
                    className="truncate text-sm font-medium text-white transition hover:text-[#FF3B3B]"
                  >
                    {item.name}
                  </Link>
                  <p className="truncate text-[11px] text-white/40">{item.category}</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#FF3B3B]">
                    {formatPrice(item.price, item.currency)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => buy(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF3B3B] px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#D63030]"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    {t("profile.wishlistBuy")}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={t("profile.wishlistRemoveItem")}
                    title={t("profile.wishlistRemoveItem")}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:border-red-500/40 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}
