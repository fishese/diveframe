import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-site-catalog.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const catalogTools = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

const catalog = {
  schemaVersion: 1,
  sites: [
    {
      id: "hk-sharp-island-test-site",
      name: "Test Site",
      aliases: ["Example Reef"],
      coordinates: { latitude: 22.3636, longitude: 114.2928 },
      place: {
        countryCode: "HK",
        country: "Hong Kong",
        region: null,
        locality: "Sharp Island",
      },
      source: { kind: "manual", reference: "test" },
      status: "active",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
  ],
};

test("validates and finds nearby session catalog sites", () => {
  assert.equal(catalogTools.validateDiveSiteCatalog(catalog), catalog);
  const nearby = catalogTools.nearbySessionCatalogSites(
    catalog,
    22.3635,
    114.2927,
  );
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].catalogId, "hk-sharp-island-test-site");
  assert.equal(nearby[0].source, "catalog");
  assert.equal(nearby[0].location, "Hong Kong");
});

test("defaults nearby catalog suggestions to a 6 km radius", () => {
  assert.equal(catalogTools.NEARBY_SITE_RADIUS_KM, 6);
  const tooFar = catalogTools.nearbySessionCatalogSites(
    catalog,
    22.48,
    114.2928,
  );
  assert.equal(tooFar.length, 0);
});

test("rejects malformed catalogs", () => {
  assert.throws(
    () =>
      catalogTools.validateDiveSiteCatalog({
        schemaVersion: 1,
        sites: [{ id: "missing-fields" }],
      }),
    /valid sites array/,
  );
});

test("adds a session catalog to the bundled catalog without replacing it", () => {
  const additional = {
    ...catalog,
    sites: [
      {
        ...catalog.sites[0],
        id: "jp-extra-site",
        name: "Additional Site",
        coordinates: { latitude: 34.68, longitude: 138.94 },
      },
    ],
  };
  const combined = catalogTools.combineDiveSiteCatalogs(catalog, additional);
  assert.equal(combined.sites.length, 2);
  assert.equal(combined.sites[0].id, "hk-sharp-island-test-site");
  assert.equal(combined.sites[1].id, "jp-extra-site");
});

test("stores and removes a catalog for the current tab session", () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };

  catalogTools.saveSessionDiveSiteCatalog(catalog, "regional-sites.json");
  assert.equal(
    catalogTools.loadSessionDiveSiteCatalog().label,
    "regional-sites.json",
  );
  catalogTools.clearSessionDiveSiteCatalog();
  assert.equal(catalogTools.loadSessionDiveSiteCatalog(), null);
  delete globalThis.sessionStorage;
});

const additional = {
  ...catalog,
  sites: [
    {
      ...catalog.sites[0],
      id: "jp-extra-site",
      name: "Additional Site",
      coordinates: { latitude: 34.68, longitude: 138.94 },
    },
  ],
};

test("resolveActiveDiveSiteCatalog combines bundled with supplementary", () => {
  const combined = catalogTools.resolveActiveDiveSiteCatalog(catalog, additional);
  assert.equal(combined.sites.length, 2);
});

test("takeSessionSupplementaryCatalogMigration copies then clears session keys", () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };

  catalogTools.saveSessionDiveSiteCatalog(catalog, "extra.json");
  const once = catalogTools.takeSessionSupplementaryCatalogMigration();
  assert.equal(once.label, "extra.json");
  assert.equal(catalogTools.loadSessionDiveSiteCatalog(), null);
  assert.equal(catalogTools.takeSessionSupplementaryCatalogMigration(), null);
  delete globalThis.sessionStorage;
});

test("blocked sessionStorage does not break catalog startup", () => {
  globalThis.sessionStorage = {
    getItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
    removeItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
  };
  assert.equal(catalogTools.loadSessionDiveSiteCatalog(), null);
  assert.doesNotThrow(() =>
    catalogTools.saveSessionDiveSiteCatalog(catalog, "x"),
  );
  assert.doesNotThrow(() => catalogTools.clearSessionDiveSiteCatalog());
  delete globalThis.sessionStorage;
});
