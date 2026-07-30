import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-site-validation.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const validator = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

function site(overrides = {}) {
  return {
    id: "jp-test-site",
    name: "Test Site",
    aliases: [],
    coordinates: { latitude: 35, longitude: 139 },
    place: {
      countryCode: "JP",
      country: "Japan",
      region: null,
      locality: null,
    },
    source: { kind: "manual", reference: null },
    status: "active",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

test("accepts nullable catalog fields and returns a validated catalog", () => {
  const input = { schemaVersion: 1, sites: [site()] };
  const report = validator.validateDiveSitesFile(input);
  assert.equal(report.ok, true);
  assert.equal(report.errorCount, 0);
  assert.equal(report.siteCount, 1);
  assert.equal(report.validSiteCount, 1);
  assert.deepEqual(report.catalog, input);
});

test("rejects unsupported or missing schema versions", () => {
  for (const schemaVersion of [undefined, 2, "1"]) {
    const report = validator.validateDiveSitesFile({
      schemaVersion,
      sites: [site()],
    });
    assert.equal(report.ok, false);
    assert.ok(
      report.issues.some(
        ({ code }) => code === "unsupported-schema-version",
      ),
    );
  }
});

test("reports malformed records without throwing", () => {
  const report = validator.validateDiveSitesFile({
    schemaVersion: 1,
    sites: [
      { id: "broken-a", coordinates: { latitude: 1, longitude: 1 } },
      { id: "broken-b", coordinates: { latitude: 1.001, longitude: 1.001 } },
    ],
  });
  assert.equal(report.ok, false);
  assert.equal(report.validSiteCount, 0);
  assert.equal(report.catalog, null);
  assert.ok(report.errorCount > 0);
});

test("does not treat different non-Latin names as identical", () => {
  const report = validator.validateDiveSitesFile({
    schemaVersion: 1,
    sites: [
      site({ id: "jp-a", name: "青の洞窟" }),
      site({
        id: "jp-b",
        name: "神子元島",
        coordinates: { latitude: 35.0001, longitude: 139.0001 },
      }),
    ],
  });
  assert.equal(report.ok, true);
  assert.equal(report.warningCount, 1);
  assert.equal(report.issues[0].code, "possible-duplicate");
  assert.equal(report.issues[0].level, "warning");
});

test("flags duplicate IDs and same normalized names as errors", () => {
  const report = validator.validateDiveSitesFile({
    schemaVersion: 1,
    sites: [
      site({ id: "duplicate", name: "Café Reef" }),
      site({
        id: "duplicate",
        name: "Ｃａｆé　Ｒｅｅｆ",
        coordinates: { latitude: 35.0001, longitude: 139.0001 },
      }),
    ],
  });
  assert.equal(report.ok, false);
  assert.equal(report.catalog, null);
  assert.ok(report.issues.some(({ code }) => code === "duplicate-id"));
  assert.ok(
    report.issues.some(
      ({ code, level }) => code === "possible-duplicate" && level === "error",
    ),
  );
});

test("handles locality groups crossing the international date line", () => {
  const place = {
    countryCode: "FJ",
    country: "Fiji",
    region: null,
    locality: "Dateline",
  };
  const report = validator.validateDiveSitesFile({
    schemaVersion: 1,
    sites: [
      site({
        id: "fiji-a",
        coordinates: { latitude: -17.7, longitude: 179.8 },
        place,
      }),
      site({
        id: "fiji-b",
        coordinates: { latitude: -17.71, longitude: -179.9 },
        place,
      }),
      site({
        id: "fiji-c",
        coordinates: { latitude: -17.69, longitude: 179.9 },
        place,
      }),
    ],
  });
  assert.equal(
    report.issues.some(({ code }) => code === "locality-outlier"),
    false,
  );
});

test("the bundled catalog has no validation errors", async () => {
  const catalog = JSON.parse(await readFile("data/dive-sites.json", "utf8"));
  const report = validator.validateDiveSitesFile(catalog);
  assert.equal(report.siteCount, catalog.sites.length);
  assert.equal(report.errorCount, 0);
});
