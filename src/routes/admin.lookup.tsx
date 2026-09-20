import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Search, ExternalLink, Loader2, User } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AdminButton,
  AdminPageHeader,
  EmptyNotice,
  NoAccess,
  Panel,
  inputClass,
} from "@/components/admin/ui";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import { adminLookup, warmLookupCache, type LookupResult } from "@/lib/admin/admin.functions";
import { formatPrice } from "@/lib/cart-store";

export const Route = createFileRoute("/admin/lookup")({
  component: AdminLookup,
});

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const PAGE_SIZE = 50;

function StatusBadge({ status }: { status: string | number | null }) {
  const label = status == null || status === "" ? "—" : String(status);
  const s = label.toLowerCase();
  let cls = "border-white/10 bg-white/5 text-white/60";
  if (/(complete|paid|success|^1$)/.test(s)) cls = "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  else if (/(refund|chargeback)/.test(s)) cls = "border-amber-400/25 bg-amber-400/10 text-amber-300";
  else if (/(declin|denied|fail|reject|void|cancel)/.test(s)) cls = "border-red-400/25 bg-red-400/10 text-red-300";
  else if (/(admin|gift|geschenk|manuell|manual)/.test(s)) cls = "border-sky-400/25 bg-sky-400/10 text-sky-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {label}
    </span>
  );
}

function AdminLookup() {
  const { user } = useTebexAuth();
  const { can } = useAdminSession();
  const basketIdent = user?.basketIdent;
  const [q, setQ] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const mut = useMutation({
    mutationFn: () => adminLookup({ data: { basketIdent: basketIdent!, query: q.trim() } }),
    onSuccess: (res) => {
      setVisible(PAGE_SIZE);
      setResult(res);
    },
  });

  // Start loading the payment history as soon as the page is open, so it is
  // usually ready by the time a name has been typed. Fire-and-forget.
  const canView = can("lookup.view");
  useEffect(() => {
    if (!basketIdent || !canView) return;
    void warmLookupCache({ data: { basketIdent } }).catch(() => {});
  }, [basketIdent, canView]);

  if (!can("lookup.view")) {
    return (
      <div>
        <AdminPageHeader eyebrow="Admin Panel" title="Lookup" icon={<Search className="h-5 w-5" />} />
        <NoAccess />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Panel"
        title="Lookup"
        subtitle="Suche nach Username, Discord-Name oder Tebex-ID oder zeige die komplette Zahlungshistorie. Egal ob bezahlt, abgelehnt, erstattet oder vom Betreiber erstellt, hier siehst du alles."
        icon={<Search className="h-5 w-5" />}
      />

      <Panel className="mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Username, Discord oder Tebex-ID …"
              className={`${inputClass} pl-10`}
            />
          </div>
          <AdminButton type="submit" disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Suchen
          </AdminButton>
          <AdminButton
            type="button"
            variant="ghost"
            disabled={mut.isPending}
            onClick={() => {
              setQ("");
              mut.mutate();
            }}
          >
            Alle anzeigen
          </AdminButton>
        </form>
      </Panel>

      {mut.isPending ? (
        // The first search after a server start loads the whole Tebex payment
        // history, which takes a while — say so instead of showing nothing.
        <Panel>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#FF3B3B]" />
            <p className="text-sm font-medium text-white/80">Zahlungshistorie wird durchsucht …</p>
            <p className="max-w-sm text-xs leading-relaxed text-white/40">
              Die erste Suche lädt die komplette Tebex-Historie und kann einige Sekunden dauern.
              Danach sind weitere Suchen sofort da.
            </p>
          </div>
        </Panel>
      ) : mut.isError ? (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm font-medium text-white/80">Die Suche konnte nicht ausgeführt werden.</p>
            <p className="max-w-sm text-xs leading-relaxed text-white/40">
              Es wurde nichts gefunden, weil die Anfrage fehlgeschlagen ist, nicht weil es keine
              Zahlungen gibt. Bitte erneut versuchen.
            </p>
            <AdminButton variant="ghost" onClick={() => mut.mutate()}>
              Erneut suchen
            </AdminButton>
          </div>
        </Panel>
      ) : result ? (
        !result.configured ? (
          <EmptyNotice icon={<Search className="h-8 w-8" />}>
            Die Kaufsuche ist derzeit nicht verfügbar.
          </EmptyNotice>
        ) : result.purchases.length === 0 ? (
          <EmptyNotice icon={<Search className="h-8 w-8" />}>
            {result.incomplete
              ? "Tebex hat die Zahlungshistorie gerade nicht vollständig geliefert. Das Ergebnis ist deshalb nicht verlässlich. Bitte gleich noch einmal suchen."
              : q
                ? `Keine Zahlungen für „${q}“ gefunden.`
                : "Keine Zahlungen vorhanden."}
          </EmptyNotice>
        ) : (
          <div>
            {result.incomplete && (
              <p className="mb-3 text-xs text-white/40">
                Hinweis: Tebex hat die Zahlungshistorie gerade nicht vollständig geliefert. Es
                können Einträge fehlen. Bitte gleich noch einmal suchen.
              </p>
            )}
            <Panel className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-[#FF3B3B]">
                    <User className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="font-display text-lg font-bold text-white">
                      {result.username ?? (q ? "Unbekannt" : "Alle Zahlungen")}
                    </div>
                    {result.cfxId ? (
                      <div className="text-xs text-white/40">CFX {result.cfxId}</div>
                    ) : (
                      <div className="text-xs text-white/40">Komplette Historie</div>
                    )}
                  </div>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
                  {Math.min(visible, result.purchases.length)} von {result.purchases.length} Einträgen
                </span>
              </div>
            </Panel>

            <Panel className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.12em] text-white/40">
                      <th className="px-5 py-3 font-bold">Käufer</th>
                      <th className="px-5 py-3 font-bold">Artikel</th>
                      <th className="px-5 py-3 font-bold">Datum</th>
                      <th className="px-5 py-3 font-bold">Betrag</th>
                      <th className="px-5 py-3 font-bold">Status</th>
                      <th className="px-5 py-3 text-right font-bold">Store</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {result.purchases.slice(0, visible).map((p) => (
                      <tr key={p.txnId} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-white/85">{p.buyer ?? "—"}</div>
                          {p.cfxId && <div className="text-xs text-white/35">CFX {p.cfxId}</div>}
                        </td>
                        <td className="px-5 py-3.5 text-white/80">{p.packageName}</td>
                        <td className="px-5 py-3.5 text-white/50">{formatDateTime(p.date)}</td>
                        <td className="px-5 py-3.5 text-white/70">
                          {p.amount != null ? formatPrice(p.amount, p.currency ?? "EUR") : "—"}
                        </td>
                        <td className="px-5 py-3.5"><StatusBadge status={p.status} /></td>
                        <td className="px-5 py-3.5 text-right">
                          {p.packageId != null ? (
                            <Link
                              to="/store/$packageId"
                              params={{ packageId: String(p.packageId) }}
                              className="inline-flex items-center gap-1.5 text-[#FF3B3B] hover:text-[#ff6a3d]"
                            >
                              Öffnen <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <span className="text-white/25">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {result.purchases.length > visible && (
              <div className="mt-5 flex justify-center">
                <button
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:border-[#FF3B3B]/40 hover:text-white"
                >
                  Mehr laden ({result.purchases.length - visible} weitere)
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        <EmptyNotice icon={<Search className="h-8 w-8" />}>
          Gib einen Suchbegriff ein oder klicke auf „Alle anzeigen“, um die komplette
          Zahlungshistorie zu sehen.
        </EmptyNotice>
      )}
    </div>
  );
}
