import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "th" | "en";

const STORAGE_KEY = "storylingo.lang";
const DEFAULT_LANG: Lang = "th";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Inline bilingual translate: t(english, thai). */
  t: (en: string, th: string) => string;
};

const LangContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start at the default so SSR and first client render agree.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "th" || saved === "en") setLangState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const t = useCallback((en: string, th: string) => (lang === "th" ? th : en), [lang]);

  const value = useMemo<Ctx>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (ctx) return ctx;
  // Safe fallback when rendered outside the provider (e.g. error boundaries).
  return {
    lang: DEFAULT_LANG,
    setLang: () => {},
    t: (_en: string, th: string) => th,
  };
}

/** Shorthand: const t = useT(); t("Shop", "ร้านค้า") */
export function useT() {
  return useLang().t;
}

/**
 * Picks the Thai version of story text stored in the database when the child
 * is reading in Thai, falling back to the English one while a book is still
 * missing its translation.
 */
export function useLocalText() {
  const { lang } = useLang();
  return useCallback(
    (en?: string | null, th?: string | null) =>
      (lang === "th" ? th?.trim() || en?.trim() : en?.trim() || th?.trim()) ?? "",
    [lang],
  );
}

