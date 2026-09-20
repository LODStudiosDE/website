import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Gift, Trash2 } from "lucide-react";
import { useState } from "react";
import { notify as toast } from "@/components/Notify";
import { AdminPageHeader, EmptyNotice, NoAccess, Panel } from "@/components/admin/ui";
import { useTebexAuth } from "@/lib/tebex-auth";
import { useAdminSession } from "@/lib/admin/use-admin";
import {
  fetchAdminWishlists,
  giftWishlistEntry,
  removeWishlistEntry,
  type AdminWishlistEntry,
} from "@/lib/admin/admin.functions";
import { formatPrice } from "@/lib/cart-store";

export const Route = createFileRoute("/admin/wishlists")({
  component: AdminWishlists,
});

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function AdminWishlists() {
  const { user } = useTebexAuth();
  const { can } = useAdminSession();
  const basketIdent = user?.basketIdent;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-wishlists", basketIdent],
    enabled: !!basketIdent && can("wishlist.view"),
    queryFn: () => fetchAdminWishlists({ data: { basketIdent: basketIdent! } }),
  });

  const removeMut = useMutation({
    mutationFn: (e: AdminWishlistEntry) =>
      removeWishlistEntry({
        data: { basketIdent: basketIdent!, cfxId: e.cfxId, packageId: e.packageId },
      }),
    onSettled: () => {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ["admin-wishlists"] });
    },
    onSuccess: (res) => {
      if (!res.ok) toast.error("Konnte Wunsch nicht entfernen");
      else toast.success("Wunsch entfernt");
    },
  });

  const giftMut = useMutation({
    mutationFn: (e: AdminWishlistEntry) =>
      giftWishlistEntry({
        data: { basketIdent: basketIdent!, cfxId: e.cfxId, packageId: e.packageId },
      }),
    onSettled: () => {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ["admin-wishlists"] });
    },
    onSuccess: (res) => {
      if (!res.ok) toast.error("Gift fehlgeschlagen");
      else toast.success("Gift erfolgreich vergeben");
    },
  });

  if (!can("wishlist.view")) {
    return (
      <div>
        <AdminPageHeader eyebrow="Admin Panel" title="Wunschlisten" icon={<Star className="h-5 w-5" />} />
        <NoAccess />
      </div>
    );
  }

  const entries = query.data?.entries ?? [];

  return (
    <div>
      <AdminPageHeader
        eyebrow="Admin Panel"
        title="Wunschlisten"
        subtitle="Alle von Usern gespeicherten Wünsche mit Zeitstempel, entfernen oder gratis verschenken."
        icon={<Star className="h-5 w-5" />}
      />

      {query.isLoading ? (
        <Panel>
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#FF3B3B]" />
          </div>
        </Panel>
      ) : query.data && !query.data.configured ? (
        <EmptyNotice icon={<Star className="h-8 w-8" />}>
          Die Wunschlisten sind derzeit nicht verfügbar.
        </EmptyNotice>
      ) : entries.length === 0 ? (
        <EmptyNotice icon={<Star className="h-8 w-8" />}>
          Noch keine Wünsche vorhanden.
        </EmptyNotice>
      ) : (
        <Panel className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.12em] text-white/40">
                  <th className="px-5 py-3 font-bold">User</th>
                  <th className="px-5 py-3 font-bold">Artikel</th>
                  <th className="px-5 py-3 font-bold">Preis</th>
                  <th className="px-5 py-3 font-bold">Hinzugefügt</th>
                  <th className="px-5 py-3 text-right font-bold">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {entries.map((e) => {
                  const key = `${e.cfxId}-${e.packageId}`;
                  return (
                    <tr key={key} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-white">{e.username}</div>
                        <div className="text-xs text-white/35">CFX {e.cfxId}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {e.image && (
                            <img
                              src={e.image}
                              alt=""
                              className="h-9 w-9 rounded-md object-cover"
                            />
                          )}
                          <span className="text-white/80">{e.packageName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-white/70">
                        {formatPrice(e.price, e.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-white/50">{formatDateTime(e.addedAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {can("wishlist.gift") && (
                            <button
                              title="Gratis verschenken (0 € Zahlung)"
                              disabled={busy === key}
                              onClick={() => {
                                setBusy(key);
                                giftMut.mutate(e);
                              }}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              <Gift className="h-4 w-4" />
                            </button>
                          )}
                          {can("wishlist.remove") && (
                            <button
                              title="Aus Wunschliste entfernen"
                              disabled={busy === key}
                              onClick={() => {
                                setBusy(key);
                                removeMut.mutate(e);
                              }}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
