"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type AppLanguage, type AppTranslate, translateApp } from "@/lib/app-i18n";
import { getLocalAppPreferences, saveLocalAppPreferences } from "@/lib/indexed-db";

type AppI18nValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  t: AppTranslate;
};

const AppI18nContext = createContext<AppI18nValue | null>(null);

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    let active = true;
    getLocalAppPreferences()
      .then((preferences) => {
        if (active && preferences?.uiLanguage) setLanguageState(preferences.uiLanguage);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang =
      language === "zh-Hant" ? "zh-HK" : language === "ja" ? "ja" : "en";
  }, [language]);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    setLanguageState(next);
    await saveLocalAppPreferences({ uiLanguage: next });
  }, []);
  const t = useCallback<AppTranslate>(
    (key, values) => translateApp(language, key, values),
    [language],
  );
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <AppI18nContext.Provider value={value}>{children}</AppI18nContext.Provider>;
}

export function useAppI18n() {
  const context = useContext(AppI18nContext);
  if (!context) throw new Error("AppI18nProvider is missing.");
  return context;
}
