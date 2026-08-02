import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadCoordinateModule() {
  const source = await readFile("lib/coordinate-input.ts", "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

const { formatCoordinatePair, parseCoordinatePair } =
  await loadCoordinateModule();

test("parses decimal latitude and longitude from one comma-separated field", () => {
  assert.deepEqual(parseCoordinatePair("19.09876,72.87643"), {
    latitude: 19.09876,
    longitude: 72.87643,
  });
  assert.deepEqual(parseCoordinatePair(" -33.856784 , 151.215297 "), {
    latitude: -33.856784,
    longitude: 151.215297,
  });
  assert.deepEqual(parseCoordinatePair("22.3，114.2"), {
    latitude: 22.3,
    longitude: 114.2,
  });
});

test("rejects malformed and out-of-range coordinate pairs", () => {
  assert.equal(parseCoordinatePair("111,22"), null);
  assert.equal(parseCoordinatePair("22,181"), null);
  assert.equal(parseCoordinatePair("22"), null);
  assert.equal(parseCoordinatePair("Hong Kong"), null);
});

test("formats stored coordinates without rounding away precision", () => {
  assert.equal(formatCoordinatePair(19.09876543, 72.8764321), "19.09876543, 72.8764321");
  assert.equal(formatCoordinatePair(null, 72.8), "");
});
