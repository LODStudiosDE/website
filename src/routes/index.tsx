import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { HeroVideo } from "@/components/HeroVideo";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { FAQ } from "@/components/FAQ";
import { PartnersSection } from "@/components/PartnersSection";

import { Newsletter } from "@/components/Newsletter";
import { Footer } from "@/components/Footer";
import { type TebexPackage } from "@/lib/tebex";
import { categoriesQuery } from "@/lib/queries";
import { findChannelVideoForProduct } from "@/lib/youtube.functions";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  // Have the catalogue ready when the page opens (server-rendered title, no
  // late pop-in). Served from the in-memory Tebex cache after the first hit;
  // a failure must never block the home page, so swallow it and let the
  // component's useQuery retry.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(categoriesQuery).catch(() => undefined),
  head: () => ({
    meta: [
      { title: "LODStudios | Home" },
      {
        name: "description",
        content: "High quality MLOs, Vehicles, Maps & Scripts for the most immersive FiveM experience.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const t = useT();
  const { data } = useQuery(categoriesQuery);

  const latest: TebexPackage | undefined = (() => {
    if (!data) return undefined;
    const map = new Map<number, TebexPackage>();
    for (const c of data) for (const p of c.packages ?? []) if (!map.has(p.id)) map.set(p.id, p);
    return Array.from(map.values()).sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    )[0];
  })();

  const { data: ytMatch } = useQuery({
    queryKey: ["yt-match", latest?.name],
    queryFn: () => findChannelVideoForProduct({ data: { title: latest!.name } }),
    enabled: !!latest?.name,
    staleTime: 1000 * 60 * 30,
  });

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0C0C0D] text-white">
      <Navigation />

      {/* HERO */}
      <section className="relative h-screen min-h-[760px] w-full overflow-hidden">
        <HeroVideo videoId={ytMatch?.videoId ?? undefined} />

        <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col justify-end px-8 pb-6">
          <div className="animate-fade-in-slow">
            <div className="max-w-2xl">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
                {t("home.eyebrow")}
              </span>
              <h1 className="mt-2 font-display text-[clamp(2.4rem,4vw,3.85rem)] font-bold leading-[1.05] tracking-tight text-white">
                {latest?.name ?? t("home.fallbackTitle")}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  to="/store/$packageId"
                  params={{ packageId: String(latest?.id ?? "") }}
                  aria-disabled={!latest}
                  className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-sm bg-[#FF3B3B] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[#D63030] hover:shadow-[0_0_40px_rgba(255,59,59,0.4)] aria-disabled:pointer-events-none aria-disabled:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,1)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover:bg-[position:0%_0%]"
                  />
                  <span className="relative z-10 inline-flex items-center gap-2.5">
                    {t("home.buyNow")}
                    <ShoppingBag className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" strokeWidth={2.5} />
                  </span>
                </Link>
              </div>
            </div>

            <div className="mt-6 w-full">
              <FeaturedCarousel showHeader={false} limit={5} />
            </div>
          </div>
        </div>

      </section>



      
      <FAQ />
      <PartnersSection />
      <Newsletter />
      <Footer />
    </div>
  );
}
