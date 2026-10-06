"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { Bi, Lang } from "@/lib/types";
import { useBrowserValue, useStored, writeStored } from "@/lib/store";

type I18n = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (b: Bi | undefined) => string;
};

const Ctx = createContext<I18n | null>(null);
const KEY = "yaqin.lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const saved = useStored(KEY);
  const browserArabic = useBrowserValue(() => navigator.language?.startsWith("ar") ?? false, false);
  const lang: Lang = saved === "ar" || saved === "en" ? saved : browserArabic ? "ar" : "en";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    writeStored(KEY, l);
    window.dispatchEvent(new Event("yaqin:language"));
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      // A lesson written in one language is shown in that language to everyone.
      t: (b) => (b ? b[lang] || b.en || b.ar || "" : ""),
    }),
    [lang, setLang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
