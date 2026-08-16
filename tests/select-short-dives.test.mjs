import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function namedFunction(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `missing function ${name}`);
  let index = source.indexOf("{", start);
  assert.notEqual(index, -1, `missing body for ${name}`);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unclosed body for ${name}`);
}

const [app, styles, model, en, ja, zhHant] = await Promise.all([
  readFile("app/DiveFrameApp.tsx", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("lib/dive-list-model.ts", "utf8"),
  readFile("lib/app-i18n/en.ts", "utf8"),
  readFile("lib/app-i18n/ja.ts", "utf8"),
  readFile("lib/app-i18n/zh-Hant.ts", "utf8"),
]);

test("select mode exposes a positive whole-minute short-dive control defaulting to 3", () => {
  assert.match(model, /export const DEFAULT_SHORT_DIVE_MAX_MINUTES = 3/);
  assert.match(app, /from "@\/lib\/dive-list-model"/);
  assert.match(app, /DEFAULT_SHORT_DIVE_MAX_MINUTES/);
  assert.match(app, /parsePositiveWholeMinutes/);
  assert.match(app, /shortDiveCandidateIds/);
  assert.match(
    app,
    /useState\(\s*String\(DEFAULT_SHORT_DIVE_MAX_MINUTES\)\s*\)/,
  );
  assert.match(app, /id="short-dive-max-minutes"/);
  assert.match(app, /type="number"/);
  assert.match(app, /min=\{1\}/);
  assert.match(app, /step=\{1\}/);
  assert.match(app, /inputMode="numeric"/);
  assert.match(app, /htmlFor="short-dive-max-minutes"/);
  assert.match(app, /t\("maxDurationMinutes"\)/);
  assert.match(app, /t\("selectShortDives"\)/);
  assert.match(app, /t\("clearSelection"\)/);
  assert.match(app, /aria-describedby="short-dive-select-hint"/);
  assert.match(app, /t\("selectShortDivesHint"\)/);
  assert.match(
    app,
    /className="select-action-count"[\s\S]*aria-live="polite"/,
  );
});

test("Select short dives unions visible candidates and never deletes", () => {
  const selectShort = namedFunction(app, "selectShortDives");
  const clearSelection = namedFunction(app, "clearSelection");

  assert.match(selectShort, /shortDiveCandidateIds\(visibleDives/);
  assert.match(selectShort, /setSelectedDiveIds/);
  assert.match(selectShort, /next\.add\(/);
  assert.doesNotMatch(
    selectShort,
    /setSelectedDiveIds\(\s*new Set\(\s*\)\s*\)/,
    "do not replace the existing selection",
  );
  assert.doesNotMatch(selectShort, /deleteLocalDives|deleteSelectedDives|deleteLocalDive\(/);
  assert.match(clearSelection, /setSelectedDiveIds\(\s*new Set\(\s*\)\s*\)/);
  assert.doesNotMatch(
    clearSelection,
    /deleteLocalDives|deleteSelectedDives|deleteLocalDive\(/,
  );
  assert.match(
    app,
    /onClick=\{selectShortDives\}[\s\S]*t\("selectShortDives"\)/,
  );
  assert.match(app, /onClick=\{clearSelection\}[\s\S]*t\("clearSelection"\)/);
});

test("short-dive controls wrap on the existing mobile breakpoint", () => {
  assert.match(
    styles,
    /\.select-short-dives\s*\{[^}]*flex-wrap:\s*wrap/,
  );
  assert.match(
    styles,
    /@media \(max-width: 560px\)\s*\{[\s\S]*?\.select-short-dives\s*\{[^}]*width:\s*100%/,
  );
});

test("all three locales ship short-dive selection strings", () => {
  for (const [locale, source] of [
    ["en", en],
    ["ja", ja],
    ["zh-Hant", zhHant],
  ]) {
    for (const key of [
      "maxDurationMinutes",
      "selectShortDives",
      "clearSelection",
      "selectShortDivesHint",
    ]) {
      assert.match(source, new RegExp(`${key}:`), `${locale} is missing ${key}`);
    }
  }

  assert.match(
    en,
    /maxDurationMinutes:\s*"Maximum duration \(minutes\)"/,
  );
  assert.match(en, /selectShortDives:\s*"Select short dives"/);
  assert.match(en, /clearSelection:\s*"Clear selection"/);
  assert.match(en, /selectShortDivesHint:[\s\S]*Nothing is deleted/);
});
