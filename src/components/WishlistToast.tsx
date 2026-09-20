import { Link } from "@tanstack/react-router";
import { Star, Heart, X } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/cart-store";
import { useT } from "@/lib/i18n";

type ToastItem = {
  name: string;
  image: string | null;
  category: string;
  unitPrice: number;
  currency: string;
};

function WishlistToast({ id, item }: { id: string | number; item: ToastItem }) {
  const t = useT();
  return (
    <div className="group relative w-[380px] overflow-hidden rounded-xl bg-store-panel p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] animate-in slide-in-from-right-4 fade-in duration-300">
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-store-accent to-transparent" />

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-store-accent/15">
            <Star className="h-3.5 w-3.5 text-store-accent" strokeWidth={2.5} fill="currentColor" />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-store-panel-foreground">
            {t("wishlist.toast.added")}
          </p>
        </div>
        <button
          onClick={() => toast.dismiss(id)}
          aria-label={t("cart.toast.close")}
          className="grid h-6 w-6 place-items-center rounded-full text-store-muted transition hover:bg-store-panel-foreground/5 hover:text-store-panel-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-store-panel-foreground/10 bg-background">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-store-muted">
              <Heart className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-display text-[14px] font-bold leading-tight text-store-panel-foreground">
            {item.name}
          </p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.18em] text-store-muted">
            {item.category}
          </p>
          <p className="mt-1.5 text-[13px] font-bold text-store-accent tabular-nums">
            {formatPrice(item.unitPrice, item.currency)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-snug text-store-muted">
        {t("wishlist.toast.description")}
      </p>

      <Link
        to="/profile"
        onClick={() => toast.dismiss(id)}
        className="group/btn relative mt-4 inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-[#FF3B3B] text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[#D63030] hover:shadow-[0_0_30px_rgba(255,59,59,0.4)]"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,1)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover/btn:bg-[position:0%_0%]"
        />
        <span className="relative z-10 inline-flex items-center gap-2">
          <Star className="h-4 w-4" strokeWidth={2.5} fill="currentColor" />
          {t("wishlist.toast.view")}
        </span>
      </Link>
    </div>
  );
}

export function showWishlistToast(item: ToastItem) {
  toast.custom((id) => <WishlistToast id={id} item={item} />, {
    duration: 4500,
    position: "top-right",
    unstyled: true,
  });
}
