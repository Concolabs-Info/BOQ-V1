"use client";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultLocale, locales } from "./locales";
import enMessages from "./messages/en.json";

const STORAGE_KEY = "quanto_locale";

// Loaders keyed by locale code. Each one is a separate dynamic import so
// only the messages for the active locale ever ship to the browser.
const MESSAGE_LOADERS: Record<string, () => Promise<{ default: AbstractIntlMessages }>> = {
  en: () => import("./messages/en.json"),
  si: () => import("./messages/si.json"),
  ta: () => import("./messages/ta.json"),
  es: () => import("./messages/es.json"),
  fr: () => import("./messages/fr.json"),
};

const LocaleContext = createContext<{ locale: string; setLocale: (locale: string) => void }>({
  locale: defaultLocale,
  setLocale: () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

function readStoredLocale(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && locales.some((option) => option.code === stored && option.enabled)) {
      return stored;
    }
  } catch {
    // Private browsing / blocked storage — fall back to the default silently.
  }
  return defaultLocale;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(defaultLocale);
  const [messages, setMessages] = useState<AbstractIntlMessages>(enMessages);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== defaultLocale) setLocaleState(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loader = MESSAGE_LOADERS[locale] ?? MESSAGE_LOADERS[defaultLocale];
    loader().then((mod) => {
      if (!cancelled) setMessages(mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  function setLocale(next: string) {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Nothing we can do if storage is blocked — the pick just won't persist.
    }
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
