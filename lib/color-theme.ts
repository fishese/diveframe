export type ColorTheme = "light" | "dark";

export const COLOR_THEME_STORAGE_KEY = "diveframe-color-theme";
export const DEFAULT_COLOR_THEME: ColorTheme = "dark";

export function isColorTheme(value: unknown): value is ColorTheme {
  return value === "light" || value === "dark";
}

export function parseColorTheme(value: unknown): ColorTheme | null {
  return isColorTheme(value) ? value : null;
}

export function applyColorTheme(theme: ColorTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      theme === "light" ? "#eef6f4" : "#071820",
    );
  }

  const native = (
    window as Window & {
      DiveFrameNative?: { setLightStatusBars?: (light: boolean) => void };
    }
  ).DiveFrameNative;
  native?.setLightStatusBars?.(theme === "light");
}

export function readStoredColorTheme(): ColorTheme | null {
  if (typeof window === "undefined") return null;
  try {
    return parseColorTheme(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredColorTheme(theme: ColorTheme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / quota — IndexedDB remains the durable preference.
  }
}
