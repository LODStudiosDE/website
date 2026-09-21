import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPartners, type PublicPartner } from "@/lib/partners.functions";

// Homepage section that showcases official partners & clients as an animated,
// grayscale logo marquee. Logos regain full color on hover and link out.
export function PartnersSection() {
  const { data } = useQuery({
    queryKey: ["public-partners"],
    queryFn: () => getPartners(),
    staleTime: 5 * 60 * 1000,
  });

  const partners = data ?? [];
  if (partners.length === 0) return null;

  // Duplicate the set so the belt loops continuously with no gap. The animation
  // shifts by exactly one set width (-50%), so the seam is never visible.
  const loop = [...partners, ...partners];

  return (
    <section className="relative overflow-hidden py-20 sm:py-24">
      <div className="mx-auto max-w-[1400px] px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-[#FF3B3B]">
            Trusted By
          </div>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Trusted By Our Partners and Clients
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/45 sm:text-base">
            Official Client and Partners from LODStudios we collaborated with.
          </p>
        </div>

        {/* Continuous marquee — vertical padding gives the hover lift room so it
            is not clipped by the horizontal overflow mask. */}
        <div className="group relative mt-10 overflow-hidden py-6 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="flex w-max animate-marquee-x items-center gap-6 group-hover:[animation-play-state:paused] sm:gap-10">
            {loop.map((p, i) => (
              <PartnerLogo key={`${p.id}-${i}`} partner={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerLogo({ partner }: { partner: PublicPartner }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={partner.link}
      target="_blank"
      rel="noopener noreferrer"
      title={partner.name}
      className="group/logo flex h-16 shrink-0 items-center transition-transform duration-300 hover:-translate-y-1"
    >
      {failed ? (
        <span className="whitespace-nowrap text-lg font-bold text-white/60 transition-colors duration-500 group-hover/logo:text-white">
          {partner.name}
        </span>
      ) : (
        <img
          src={partner.image}
          alt={partner.name}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-16 w-auto object-contain opacity-60 grayscale transition-all duration-500 group-hover/logo:opacity-100 group-hover/logo:grayscale-0"
        />
      )}
    </a>
  );
}
