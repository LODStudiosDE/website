import { useEffect, useState } from "react";
import { Mail, ArrowRight, Check, LogIn } from "lucide-react";
import { notify as toast } from "@/components/Notify";
import { useMutation } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { useTebexAuth } from "@/lib/tebex-auth";
import { subscribeEmail } from "@/lib/subscription.functions";

export function Newsletter() {
  const t = useT();
  const { user, isAuthed, login, loading } = useTebexAuth();
  const PLACEHOLDER_TEXT = t("newsletter.placeholder");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [typingPhase, setTypingPhase] = useState<"typing" | "pausing" | "deleting">("typing");

  const subscribeMut = useMutation({
    mutationFn: () =>
      subscribeEmail({ data: { basketIdent: user!.basketIdent, email } }),
    onSuccess: (res) => {
      if (res.ok) {
        setSubmitted(true);
        setEmail("");
        toast.success(t("newsletter.toast.success"));
        setTimeout(() => setSubmitted(false), 3500);
      } else if (res.reason === "not_authenticated") {
        toast.error(t("newsletter.toast.notAuthed"));
      } else if (res.reason === "not_configured") {
        toast.error(t("newsletter.toast.notConfigured"));
      } else {
        toast.error(t("newsletter.toast.saveFailedRetry"));
      }
    },
    onError: () => toast.error(t("newsletter.toast.saveFailed")),
  });

  useEffect(() => {
    setTypedText("");
    setTypingPhase("typing");
  }, [PLACEHOLDER_TEXT]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (typingPhase === "typing") {
      if (typedText.length < PLACEHOLDER_TEXT.length) {
        timeout = setTimeout(
          () => setTypedText(PLACEHOLDER_TEXT.slice(0, typedText.length + 1)),
          90,
        );
      } else {
        timeout = setTimeout(() => setTypingPhase("pausing"), 1800);
      }
    } else if (typingPhase === "pausing") {
      timeout = setTimeout(() => setTypingPhase("deleting"), 600);
    } else {
      if (typedText.length > 0) {
        timeout = setTimeout(
          () => setTypedText(PLACEHOLDER_TEXT.slice(0, typedText.length - 1)),
          40,
        );
      } else {
        setTypingPhase("typing");
      }
    }
    return () => clearTimeout(timeout);
  }, [typedText, typingPhase, PLACEHOLDER_TEXT]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!isAuthed || !user?.basketIdent) {
      toast.error(t("newsletter.toast.loginToSave"));
      return;
    }
    subscribeMut.mutate();
  };



  return (
    <section className="relative w-full overflow-hidden bg-[#0C0C0D] py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,59,59,0.12),transparent_60%)]"
      />
      <div className="relative mx-auto max-w-[900px] px-8 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
          {t("newsletter.eyebrow")}
        </span>
        <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[0.95] tracking-tight text-white">
          {t("newsletter.title")}
          <span className="block text-[#FF3B3B]">{t("newsletter.titleAccent")}</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[14px] leading-relaxed text-white/60">
          {t("newsletter.lead")}
        </p>

        <form
          onSubmit={onSubmit}
          className="group/form relative mx-auto mt-12 flex h-16 max-w-xl items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-sm transition-all duration-300 focus-within:border-[#FF3B3B]/60 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_60px_-15px_rgba(255,59,59,0.5)]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(ellipse_at_left,rgba(255,59,59,0.08),transparent_60%)] opacity-0 transition-opacity duration-500 group-focus-within/form:opacity-100"
          />
          <Mail
            className="pointer-events-none relative z-10 ml-5 h-[18px] w-[18px] shrink-0 text-white/40 transition-colors group-focus-within/form:text-[#FF3B3B]"
            strokeWidth={2}
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={typedText || "\u00A0"}
            className="relative z-10 h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] text-white placeholder:text-white/30 focus:outline-none"
          />
          <button
            type="submit"
            disabled={subscribeMut.isPending}
            className="group/btn relative z-10 inline-flex h-full shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FF3B3B] px-7 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition-all duration-300 hover:bg-[#D63030] hover:shadow-[0_0_30px_rgba(255,59,59,0.5)] disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.9)_50%,transparent_60%)] bg-[length:250%_250%] bg-[position:100%_100%] transition-[background-position] duration-1000 ease-out group-hover/btn:bg-[position:0%_0%]"
            />
            <span className="relative z-10 inline-flex items-center gap-2">
              {submitted ? (
                <>
                  {t("newsletter.success")}
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </>
              ) : (
                <>
                  {t("newsletter.submit")}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" strokeWidth={2.5} />
                </>
              )}
            </span>
          </button>
        </form>

        {!isAuthed ? (
          <button
            type="button"
            onClick={() => void login()}
            disabled={loading}
            className="mx-auto mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-white/50 transition hover:text-white disabled:opacity-60"
          >
            <LogIn className="h-3.5 w-3.5 text-[#FF3B3B]" />
            {loading
              ? "Anmeldung läuft…"
              : "Melde dich mit FiveM an, um deine E-Mail zu hinterlegen"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
