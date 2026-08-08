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
  assert.equal(normalized.ratio, "16:9");
  assert.equal(normalized.panelFillMode, "frosted");
  assert.ok(Math.abs(normalized.panelOpacity - 0.55) < 0.001);
  assert.equal(normalized.visibleFields.duration, true);
  assert.equal(normalized.visibleFields.maxDepth, true);
  assert.equal(normalized.visibleFields.temperature, true);
  assert.equal(normalized.visibleFields.gasMix, false);
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

test("dock and solid-band recipes seed their intended fields", () => {
  const dock = templatesMod.getTemplate("bottom-stats-dock");
  assert.equal(dock.statsPresentation, "icon-grid");
  assert.equal(dock.defaultVisibleFields.duration, true);
  assert.equal(dock.defaultVisibleFields.maxDepth, true);
  assert.equal(dock.defaultVisibleFields.temperature, true);
  assert.equal(dock.defaultVisibleFields.averageDepth, false);

  const solid = templatesMod.getTemplate("solid-info-band");
  assert.equal(solid.statsPresentation, "solid-band");
  assert.equal(solid.panel.edge, "left");
  assert.equal(solid.defaultPositions.logo, "top-right");
  assert.equal(solid.defaultVisibleFields.duration, true);
  assert.equal(solid.defaultVisibleFields.maxDepth, true);
  assert.equal(solid.defaultVisibleFields.temperature, true);
  assert.equal(solid.defaultVisibleFields.gasMix, true);
});
