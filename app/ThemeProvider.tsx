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
import {
  applyColorTheme,
  type ColorTheme,
  DEFAULT_COLOR_THEME,
  parseColorTheme,
  readStoredColorTheme,
  writeStoredColorTheme,
} from "@/lib/color-theme";
import { getLocalAppPreferences, saveLocalAppPreferences } from "@/lib/indexed-db";

type ThemeValue = {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => Promise<void>;
};

const ThemeContext = createContext<ThemeValue | null>(null);

function initialTheme(): ColorTheme {
  return readStoredColorTheme() ?? DEFAULT_COLOR_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(initialTheme);

  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    let active = true;
    getLocalAppPreferences()
      .then((preferences) => {
        if (!active) return;
        const stored = parseColorTheme(preferences?.colorTheme);
        if (stored) {
          writeStoredColorTheme(stored);
          setColorThemeState(stored);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setColorTheme = useCallback(async (next: ColorTheme) => {
    const previous = colorTheme;
    setColorThemeState(next);
    writeStoredColorTheme(next);
    applyColorTheme(next);
    try {
      await saveLocalAppPreferences({ colorTheme: next });
    } catch (error) {
      setColorThemeState((current) => (current === next ? previous : current));
      writeStoredColorTheme(previous);
      applyColorTheme(previous);
      throw error;
    }
  }, [colorTheme]);

  const value = useMemo(
    () => ({ colorTheme, setColorTheme }),
    [colorTheme, setColorTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useColorTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is missing.");
  return context;
}
