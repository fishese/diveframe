import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/parsers/parser-utils.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { parseGpsPair } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("parseGpsPair validates complete latitude-longitude pairs", () => {
  assert.deepEqual(parseGpsPair("22.3, 114.2"), {
    latitude: 22.3,
    longitude: 114.2,
  });
  assert.deepEqual(parseGpsPair("-33.9 151.2"), {
    latitude: -33.9,
    longitude: 151.2,
  });
  assert.deepEqual(parseGpsPair("22.3\uFF0C114.2"), {
    latitude: 22.3,
    longitude: 114.2,
  });
  assert.equal(parseGpsPair("91, 114"), null);
  assert.equal(parseGpsPair("22, 181"), null);
  assert.equal(parseGpsPair("22, 114, 7"), null);
});
