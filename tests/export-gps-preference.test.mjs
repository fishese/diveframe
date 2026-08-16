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

function exportedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `missing export async function ${name}`);
  const bodyStart = source.indexOf(") {", start);
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let index = source.indexOf("{", bodyStart);
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

const [app, storage, overrides, en, ja, zhHant, logbook, siteExport] =
  await Promise.all([
    readFile("app/DiveFrameApp.tsx", "utf8"),
    readFile("lib/indexed-db.ts", "utf8"),
    readFile("lib/dive-site-overrides.ts", "utf8"),
    readFile("lib/app-i18n/en.ts", "utf8"),
    readFile("lib/app-i18n/ja.ts", "utf8"),
    readFile("lib/app-i18n/zh-Hant.ts", "utf8"),
    readFile("lib/subsurface-logbook-export.ts", "utf8"),
    readFile("lib/subsurface-site-export.ts", "utf8"),
  ]);

test("Edit Location checkbox writes the preference immediately and stays unchecked by default", () => {
  const editor = app.slice(
    app.indexOf('className="user-gps-editor-body"'),
    app.indexOf("user-gps-editor-actions"),
  );
  assert.match(editor, /type="checkbox"/);
  assert.match(editor, /t\("preferUserCoordinates"\)/);
  assert.match(editor, /t\("preferUserCoordinatesHint"\)/);
  assert.match(editor, /disabled=\{busy \|\| !storedUserCoordinates\}/);
  assert.match(app, /dive\.exportGpsPreference === "user"/);
  assert.match(app, /updateLocalDiveExportGpsPreference/);
  assert.match(
    app,
    /preferUser \? "user" : "computer"/,
  );
  assert.doesNotMatch(
    namedFunction(app, "saveDiveExportGpsPreference"),
    /gpsEntryLat|gpsExitLat/,
  );
});

test("map stays computer-first while site suggestions use the preferred coordinate", () => {
  assert.match(app, /const mapCoordinates = resolveDiveMapCoordinates\(dive\);/);
  assert.match(
    app,
    /const preferredCoordinates = resolvePreferredDiveCoordinates\(dive\);/,
  );
  const suggestions = app.slice(
    app.indexOf("<DiveSiteSuggestions"),
    app.indexOf("</DiveSiteSuggestions>"),
  );
  assert.match(suggestions, /coordinates=\{preferredCoordinates\}/);
  assert.doesNotMatch(suggestions, /coordinates=\{mapCoordinates\}/);
});

test("clearing user coordinates resets the override without touching computer GPS", () => {
  const clearGps = exportedFunction(storage, "updateLocalDiveUserGps");
  assert.match(
    clearGps,
    /gps === null[\s\S]*exportGpsPreference:\s*"computer"/,
  );
  assert.doesNotMatch(clearGps, /gpsEntryLat\s*:|gpsExitLat\s*:/);
  assert.match(overrides, /exportGpsPreference:\s*"computer"/);

  const setPreference = exportedFunction(
    storage,
    "updateLocalDiveExportGpsPreference",
  );
  assert.match(setPreference, /appEditedAt/);
  assert.doesNotMatch(setPreference, /gpsEntryLat|gpsExitLat|userGpsLat/);
  assert.match(storage, /normalizeExportGpsPreference/);
});

test("both Subsurface export paths honor the same user-GPS preference helper", () => {
  assert.match(logbook, /resolvePreferredDiveCoordinates/);
  assert.match(siteExport, /prefersUserExportGps/);
  assert.match(siteExport, /targetGps = prefersUserExportGps/);
});

test("all three locales ship the user-coordinate preference strings", () => {
  for (const [locale, source] of [
    ["en", en],
    ["ja", ja],
    ["zh-Hant", zhHant],
  ]) {
    for (const key of ["preferUserCoordinates", "preferUserCoordinatesHint"]) {
      assert.match(source, new RegExp(`${key}:`), `${locale} is missing ${key}`);
    }
  }
  assert.match(
    en,
    /preferUserCoordinates:\s*"Use this location for site suggestions and export"/,
  );
  assert.match(en, /preferUserCoordinatesHint:[\s\S]*not changed/);
});
