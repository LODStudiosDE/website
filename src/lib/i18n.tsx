import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { common } from "./i18n/common";
import { cart } from "./i18n/cart";
import { team } from "./i18n/team";
import { jobs } from "./i18n/jobs";
import { store } from "./i18n/store";

export type Lang = "EN" | "DE" | "FR";

export type Dict = Record<string, string>;
export type Namespace = { EN: Dict; DE: Dict; FR: Dict };

const NAMESPACES: Namespace[] = [common, cart, team, jobs, store];

function merge(lang: Lang): Dict {
  return Object.assign({}, ...NAMESPACES.map((n) => n[lang]));
}

const DICTS: Record<Lang, Dict> = {
  EN: merge("EN"),
  DE: merge("DE"),
  FR: merge("FR"),
};

export const DEFAULT_LANG: Lang = "EN";
export const DEFAULT_CURRENCY = "USD";

const LANG_KEY = "lod_lang";
const CURRENCY_KEY = "lod_currency";

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  currency: string;
  setCurrency: (currency: string) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function translate(lang: Lang, key: string, fallback?: string): string {
  return DICTS[lang]?.[key] ?? DICTS.EN[key] ?? fallback ?? key;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [currency, setCurrencyState] = useState<string>(DEFAULT_CURRENCY);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang.toLowerCase();
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const setCurrency = useCallback((next: string) => {
    setCurrencyState(next);
    try {
      localStorage.setItem(CURRENCY_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      currency,
      setCurrency,
      t: (key: string, fallback?: string) => translate(lang, key, fallback),
    }),
    [lang, currency, setLang, setCurrency],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      currency: DEFAULT_CURRENCY,
      setCurrency: () => {},
      t: (key: string, fallback?: string) => translate(DEFAULT_LANG, key, fallback),
    };
  }
  return ctx;
}

/** Convenience hook when only the translate function is needed. */
export function useT() {
  return useI18n().t;
}
