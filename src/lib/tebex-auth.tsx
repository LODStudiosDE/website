import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createTebexAuthLink, fetchTebexBasketUser } from "./tebex.functions";

export type TebexUser = {
  basketIdent: string;
  username: string;
  usernameId: number | null;
};

type TebexAuthContextValue = {
  user: TebexUser | null;
  isAuthed: boolean;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => void;
};

const TebexAuthContext = createContext<TebexAuthContextValue | null>(null);

const USER_KEY = "lod_tebex_user_v1";
const PENDING_KEY = "lod_tebex_pending_basket_v1";
const RETURN_FLAG = "tebexAuth";

export function TebexAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TebexUser | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore a previously logged-in session.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Handle the redirect back from the Tebex/Cfx.re auth page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(RETURN_FLAG) !== "return") return;

    const pending = localStorage.getItem(PENDING_KEY);

    const cleanUrl = () => {
      params.delete(RETURN_FLAG);
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (query ? `?${query}` : ""),
      );
    };

    if (!pending) {
      cleanUrl();
      return;
    }

    setLoading(true);
    fetchTebexBasketUser({ data: { basketIdent: pending } })
      .then((res) => {
        if (res?.username) {
          const next: TebexUser = {
            basketIdent: pending,
            username: res.username,
            usernameId: res.usernameId,
          };
          setUser(next);
          localStorage.setItem(USER_KEY, JSON.stringify(next));
        }
      })
      .catch(() => {
        // ignore — user simply stays logged out
      })
      .finally(() => {
        localStorage.removeItem(PENDING_KEY);
        setLoading(false);
        cleanUrl();
      });
  }, []);

  // Refresh cached identity from the current basket to prevent stale names/ids.
  useEffect(() => {
    if (!user?.basketIdent) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(RETURN_FLAG) === "return") return;
    fetchTebexBasketUser({ data: { basketIdent: user.basketIdent } })
      .then((res) => {
        if (!res?.username) return;
        if (res.username === user.username && (res.usernameId ?? null) === (user.usernameId ?? null)) {
          return;
        }
        const next: TebexUser = {
          basketIdent: user.basketIdent,
          username: res.username,
          usernameId: res.usernameId,
        };
        setUser(next);
        localStorage.setItem(USER_KEY, JSON.stringify(next));
      })
      .catch(() => {});
  }, [user?.basketIdent]);

  const login = useCallback(async () => {
    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?${RETURN_FLAG}=return`;
      const { authUrl, basketIdent } = await createTebexAuthLink({
        data: { returnUrl },
      });
      localStorage.setItem(PENDING_KEY, basketIdent);
      window.location.href = authUrl;
    } catch {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, []);

  const value = useMemo<TebexAuthContextValue>(
    () => ({ user, isAuthed: !!user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return (
    <TebexAuthContext.Provider value={value}>{children}</TebexAuthContext.Provider>
  );
}

export function useTebexAuth(): TebexAuthContextValue {
  const ctx = useContext(TebexAuthContext);
  if (!ctx) {
    return {
      user: null,
      isAuthed: false,
      loading: false,
      login: async () => {},
      logout: () => {},
    };
  }
  return ctx;
}
