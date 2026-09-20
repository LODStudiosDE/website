import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ScrollText,
  ShoppingCart,
  XCircle,
  Repeat,
  CalendarClock,
  ShieldAlert,
  Mail,
  MailX,
  EyeOff,
  Send,
  RotateCcw,
  Package,
  CreditCard,
  User,
  Gift,
  UserPlus,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminPageHeader, EmptyNotice, NoAccess, Panel } from "@/components/admin/ui";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import { fetchAdminLogs } from "@/lib/admin/admin.functions";
import { formatPrice } from "@/lib/cart-store";

export const Route = createFileRoute("/admin/logs")({
  component: AdminLogs,
});

type Meta = { label: string; icon: LucideIcon; tint: string; ring: string; text: string };

const TYPE_META: Record<string, Meta> = {
  "purchase.success": {
    label: "Kauf erfolgreich",
    icon: ShoppingCart,
    tint: "bg-emerald-400/10",
    ring: "ring-emerald-400/25",
    text: "text-emerald-300",
  },
  "purchase.declined": {
    label: "Kauf abgelehnt",
    icon: XCircle,
    tint: "bg-red-400/10",
    ring: "ring-red-400/25",
    text: "text-red-300",
  },
  "subscription.started": {
    label: "Abo gestartet",
    icon: Repeat,
    tint: "bg-sky-400/10",
    ring: "ring-sky-400/25",
    text: "text-sky-300",
  },
  "subscription.ended": {
    label: "Abo beendet",
    icon: CalendarClock,
    tint: "bg-amber-400/10",
    ring: "ring-amber-400/25",
    text: "text-amber-300",
  },
  "admin.action": {
    label: "Admin-Aktion",
    icon: ShieldAlert,
    tint: "bg-violet-400/10",
    ring: "ring-violet-400/25",
    text: "text-violet-300",
  },
  "email.subscribe": {
    label: "E-Mail hinterlegt",
    icon: Mail,
    tint: "bg-emerald-400/10",
    ring: "ring-emerald-400/25",
    text: "text-emerald-300",
  },
  "email.update": {
    label: "E-Mail geändert",
    icon: Mail,
    tint: "bg-sky-400/10",
    ring: "ring-sky-400/25",
    text: "text-sky-300",
  },
  "email.unsubscribe": {
    label: "E-Mail widerrufen",
    icon: MailX,
    tint: "bg-amber-400/10",
    ring: "ring-amber-400/25",
    text: "text-amber-300",
  },
  "email.remove": {
    label: "E-Mail entfernt (Admin)",
    icon: MailX,
    tint: "bg-red-400/10",
    ring: "ring-red-400/25",
    text: "text-red-300",
  },
  "email.hide": {
    label: "E-Mail ausgeblendet",
    icon: EyeOff,
    tint: "bg-white/5",
    ring: "ring-white/15",
    text: "text-white/60",
  },
  "email.broadcast": {
    label: "E-Mail-Broadcast",
    icon: Send,
    tint: "bg-[#FF3B3B]/10",
    ring: "ring-[#FF3B3B]/25",
    text: "text-[#FF3B3B]",
  },
  "referral.code_created": {
    label: "Empfehlungscode erstellt",
    icon: UserPlus,
    tint: "bg-sky-400/10",
    ring: "ring-sky-400/25",
    text: "text-sky-300",
  },
  "referral.join": {
    label: "Empfehlung beigetreten",
    icon: Gift,
    tint: "bg-[#FF3B3B]/10",
    ring: "ring-[#FF3B3B]/25",
    text: "text-[#FF3B3B]",
  },
  "referral.claim": {
    label: "Belohnung beansprucht",
    icon: Trophy,
    tint: "bg-amber-400/10",
    ring: "ring-amber-400/25",
    text: "text-amber-300",
  },
};

function metaOf(type: string): Meta {
  return (
    TYPE_META[type] ?? {
      label: type,
      icon: RotateCcw,
      tint: "bg-white/5",
      ring: "ring-white/15",
      text: "text-white/60",
    }
  );
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "purchase.success", label: "Käufe" },
  { key: "purchase.declined", label: "Ablehnungen" },
  { key: "subscription.started", label: "Abos" },
  { key: "admin.action", label: "Admin" },
  { key: "referral", label: "Empfehlungen" },
  { key: "email", label: "E-Mails" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const PAGE_SIZE = 40;

function DetailChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-xs text-white/60">
      <span className="text-white/35">{icon}</span>
      {children}
    </span>
  );
}

function AdminLogs() {
  const { user } = useTebexAuth();
  const { can } = useAdminSession();
  const basketIdent = user?.basketIdent;
  const [filter, setFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const query = useQuery({
    queryKey: ["admin-logs", basketIdent],
    enabled: !!basketIdent && can("logs.view"),
    queryFn: () => fetchAdminLogs({ data: { basketIdent: basketIdent! } }),
  });

  const logs = query.data?.logs ?? [];

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return logs.filter((l) => {
      if (filter !== "all") {
        if (filter === "email") {
          if (!l.type.startsWith("email.")) return false;
        } else if (filter === "referral") {
          if (!l.type.startsWith("referral.")) return false;
        } else if (l.type !== filter) return false;
      }
      if (fromTs != null || toTs != null) {
        const ts = new Date(l.at).getTime();
        if (Number.isNaN(ts)) return false;
        if (fromTs != null && ts < fromTs) return false;
        if (toTs != null && ts > toTs) return false;
      }
      return true;
    });
  }, [logs, filter, from, to]);

  // Reset the visible window whenever the filter or date range changes.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filter, from, to]);

  const shown = filtered.slice(0, visible);

  if (!can("logs.view")) {
    return (
      <div>
        <AdminPageHeader eyebrow="Admin Panel" title="Logs" icon={<ScrollText className="h-5 w-5" />} />
        <NoAccess />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Panel"
        title="Logs"
        subtitle="Käufe, Ablehnungen, Abos, E-Mail-Ereignisse und Admin-Aktionen. Die komplette, auf Tebex verfügbare Historie."
        icon={<ScrollText className="h-5 w-5" />}
      />

      {/* Filter bar */}
      <Panel className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
              Typ
            </span>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                    filter === f.key
                      ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-white"
                      : "border-white/10 text-white/45 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
                Von
              </span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 [color-scheme:dark] focus:border-[#FF3B3B]/40 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
                Bis
              </span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 [color-scheme:dark] focus:border-[#FF3B3B]/40 focus:outline-none"
              />
            </label>
            {(from || to) && (
              <button
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/50 transition hover:text-white"
              >
                Zurücksetzen
              </button>
            )}
          </div>
        </div>
      </Panel>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : query.data && !query.data.configured ? (
        <EmptyNotice icon={<ScrollText className="h-8 w-8" />}>
          Logs sind derzeit nicht verfügbar.
        </EmptyNotice>
      ) : filtered.length === 0 ? (
        <EmptyNotice icon={<ScrollText className="h-8 w-8" />}>
          Keine Log-Einträge für diese Auswahl.
        </EmptyNotice>
      ) : (
        <>
          <div className="mb-3 text-xs text-white/40">
            {shown.length} von {filtered.length} Einträgen
          </div>
          <div className="space-y-3">
            {shown.map((l) => {
              const meta = metaOf(l.type);
              const Icon = meta.icon;
              return (
                <div
                  key={l.id}
                  className="group flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.03]"
                >
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${meta.tint} ${meta.ring} ${meta.text}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-sm font-bold ${meta.text}`}>{meta.label}</span>
                      <span className="whitespace-nowrap text-xs text-white/35">
                        {formatDateTime(l.at)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(l.cfxName || l.actor) && (
                        <DetailChip icon={<User className="h-3.5 w-3.5" />}>
                          {l.cfxName ?? l.actor}
                        </DetailChip>
                      )}
                      {l.tebexId && (
                        <DetailChip icon={<CreditCard className="h-3.5 w-3.5" />}>
                          {l.tebexId}
                        </DetailChip>
                      )}
                      {l.packageName && (
                        <DetailChip icon={<Package className="h-3.5 w-3.5" />}>
                          {l.packageName}
                        </DetailChip>
                      )}
                      {l.amount != null && (
                        <DetailChip icon={<CreditCard className="h-3.5 w-3.5" />}>
                          {formatPrice(l.amount, l.currency ?? "EUR")}
                        </DetailChip>
                      )}
                      {l.paymentMethod && (
                        <DetailChip icon={<CreditCard className="h-3.5 w-3.5" />}>
                          {l.paymentMethod}
                        </DetailChip>
                      )}
                    </div>

                    {l.detail && (
                      <p className="mt-2 text-sm leading-relaxed text-white/55">{l.detail}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length > visible && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:border-[#FF3B3B]/40 hover:text-white"
              >
                Mehr laden ({filtered.length - visible} weitere)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
