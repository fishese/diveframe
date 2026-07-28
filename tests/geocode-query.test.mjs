import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("app/api/geocode/route.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const geocode = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("broadens comma-separated dive-site searches once", () => {
  assert.deepEqual(
    geocode.locationQueries("Mikomotojima, Shizuoka, Japan"),
    ["Mikomotojima, Shizuoka, Japan", "Shizuoka, Japan"],
  );
  assert.deepEqual(
    geocode.locationQueries("Sabang Bay , Puerto Galera"),
    ["Sabang Bay, Puerto Galera", "Puerto Galera"],
  );
  assert.deepEqual(geocode.locationQueries("Maldives"), ["Maldives"]);
});
