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

const layout = await loadTypeScriptModule("lib/composer-layout.ts");
const fileNames = await loadTypeScriptModule("lib/export-file-name.ts");

test("chart height expands lower information layouts", () => {
  const shortPanelY = layout.lowerPanelY("bottom", 0.12, 1000);
  const tallPanelY = layout.lowerPanelY("bottom", 0.48, 1000);
  assert.ok(tallPanelY < shortPanelY);
  assert.equal(shortPanelY - tallPanelY, 320);
});

test("chart height expands the landscape dashboard when needed", () => {
  assert.ok(
    layout.lowerPanelY("dashboard", 0.48, 1000) <
      layout.lowerPanelY("dashboard", 0.2, 1000),
  );
});

test("export names use dive date and a Windows-safe time", () => {
  assert.equal(
    fileNames.exportFileName("2026-05-17 14:03:00"),
    "diveframe-20260517 14-03",
  );
});
