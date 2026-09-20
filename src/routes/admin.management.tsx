import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SlidersHorizontal,
  Undo2,
  CreditCard,
  Ticket,
  Gift,
  UsersRound,
  ShieldPlus,
  Loader2,
  Check,
  ExternalLink,
  Trash2,
  ShieldCheck,
  Search,
  X,
  ReceiptText,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { notify as toast } from "@/components/Notify";
import {
  AdminButton,
  AdminPageHeader,
  Field,
  NoAccess,
  Panel,
  PanelTitle,
  inputClass,
  selectClass,
} from "@/components/admin/ui";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import {
  createAdminRole,
  createManualPayment,
  createRefund,
  deleteAdminRole,
  deleteRosterEntry,
  fetchAdminRoles,
  fetchAdminRoster,
  fetchAllSales,
  fetchCoupons,
  fetchGiftcards,
  fetchStorePackages,
  manageCoupon,
  manageGiftcard,
  upsertRosterEntry,
  type AdminCoupon,
  type AdminGiftcard,
  type AdminSale,
} from "@/lib/admin/admin.functions";
import { PERMISSIONS, type Permission } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin/management")({
  component: AdminManagement,
});

// Tebex's public plugin API is read-oriented: creating coupons, gift cards,
// refunds and manual payments is only possible in the Tebex Creator panel.
// We link there directly instead of pretending it works via API.
const TEBEX_PANEL = "https://creator.tebex.io";

function TebexLink({ label = "Im Tebex-Panel verwalten" }: { label?: string }) {
  return (
    <a
      href={TEBEX_PANEL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm font-semibold text-white/70 transition hover:border-[#FF3B3B]/40 hover:text-white"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

type Tab = { key: string; label: string; icon: ReactNode; perms: Permission[] };

function formatTebexDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(d);
}

const TABS: Tab[] = [
  {
    key: "general",
    label: "Allgemein",
    icon: <SlidersHorizontal className="h-4 w-4" />,
    perms: [
      "management.refund",
      "management.payment",
      "coupon.view",
      "coupon.create",
      "coupon.delete",
      "giftcard.view",
      "giftcard.create",
      "giftcard.delete",
    ],
  },
  {
    key: "admins",
    label: "Admins",
    icon: <UsersRound className="h-4 w-4" />,
    perms: ["roster.view", "roster.manage"],
  },
  {
    key: "roles",
    label: "Rollen",
    icon: <ShieldPlus className="h-4 w-4" />,
    perms: ["roles.view", "roles.create", "roles.edit", "roles.delete"],
  },
];

function reasonToast(res: { ok: boolean; reason?: string }, okMsg: string) {
  if (res.ok) {
    toast.success(okMsg);
    return;
  }
  const map: Record<string, string> = {
    tebex_secret_missing: "TEBEX_SECRET fehlt in der .env",
    tebex_error: "Tebex hat die Aktion abgelehnt. Bitte Eingaben prüfen.",
    invalid_input: "Bitte fülle alle Pflichtfelder korrekt aus.",
    store_not_configured:
      "Keine Datenbank angebunden (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in der .env)",
    store_unavailable:
      "Die Datenbank ist gerade nicht erreichbar. Es wurde nichts geändert. Bitte gleich nochmal versuchen.",
    not_implemented:
      "Diese Aktion ist nur im Tebex-Creator-Panel möglich. Nutze den Button „Im Tebex-Panel verwalten“.",
    protected: "Dieser Account ist geschützt und kann nicht bearbeitet werden.",
    unknown_role: "Unbekannte Rolle",
    invalid_cfx: "Ungültige CFX-ID",
    invalid_role: "Ungültiger Rollenname",
    role_exists: "Diese Rolle existiert bereits",
    builtin_role: "Standard-Rollen können nicht gelöscht werden",
    role_in_use: "Rolle wird noch von einem Admin genutzt",
    FORBIDDEN: "Keine Berechtigung",
  };
  toast.error(map[res.reason ?? ""] ?? "Aktion fehlgeschlagen");
}

function AdminManagement() {
  const { user } = useTebexAuth();
  const { can } = useAdminSession();
  const basketIdent = user?.basketIdent;

  const tabs = TABS.filter((tab) => tab.perms.some((p) => can(p)));
  const [active, setActive] = useState(tabs[0]?.key ?? "general");

  const anyManagement = tabs.length > 0;

  if (!anyManagement) {
    return (
      <div>
        <AdminPageHeader eyebrow="Admin Panel" title="Management" icon={<SlidersHorizontal className="h-5 w-5" />} />
        <NoAccess />
      </div>
    );
  }

  const current = tabs.find((t) => t.key === active) ? active : tabs[0].key;

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Panel"
        title="Management"
        subtitle="Rückerstattungen, Zahlungen, Coupons, Giftcards, CFX-IDs und Rollen."
        icon={<SlidersHorizontal className="h-5 w-5" />}
      />

      <div className="mb-6 flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors ${
              current === tab.key
                ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-white"
                : "border-white/10 text-white/45 hover:text-white"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {current === "general" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-[#FF3B3B]/15 bg-gradient-to-br from-[#FF3B3B]/[0.08] to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FF3B3B]/15 text-[#FF3B3B]">
                <SlidersHorizontal className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  Store-Verwaltung
                </h3>
                <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-white/50">
                  Coupons, Giftcards, Refunds und manuelle Zahlungen werden aus
                  Sicherheitsgründen final im Tebex-Creator-Panel bestätigt. Nutze die
                  Formulare als Schnellzugriff und öffne das Panel für den Abschluss.
                </p>
              </div>
            </div>
            <TebexLink label="Tebex-Panel öffnen" />
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            {can("management.refund") && <RefundSection basketIdent={basketIdent} />}
            {can("management.payment") && <PaymentSection basketIdent={basketIdent} />}
          </div>
          {(can("coupon.create") || can("coupon.delete") || can("coupon.view")) && (
            <CouponSection basketIdent={basketIdent} canCreate={can("coupon.create")} canDelete={can("coupon.delete")} />
          )}
          {(can("giftcard.create") || can("giftcard.delete") || can("giftcard.view")) && (
            <GiftcardSection basketIdent={basketIdent} canCreate={can("giftcard.create")} canDelete={can("giftcard.delete")} />
          )}
        </div>
      )}
      {current === "admins" && (can("roster.view") || can("roster.manage")) && (
        <RosterSection basketIdent={basketIdent} canManage={can("roster.manage")} />
      )}
      {current === "roles" && (
        <RolesSection
          basketIdent={basketIdent}
          canCreate={can("roles.create")}
          canDelete={can("roles.delete")}
        />
      )}
    </div>
  );
}

function RefundSection({ basketIdent }: { basketIdent?: string }) {
  const [txn, setTxn] = useState("");
  const [salesOpen, setSalesOpen] = useState(false);
  const mut = useMutation({
    mutationFn: () => createRefund({ data: { basketIdent: basketIdent!, transactionId: txn.trim() } }),
    onSuccess: (res) => reasonToast(res, "Rückerstattung ausgelöst"),
    onError: () => toast.error("Fehler"),
  });
  return (
    <Panel>
      <PanelTitle icon={<Undo2 className="h-[18px] w-[18px]" />} title="Rückerstattung" sub="Transaktion per Tebex-ID zurückerstatten." />
      <div className="space-y-4">
        <Field label="Transaktions-ID">
          <input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="tbx-..." className={inputClass} />
        </Field>
        <AdminButton variant="ghost" onClick={() => setSalesOpen(true)} className="w-full">
          <ReceiptText className="h-4 w-4" />
          Alle Verkäufe ansehen
        </AdminButton>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton variant="danger" onClick={() => mut.mutate()} disabled={!txn.trim() || mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Rückerstatten
          </AdminButton>
          <TebexLink label="Im Panel erstatten" />
        </div>
      </div>
      {salesOpen && (
        <SalesModal
          basketIdent={basketIdent}
          onClose={() => setSalesOpen(false)}
          onPick={(id) => {
            setTxn(id);
            setSalesOpen(false);
          }}
        />
      )}
    </Panel>
  );
}

function SalesModal({
  basketIdent,
  onClose,
  onPick,
}: {
  basketIdent?: string;
  onClose: () => void;
  onPick: (txnId: string) => void;
}) {
  const [q, setQ] = useState("");
  const salesQuery = useQuery({
    queryKey: ["admin-sales", basketIdent],
    enabled: !!basketIdent,
    queryFn: () => fetchAllSales({ data: { basketIdent: basketIdent! } }),
  });
  const sales = salesQuery.data ?? [];
  const term = q.trim().toLowerCase();
  const filtered = term
    ? sales.filter((s) => {
        const dateStr = s.date ? formatTebexDate(s.date).toLowerCase() : "";
        return (
          s.txnId.toLowerCase().includes(term) ||
          s.buyer.toLowerCase().includes(term) ||
          s.packageName.toLowerCase().includes(term) ||
          (s.status ?? "").toLowerCase().includes(term) ||
          dateStr.includes(term)
        );
      })
    : sales;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-6 w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0C0C0D] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ReceiptText className="h-5 w-5 text-[#FF3B3B]" />
            <h2 className="font-display text-base font-bold text-white">Alle Verkäufe</h2>
            <span className="text-xs text-white/40">{filtered.length} Einträge</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-white/[0.06] p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche nach Transaktion, Name, Paket, Datum oder Status…"
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {salesQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-white/40">Keine Verkäufe gefunden.</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filtered.map((s) => (
                <button
                  key={s.txnId}
                  type="button"
                  onClick={() => onPick(s.txnId)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display font-bold text-white">{s.buyer}</span>
                      {s.status && (
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/50">
                          {s.status}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-white/40">
                      {s.txnId} · {s.packageName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-white">
                      {s.amount != null ? `${s.amount.toFixed(2)} ${s.currency}` : "—"}
                    </div>
                    <div className="text-xs text-white/40">{formatTebexDate(s.date)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentSection({ basketIdent }: { basketIdent?: string }) {
  const [cfxId, setCfxId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [price, setPrice] = useState("0");
  const packagesQuery = useQuery({
    queryKey: ["store-packages", basketIdent],
    enabled: !!basketIdent,
    queryFn: () => fetchStorePackages({ data: { basketIdent: basketIdent! } }),
    staleTime: 5 * 60 * 1000,
  });
  const packages = packagesQuery.data ?? [];
  const mut = useMutation({
    mutationFn: () =>
      createManualPayment({
        data: {
          basketIdent: basketIdent!,
          cfxId: cfxId.trim(),
          packageId: Number(packageId),
          price: Number(price),
        },
      }),
    onSuccess: (res) => reasonToast(res, "Zahlung erstellt"),
    onError: () => toast.error("Fehler"),
  });
  const valid = cfxId.trim() && Number(packageId) > 0 && Number(price) >= 0;
  return (
    <Panel>
      <PanelTitle icon={<CreditCard className="h-[18px] w-[18px]" />} title="Zahlung erstellen" sub="Manuelle Zahlung / Gratis-Delivery (Preis 0 = kostenlos)." />
      <div className="space-y-4">
        <Field label="CFX-ID">
          <input value={cfxId} onChange={(e) => setCfxId(e.target.value)} placeholder="1234567" className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Asset / Paket">
            <select
              value={packageId}
              onChange={(e) => {
                const id = e.target.value;
                setPackageId(id);
                const pkg = packages.find((p) => String(p.id) === id);
                if (pkg) setPrice(String(pkg.price));
              }}
              className={selectClass}
            >
              <option value="" className="bg-[#0C0C0D]">
                {packagesQuery.isLoading ? "Lädt Assets…" : "Asset wählen…"}
              </option>
              {packages.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0C0C0D]">
                  {p.name} ({p.price.toFixed(2)} {p.currency})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preis (€)">
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className={inputClass} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton onClick={() => mut.mutate()} disabled={!valid || mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Zahlung erstellen
          </AdminButton>
          <TebexLink label="Im Panel erstellen" />
        </div>
      </div>
    </Panel>
  );
}

function CouponSection({
  basketIdent,
  canCreate,
  canDelete,
}: {
  basketIdent?: string;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("10");
  const [note, setNote] = useState("");
  const [expire, setExpire] = useState("");
  const [unlimited, setUnlimited] = useState(true);
  const [maxUses, setMaxUses] = useState("1");
  const [openId, setOpenId] = useState<string | number | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin-coupons", basketIdent],
    enabled: !!basketIdent && canDelete,
    queryFn: () => fetchCoupons({ data: { basketIdent: basketIdent! } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-coupons", basketIdent] });

  const createMut = useMutation({
    mutationFn: () =>
      manageCoupon({
        data: {
          basketIdent: basketIdent!,
          action: "create",
          code: code.trim(),
          discountPercent: Number(discount),
          note: note.trim() || undefined,
          expireDate: expire || undefined,
          redeemUnlimited: unlimited,
          redeemLimit: unlimited ? undefined : Math.max(1, Number(maxUses) || 1),
        },
      }),
    onSuccess: (res) => {
      reasonToast(res, "Coupon erstellt");
      if (res.ok) {
        setCode("");
        setNote("");
        setExpire("");
        setUnlimited(true);
        setMaxUses("1");
        invalidate();
      }
    },
  });
  const delMut = useMutation({
    mutationFn: (c: AdminCoupon) =>
      manageCoupon({
        data: { basketIdent: basketIdent!, action: "delete", couponId: c.id, code: c.code },
      }),
    onSuccess: (res) => {
      reasonToast(res, "Coupon gelöscht");
      if (res.ok) invalidate();
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canCreate && (
        <Panel>
          <PanelTitle icon={<Ticket className="h-[18px] w-[18px]" />} title="Coupon erstellen" />
          <div className="space-y-4">
            <Field label="Code">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SUMMER20" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rabatt (%)">
                <input value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Ablaufdatum (optional)">
                <input type="date" value={expire} onChange={(e) => setExpire(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Grund / Notiz (wird in Tebex gespeichert)">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Sommer-Aktion" className={inputClass} />
            </Field>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white/80">Unbegrenzt oft einlösbar</span>
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(e) => setUnlimited(e.target.checked)}
                  className="h-4 w-4 accent-[#FF3B3B]"
                />
              </label>
              {!unlimited && (
                <div className="mt-3">
                  <Field label="Maximale Einlösungen">
                    <input
                      type="number"
                      min={1}
                      value={maxUses}
                      onChange={(e) => setMaxUses(e.target.value)}
                      placeholder="1"
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AdminButton onClick={() => createMut.mutate()} disabled={!code.trim() || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Erstellen
              </AdminButton>
              <TebexLink label="Im Panel erstellen" />
            </div>
          </div>
        </Panel>
      )}
      {canDelete && (
        <Panel className="p-0">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2">
              <Ticket className="h-[18px] w-[18px] text-white/60" />
              <h2 className="font-display text-base font-bold text-white">Coupons löschen</h2>
            </div>
            <span className="text-xs text-white/40">{listQuery.data?.length ?? 0} aktiv</span>
          </div>
          <div className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              </div>
            ) : (listQuery.data ?? []).length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-white/40">Keine Coupons vorhanden.</div>
            ) : (
              (listQuery.data ?? []).map((c) => {
                const open = openId === c.id;
                return (
                  <div key={c.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : c.id)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-white/[0.02]"
                    >
                      <div className="min-w-0">
                        <span className="font-display font-bold text-white">{c.code}</span>
                        <span className="ml-2 text-sm text-[#FF3B3B]">
                          {c.discountType === "percentage" ? `${c.discountValue}%` : `${c.discountValue}€`}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-white/40">
                        {c.expireNever ? "Läuft nie ab" : `bis ${formatTebexDate(c.expireDate)}`}
                      </span>
                    </button>
                    {open && (
                      <div className="space-y-2 border-t border-white/[0.04] bg-white/[0.01] px-5 py-4 text-sm text-white/60">
                        <p>Gültig für: {c.basketType ?? "—"}</p>
                        <p>Ablauf: {c.expireNever ? "Nie" : formatTebexDate(c.expireDate)}</p>
                        <p>Einlösungen: {c.redeemUnlimited ? "Unbegrenzt" : `max. ${c.redeemLimit}x`}</p>
                        {c.note && <p>Notiz: {c.note}</p>}
                        <AdminButton
                          variant="danger"
                          onClick={() => delMut.mutate(c)}
                          disabled={delMut.isPending}
                        >
                          {delMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Coupon löschen
                        </AdminButton>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function GiftcardSection({
  basketIdent,
  canCreate,
  canDelete,
}: {
  basketIdent?: string;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [expire, setExpire] = useState("");
  const [openId, setOpenId] = useState<string | number | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin-giftcards", basketIdent],
    enabled: !!basketIdent && canDelete,
    queryFn: () => fetchGiftcards({ data: { basketIdent: basketIdent! } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-giftcards", basketIdent] });

  const createMut = useMutation({
    mutationFn: () =>
      manageGiftcard({
        data: {
          basketIdent: basketIdent!,
          action: "create",
          amount: Number(amount),
          note: note.trim() || undefined,
          expiresAt: expire || undefined,
        },
      }),
    onSuccess: (res) => {
      reasonToast(res, "Giftcard erstellt");
      if (res.ok) {
        setNote("");
        setExpire("");
        invalidate();
      }
    },
  });
  const delMut = useMutation({
    mutationFn: (g: AdminGiftcard) =>
      manageGiftcard({
        data: { basketIdent: basketIdent!, action: "delete", cardId: g.id, code: g.code },
      }),
    onSuccess: (res) => {
      reasonToast(res, "Giftcard entwertet");
      if (res.ok) invalidate();
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canCreate && (
        <Panel>
          <PanelTitle icon={<Gift className="h-[18px] w-[18px]" />} title="Giftcard erstellen" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Betrag (€)">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Ablaufdatum (optional)">
                <input type="date" value={expire} onChange={(e) => setExpire(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Grund / Notiz (wird in Tebex gespeichert)">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Support-Wiedergutmachung" className={inputClass} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <AdminButton onClick={() => createMut.mutate()} disabled={Number(amount) <= 0 || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Erstellen
              </AdminButton>
              <TebexLink label="Im Panel erstellen" />
            </div>
          </div>
        </Panel>
      )}
      {canDelete && (
        <Panel className="p-0">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2">
              <Gift className="h-[18px] w-[18px] text-white/60" />
              <h2 className="font-display text-base font-bold text-white">Giftcards entwerten</h2>
            </div>
            <span className="text-xs text-white/40">{listQuery.data?.length ?? 0} vorhanden</span>
          </div>
          <div className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              </div>
            ) : (listQuery.data ?? []).length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-white/40">Keine Giftcards vorhanden.</div>
            ) : (
              (listQuery.data ?? []).map((g) => {
                const open = openId === g.id;
                return (
                  <div key={g.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : g.id)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-white/[0.02]"
                    >
                      <div className="min-w-0">
                        <span className="font-display font-bold text-white">{g.code}</span>
                        {g.void && (
                          <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/50">
                            Entwertet
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-white/40">
                        {g.remaining.toFixed(2)} / {g.starting.toFixed(2)} {g.currency}
                      </span>
                    </button>
                    {open && (
                      <div className="space-y-2 border-t border-white/[0.04] bg-white/[0.01] px-5 py-4 text-sm text-white/60">
                        <p>Guthaben: {g.remaining.toFixed(2)} von {g.starting.toFixed(2)} {g.currency}</p>
                        {g.note && <p>Notiz: {g.note}</p>}
                        {!g.void && (
                          <AdminButton
                            variant="danger"
                            onClick={() => delMut.mutate(g)}
                            disabled={delMut.isPending}
                          >
                            {delMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Giftcard entwerten
                          </AdminButton>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function RosterSection({ basketIdent, canManage }: { basketIdent?: string; canManage: boolean }) {
  const qc = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: ["admin-roles", basketIdent],
    enabled: !!basketIdent,
    queryFn: () => fetchAdminRoles({ data: { basketIdent: basketIdent! } }),
  });
  const rosterQuery = useQuery({
    queryKey: ["admin-roster", basketIdent],
    enabled: !!basketIdent,
    queryFn: () => fetchAdminRoster({ data: { basketIdent: basketIdent! } }),
  });

  const [cfxId, setCfxId] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState("founder");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-roster", basketIdent] });

  const upsertMut = useMutation({
    mutationFn: (vars: { cfxId: string; role: string; label?: string }) =>
      upsertRosterEntry({ data: { basketIdent: basketIdent!, ...vars } }),
    onSuccess: (res) => {
      reasonToast(res, "Admin gespeichert");
      if (res.ok) {
        setCfxId("");
        setLabel("");
        invalidate();
      }
    },
    onError: () => toast.error("Aktion fehlgeschlagen"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteRosterEntry({ data: { basketIdent: basketIdent!, cfxId: id } }),
    onSuccess: (res) => {
      reasonToast(res, "Admin entfernt");
      if (res.ok) invalidate();
    },
    onError: () => toast.error("Aktion fehlgeschlagen"),
  });

  const configured = rosterQuery.data?.configured ?? false;
  const roster = rosterQuery.data?.roster ?? [];
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const filtered = term
    ? roster.filter(
        (e) =>
          (e.label ?? "").toLowerCase().includes(term) ||
          e.cfxId.toLowerCase().includes(term) ||
          (e.roleLabel ?? "").toLowerCase().includes(term),
      )
    : roster;

  return (
    <div className="space-y-6">
      <Panel className="p-0">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#FF3B3B]/15 text-[#FF3B3B]">
              <UsersRound className="h-4 w-4" />
            </span>
            <h2 className="font-display text-base font-bold text-white">Admins</h2>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-semibold text-white/50">
              {roster.length}
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Admin suchen (Name, CFX, Rolle)…"
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {rosterQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : roster.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-white/40">
              Noch keine Admins hinterlegt.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-white/40">
              Kein Admin passt zur Suche „{search}“.
            </div>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry.cfxId}
                className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-white/[0.02]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] font-display text-sm font-bold uppercase text-white/70">
                    {(entry.label ?? entry.cfxId).slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display font-bold text-white">
                        {entry.label ?? entry.cfxId}
                      </span>
                      {entry.protected && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#FF3B3B]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#FF3B3B]">
                          <ShieldCheck className="h-3 w-3" /> Geschützt
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-white/40">CFX {entry.cfxId}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full border border-[#FF3B3B]/20 bg-[#FF3B3B]/[0.08] px-2.5 py-1 text-xs font-semibold text-[#FF3B3B]">
                    {entry.roleLabel}
                  </span>
                  {canManage && !entry.protected && (
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate(entry.cfxId)}
                      disabled={deleteMut.isPending}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-sm text-white/60 transition hover:border-[#FF3B3B]/40 hover:text-[#FF3B3B] disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {canManage && (
        <Panel className="max-w-xl">
          <PanelTitle
            icon={<UsersRound className="h-[18px] w-[18px]" />}
            title="Admin hinzufügen / bearbeiten"
            sub="Bestehende CFX-ID erneut hinzufügen, um die Rolle zu ändern."
          />
          <div className="space-y-4">
            <Field label="CFX-ID">
              <input
                value={cfxId}
                onChange={(e) => setCfxId(e.target.value)}
                placeholder="1234567"
                className={inputClass}
              />
            </Field>
            <Field label="Name (optional)">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. Tretex"
                className={inputClass}
              />
            </Field>
            <Field label="Rolle">
              <select value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
                {(rolesQuery.data ?? []).map((r) => (
                  <option key={r.key} value={r.key} className="bg-[#0C0C0D]">
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <AdminButton
              onClick={() =>
                upsertMut.mutate({ cfxId: cfxId.trim(), role, label: label.trim() || undefined })
              }
              disabled={!cfxId.trim() || !configured || upsertMut.isPending}
            >
              {upsertMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UsersRound className="h-4 w-4" />
              )}
              Speichern
            </AdminButton>
            {!configured && (
              <p className="text-xs text-white/40">
                Die Admin-Verwaltung ist derzeit nicht verfügbar.
              </p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function RolesSection({
  basketIdent,
  canCreate,
  canDelete,
}: {
  basketIdent?: string;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: ["admin-roles", basketIdent],
    enabled: !!basketIdent,
    queryFn: () => fetchAdminRoles({ data: { basketIdent: basketIdent! } }),
  });
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<Permission[]>([]);

  const toggle = (p: Permission) =>
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-roles", basketIdent] });

  const createMut = useMutation({
    mutationFn: (vars: { label: string; permissions: Permission[] }) =>
      createAdminRole({ data: { basketIdent: basketIdent!, ...vars } }),
    onSuccess: (res) => {
      reasonToast(res, "Rolle erstellt");
      if (res.ok) {
        setLabel("");
        setSelected([]);
        invalidate();
      }
    },
    onError: () => toast.error("Aktion fehlgeschlagen"),
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) => deleteAdminRole({ data: { basketIdent: basketIdent!, key } }),
    onSuccess: (res) => {
      reasonToast(res, "Rolle gelöscht");
      if (res.ok) invalidate();
    },
    onError: () => toast.error("Aktion fehlgeschlagen"),
  });

  return (
    <div className="space-y-6">
      <Panel className="p-0">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="font-display text-base font-bold text-white">Rollen</h2>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {rolesQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : (
            (rolesQuery.data ?? []).map((r) => (
              <div key={r.key} className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-white">{r.label}</span>
                    {r.builtin && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/50">
                        Standard
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-white/40">{r.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-right text-xs text-white/40">
                    {r.permissions === "*" ? "Alle Rechte" : `${r.permissions.length} Rechte`}
                  </span>
                  {canDelete && !r.builtin && (
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate(r.key)}
                      disabled={deleteMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-sm text-white/60 transition hover:border-[#FF3B3B]/40 hover:text-[#FF3B3B] disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {canCreate && (
        <Panel>
          <PanelTitle icon={<ShieldPlus className="h-[18px] w-[18px]" />} title="Neue Rolle erstellen" sub="Wähle die Berechtigungen dieser Rolle." />
          <div className="space-y-4">
            <Field label="Rollenname">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Moderator" className={inputClass} />
            </Field>
            <div>
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
                Berechtigungen ({selected.length})
              </span>
              <div className="space-y-4">
                {Object.entries(
                  PERMISSIONS.reduce<Record<string, Permission[]>>((acc, p) => {
                    const cat = p.split(".")[0];
                    (acc[cat] ??= []).push(p);
                    return acc;
                  }, {}),
                ).map(([cat, perms]) => (
                  <div key={cat}>
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#FF3B3B]/70">
                      {cat}
                    </span>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {perms.map((p) => {
                        const on = selected.includes(p);
                        return (
                          <button
                            type="button"
                            key={p}
                            onClick={() => toggle(p)}
                            className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              on
                                ? "border-[#FF3B3B]/50 bg-[#FF3B3B]/10 text-white"
                                : "border-white/[0.06] bg-white/[0.02] text-white/55 hover:border-white/15"
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                                on
                                  ? "border-[#FF3B3B] bg-[#FF3B3B]"
                                  : "border-white/20 bg-transparent group-hover:border-white/35"
                              }`}
                            >
                              {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                            </span>
                            <code className="text-xs">{p}</code>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <AdminButton
              onClick={() => createMut.mutate({ label: label.trim(), permissions: selected })}
              disabled={!label.trim() || createMut.isPending}
            >
              {createMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldPlus className="h-4 w-4" />
              )}
              Rolle erstellen
            </AdminButton>
          </div>
        </Panel>
      )}
    </div>
  );
}
