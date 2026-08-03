import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/fit-units.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { fitCoordinateDegrees, fitDepthMetres } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("converts FIT semicircle coordinates to degrees", () => {
  const hongKongLatitudeSemicircles = 22.3 * (2 ** 31 / 180);
  assert.ok(
    Math.abs(fitCoordinateDegrees(hongKongLatitudeSemicircles, -90, 90) - 22.3) <
      1e-9,
  );
  assert.equal(fitCoordinateDegrees(2 ** 31, -90, 90), null);
});

test("applies the missing FIT depth scale", () => {
  assert.equal(fitDepthMetres(18500), 18.5);
  assert.equal(fitDepthMetres(null), null);
});
