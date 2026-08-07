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

const settingsMod = await loadTypeScriptModule("lib/composer-settings.ts");
const templatesMod = await loadTypeScriptModule("lib/templates.ts");

test("retired templateId coerces to bottom-stats-dock", () => {
  const base = settingsMod.defaultComposerSettings("dive-1");
  const normalized = templatesMod.normalizeComposerSettings({
    ...base,
    templateId: "landscape-dashboard",
  });
  assert.equal(normalized.templateId, "bottom-stats-dock");
});

test("missing panel fields fill from active recipe", () => {
  const base = settingsMod.defaultComposerSettings("dive-1");
  const { panelEdge, panelFillMode, chartOffsetX, ...rest } = base;
  const normalized = templatesMod.normalizeComposerSettings(rest);
  assert.equal(typeof normalized.panelEdge, "string");
  assert.equal(typeof normalized.panelFillMode, "string");
  assert.equal(normalized.chartOffsetX, 0);
  assert.equal(normalized.chartOffsetY, 0);
});
