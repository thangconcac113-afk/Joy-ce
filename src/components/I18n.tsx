"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { dateTag, LOCALE_COOKIE, translate, type Locale } from "@/lib/i18n";
import { ago as agoEn } from "./format";

const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({ locale: "en", setLocale: () => {} });

export function I18nProvider({ locale: initial, children }: { locale: Locale; children: React.ReactNode }) {
  const [locale, set] = useState<Locale>(initial);
  const router = useRouter();
  const setLocale = (l: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    set(l);
    router.refresh(); // re-renders the server-rendered bits (sign out button)
  };
  return <Ctx.Provider value={{ locale, setLocale }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const { locale, setLocale } = useContext(Ctx);
  const tag = dateTag(locale);
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const ago = (iso: string | null) => agoEn(iso, Date.now(), t);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" }) : "—");
  const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short" }) : "—");
  return { t, locale, setLocale, tag, ago, date, shortDate };
}

export function LangSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className={`lang ${className}`} role="group" aria-label="Language">
      {(["en", "vi"] as Locale[]).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} title={l === "en" ? "English" : "Tiếng Việt"}>
          {l === "en" ? "EN" : "VI"}
        </button>
      ))}
    </div>
  );
}
