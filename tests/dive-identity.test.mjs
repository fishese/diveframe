import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-identity.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const identity = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

function dive(overrides = {}) {
  return {
    id: "parser-temporary-id",
    source: "subsurface",
    sourceId: "a1b2c3:d4e5f6",
    diveNumber: 17,
    diveDate: "2026-05-17 14:00:00",
    lastModified: null,
    depth: "14",
    averageDepth: 8,
    minTemp: 24,
    maxTemp: 25,
    lengthText: "3600",
    durationSeconds: 3600,
    location: null,
    site: null,
    buddy: null,
    notes: null,
    serialNumber: "12345",
    gpsEntryLat: null,
    gpsEntryLng: null,
    gpsExitLat: null,
    gpsExitLng: null,
    calculatedJson: null,
    category: "scuba",
    categorySource: "import",
    maxDepthM: 14,
    waterTemperatureC: 24,
    gasMixes: [],
    computerModel: "Perdix 2",
    samples: [],
    tankPressuresStartBar: [],
    tankPressuresEndBar: [],
    ...overrides,
  };
}

test("canonical identity is unchanged by editable dive fields", () => {
  const original = dive();
  const edited = dive({
    site: "Sharp Island",
    buddy: "A diver",
    notes: "Changed later",
    diveNumber: 999,
    gpsEntryLat: 22.3636,
  });
  assert.equal(
    identity.canonicalDiveId(original),
    identity.canonicalDiveId(edited),
  );
});

test("canonical identity uses source type and immutable source id", () => {
  assert.notEqual(
    identity.canonicalDiveId(dive()),
    identity.canonicalDiveId(
      dive({ source: "shearwater", sourceId: "same-looking-id" }),
    ),
  );
  assert.match(
    identity.canonicalDiveId(dive()),
    /^dive:v1:subsurface:/,
  );
});

test("higher priority sources deterministically promote the canonical id", () => {
  assert.equal(
    identity.shouldPromoteCanonicalSource("shearwater", ["subsurface"]),
    true,
  );
  assert.equal(
    identity.shouldPromoteCanonicalSource("subsurface", ["shearwater"]),
    false,
  );
  assert.equal(
    identity.shouldPromoteCanonicalSource("uddf", ["fit"]),
    true,
  );
  assert.equal(
    identity.shouldPromoteCanonicalSource("shearwater-ble", ["subsurface"]),
    true,
  );
  assert.equal(
    identity.shouldPromoteCanonicalSource("subsurface", ["shearwater-ble"]),
    false,
  );
});

test("portable export identity prefers an explicit immutable activity id", () => {
  const sourceId = identity.stablePortableSourceId("activity-123", {
    startDateTime: "2026-05-17T14:00:00Z",
    serialNumber: "ABC123",
    maxDepthM: 14,
    durationSeconds: 3600,
    samples: [],
  });
  assert.equal(sourceId, "id:activity-123");
});

test("portable export fallback ignores filenames and dive ordering", () => {
  const details = {
    startDateTime: "2026-05-17T14:00:00Z",
    serialNumber: "ABC123",
    maxDepthM: 14.04,
    durationSeconds: 3600,
    samples: [
      { elapsedSeconds: 0, depthM: 0, pressuresBar: [] },
      { elapsedSeconds: 1200, depthM: 12, pressuresBar: [] },
      { elapsedSeconds: 3600, depthM: 0, pressuresBar: [] },
    ],
  };
  assert.equal(
    identity.stablePortableSourceId(null, details),
    identity.stablePortableSourceId("", details),
  );
  assert.match(
    identity.stablePortableSourceId(null, details),
    /^fingerprint:/,
  );
});
