import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(path) {
  const source = await readFile(path, "utf8");
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

const fileNames = await loadTypeScriptModule("lib/export-file-name.ts");

test("export names use dive date and a Windows-safe time", () => {
  assert.equal(
    fileNames.exportFileName("2026-05-17 14:03:00"),
    "diveframe-20260517 14-03",
  );
});
