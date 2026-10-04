import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LangContext, translate, type Lang } from "./context.ts";

const STORAGE_KEY = "attendance.lang";

function initialLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = translate(lang, "app.name");
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang: (next: Lang) => {
        setLangState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // storage blocked; the choice lasts until the page reloads
        }
      },
      t: (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(lang, key, vars),
    }),
    [lang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
