import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus, Trash2, ExternalLink, Pencil, X } from "lucide-react";
import { notify as toast } from "@/components/Notify";
import {
  AdminButton,
  AdminPageHeader,
  EmptyNotice,
  Field,
  NoAccess,
  Panel,
  PanelTitle,
  inputClass,
} from "@/components/admin/ui";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import {
  deletePartner,
  fetchAdminPartners,
  upsertPartner,
  type PartnerEntry,
} from "@/lib/admin/partners.admin.functions";
import { EXPIRING_DISCORD_URL_MESSAGE, isExpiringDiscordUrl } from "@/lib/partner-url";

export const Route = createFileRoute("/admin/partners")({
  component: AdminPartners,
});

type PartnerDraft = { id?: string; name: string; image: string; link: string };

const emptyDraft: PartnerDraft = { name: "", image: "", link: "" };

function AdminPartners() {
  const { user } = useTebexAuth();
  const { can } = useAdminSession();
  const basketIdent = user?.basketIdent;
  const qc = useQueryClient();
  const canManage = can("partners.manage");

  const [draft, setDraft] = useState<PartnerDraft>(emptyDraft);

  const query = useQuery({
    queryKey: ["admin-partners", basketIdent],
    enabled: !!basketIdent && can("partners.view"),
    queryFn: () => fetchAdminPartners({ data: { basketIdent: basketIdent! } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-partners", basketIdent] });

  const saveMutation = useMutation({
    mutationFn: (partner: PartnerDraft) =>
      upsertPartner({ data: { basketIdent: basketIdent!, partner } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen.");
        return;
      }
      toast.success(draft.id ? "Partner aktualisiert." : "Partner hinzugefügt.");
      setDraft(emptyDraft);
      invalidate();
    },
    onError: () => toast.error("Speichern fehlgeschlagen."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deletePartner({ data: { basketIdent: basketIdent!, id } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("Löschen fehlgeschlagen.");
        return;
      }
      toast.success("Partner entfernt.");
      invalidate();
    },
    onError: () => toast.error("Löschen fehlgeschlagen."),
  });

  if (!can("partners.view")) {
    return <NoAccess>Dir fehlt die Berechtigung für die Partnerverwaltung.</NoAccess>;
  }

  const submit = () => {
    if (!draft.name.trim() || !draft.image.trim() || !draft.link.trim()) {
      toast.error("Bitte Name, Logo-URL und Link angeben.");
      return;
    }
    if (isExpiringDiscordUrl(draft.image.trim())) {
      toast.error(EXPIRING_DISCORD_URL_MESSAGE);
      return;
    }
    saveMutation.mutate({
      id: draft.id,
      name: draft.name.trim(),
      image: draft.image.trim(),
      link: draft.link.trim(),
    });
  };

  const startEdit = (p: PartnerEntry) => {
    setDraft({ id: p.id, name: p.name, image: p.image, link: p.link });
  };

  const data = query.data;
  const partners = data?.partners ?? [];

  return (
    <div>
      <AdminPageHeader
        eyebrow="Marketing"
        title="Partner & Kunden"
        subtitle="Verwalte die Logos, die auf der Startseite unter „Trusted By Our Partners and Clients“ erscheinen."
        icon={<Handshake className="h-5 w-5" />}
      />

      {data && !data.configured && (
        <EmptyNotice icon={<Handshake className="h-8 w-8" />}>
          Die Partnerverwaltung ist derzeit nicht verfügbar.
        </EmptyNotice>
      )}

      {data?.configured && data.readFailed && (
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
          <strong className="font-semibold text-white/85">Die Datenbank ist gerade nicht erreichbar.</strong> Deine
          Partner sind nicht gelöscht, sie können nur im Moment nicht geladen werden. Bitte in ein
          paar Sekunden neu laden.
        </div>
      )}

      {data?.configured && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* List */}
          <Panel>
            <PanelTitle
              icon={<Handshake className="h-4 w-4" />}
              title="Partnerliste"
              sub={`${partners.length} Einträge`}
            />
            {partners.length === 0 ? (
              <EmptyNotice icon={<Handshake className="h-8 w-8" />}>
                {data.readFailed
                  ? "Die Partnerliste konnte nicht geladen werden. Deine Einträge sind nicht gelöscht."
                  : "Noch keine Partner. Füge rechts den ersten hinzu."}
              </EmptyNotice>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {partners.map((p) => (
                  <li
                    key={p.id}
                    className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                      <img
                        src={p.image}
                        alt={p.name}
                        className="h-full w-full object-contain p-1"
                        loading="eager"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 max-w-full items-center gap-1 text-xs text-white/40 transition-colors hover:text-[#FF3B3B]"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="min-w-0 truncate">{p.link}</span>
                      </a>
                      {isExpiringDiscordUrl(p.image) && (
                        <div
                          className="mt-1 truncate text-[11px] font-medium text-white/45"
                          title={EXPIRING_DISCORD_URL_MESSAGE}
                        >
                          Logo-Link läuft ab (Discord), bitte ersetzen
                        </div>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/50 transition-colors hover:border-white/25 hover:text-white"
                          aria-label="Bearbeiten"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(p.id)}
                          disabled={deleteMutation.isPending}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-red-500/20 text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                          aria-label="Löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Form */}
          {canManage ? (
            <Panel className="lg:sticky lg:top-28 lg:self-start">
              <PanelTitle
                icon={draft.id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                title={draft.id ? "Partner bearbeiten" : "Partner hinzufügen"}
                right={
                  draft.id ? (
                    <button
                      type="button"
                      onClick={() => setDraft(emptyDraft)}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-white/50 transition-colors hover:text-white"
                      aria-label="Abbrechen"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : undefined
                }
              />
              <div className="space-y-4">
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="z. B. FiveM Studio XY"
                  />
                </Field>
                <Field label="Logo-URL" hint="Direkter Link zu einem Bild (PNG/SVG empfohlen).">
                  <input
                    className={inputClass}
                    value={draft.image}
                    onChange={(e) => setDraft((d) => ({ ...d, image: e.target.value }))}
                    placeholder="https://…/logo.png"
                  />
                </Field>
                <Field label="Link" hint="Ziel, das beim Klick geöffnet wird.">
                  <input
                    className={inputClass}
                    value={draft.link}
                    onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))}
                    placeholder="https://…"
                  />
                </Field>

                {draft.image.trim() && (
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
                      Vorschau
                    </div>
                    <div className="grid h-16 place-items-center rounded-lg bg-white/[0.03]">
                      <img
                        src={draft.image}
                        alt="Vorschau"
                        referrerPolicy="no-referrer"
                        className="max-h-12 max-w-[70%] object-contain opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
                      />
                    </div>
                  </div>
                )}

                <AdminButton
                  onClick={submit}
                  disabled={saveMutation.isPending}
                  className="w-full"
                >
                  {draft.id ? "Änderungen speichern" : "Partner hinzufügen"}
                </AdminButton>
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}
