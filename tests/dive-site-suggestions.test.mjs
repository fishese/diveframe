import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-site-suggestions.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace(/^import .*;\s*/m, "");
const {
  buildSiteLocationSuggestions,
  buildSiteNameSuggestions,
  catalogSiteNameMatches,
  catalogSiteSelection,
  nearbySiteSelection,
} =
  await import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );

const catalog = {
  schemaVersion: 1,
  sites: [
    {
      id: "blue-corner",
      name: "Blue Corner",
      aliases: ["Local Blue"],
      coordinates: { latitude: 7.1, longitude: 134.2 },
      place: { locality: "Koror", region: null, country: "Palau" },
      source: { kind: "test", reference: null },
      status: "active",
      updatedAt: "2026-08-09T00:00:00Z",
    },
  ],
};

test("shared site search includes catalog names, aliases, and stored sites", () => {
  assert.deepEqual(buildSiteNameSuggestions(catalog, ["House Reef"]), [
    "Blue Corner",
    "House Reef",
    "Local Blue",
  ]);
});

test("shared location suggestions resolve catalog aliases", () => {
  assert.deepEqual(
    buildSiteLocationSuggestions({
      catalog,
      selectedSite: "Local Blue",
      storedLocations: [],
      siteLocationPairs: [],
    }),
    ["Koror", "Palau"],
  );
});

test("nearby selections preserve catalog identity and coordinates", () => {
  assert.deepEqual(
    nearbySiteSelection(
      {
        id: "session-catalog-blue-corner",
        catalogId: "blue-corner",
        name: "Blue Corner",
        aliases: ["Local Blue"],
        latitude: 7.1,
        longitude: 134.2,
        location: "Palau",
        distanceKm: 0.5,
        source: "catalog",
      },
      "Local Blue",
    ),
    {
      name: "Local Blue",
      source: "catalog",
      catalogId: "blue-corner",
      latitude: 7.1,
      longitude: 134.2,
      location: "Palau",
    },
  );
});

test("typed exact catalog names offer an explicit coordinate selection", () => {
  const matches = catalogSiteNameMatches(catalog, "blue corner");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].kind, "exact");
  assert.deepEqual(catalogSiteSelection(matches[0].site), {
    name: "Blue Corner",
    source: "catalog",
    catalogId: "blue-corner",
    latitude: 7.1,
    longitude: 134.2,
    location: "Palau",
  });
});

test("typed close catalog names are ranked without matching unrelated short text", () => {
  assert.equal(catalogSiteNameMatches(catalog, "Blue Cornr")[0].kind, "close");
  assert.deepEqual(catalogSiteNameMatches(catalog, "Blue"), []);
});
