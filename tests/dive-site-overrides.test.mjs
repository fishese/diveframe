import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-site-overrides.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  clearedDiveFrameSiteData,
  inferLegacyLocationOverride,
  preferredImportedLocation,
  preferredImportedSite,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("clear restores imported location and removes every DiveFrame site field", () => {
  const cleared = clearedDiveFrameSiteData({
    location: "Memo region",
    locationSource: "memo",
    sourceLocations: { shearwater: "Imported region" },
  });
  assert.deepEqual(cleared, {
    location: "Imported region",
    locationSource: null,
    userSite: null,
    userSiteSource: null,
    userSiteCatalogId: null,
    userSiteUpdatedAt: null,
    userGpsLat: null,
    userGpsLng: null,
    userGpsSource: null,
    userGpsUpdatedAt: null,
    resolvedLocation: null,
    resolvedCity: null,
    resolvedCountry: null,
    resolvedLocationSuppressed: true,
  });
});

test("clear preserves an imported location when no DiveFrame override exists", () => {
  const cleared = clearedDiveFrameSiteData({
    location: "Imported region",
    locationSource: null,
    sourceLocations: { shearwater: "Imported region" },
  });
  assert.equal(cleared.location, "Imported region");
});

test("legacy memo-applied location is inferred conservatively", () => {
  assert.equal(
    inferLegacyLocationOverride({
      location: "Blue Corner",
      userSite: "Blue Corner",
      userSiteUpdatedAt: "2026-08-09T00:00:00Z",
      sourceLocations: {},
      sourceSiteNames: {},
    }),
    "site-selection",
  );
  assert.equal(
    inferLegacyLocationOverride({
      location: "Imported region",
      userSite: "Blue Corner",
      userSiteUpdatedAt: "2026-08-09T00:00:00Z",
      sourceLocations: { shearwater: "Imported region" },
      sourceSiteNames: { shearwater: "Original site" },
    }),
    null,
  );
});

test("imported locations use stable source priority", () => {
  assert.equal(
    preferredImportedLocation({ fit: "FIT", shearwater: "Shearwater" }),
    "Shearwater",
  );
});

test("imported site fallback uses stable source priority", () => {
  assert.equal(
    preferredImportedSite({
      fit: "Portable site",
      subsurface: "Subsurface site",
      shearwater: "Shearwater site",
    }),
    "Shearwater site",
  );
  assert.equal(
    preferredImportedSite({ subsurface: "  Blue Corner  ", fit: "Later" }),
    "Blue Corner",
  );
});
