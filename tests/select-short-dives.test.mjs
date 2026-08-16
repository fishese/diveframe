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

test("the collapsed filter panel owns the short-dive duration control", () => {
  assert.match(model, /export const DEFAULT_SHORT_DIVE_MAX_MINUTES = 3/);
  assert.match(app, /from "@\/lib\/dive-list-model"/);
  assert.match(app, /DEFAULT_SHORT_DIVE_MAX_MINUTES/);
  assert.match(app, /parsePositiveWholeMinutes/);
  assert.match(
    app,
    /useState\(\s*String\(DEFAULT_SHORT_DIVE_MAX_MINUTES\),?\s*\)/,
  );
  assert.match(app, /id="short-dive-max-minutes"/);
  assert.match(app, /type="number"/);
  assert.match(app, /min=\{1\}/);
  assert.match(app, /step=\{1\}/);
  assert.match(app, /inputMode="numeric"/);
  assert.match(app, /htmlFor="short-dive-max-minutes"/);
  assert.match(app, /t\("maxDurationMinutes"\)/);
  assert.match(app, /className={`filter-panel-chip \$\{shortDiveOnly/);
  assert.match(app, /t\("shortDives"\)/);
  assert.match(app, /shortDiveMaxMinutes: shortDiveOnly/);
  assert.match(
    app,
    /className="filter-panel"[\s\S]*id="short-dive-max-minutes"/,
  );
});

test("Select shown replaces selection with exactly the visible filtered dives", () => {
  const selectVisible = namedFunction(app, "selectVisibleDives");
  const clearSelection = namedFunction(app, "clearSelection");

  assert.match(selectVisible, /new Set\(visibleDives\.map\(\(dive\) => dive\.id\)\)/);
  assert.doesNotMatch(
    selectVisible,
    /deleteLocalDives|deleteSelectedDives|deleteLocalDive\(/,
  );
  assert.match(clearSelection, /setSelectedDiveIds\(\s*new Set\(\s*\)\s*\)/);
  assert.doesNotMatch(
    clearSelection,
    /deleteLocalDives|deleteSelectedDives|deleteLocalDive\(/,
  );
  assert.match(
    app,
    /onClick=\{selectVisibleDives\}[\s\S]*t\("selectShown"\)/,
  );
  assert.match(app, /onClick=\{clearSelection\}[\s\S]*t\("clearSelection"\)/);
});

test("the main toolbar stays on one row and selection actions are grouped", () => {
  assert.match(styles, /\.filter-row\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(styles, /\.filter-row \.select-mode-toggle\s*\{[^}]*margin-left:\s*auto/);
  assert.match(styles, /\.select-action-group\s*\{/);
  assert.match(
    styles,
    /\.select-action-buttons > \.button,\s*\.select-action-buttons > select\s*\{[^}]*height:\s*40px;[^}]*min-height:\s*40px/,
  );
  assert.match(app, /className="select-action-group"/);
  assert.match(app, /className="select-action-group select-action-final"/);
});

test("all three locales ship the new filter and selection strings", () => {
  for (const [locale, source] of [
    ["en", en],
    ["ja", ja],
    ["zh-Hant", zhHant],
  ]) {
    for (const key of [
      "noSiteNamed",
      "gasData",
      "shortDives",
      "maxDurationMinutes",
      "selectionTools",
      "selectShown",
      "clearSelection",
      "selectShownHint",
      "selectedDiveActions",
    ]) {
      assert.match(source, new RegExp(`${key}:`), `${locale} is missing ${key}`);
    }
  }

  assert.match(
    en,
    /maxDurationMinutes:\s*"Maximum duration \(minutes\)"/,
  );
  assert.match(en, /gpsData:\s*"GPS"/);
  assert.match(en, /selectShown:\s*"Select shown"/);
  assert.match(en, /clearSelection:\s*"Clear selection"/);
  assert.match(en, /selectShownHint:[\s\S]*Nothing is deleted/);
});
