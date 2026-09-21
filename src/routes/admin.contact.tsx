import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Sparkles,
  Paperclip,
  Send,
  X,
  Loader2,
  Users,
  Trash2,
  Eye,
  EyeOff,
  Save,
  FileText,
  FolderOpen,
  Eraser,
} from "lucide-react";
import { useMemo, useState } from "react";
import { notify as toast } from "@/components/Notify";
import {
  AdminButton,
  AdminPageHeader,
  Field,
  NoAccess,
  Panel,
  PanelTitle,
  inputClass,
} from "@/components/admin/ui";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import {
  generateEmailDraft,
  sendBroadcastEmail,
  fetchSubscribers,
  removeSubscriber,
  toggleSubscriberHidden,
  fetchTemplates,
  saveTemplate,
  removeTemplate,
} from "@/lib/admin/admin.functions";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export const Route = createFileRoute("/admin/contact")({
  component: AdminContact,
});

type Attachment = {
  name: string;
  url: string;
  isImage: boolean;
  contentType: string;
  dataBase64: string;
};

function AdminContact() {
  const { user } = useTebexAuth();
  const { can } = useAdminSession();
  const basketIdent = user?.basketIdent;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  const qc = useQueryClient();

  const subsQuery = useQuery({
    queryKey: ["admin-subscribers", basketIdent],
    queryFn: () => fetchSubscribers({ data: { basketIdent: basketIdent! } }),
    enabled: !!basketIdent,
    staleTime: 15_000,
  });

  const invalidateSubs = () =>
    void qc.invalidateQueries({ queryKey: ["admin-subscribers", basketIdent] });

  const removeMut = useMutation({
    mutationFn: (cfxId: string) =>
      removeSubscriber({ data: { basketIdent: basketIdent!, cfxId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("E-Mail entfernt");
        invalidateSubs();
      } else toast.error("Konnte E-Mail nicht entfernen");
    },
    onError: () => toast.error("Konnte E-Mail nicht entfernen"),
  });

  const hideMut = useMutation({
    mutationFn: (cfxId: string) =>
      toggleSubscriberHidden({ data: { basketIdent: basketIdent!, cfxId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.hidden ? "Vom Versand ausgeblendet" : "Wieder aktiviert");
        invalidateSubs();
      } else toast.error("Aktion fehlgeschlagen");
    },
    onError: () => toast.error("Aktion fehlgeschlagen"),
  });

  // ── e-mail templates ──────────────────────────────────────────────────────
  const [templateName, setTemplateName] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["admin-templates", basketIdent],
    queryFn: () => fetchTemplates({ data: { basketIdent: basketIdent! } }),
    enabled: !!basketIdent,
    staleTime: 15_000,
  });

  const invalidateTemplates = () =>
    void qc.invalidateQueries({ queryKey: ["admin-templates", basketIdent] });

  const saveTemplateMut = useMutation({
    mutationFn: () =>
      saveTemplate({
        data: {
          basketIdent: basketIdent!,
          name: templateName.trim(),
          subject,
          body,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.replaced ? "Vorlage ersetzt" : "Vorlage gespeichert");
        invalidateTemplates();
      } else
        toast.error(
          res.reason === "store_not_configured"
            ? "Vorlagen-Speicher ist nicht konfiguriert"
            : "Speichern fehlgeschlagen",
        );
    },
    onError: () => toast.error("Speichern fehlgeschlagen"),
  });

  const removeTemplateMut = useMutation({
    mutationFn: (id: string) => removeTemplate({ data: { basketIdent: basketIdent!, id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Vorlage gelöscht");
        invalidateTemplates();
      } else toast.error("Löschen fehlgeschlagen");
    },
    onError: () => toast.error("Löschen fehlgeschlagen"),
  });

  const loadTemplate = (t: { name: string; subject: string; body: string }) => {
    setSubject(t.subject);
    setBody(t.body);
    setTemplateName(t.name);
    toast.success(`Vorlage „${t.name}" geladen`);
  };

  const aiMut = useMutation({
    mutationFn: () =>
      generateEmailDraft({ data: { basketIdent: basketIdent!, prompt: aiPrompt } }),
    onSuccess: (res) => {
      if (res.ok) {
        if (res.subject) setSubject(res.subject);
        if (res.body) setBody(res.body);
        setAiOpen(false);
        const providerLabel =
          res.provider === "gemini"
            ? "Gemini"
            : res.provider === "chatgpt"
              ? "ChatGPT"
              : "Pollinations";
        toast.success(`Entwurf erstellt (${providerLabel})`);
      } else {
        toast.error(
          res.reason === "openai_quota"
            ? "Kein KI-Guthaben. Bitte GEMINI_API_KEY in .env setzen (gratis) oder OpenAI-Guthaben aufladen."
            : "KI-Fehler, bitte erneut versuchen",
        );
      }
    },
    onError: () => toast.error("KI-Fehler"),
  });

  const sendMut = useMutation({
    mutationFn: () =>
      sendBroadcastEmail({
        data: {
          basketIdent: basketIdent!,
          subject,
          body,
          attachments: attachments.map((a) => ({
            name: a.name,
            contentType: a.contentType,
            dataBase64: a.dataBase64,
          })),
        },
      }),
    onSuccess: (res) => {
      if (res.ok)
        toast.success(
          `Versendet an ${res.sent ?? 0} Empfänger${res.failed ? ` (${res.failed} fehlgeschlagen)` : ""}`,
        );
      else if (res.reason === "email_not_configured")
        toast.error("E-Mail-Connector nicht konfiguriert");
      else if (res.reason === "no_subscriber_store")
        toast.error("Kein Abonnenten-Speicher angebunden");
      else toast.error("Versand fehlgeschlagen");
    },
    onError: () => toast.error("Versand fehlgeschlagen"),
  });

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    // Read as data URL: the base64 payload is embedded in the outgoing email
    // (inline cid images) and the same data URL powers the live preview.
    const MAX_BYTES = 6 * 1024 * 1024;
    const read = (f: File) =>
      new Promise<Attachment | null>((resolve) => {
        if (f.size > MAX_BYTES) {
          toast.error(`„${f.name}" ist größer als 6 MB und wurde übersprungen.`);
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result);
          const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : "";
          resolve({
            name: f.name,
            url: dataUrl,
            isImage: f.type.startsWith("image/"),
            contentType: f.type || "application/octet-stream",
            dataBase64: base64,
          });
        };
        reader.onerror = () => {
          toast.error(`Konnte „${f.name}" nicht laden.`);
          resolve(null);
        };
        reader.readAsDataURL(f);
      });
    const results = await Promise.all(Array.from(files).map(read));
    const next = results.filter((a): a is Attachment => a !== null);
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  };

  const bodyParagraphs = useMemo(
    () => body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    [body],
  );

  if (!can("contact.send")) {
    return (
      <div>
        <AdminPageHeader eyebrow="Admin Panel" title="Kontakt" icon={<Mail className="h-5 w-5" />} />
        <NoAccess />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Panel"
        title="Kontakt"
        subtitle="E-Mails an alle Abonnenten von contact.lodstudios@gmail.com mit Live-Vorschau, Anhängen und KI."
        icon={<Mail className="h-5 w-5" />}
        actions={
          <AdminButton variant="ghost" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4" /> KI-Assistent
          </AdminButton>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Composer */}
        <Panel>
          <PanelTitle
            icon={<Mail className="h-[18px] w-[18px]" />}
            title="Nachricht verfassen"
            right={
              subject || body ? (
                <button
                  onClick={() => {
                    setSubject("");
                    setBody("");
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-medium text-white/50 transition hover:bg-white/5 hover:text-white"
                >
                  <Eraser className="h-3.5 w-3.5" /> Leeren
                </button>
              ) : undefined
            }
          />
          <div className="space-y-4">
            <Field label="Betreff">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="z. B. Neue MLOs jetzt verfügbar"
                className={inputClass}
              />
            </Field>
            <Field label="Inhalt" hint="Leere Zeile = neuer Absatz.">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Deine Nachricht …"
                className={`${inputClass} resize-y`}
              />
            </Field>

            <div>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
                Anhänge
              </span>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 bg-black/20 px-3.5 py-3 text-sm text-white/50 transition-colors hover:border-white/30 hover:text-white/70">
                <Paperclip className="h-4 w-4" />
                Dateien anhängen (Bilder etc.)
                <input type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
              </label>
              {attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {attachments.map((a, i) => (
                    <div
                      key={`${a.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-2 pr-1.5 text-xs text-white/70"
                    >
                      {a.isImage ? (
                        <img src={a.url} alt="" className="h-6 w-6 rounded object-cover" />
                      ) : (
                        <Paperclip className="h-3.5 w-3.5" />
                      )}
                      <span className="max-w-[140px] truncate">{a.name}</span>
                      <button
                        onClick={() => setAttachments((prev) => prev.filter((_, x) => x !== i))}
                        className="grid h-5 w-5 place-items-center rounded text-white/40 hover:text-red-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <AdminButton
              onClick={() => sendMut.mutate()}
              disabled={!subject.trim() || !body.trim() || sendMut.isPending}
              className="w-full"
            >
              {sendMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              An alle Abonnenten senden
            </AdminButton>
          </div>
        </Panel>

        {/* Live preview */}
        <div>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
            Live-Vorschau
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#f4f4f5]">
            <div className="bg-[#0C0C0D] px-6 py-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FF3B3B]">
                LODStudios
              </div>
              <div className="mt-2 text-xl font-bold text-white">
                {subject || "Betreff der E-Mail"}
              </div>
            </div>
            <div className="px-6 py-6">
              {bodyParagraphs.length > 0 ? (
                bodyParagraphs.map((p, i) => (
                  <p key={i} className="mb-3 text-[15px] leading-relaxed text-[#1a1a1a] whitespace-pre-wrap">
                    {p}
                  </p>
                ))
              ) : (
                <p className="text-[15px] leading-relaxed text-[#9a9a9a]">
                  Hier erscheint dein Nachrichtentext …
                </p>
              )}

              {attachments.some((a) => a.isImage) && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {attachments
                    .filter((a) => a.isImage)
                    .map((a, i) => (
                      <img key={i} src={a.url} alt="" className="w-full rounded-lg object-cover" />
                    ))}
                </div>
              )}

              <div className="mt-6 border-t border-[#e4e4e7] pt-4 text-xs text-[#8a8a8a]">
                Du erhältst diese E-Mail von contact.lodstudios@gmail.com, weil du dich auf
                lodstudios eingetragen hast.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subscribers */}
      <div className="mt-6">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <PanelTitle
              icon={<Users className="h-[18px] w-[18px]" />}
              title="Hinterlegte E-Mails"
            />
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
              {subsQuery.data?.subscribers.length ?? 0} gesamt
            </span>
          </div>

          {!subsQuery.data?.configured ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/40">
              Abonnenten-Speicher ist nicht konfiguriert.
            </p>
          ) : subsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : (subsQuery.data?.subscribers.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/40">
              Noch keine E-Mails hinterlegt.
            </p>
          ) : (
            <div className="space-y-2">
              {subsQuery.data!.subscribers.map((s) => (
                <div
                  key={s.cfxId}
                  className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    s.hidden
                      ? "border-white/5 bg-white/[0.01] opacity-60"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-white">{s.email}</span>
                      {s.hidden && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                          ausgeblendet
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/40">
                      <span className="text-white/60">{s.username}</span>
                      <span className="font-mono text-[11px]">CFX: {s.cfxId}</span>
                      <span>{formatDateTime(s.at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => hideMut.mutate(s.cfxId)}
                      disabled={hideMut.isPending}
                      title={s.hidden ? "Wieder aktivieren" : "Vom Versand ausblenden"}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                    >
                      {s.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => removeMut.mutate(s.cfxId)}
                      disabled={removeMut.isPending}
                      title="E-Mail entfernen"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-[#FF3B3B]/30 text-[#FF3B3B] transition hover:bg-[#FF3B3B]/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* E-mail templates */}
      <div className="mt-6">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <PanelTitle
              icon={<FileText className="h-[18px] w-[18px]" />}
              title="Vorlagen"
            />
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
              {templatesQuery.data?.templates.length ?? 0} gespeichert
            </span>
          </div>

          {/* Save current message as template */}
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <Field
              label="Aktuelle Nachricht als Vorlage speichern"
              hint="Gleicher Name überschreibt die vorhandene Vorlage."
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      templateName.trim() &&
                      !saveTemplateMut.isPending
                    )
                      saveTemplateMut.mutate();
                  }}
                  placeholder="Vorlagen-Name (z. B. Sale-Ankündigung)"
                  className={inputClass}
                />
                <AdminButton
                  onClick={() => saveTemplateMut.mutate()}
                  disabled={!templateName.trim() || saveTemplateMut.isPending}
                  className="shrink-0"
                >
                  {saveTemplateMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Speichern
                </AdminButton>
              </div>
            </Field>
          </div>

          {!templatesQuery.data?.configured ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/40">
              Vorlagen-Speicher ist nicht konfiguriert.
            </p>
          ) : templatesQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : (templatesQuery.data?.templates.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/40">
              Noch keine Vorlagen gespeichert.
            </p>
          ) : (
            <div className="space-y-2">
              {templatesQuery.data!.templates.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-white/40" />
                      <span className="truncate font-medium text-white">{t.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/40">
                      <span className="truncate text-white/60">
                        {t.subject || "(kein Betreff)"}
                      </span>
                      <span>{formatDateTime(t.at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => loadTemplate(t)}
                      title="In Editor laden"
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
                    >
                      <FolderOpen className="h-4 w-4" /> Laden
                    </button>
                    <button
                      onClick={() => removeTemplateMut.mutate(t.id)}
                      disabled={removeTemplateMut.isPending}
                      title="Vorlage löschen"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-[#FF3B3B]/30 text-[#FF3B3B] transition hover:bg-[#FF3B3B]/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0C0C0D] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-5 w-5 text-[#FF3B3B]" />
                <h3 className="font-display text-lg font-bold text-white">KI-Assistent</h3>
              </div>
              <button
                onClick={() => setAiOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-white/45">
              Beschreibe, worum es gehen soll. Die KI erstellt Betreff und Inhalt.
            </p>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              placeholder="z. B. Ankündigung: 20% Rabatt auf alle MLOs bis Sonntag"
              className={`${inputClass} resize-y`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <AdminButton variant="ghost" onClick={() => setAiOpen(false)}>
                Abbrechen
              </AdminButton>
              <AdminButton
                onClick={() => aiMut.mutate()}
                disabled={!aiPrompt.trim() || aiMut.isPending}
              >
                {aiMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generieren
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
