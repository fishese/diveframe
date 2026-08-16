import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { DOMParser } from "linkedom";

const awaited = await readFile("lib/subsurface-logbook-export.ts", "utf8");
const gpsJavascript = ts.transpileModule(
  await readFile("lib/dive-gps.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const gpsUrl = `data:text/javascript;base64,${Buffer.from(gpsJavascript).toString("base64")}`;
const source = awaited.replace(
  /from "\.\/dive-gps"/,
  `from "${gpsUrl}"`,
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  createSubsurfaceLogbook,
  partitionSubsurfaceLogbookDives,
  validateSubsurfaceLogbookExport,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`,
);

const completeDive = {
  id: "dive:v1:uddf:id%3Atest-dive",
  diveNumber: 42,
  diveDate: "2030-08-02 10:00:00",
  durationSeconds: 1800,
  category: "scuba",
  userSite: "Example & Reef",
  site: null,
  gpsEntryLat: 22.3,
  gpsEntryLng: 114.2,
  userGpsLat: null,
  userGpsLng: null,
  buddy: "A & B",
  notes: "A < B",
  gasMixes: [{ oxygenPercent: 32, heliumPercent: 0 }],
  computerModel: "Perdix 2",
  serialNumber: "ABC-123",
  maxDepthM: 18.5,
  depth: "18.5",
  averageDepth: 10.2,
  waterTemperatureC: 26.4,
  samples: [
    { elapsedSeconds: 0, depthM: 0, pressuresBar: [200] },
    { elapsedSeconds: 900, depthM: 18.5, pressuresBar: [150], temperatureC: 26.4 },
    { elapsedSeconds: 1800, depthM: 0, pressuresBar: [100] },
  ],
};

test("creates a portable Subsurface logbook from complete local dives", () => {
  assert.deepEqual(validateSubsurfaceLogbookExport([completeDive]), { ok: true });
  const xml = createSubsurfaceLogbook([completeDive]);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const root = document.documentElement;
  const site = document.querySelector("divesites > site");
  const dive = document.querySelector("dives > dive");
  const siteId = site?.getAttribute("uuid");

  assert.equal(root?.getAttribute("version"), "3");
  assert.equal(site?.getAttribute("name"), "Example &amp; Reef");
  assert.match(siteId ?? "", /^[0-9a-f]{8}$/);
  assert.equal(dive?.getAttribute("divesiteid"), siteId);
  assert.equal(dive?.getAttribute("duration"), "30:00 min");
  assert.equal(dive?.querySelector("buddy")?.textContent, "A & B");
  assert.equal(dive?.querySelector("notes")?.textContent, "A < B");
  assert.equal(dive?.querySelectorAll("sample").length, 3);
  assert.equal(dive?.querySelector("sample")?.getAttribute("pressure0"), "200.0 bar");
});

test("rejects records without a usable depth-over-time profile", () => {
  const incomplete = { ...completeDive, samples: [{ elapsedSeconds: 0, depthM: 0 }] };
  assert.deepEqual(validateSubsurfaceLogbookExport([incomplete]), {
    ok: false,
    incompleteDiveIds: [incomplete.id],
  });
  assert.throws(() => createSubsurfaceLogbook([incomplete]), /no complete dive/);
});

test("exports complete dives and skips incomplete ones in the same selection", () => {
  const incomplete = {
    ...completeDive,
    id: "incomplete-cloud",
    samples: [{ elapsedSeconds: 0, depthM: 0 }],
  };
  const partition = partitionSubsurfaceLogbookDives([completeDive, incomplete]);
  assert.deepEqual(
    partition.portable.map((dive) => dive.id),
    [completeDive.id],
  );
  assert.deepEqual(partition.incompleteDiveIds, [incomplete.id]);

  const xml = createSubsurfaceLogbook([completeDive, incomplete]);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  assert.equal(document.querySelectorAll("dives > dive").length, 1);
  assert.equal(
    document.querySelector("divecomputer")?.getAttribute("diveid"),
    completeDive.id,
  );
});

test("rejects surface-only and duplicate-time profiles", () => {
  const surfaceOnly = {
    ...completeDive,
    id: "surface-only",
    samples: [
      { elapsedSeconds: 0, depthM: 0 },
      { elapsedSeconds: 120, depthM: 0 },
    ],
  };
  const duplicateTime = {
    ...completeDive,
    id: "duplicate-time",
    samples: [
      { elapsedSeconds: 10, depthM: 1 },
      { elapsedSeconds: 10, depthM: 5 },
    ],
  };
  assert.deepEqual(validateSubsurfaceLogbookExport([surfaceOnly, duplicateTime]), {
    ok: false,
    incompleteDiveIds: ["surface-only", "duplicate-time"],
  });
});

test("preserves computer GPS and falls back to a complete user pair", () => {
  const userGpsDive = {
    ...completeDive,
    gpsEntryLat: 22.3,
    gpsEntryLng: 114.2,
    userGpsLat: 1.2,
    userGpsLng: 2.3,
  };
  const xml = createSubsurfaceLogbook([userGpsDive]);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  assert.equal(
    document.querySelector("divesites > site")?.getAttribute("gps"),
    "22.300000 114.200000",
  );

  const partialComputer = {
    ...userGpsDive,
    gpsEntryLng: null,
    exportGpsPreference: "computer",
  };
  const partialXml = createSubsurfaceLogbook([partialComputer]);
  const partialDocument = new DOMParser().parseFromString(partialXml, "application/xml");
  assert.equal(
    partialDocument.querySelector("divesites > site")?.getAttribute("gps"),
    "1.200000 2.300000",
  );

  const exitGpsDive = {
    ...partialComputer,
    userGpsLat: 1.2,
    userGpsLng: 2.3,
    gpsExitLat: 7.4,
    gpsExitLng: 134.5,
  };
  const exitDocument = new DOMParser().parseFromString(
    createSubsurfaceLogbook([exitGpsDive]),
    "application/xml",
  );
  assert.equal(
    exitDocument.querySelector("divesites > site")?.getAttribute("gps"),
    "7.400000 134.500000",
  );
});

test("user GPS preference wins in the full logbook and falls back when invalid", () => {
  const both = {
    ...completeDive,
    gpsEntryLat: 22.3,
    gpsEntryLng: 114.2,
    userGpsLat: 1.2,
    userGpsLng: 2.3,
    exportGpsPreference: "user",
  };
  const userDocument = new DOMParser().parseFromString(
    createSubsurfaceLogbook([both]),
    "application/xml",
  );
  assert.equal(
    userDocument.querySelector("divesites > site")?.getAttribute("gps"),
    "1.200000 2.300000",
  );

  const legacy = createSubsurfaceLogbook([
    { ...both, exportGpsPreference: "user-if-missing" },
  ]);
  assert.equal(
    new DOMParser()
      .parseFromString(legacy, "application/xml")
      .querySelector("divesites > site")
      ?.getAttribute("gps"),
    "22.300000 114.200000",
  );

  const invalidUser = createSubsurfaceLogbook([
    { ...both, userGpsLat: 91, userGpsLng: 2.3 },
  ]);
  assert.equal(
    new DOMParser()
      .parseFromString(invalidUser, "application/xml")
      .querySelector("divesites > site")
      ?.getAttribute("gps"),
    "22.300000 114.200000",
  );
});

test("derives average depth by elapsed time rather than sample count", () => {
  const derived = {
    ...completeDive,
    averageDepth: null,
    samples: [
      { elapsedSeconds: 0, depthM: 0, pressuresBar: [] },
      { elapsedSeconds: 100, depthM: 10, pressuresBar: [] },
      { elapsedSeconds: 110, depthM: 10, pressuresBar: [] },
    ],
  };
  const document = new DOMParser().parseFromString(
    createSubsurfaceLogbook([derived]),
    "application/xml",
  );
  assert.equal(
    document.querySelector("divecomputer > depth")?.getAttribute("mean"),
    "5.45 m",
  );
});
