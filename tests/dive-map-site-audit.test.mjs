import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFile } from "node:fs/promises";

async function loadModule(path, replacements = []) {
  let source = await readFile(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  source = transpiled;
  for (const [from, to] of replacements) source = source.replace(from, to);
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

const mapSource = await readFile("lib/dive-map.ts", "utf8");
const mapModuleUrl = `data:text/javascript,${encodeURIComponent(
  ts.transpileModule(mapSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
)}`;
const audit = await loadModule("lib/dive-map-site-audit.ts", [
  ["./dive-map", mapModuleUrl],
]);

const catalog = {
  schemaVersion: 1,
  sites: [
    {
      id: "hk-au-yue-tsui",
      name: "Au Yue Tsui",
      aliases: ["Whiskey Beach"],
      coordinates: { latitude: 22.285, longitude: 114.305 },
      place: {
        countryCode: "HK",
        country: "Hong Kong",
        region: "Sai Kung",
        locality: "Sharp Island",
      },
      source: { kind: "bundled", reference: null },
      status: "active",
      updatedAt: "2026-01-01",
    },
    {
      id: "pw-blue-corner",
      name: "Blue Corner",
      aliases: [],
      coordinates: { latitude: 7.1, longitude: 134.2 },
      place: {
        countryCode: "PW",
        country: "Palau",
        region: null,
        locality: null,
      },
      source: { kind: "bundled", reference: null },
      status: "active",
      updatedAt: "2026-01-01",
    },
  ],
};

function dive(id, overrides = {}) {
  return {
    id,
    diveDate: null,
    appEditedAt: null,
    location: null,
    site: null,
    resolvedLocation: null,
    resolvedCity: null,
    resolvedCountry: null,
    userSite: null,
    userSiteCatalogId: null,
    gpsEntryLat: null,
    gpsEntryLng: null,
    gpsExitLat: null,
    gpsExitLng: null,
    userGpsLat: null,
    userGpsLng: null,
    sourceSiteNames: {},
    ...overrides,
  };
}

test("audits exact names and aliases while listing names not found", () => {
  const result = audit.buildDiveSiteCoordinateAudit(
    [
      dive("alias", { site: " Whiskey   Beach ", location: "Hong Kong" }),
      dive("missing", { userSite: "Mystery Reef", location: "Somewhere" }),
      dive("mapped", { site: "Blue Corner", gpsExitLat: 7.1, gpsExitLng: 134.2 }),
      dive("nameless"),
    ],
    catalog,
  );

  assert.equal(result.namedDiveCount, 2);
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].candidates[0].site.id, "hk-au-yue-tsui");
  assert.equal(result.matched[0].candidates[0].matchedName, "Whiskey Beach");
  assert.equal(result.notFound.length, 1);
  assert.equal(result.notFound[0].diveSiteName, "Mystery Reef");
});

test("groups repeated site and location pairs but keeps differing locations separate", () => {
  const result = audit.buildDiveSiteCoordinateAudit(
    [
      dive("1", { site: "Blue Corner", location: "Palau" }),
      dive("2", { site: "blue corner", location: " Palau " }),
      dive("3", { site: "Blue Corner", location: "Koror" }),
    ],
    catalog,
  );

  assert.equal(result.matched.length, 2);
  assert.deepEqual(result.matched.map((group) => group.dives.length).sort(), [1, 2]);
  assert.equal(audit.catalogSiteLocation(catalog.sites[0]), "Sharp Island · Sai Kung · Hong Kong");
});

test("audit fingerprints invalidate stale results after relevant dive changes", () => {
  const original = dive("1", { site: "Blue Corner", location: "Palau" });
  const result = audit.buildDiveSiteCoordinateAudit([original], catalog);
  const fingerprint = result.matched[0].dives[0].auditFingerprint;

  assert.equal(fingerprint, audit.diveSiteAuditFingerprint(original));
  assert.notEqual(
    fingerprint,
    audit.diveSiteAuditFingerprint({ ...original, userGpsLat: 7.1, userGpsLng: 134.2 }),
  );
  assert.notEqual(
    fingerprint,
    audit.diveSiteAuditFingerprint({ ...original, appEditedAt: "2026-08-11T00:00:00Z" }),
  );
});
