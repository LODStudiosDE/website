import { type ReactNode } from "react";
import { Clock } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";


export function LegalPageShell({
  eyebrow,
  title,
  description,
  lastUpdated,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  lastUpdated?: string;
  icon?: React.ElementType;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#0C0C0D] text-white">
      {/* subtle warm ambience like the store pages */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[70vh]"
        style={{
          background:
            "radial-gradient(1100px 520px at 50% -20%, rgba(255,59,59,0.07), transparent 65%), linear-gradient(180deg, #121011 0%, #0C0C0D 100%)",
        }}
      />
      <Navigation />
      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-6 pb-24 pt-32 lg:px-10">
        <div className="rounded-2xl border border-white/[0.07] bg-[#141011]/90 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.9)] backdrop-blur-sm">

          <header className="space-y-1.5 border-b border-white/[0.06] px-6 pb-5 pt-6 lg:px-8">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="h-3.5 w-3.5 text-[#FF3B3B]" />}
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#FF3B3B]">
                {eyebrow}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            {description && <p className="text-sm text-white/50">{description}</p>}
            {lastUpdated && (
              <p className="flex items-center gap-1.5 pt-0.5 text-[11px] text-white/40">
                <Clock className="h-3 w-3 text-[#FF3B3B]/70" />
                Last updated: {lastUpdated}
              </p>
            )}
          </header>
          <div className="px-6 py-6 lg:px-8">{children}</div>
        </div>
      </main>
      <div className="relative z-10 w-full">
        <Footer />
      </div>
    </div>


  );
}
