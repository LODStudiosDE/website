import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  id: number;
  name: string;
  image: string | null;
  category: string;
  unitPrice: number;
  taxPerUnit: number;
  currency: string;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  tax: number;
  total: number;
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  removeItem: (id: number) => void;
  updateQuantity: (id: number, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "lod_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setItems([]);
      setHydrated(true);
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, hydrated]);

  const addItem = useCallback<CartContextValue["addItem"]>((item, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.id === item.id);
      if (existing) {
        return prev.map((p) =>
          p.id === item.id ? { ...p, quantity: p.quantity + qty } : p,
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateQuantity = useCallback((id: number, qty: number) => {
    setItems((prev) =>
      prev
        .map((p) => (p.id === id ? { ...p, quantity: Math.max(1, qty) } : p))
        .filter((p) => p.quantity > 0),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce(
      (s, i) => s + i.unitPrice * i.quantity,
      0,
    );
    const tax = items.reduce((s, i) => s + i.taxPerUnit * i.quantity, 0);
    const total = subtotal + tax;
    const count = items.reduce((s, i) => s + i.quantity, 0);
    return {
      items,
      count,
      subtotal,
      tax,
      total,
      addItem,
      removeItem,
      updateQuantity,
      clear,
    };
  }, [items, addItem, removeItem, updateQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    // Safe fallback (e.g. during SSR before provider mounts)
    return {
      items: [],
      count: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
      addItem: () => {},
      removeItem: () => {},
      updateQuantity: () => {},
      clear: () => {},
    };
  }
  return ctx;
}

export function formatPrice(amount: number, currency = "EUR"): string {
  const symbol =
    currency === "EUR"
      ? "€"
      : currency === "USD"
        ? "$"
        : currency === "GBP"
          ? "£"
          : "";
  return `${symbol}${amount.toFixed(2)} ${currency}`;
}
