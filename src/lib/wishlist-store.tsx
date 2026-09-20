import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTebexAuth } from "./tebex-auth";
import {
  fetchMyWishlist,
  syncWishlistAdd,
  syncWishlistRemove,
  syncWishlistReplace,
} from "./wishlist.functions";

export type WishlistItem = {
  id: number;
  name: string;
  image: string | null;
  category: string;
  price: number;
  basePrice: number;
  taxPerUnit: number;
  currency: string;
  addedAt?: string;
};

export type WishlistIdentity = {
  cfxId: string;
  username: string;
};

type WishlistContextValue = {
  items: WishlistItem[];
  count: number;
  identity: WishlistIdentity | null;
  has: (id: number) => boolean;
  addItem: (item: WishlistItem) => void;
  removeItem: (id: number) => void;
  toggle: (item: WishlistItem) => boolean;
  clear: () => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

function toStored(item: WishlistItem) {
  return {
    packageId: item.id,
    packageName: item.name,
    image: item.image,
    category: item.category,
    price: item.price,
    basePrice: item.basePrice,
    taxPerUnit: item.taxPerUnit,
    currency: item.currency,
  };
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const { user } = useTebexAuth();
  // cfxId = usernameId (numeric CFX forum ID, verified by Tebex at login)
  const identityRef = useRef<WishlistIdentity | null>(null);
  const loadedUserRef = useRef<string | null>(null);

  const toLocalItem = useCallback(
    (it: {
      packageId: number;
      packageName: string;
      image: string | null;
      category: string;
      price: number;
      basePrice: number;
      taxPerUnit: number;
      currency: string;
      addedAt: string;
    }): WishlistItem => ({
      id: it.packageId,
      name: it.packageName,
      image: it.image,
      category: it.category,
      price: it.price,
      basePrice: it.basePrice,
      taxPerUnit: it.taxPerUnit,
      currency: it.currency,
      addedAt: it.addedAt,
    }),
    [],
  );

  const reloadFromServer = useCallback(async () => {
    const id = identityRef.current;
    if (!id) {
      setItems([]);
      return;
    }
    const res = await fetchMyWishlist({ data: id });
    if (!res?.ok) return;
    setItems((res.items ?? []).map(toLocalItem));
  }, [toLocalItem]);

  useEffect(() => {
    // usernameId = numeric CFX ID; fall back to username string if not set
    identityRef.current = user?.username
      ? {
          cfxId: user.usernameId != null ? String(user.usernameId) : user.username,
          username: user.username,
        }
      : null;
    if (!user?.username) {
      loadedUserRef.current = null;
      setItems([]);
    }
  }, [user]);

  // Load server-side wishlist by CFX id so profile/admin stay in sync.
  useEffect(() => {
    const id = identityRef.current;
    if (!id) return;
    if (loadedUserRef.current === id.cfxId) return;
    loadedUserRef.current = id.cfxId;
    void reloadFromServer().catch(() => {});
  }, [user, reloadFromServer]);

  // Keep in sync with the server (the database is the source of truth): re-fetch on
  // focus/visibility and poll periodically so an admin removing or gifting a
  // wish is reflected here immediately, without stale items causing errors.
  useEffect(() => {
    if (!user?.username) return;
    const sync = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void reloadFromServer().catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(sync, 20_000);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [user?.username, reloadFromServer]);

  const has = useCallback(
    (id: number) => items.some((p) => p.id === id),
    [items],
  );

  const addItem = useCallback((item: WishlistItem) => {
    const id = identityRef.current;
    if (!id) return;
    void syncWishlistAdd({ data: { ...id, item: toStored(item) } })
      .then(() => reloadFromServer())
      .catch(() => {});
  }, [reloadFromServer]);

  const removeItem = useCallback((id: number) => {
    const ident = identityRef.current;
    if (!ident) return;
    void syncWishlistRemove({ data: { ...ident, packageId: id } })
      .then(() => reloadFromServer())
      .catch(() => {});
  }, [reloadFromServer]);

  const toggle = useCallback((item: WishlistItem) => {
    const added = !items.some((p) => p.id === item.id);
    const id = identityRef.current;
    if (id) {
      if (added) {
        void syncWishlistAdd({ data: { ...id, item: toStored(item) } })
          .then(() => reloadFromServer())
          .catch(() => {});
      } else {
        void syncWishlistRemove({ data: { ...id, packageId: item.id } })
          .then(() => reloadFromServer())
          .catch(() => {});
      }
    }
    return added;
  }, [items, reloadFromServer]);

  const clear = useCallback(() => {
    const id = identityRef.current;
    if (!id) {
      setItems([]);
      return;
    }
    void syncWishlistReplace({ data: { ...id, items: [] } })
      .then(() => reloadFromServer())
      .catch(() => {});
  }, [reloadFromServer]);

  const value = useMemo<WishlistContextValue>(
    () => ({
      items,
      count: items.length,
      identity: identityRef.current,
      has,
      addItem,
      removeItem,
      toggle,
      clear,
    }),
    [items, has, addItem, removeItem, toggle, clear, user],
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    // Safe fallback (e.g. during SSR before provider mounts)
    return {
      items: [],
      count: 0,
      identity: null,
      has: () => false,
      addItem: () => {},
      removeItem: () => {},
      toggle: () => false,
      clear: () => {},
    };
  }
  return ctx;
}
