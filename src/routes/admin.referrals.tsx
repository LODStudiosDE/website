import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, Pencil, Trash2, Check, X, Users, Sparkles, Trophy, Power } from "lucide-react";
import { notify as toast } from "@/components/Notify";
import {
  AdminButton,
  AdminIconButton,
  AdminPageHeader,
  AdminToggle,
  EmptyNotice,
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
  deleteReferralReward,
  fetchAdminReferralOverview,
  saveReferralSettings,
  setReferralStatus,
  upsertReferralReward,
  type AdminReferralOverview,
} from "@/lib/admin/referral.admin.functions";
import type { ReferralReward, ReferralSettings } from "@/lib/referral.shared";

export const Route = createFileRoute("/admin/referrals")({
  component: AdminReferrals,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(d);
}

type RewardDraft = {
  id?: string;
  name: string;
  description: string;
  image: string;
  requiredReferrals: number;
  requiredPoints: number;
  rewardType: ReferralReward["rewardType"];
  rewardValue: string;
  active: boolean;
  sortOrder: number;
};

function emptyDraft(sortOrder: number): RewardDraft {
  return {
    name: "",
    description: "",
    image: "",
    requiredReferrals: 1,
    requiredPoints: 0,
    rewardType: "map",
    rewardValue: "",
    active: true,
    sortOrder,
  };
}

function AdminReferrals() {
  const { user } = useTebexAuth();
  const { can } = useAdminSession();
  const basketIdent = user?.basketIdent;
  const qc = useQueryClient();
  const canManage = can("referral.manage");

  const query = useQuery({
    queryKey: ["admin-referrals", basketIdent],
    enabled: !!basketIdent && can("referral.view"),
    queryFn: () => fetchAdminReferralOverview({ data: { basketIdent: basketIdent! } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-referrals", basketIdent] });

  const statusMut = useMutation({
    mutationFn: (v: { referralId: string; status: "completed" | "rejected" | "pending" }) =>
      setReferralStatus({ data: { basketIdent: basketIdent!, ...v } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Status aktualisiert");
        void invalidate();
      } else toast.error("Aktualisierung fehlgeschlagen");
    },
    onError: () => toast.error("Aktualisierung fehlgeschlagen"),
  });

  // One click on/off for the whole program: saves at once, no "Speichern" needed.
  const power = useMutation({
    mutationFn: (enabled: boolean) =>
      saveReferralSettings({
        data: { basketIdent: basketIdent!, settings: { ...query.data!.settings, enabled } },
      }),
    onSuccess: (res, enabled) => {
      if (res.ok) {
        toast.success(enabled ? "Empfehlungsprogramm eingeschaltet" : "Empfehlungsprogramm ausgeschaltet");
        void invalidate();
      } else toast.error("Umschalten fehlgeschlagen");
    },
    onError: () => toast.error("Umschalten fehlgeschlagen"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteReferralReward({ data: { basketIdent: basketIdent!, id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Reward gelöscht");
        void invalidate();
      } else toast.error("Löschen fehlgeschlagen");
    },
    onError: () => toast.error("Löschen fehlgeschlagen"),
  });

  if (!can("referral.view")) {
    return (
      <div>
        <AdminPageHeader eyebrow="Admin Panel" title="Empfehlungen" icon={<Gift className="h-5 w-5" />} />
        <NoAccess />
      </div>
    );
  }

  const data = query.data;

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Panel"
        title="Empfehlungsprogramm"
        subtitle="Steuere Einstellungen, Belohnungen und alle Empfehlungen deiner Community."
        icon={<Gift className="h-5 w-5" />}
        actions={
          data?.configured ? (
            <button
              type="button"
              disabled={!canManage || power.isPending}
              onClick={() => power.mutate(!data.settings.enabled)}
              title={canManage ? undefined : "Keine Berechtigung"}
              className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-5 text-[12px] font-bold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                data.settings.enabled
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                  : "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <Power className="h-4 w-4" />
              {power.isPending
                ? "…"
                : data.settings.enabled
                  ? "Programm aktiv · Ausschalten"
                  : "Programm aus · Einschalten"}
            </button>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <Panel>
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#FF3B3B]" />
          </div>
        </Panel>
      ) : data && !data.configured ? (
        <EmptyNotice icon={<Gift className="h-8 w-8" />}>
          Das Empfehlungsprogramm ist derzeit nicht verfügbar.
        </EmptyNotice>
      ) : data ? (
        <div className="flex flex-col gap-6">
          <StatsPanel stats={data.stats} />
          <SettingsPanel
            settings={data.settings}
            canManage={canManage}
            basketIdent={basketIdent!}
            onSaved={invalidate}
          />
          <RewardsPanel
            rewards={data.rewards}
            canManage={canManage}
            basketIdent={basketIdent!}
            onSaved={invalidate}
            onDelete={(id) => deleteMut.mutate(id)}
            deletingId={deleteMut.isPending ? (deleteMut.variables ?? null) : null}
          />
          <TopReferrersPanel rows={data.topReferrers} />
          <ReferralsPanel
            rows={data.referrals}
            canManage={canManage}
            onSetStatus={(referralId, status) => statusMut.mutate({ referralId, status })}
            busy={
              statusMut.isPending && statusMut.variables
                ? { id: statusMut.variables.referralId, status: statusMut.variables.status }
                : null
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function StatsPanel({ stats }: { stats: AdminReferralOverview["stats"] }) {
  const items: { label: string; value: string | number }[] = [
    { label: "Empfehlungen", value: stats.totalReferrals },
    { label: "Erfolgreich", value: stats.successful },
    { label: "Ausstehend", value: stats.pending },
    { label: "Abgelehnt", value: stats.rejected },
    { label: "Conversion", value: `${stats.conversionRate}%` },
    { label: "Punkte vergeben", value: stats.pointsIssued },
    { label: "Rewards freigeschaltet", value: stats.rewardsUnlocked },
    { label: "Rewards beansprucht", value: stats.rewardsClaimed },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">{it.label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-white">{it.value}</p>
        </div>
      ))}
    </div>
  );
}

function SettingsPanel({
  settings,
  canManage,
  basketIdent,
  onSaved,
}: {
  settings: ReferralSettings;
  canManage: boolean;
  basketIdent: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ReferralSettings>(settings);
  useEffect(() => setForm(settings), [settings]);

  const saveMut = useMutation({
    mutationFn: () => saveReferralSettings({ data: { basketIdent, settings: form } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Einstellungen gespeichert");
        onSaved();
      } else toast.error("Speichern fehlgeschlagen");
    },
    onError: () => toast.error("Speichern fehlgeschlagen"),
  });

  const set = <K extends keyof ReferralSettings>(key: K, value: ReferralSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Panel>
      <PanelTitle icon={<Sparkles className="h-4 w-4" />} title="Einstellungen" sub="Programm-Konfiguration" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Programmname">
          <input
            className={inputClass}
            value={form.programName}
            disabled={!canManage}
            onChange={(e) => set("programName", e.target.value)}
          />
        </Field>
        <Field label="Punkte pro Empfehlung">
          <input
            type="number"
            className={inputClass}
            value={form.pointsPerReferral}
            disabled={!canManage}
            onChange={(e) => set("pointsPerReferral", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Beschreibung" hint="Wird dem Nutzer oben im Programm angezeigt.">
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={form.programDescription}
            disabled={!canManage}
            onChange={(e) => set("programDescription", e.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-4">
          <Field label="Voraussetzung für Erfolg" hint="Wann eine Empfehlung als erfolgreich zählt.">
            <select
              className={selectClass}
              value={form.completion}
              disabled={!canManage}
              onChange={(e) => set("completion", e.target.value as ReferralSettings["completion"])}
            >
              <option value="purchase">Nach erstem Kauf des geworbenen Users</option>
              <option value="signup">Direkt nach Anmeldung</option>
            </select>
          </Field>
          <Field label="Attribution-Dauer (Tage)">
            <input
              type="number"
              className={inputClass}
              value={form.attributionDays}
              disabled={!canManage}
              onChange={(e) => set("attributionDays", Number(e.target.value) || 1)}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <AdminToggle
          label="Programm aktiv"
          description="Nutzer können werben"
          checked={form.enabled}
          disabled={!canManage}
          onChange={(v) => set("enabled", v)}
        />
        <AdminToggle
          label="Belohnungen einlösbar"
          description="Claims freigeschaltet"
          checked={form.allowClaims}
          disabled={!canManage}
          onChange={(v) => set("allowClaims", v)}
        />
        <AdminToggle
          label="Rangliste anzeigen"
          description="Öffentliches Leaderboard"
          checked={form.showLeaderboard}
          disabled={!canManage}
          onChange={(v) => set("showLeaderboard", v)}
        />
      </div>

      {canManage ? (
        <div className="mt-5 flex justify-end border-t border-white/[0.06] pt-5">
          <AdminButton onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Speichern…" : "Einstellungen speichern"}
          </AdminButton>
        </div>
      ) : null}
    </Panel>
  );
}

function RewardsPanel({
  rewards,
  canManage,
  basketIdent,
  onSaved,
  onDelete,
  deletingId,
}: {
  rewards: ReferralReward[];
  canManage: boolean;
  basketIdent: string;
  onSaved: () => void;
  onDelete: (id: string) => void;
  /** id of the reward currently being deleted (spinner on that row only). */
  deletingId: string | null;
}) {
  const [draft, setDraft] = useState<RewardDraft | null>(null);

  // Two-step delete: the first click arms the button, the second one deletes.
  // Disarms by itself so a stray click never removes a reward.
  const [armedId, setArmedId] = useState<string | null>(null);
  useEffect(() => {
    if (!armedId) return;
    const t = window.setTimeout(() => setArmedId(null), 3000);
    return () => window.clearTimeout(t);
  }, [armedId]);
  const nextSort = useMemo(
    () => (rewards.length ? Math.max(...rewards.map((r) => r.sortOrder)) + 1 : 0),
    [rewards],
  );

  const saveMut = useMutation({
    mutationFn: (d: RewardDraft) =>
      upsertReferralReward({
        data: {
          basketIdent,
          reward: {
            id: d.id,
            name: d.name,
            description: d.description,
            image: d.image.trim() ? d.image.trim() : null,
            requiredReferrals: d.requiredReferrals,
            requiredPoints: d.requiredPoints,
            rewardType: d.rewardType,
            rewardValue: d.rewardValue,
            active: d.active,
            sortOrder: d.sortOrder,
          },
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Reward gespeichert");
        setDraft(null);
        onSaved();
      } else toast.error("Speichern fehlgeschlagen");
    },
    onError: () => toast.error("Speichern fehlgeschlagen"),
  });

  return (
    <Panel>
      <PanelTitle
        icon={<Gift className="h-4 w-4" />}
        title="Belohnungen"
        sub="Die Reward-Leiter, die Nutzer freischalten können."
        right={
          canManage ? (
            <AdminButton variant="ghost" onClick={() => setDraft(emptyDraft(nextSort))}>
              <Plus className="h-4 w-4" /> Neu
            </AdminButton>
          ) : undefined
        }
      />

      {draft ? (
        <RewardForm
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => saveMut.mutate(draft)}
          saving={saveMut.isPending}
        />
      ) : null}

      {rewards.length === 0 ? (
        <EmptyNotice icon={<Gift className="h-8 w-8" />}>
          Noch keine Belohnungen. Lege die erste Stufe der Reward-Leiter an.
        </EmptyNotice>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {rewards.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 text-[#FF3B3B]">
                  {r.image ? (
                    <img src={r.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Gift className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-white">{r.name}</span>
                    {!r.active ? (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase text-white/40">
                        Inaktiv
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-white/40">
                    {r.requiredReferrals} Empf. · {r.requiredPoints} Pkt · {r.rewardType}
                  </p>
                </div>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                  <AdminIconButton
                    label="Bearbeiten"
                    disabled={deletingId === r.id}
                    onClick={() =>
                      setDraft({
                        id: r.id,
                        name: r.name,
                        description: r.description,
                        image: r.image ?? "",
                        requiredReferrals: r.requiredReferrals,
                        requiredPoints: r.requiredPoints,
                        rewardType: r.rewardType,
                        rewardValue: r.rewardValue,
                        active: r.active,
                        sortOrder: r.sortOrder,
                      })
                    }
                  >
                    <Pencil />
                  </AdminIconButton>
                  <AdminIconButton
                    label={armedId === r.id ? "Nochmal klicken zum Löschen" : "Löschen"}
                    tone={armedId === r.id ? "dangerSolid" : "danger"}
                    busy={deletingId === r.id}
                    disabled={deletingId !== null}
                    onClick={() => {
                      if (armedId === r.id) {
                        setArmedId(null);
                        onDelete(r.id);
                      } else setArmedId(r.id);
                    }}
                  >
                    {armedId === r.id ? <Check /> : <Trash2 />}
                  </AdminIconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RewardForm({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: RewardDraft;
  onChange: (d: RewardDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof RewardDraft>(key: K, value: RewardDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="mb-4 rounded-xl border border-[#FF3B3B]/20 bg-[#FF3B3B]/[0.04] p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Bild-URL (optional)">
          <input
            className={inputClass}
            value={draft.image}
            onChange={(e) => set("image", e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="Beschreibung">
          <textarea
            className={`${inputClass} min-h-[70px] resize-y`}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Benötigte Empfehlungen">
            <input
              type="number"
              className={inputClass}
              value={draft.requiredReferrals}
              onChange={(e) => set("requiredReferrals", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Benötigte Punkte">
            <input
              type="number"
              className={inputClass}
              value={draft.requiredPoints}
              onChange={(e) => set("requiredPoints", Number(e.target.value) || 0)}
            />
          </Field>
        </div>
        <Field label="Typ">
          <select
            className={selectClass}
            value={draft.rewardType}
            onChange={(e) => set("rewardType", e.target.value as RewardDraft["rewardType"])}
          >
            <option value="map">Map</option>
            <option value="discount">Rabatt</option>
            <option value="role">Rolle</option>
            <option value="custom">Sonstiges</option>
          </select>
        </Field>
        <Field label="Wert (optional)" hint="z. B. Rabattcode, Map-Name oder Rollen-ID.">
          <input
            className={inputClass}
            value={draft.rewardValue}
            onChange={(e) => set("rewardValue", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sortierung">
            <input
              type="number"
              className={inputClass}
              value={draft.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
            />
          </Field>
          {/* Same label + control rhythm as <Field>, so it lines up with "Sortierung". */}
          <div>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
              Status
            </span>
            <AdminToggle label="Aktiv" checked={draft.active} onChange={(v) => set("active", v)} />
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
        <AdminButton variant="ghost" onClick={onCancel} disabled={saving}>
          Abbrechen
        </AdminButton>
        <AdminButton onClick={onSave} disabled={saving || !draft.name.trim()}>
          {saving ? "Speichern…" : "Speichern"}
        </AdminButton>
      </div>
    </div>
  );
}

function TopReferrersPanel({ rows }: { rows: AdminReferralOverview["topReferrers"] }) {
  return (
    <Panel>
      <PanelTitle icon={<Trophy className="h-4 w-4" />} title="Top-Empfehler" sub="Aktivste Community-Mitglieder" />
      {rows.length === 0 ? (
        <EmptyNotice icon={<Trophy className="h-8 w-8" />}>Noch keine erfolgreichen Empfehlungen.</EmptyNotice>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={`${r.username}-${i}`}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                  i < 3 ? "bg-[#FF3B3B]/15 text-[#FF3B3B]" : "bg-white/5 text-white/50"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{r.username}</span>
              <span className="shrink-0 text-xs text-white/45">Lvl {r.level}</span>
              <span className="shrink-0 text-xs text-white/45">{r.points} Pkt</span>
              <span className="shrink-0 text-sm font-semibold text-[#FF3B3B]">{r.successful}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function ReferralsPanel({
  rows,
  canManage,
  onSetStatus,
  busy,
}: {
  rows: AdminReferralOverview["referrals"];
  canManage: boolean;
  onSetStatus: (referralId: string, status: "completed" | "rejected" | "pending") => void;
  /** The row + target status currently being saved (spinner on that button only). */
  busy: { id: string; status: "completed" | "rejected" | "pending" } | null;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "rejected">("all");
  const filtered = rows.filter((r) => filter === "all" || r.status === filter);

  const badge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-500/15 text-amber-300 ring-amber-500/25",
      completed: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25",
      rejected: "bg-red-500/15 text-red-300 ring-red-500/25",
    };
    const label: Record<string, string> = {
      pending: "Ausstehend",
      completed: "Erfolgreich",
      rejected: "Abgelehnt",
    };
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${map[status] ?? ""}`}
      >
        {label[status] ?? status}
      </span>
    );
  };

  return (
    <Panel className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-5">
        <div className="flex items-center gap-3">
          <span className="text-[#FF3B3B]">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-bold text-white">Alle Empfehlungen</h2>
            <p className="mt-0.5 text-xs text-white/40">Empfehlungen prüfen, bestätigen oder ablehnen.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "pending", "completed", "rejected"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 text-xs font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B3B]/60 ${
                filter === f
                  ? "border-[#FF3B3B]/40 bg-[#FF3B3B]/10 text-white"
                  : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"
              }`}
            >
              {f === "all" ? "Alle" : f === "pending" ? "Ausstehend" : f === "completed" ? "Erfolgreich" : "Abgelehnt"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-5">
          <EmptyNotice icon={<Users className="h-8 w-8" />}>Keine Empfehlungen für diesen Filter.</EmptyNotice>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.12em] text-white/40">
                <th className="px-5 py-3 font-bold">Empfehler</th>
                <th className="px-5 py-3 font-bold">Geworben</th>
                <th className="px-5 py-3 font-bold">Erstellt</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Punkte</th>
                <th className="px-5 py-3 text-right font-bold">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((r) => (
                <tr key={r.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-5 py-3.5 font-medium text-white">{r.referrer}</td>
                  <td className="px-5 py-3.5 text-white/70">{r.referred}</td>
                  <td className="px-5 py-3.5 text-white/50">{formatDate(r.createdAt)}</td>
                  <td className="px-5 py-3.5">{badge(r.status)}</td>
                  <td className="px-5 py-3.5 text-[#FF3B3B]">{r.points > 0 ? `+${r.points}` : "—"}</td>
                  <td className="px-5 py-3.5">
                    {canManage ? (
                      <div className="flex items-center justify-end gap-2">
                        {r.status !== "completed" ? (
                          <AdminIconButton
                            label="Bestätigen"
                            tone="success"
                            busy={busy?.id === r.id && busy.status === "completed"}
                            disabled={busy !== null}
                            onClick={() => onSetStatus(r.id, "completed")}
                          >
                            <Check />
                          </AdminIconButton>
                        ) : null}
                        {r.status !== "rejected" ? (
                          <AdminIconButton
                            label="Ablehnen"
                            tone="danger"
                            busy={busy?.id === r.id && busy.status === "rejected"}
                            disabled={busy !== null}
                            onClick={() => onSetStatus(r.id, "rejected")}
                          >
                            <X />
                          </AdminIconButton>
                        ) : null}
                      </div>
                    ) : (
                      <span className="block text-right text-white/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
