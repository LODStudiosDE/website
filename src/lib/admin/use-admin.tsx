import { useQuery } from "@tanstack/react-query";
import { useTebexAuth } from "@/lib/tebex-auth";
import { fetchAdminSession } from "@/lib/admin/admin.functions";
import {
  EMPTY_SESSION,
  hasPermission,
  type AdminSession,
  type Permission,
} from "@/lib/admin/permissions";

export type UseAdminSession = {
  session: AdminSession;
  isAdmin: boolean;
  loading: boolean;
  can: (permission: Permission) => boolean;
};

// Resolves the current user's admin role from their verified basket. Returns a
// safe empty session for guests / non-admins. The CFX id never reaches here.
export function useAdminSession(): UseAdminSession {
  const { user, isAuthed } = useTebexAuth();
  const basketIdent = user?.basketIdent;

  const query = useQuery({
    queryKey: ["admin-session", basketIdent],
    enabled: !!basketIdent,
    staleTime: 60_000,
    queryFn: () => fetchAdminSession({ data: { basketIdent: basketIdent! } }),
  });

  const session = (isAuthed && query.data) || EMPTY_SESSION;

  return {
    session,
    isAdmin: session.isAdmin,
    loading: !!basketIdent && query.isLoading,
    can: (permission: Permission) => hasPermission(session.permissions, permission),
  };
}
