import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/gas-calculations.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const calculations = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("calculates time-weighted sample averages", () => {
  const samples = [
    { elapsedSeconds: 0, depthM: 0, temperatureC: 20, pressuresBar: [] },
    { elapsedSeconds: 60, depthM: 20, temperatureC: 24, pressuresBar: [] },
  ];
  assert.equal(calculations.averageSampleTemperatureC(samples), 22);
  assert.equal(calculations.averageSampleDepthM(samples), 10);
});

test("calculates SAC only with one complete pressure pair", () => {
  assert.equal(
    calculations.calculateSacLitresPerMinute({
      startPressureBar: 200,
      endPressureBar: 50,
      cylinderVolumeL: 11.1,
      durationSeconds: 3600,
      averageDepthM: 10,
    }),
    13.875,
  );
  assert.deepEqual(
    calculations.firstCompletePressurePair([200], [50]),
    { start: 200, end: 50 },
  );
  assert.equal(
    calculations.firstCompletePressurePair([200, 180], [50, 60]),
    null,
  );
});

test("normalizes Shearwater unitless PSI pressure pairs to bar", () => {
  const normalized = calculations.normalizeShearwaterPressurePair(
    2900.75,
    580.15,
  );
  assert.ok(Math.abs(normalized.start - 200) < 0.1);
  assert.ok(Math.abs(normalized.end - 40) < 0.1);
  assert.deepEqual(
    calculations.normalizeShearwaterPressurePair(200, 50),
    { start: 200, end: 50 },
  );
});
