import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-segment-merge.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const merge = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

function sample(elapsedSeconds, depthM, extra = {}) {
  return { elapsedSeconds, depthM, pressuresBar: [], ...extra };
}

function dive(overrides = {}) {
  return {
    id: "dive-a",
    diveDate: "2026-08-16T10:00:00.000Z",
    diveNumber: 12,
    durationSeconds: 120,
    maxDepthM: 6,
    serialNumber: "A8E705BD",
    computerModel: "Perdix 2",
    category: "scuba",
    diveMode: "oc",
    site: "First reef",
    userSite: null,
    tripId: "trip-1",
    buddy: "Ada",
    notes: "First hop",
    gasMixes: [{ oxygenPercent: 32, heliumPercent: 0, label: "Nitrox 32" }],
    tanks: [{ index: 0, gasMixIndex: 0, volumeL: 11.1, workPressureBar: null, startPressureBar: 200, endPressureBar: 150, usage: "unknown" }],
    samples: [sample(0, 0), sample(60, 6), sample(120, 0)],
    photoCount: 1,
    sources: ["shearwater"],
    sourceDiveNumbers: { shearwater: 12 },
    sourceSiteNames: { shearwater: "First reef" },
    sourceLocations: {},
    location: null,
    locationSource: null,
    userGpsLat: null,
    userGpsLng: null,
    exportGpsPreference: "computer",
    importedAt: "2026-08-16T12:00:00.000Z",
    appEditedAt: null,
    ...overrides,
  };
}

function second(overrides = {}) {
  return dive({
    id: "dive-b",
    diveDate: "2026-08-16T10:03:30.000Z",
    diveNumber: 13,
    durationSeconds: 600,
    maxDepthM: 18,
    site: "First reef",
    notes: "Main profile",
    samples: [sample(0, 0), sample(300, 18), sample(600, 0)],
    photoCount: 2,
    sourceDiveNumbers: { shearwater: 13 },
    ...overrides,
  });
}

test("allows same-serial adjacent segments with a 90-second surface gap", () => {
  const result = merge.evaluateSegmentMerge([second(), dive()]);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ordered.map((item) => item.id),
    ["dive-a", "dive-b"],
  );
  assert.equal(result.gapsSeconds.length, 1);
  assert.equal(result.gapsSeconds[0], 90);
  assert.equal(result.clockDurationSeconds, 810);
  assert.equal(result.underwaterDurationSeconds, 720);
  assert.equal(result.errors.length, 0);
});

test("blocks overlapping start times", () => {
  const result = merge.evaluateSegmentMerge([
    dive({ durationSeconds: 600 }),
    second({ diveDate: "2026-08-16T10:05:00.000Z" }),
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("overlap"));
});

test("blocks serial mismatch", () => {
  const result = merge.evaluateSegmentMerge([
    dive(),
    second({ serialNumber: "FFFFFFFF" }),
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("serial-mismatch"));
});

test("blocks scuba plus freediving", () => {
  const result = merge.evaluateSegmentMerge([
    dive(),
    second({ category: "freediving", diveMode: "freedive" }),
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("category-mismatch"));
});

test("blocks a 61-minute surface gap and warns at 16 minutes", () => {
  const blocked = merge.evaluateSegmentMerge([
    dive(),
    second({ diveDate: "2026-08-16T11:03:00.000Z" }),
  ]);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.errors.includes("gap-too-large"));

  const warned = merge.evaluateSegmentMerge([
    dive(),
    second({ diveDate: "2026-08-16T10:18:00.000Z" }),
  ]);
  assert.equal(warned.ok, true);
  assert.ok(warned.warnings.includes("long-gap"));
});

test("warns when serials are missing but computer models match", () => {
  const result = merge.evaluateSegmentMerge([
    dive({ serialNumber: null }),
    second({ serialNumber: null }),
  ]);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes("missing-serial"));
});

test("blocks unknown computers when serial and model are both missing", () => {
  const result = merge.evaluateSegmentMerge([
    dive({ serialNumber: null, computerModel: null }),
    second({ serialNumber: null, computerModel: null }),
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unknown-computer"));
});

test("offsets later samples and leaves original arrays unchanged", () => {
  const first = dive();
  const later = second();
  const originalFirst = first.samples.map((item) => ({ ...item }));
  const originalLater = later.samples.map((item) => ({ ...item }));
  const profile = merge.buildMergedProfile([first, later]);
  assert.equal(profile.samples[0].elapsedSeconds, 0);
  const laterStart = profile.samples.find(
    (item) => item.depthM === 18 && item.elapsedSeconds === 510,
  );
  assert.ok(laterStart, "later max-depth sample should be offset by 210 seconds");
  assert.deepEqual(first.samples, originalFirst);
  assert.deepEqual(later.samples, originalLater);
});

test("inserts zero-depth boundary samples for a surface gap", () => {
  const profile = merge.buildMergedProfile([dive(), second()]);
  const zeros = profile.samples.filter((item) => item.depthM === 0);
  assert.ok(zeros.some((item) => item.elapsedSeconds === 120));
  assert.ok(zeros.some((item) => item.elapsedSeconds === 210));
  assert.equal(profile.durationSeconds, 810);
  assert.equal(profile.samples.at(-1).elapsedSeconds, 810);
});

test("average depth ignores the surface interval", () => {
  const profile = merge.buildMergedProfile([dive(), second()]);
  const withSurface = merge.averageSampleDepthM(profile.samples, {
    includeSurface: true,
  });
  assert.ok(profile.averageDepthM > 0);
  assert.ok(withSurface < profile.averageDepthM);
});

test("marks gas conflicts without rewriting member mixes", () => {
  const first = dive();
  const later = second({
    gasMixes: [{ oxygenPercent: 21, heliumPercent: 0, label: "Air" }],
  });
  const profile = merge.buildMergedProfile([first, later]);
  assert.equal(profile.gasConflict, true);
  assert.equal(first.gasMixes[0].oxygenPercent, 32);
  assert.equal(later.gasMixes[0].oxygenPercent, 21);
});

test("treats tank-count and cylinder-volume changes as gas conflicts", () => {
  const extraTank = second({
    tanks: [
      ...second().tanks,
      { index: 1, gasMixIndex: 0, volumeL: 5.7, usage: "unknown" },
    ],
  });
  assert.equal(merge.buildMergedProfile([dive(), extraTank]).gasConflict, true);
  assert.equal(
    merge.buildMergedProfile([
      dive({ cylinderVolumeL: 11.1 }),
      second({ cylinderVolumeL: 12 }),
    ]).gasConflict,
    true,
  );
});

test("projection hides members and exposes a merge presentation id", () => {
  const first = dive({ gpsEntryLat: null, gpsEntryLng: null });
  const later = second({ gpsEntryLat: 19.1, gpsEntryLng: 72.8 });
  const group = {
    id: "group-1",
    memberDiveIds: ["dive-a", "dive-b"],
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    memberRevision: [],
  };
  const presentation = merge.projectLogbookDives([first, later, dive({ id: "solo" })], [
    group,
  ]);
  assert.deepEqual(
    presentation.map((item) => item.id).sort(),
    ["merge:group-1", "solo"].sort(),
  );
  const merged = presentation.find((item) => item.id === "merge:group-1");
  assert.equal(merged.mergeGroupId, "group-1");
  assert.deepEqual(merged.memberDiveIds, ["dive-a", "dive-b"]);
  assert.equal(merged.durationSeconds, 810);
  assert.equal(merged.photoCount, 3);
  assert.equal(merged.maxDepthM, 18);
  assert.equal(merged.gpsEntryLat, 19.1);
  assert.equal(merged.gpsEntryLng, 72.8);
});

test("projection keeps first-source values and ignores invalid coordinate pairs", () => {
  const first = dive({
    sourceDiveNumbers: { shearwater: 12 },
    gpsEntryLat: 91,
    gpsEntryLng: 1,
  });
  const later = second({
    sourceDiveNumbers: { shearwater: 99 },
    gpsEntryLat: 19.1,
    gpsEntryLng: 72.8,
    userGpsLat: Number.NaN,
    userGpsLng: 114,
  });
  const group = {
    id: "group-precedence",
    memberDiveIds: [first.id, later.id],
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    memberRevision: [],
  };
  const projected = merge.projectMergedDive([first, later], group);
  assert.equal(projected.sourceDiveNumbers.shearwater, 12);
  assert.equal(projected.gpsEntryLat, 19.1);
  assert.equal(projected.gpsEntryLng, 72.8);
  assert.equal(projected.userGpsLat, null);
  assert.equal(projected.userGpsLng, null);
});

test("presentation helpers round-trip merge ids", () => {
  assert.equal(merge.mergePresentationId("abc"), "merge:abc");
  assert.equal(merge.parseMergePresentationId("merge:abc"), "abc");
  assert.equal(merge.parseMergePresentationId("merge:"), null);
  assert.equal(merge.parseMergePresentationId("dive:v1:shearwater:one"), null);
  assert.equal(merge.isMergePresentationId("merge:abc"), true);
});
