/**
 * Remove unused app-i18n keys, then split locales into separate modules.
 * Run from the web package root: node scripts/prune-and-split-app-i18n.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const UNUSED = new Set([
  "betaNoticeText",
  "betaNoticeBackup",
  "whatsNewDescription",
  "whatsNewOffline",
  "whatsNewUpdated",
  "creatingShareCard",
  "shareCardReady",
  "shareCardFailed",
  "mapped",
  "photos",
  "monthsShort",
  "orderByDate",
  "deleteDiveLogConfirm",
  "shareCard",
  "appStorage",
  "deviceStorageTitle",
  "nativeDataNote",
  "storageNativeApp",
  "storageNativeAppDescription",
  "appStorageUsage",
  "portableBackup",
  "importComplete",
  "eraseAllDataTitle",
  "eraseAllDataDescription",
  "chooseCatalogDescription",
  "exportAdditionLog",
  "mergeCatalogNote",
  "reviewedSitesExported",
  "mergedCatalogDownloaded",
  "bleImportScanning",
  "bleImportStart",
]);

const sourcePath = "lib/app-i18n.ts";
const source = readFileSync(sourcePath, "utf8");

function removeUnusedEntries(block) {
  // Remove single-line entries: key: "...", or key: `...`,
  let next = block.replace(
    /^\s{2}([A-Za-z][A-Za-z0-9_]*)\s*:\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)\s*,?\s*$/gm,
    (line, key) => (UNUSED.has(key) ? "" : line),
  );
  // Remove two-line entries:
  //   key:
  //     "....",
  next = next.replace(
    /^\s{2}([A-Za-z][A-Za-z0-9_]*)\s*:\s*\r?\n\s{4}(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*,?\s*$/gm,
    (blockMatch, key) => (UNUSED.has(key) ? "" : blockMatch),
  );
  // Collapse runs of blank lines created by removals.
  return next.replace(/\n{3,}/g, "\n\n");
}

const enMatch = source.match(/const en = \{([\s\S]*?)^\} as const;/m);
const zhMatch = source.match(
  /const zhHant: Record<keyof typeof en, string> = \{([\s\S]*?)^\};/m,
);
const jaMatch = source.match(
  /const ja: Record<keyof typeof en, string> = \{([\s\S]*?)^\};/m,
);
if (!enMatch || !zhMatch || !jaMatch) {
  throw new Error("Could not locate en/zhHant/ja blocks");
}

const enBody = removeUnusedEntries(enMatch[1]);
const zhBody = removeUnusedEntries(zhMatch[1]);
const jaBody = removeUnusedEntries(jaMatch[1]);

function extractKeys(body) {
  return [
    ...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\s*:/gm),
  ].map((m) => m[1]);
}

const enKeys = new Set(extractKeys(enBody));
const zhKeys = new Set(extractKeys(zhBody));
const jaKeys = new Set(extractKeys(jaBody));
for (const key of UNUSED) {
  if (enKeys.has(key) || zhKeys.has(key) || jaKeys.has(key)) {
    throw new Error(`Failed to remove unused key: ${key}`);
  }
}
for (const key of enKeys) {
  if (!zhKeys.has(key)) throw new Error(`zh-Hant missing key after prune: ${key}`);
  if (!jaKeys.has(key)) throw new Error(`ja missing key after prune: ${key}`);
}
console.log(`Pruned ${UNUSED.size} unused keys; ${enKeys.size} keys remain.`);

const outDir = "lib/app-i18n";
mkdirSync(outDir, { recursive: true });

writeFileSync(
  join(outDir, "en.ts"),
  `import { translations as overlayTranslations } from "../i18n";\n\nexport const en = {${enBody}} as const;\n`,
);
writeFileSync(
  join(outDir, "zh-Hant.ts"),
  `import { translations as overlayTranslations } from "../i18n";\nimport type { en } from "./en";\n\nexport const zhHant: Record<keyof typeof en, string> = {${zhBody}};\n`,
);
writeFileSync(
  join(outDir, "ja.ts"),
  `import { translations as overlayTranslations } from "../i18n";\nimport type { en } from "./en";\n\nexport const ja: Record<keyof typeof en, string> = {${jaBody}};\n`,
);

writeFileSync(
  "lib/app-i18n.ts",
  `import type { ComposerLanguage } from "./i18n";
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
    text = text.replaceAll(\`{\${name}}\`, String(value));
  }
  return text;
}
`,
);

console.log("Wrote lib/app-i18n.ts + lib/app-i18n/{en,zh-Hant,ja}.ts");
void dirname;
