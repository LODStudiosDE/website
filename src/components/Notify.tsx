import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { toast } from "sonner";

type NotifyKind = "success" | "error" | "info";

const KIND = {
  success: {
    accent: "#34D399",
    ring: "rgba(52,211,153,0.15)",
    glow: "rgba(52,211,153,0.35)",
    Icon: CheckCircle2,
  },
  error: {
    accent: "#FF3B3B",
    ring: "rgba(255,59,59,0.15)",
    glow: "rgba(255,59,59,0.35)",
    Icon: AlertTriangle,
  },
  info: {
    accent: "#60A5FA",
    ring: "rgba(96,165,250,0.15)",
    glow: "rgba(96,165,250,0.3)",
    Icon: Info,
  },
} as const;

function NotifyToast({
  id,
  kind,
  message,
}: {
  id: string | number;
  kind: NotifyKind;
  message: string;
}) {
  const { accent, ring, glow, Icon } = KIND[kind];
  return (
    <div
      className="group relative flex w-[360px] items-start gap-3 overflow-hidden rounded-xl bg-store-panel p-4 pr-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] animate-in slide-in-from-right-4 fade-in duration-300"
      style={{ boxShadow: `0 20px 60px -20px rgba(0,0,0,0.9), 0 0 0 1px ${ring}` }}
    >
      {/* Left accent bar */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: accent, boxShadow: `0 0 16px ${glow}` }}
      />
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: ring }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} style={{ color: accent }} />
      </span>
      <p className="min-w-0 flex-1 pt-1 text-[13.5px] font-medium leading-snug text-store-panel-foreground">
        {message}
      </p>
      <button
        onClick={() => toast.dismiss(id)}
        aria-label="Close"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-store-muted transition hover:bg-store-panel-foreground/5 hover:text-store-panel-foreground"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function show(kind: NotifyKind, message: string) {
  return toast.custom((id) => <NotifyToast id={id} kind={kind} message={message} />, {
    duration: kind === "error" ? 5000 : 3500,
    position: "top-right",
    unstyled: true,
  });
}

export const notify = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
  info: (message: string) => show("info", message),
};
