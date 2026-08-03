import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/sample-dive.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { prepareSampleAwareImport, SAMPLE_DIVE_SOURCE_ID } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("keeps a sample-only import", () => {
  const sample = { sourceId: SAMPLE_DIVE_SOURCE_ID };
  assert.deepEqual(prepareSampleAwareImport([sample]), {
    includesRealDive: false,
    dives: [sample],
  });
});

test("removes the sample when real dives are imported in the same selection", () => {
  const real = { sourceId: "id:real-dive" };
  assert.deepEqual(
    prepareSampleAwareImport([{ sourceId: SAMPLE_DIVE_SOURCE_ID }, real]),
    { includesRealDive: true, dives: [real] },
  );
});
