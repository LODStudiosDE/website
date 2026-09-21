import { Wrench } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useT } from "@/lib/i18n";

/** Shown instead of the referral pages while an admin has the program switched off. */
export function ReferralMaintenance() {
  const t = useT();
  return (
    <div className="relative min-h-screen bg-[#0A0A0B] text-white">
      <Navigation />
      <main className="mx-auto flex max-w-[900px] flex-col items-center justify-center gap-5 px-6 pb-24 pt-44 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FF3B3B]/12 text-[#FF3B3B] ring-1 ring-inset ring-[#FF3B3B]/20">
          <Wrench className="h-7 w-7" />
        </span>
        <h1 className="font-headline text-3xl text-white sm:text-4xl">
          {t("referral.maintenance.title")}
        </h1>
        <p className="max-w-md text-white/60">{t("referral.maintenance.text")}</p>
      </main>
      <Footer />
    </div>
  );
}
