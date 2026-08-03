import type { ComposerLanguage } from "./i18n";
import { en } from "./app-i18n/en";
import { zhHant } from "./app-i18n/zh-Hant";
import { ja } from "./app-i18n/ja";

export type AppLanguage = ComposerLanguage;
export type AppTranslationKey = keyof typeof en;
export type AppTranslate = (
  key: AppTranslationKey,
  values?: Record<string, string | number>,
) => string;

const appTranslations = {
  en,
  "zh-Hant": zhHant,
  ja,
} as const;

export function translateApp(
  language: AppLanguage,
  key: AppTranslationKey,
  values?: Record<string, string | number>,
) {
  let text = appTranslations[language][key];
  for (const [name, value] of Object.entries(values ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
