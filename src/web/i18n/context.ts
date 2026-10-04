import { createContext, useContext } from "react";
import { formatPlurals } from "../../core/plural.ts";
import { ar, type TKey } from "./ar.ts";
import { en } from "./en.ts";

export type Lang = "ar" | "en";
export type { TKey };

const DICTS = { ar, en } as const;

export type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  let text: string = DICTS[lang][key] ?? ar[key] ?? key;
  if (!vars) return text;
  text = formatPlurals(text, lang, vars);
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/** Look up a key that is built at runtime (e.g. "status." + status); falls back to the key itself. */
export function hasKey(key: string): key is TKey {
  return key in ar;
}

export interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

export const LangContext = createContext<LangState>({
  lang: "ar",
  setLang: () => {},
  t: (key, vars) => translate("ar", key, vars),
});

export function useLang(): LangState {
  return useContext(LangContext);
}
