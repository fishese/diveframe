import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/duplicate-dives.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const duplicates = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

function dive(overrides = {}) {
  return {
    id: "subsurface:one",
    diveDate: "2026-05-17T14:00:00.000Z",
    maxDepthM: 14,
    durationSeconds: 3600,
    serialNumber: null,
    sources: ["subsurface"],
    ...overrides,
  };
}

test("flags close records from complementary sources", () => {
  const result = duplicates.findPotentialDuplicateDives([
    dive(),
    dive({
      id: "shearwater:two",
      diveDate: "2026-05-17T14:00:45.000Z",
      maxDepthM: 14.2,
      durationSeconds: 3580,
      sources: ["shearwater"],
    }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].timeDifferenceSeconds, 45);
});

test("does not flag materially different profiles", () => {
  const result = duplicates.findPotentialDuplicateDives([
    dive(),
    dive({
      id: "shearwater:two",
      diveDate: "2026-05-17T14:01:00.000Z",
      maxDepthM: 22,
      durationSeconds: 1800,
      sources: ["shearwater"],
    }),
  ]);
  assert.equal(result.length, 0);
});

test("detects a source difference regardless of which record has more sources", () => {
  const result = duplicates.findPotentialDuplicateDives([
    dive({ id: "earlier", sources: ["shearwater"] }),
    dive({
      id: "later",
      diveDate: "2026-05-17T14:02:00.000Z",
      sources: ["shearwater", "uddf"],
    }),
  ]);
  assert.equal(result.length, 1);
});
