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

test("bottom panel occupies the lower band", () => {
  const panel = layout.panelRect("bottom", 1000, 1000, 0.25, "comfortable");
  assert.equal(panel.x, 0);
  assert.ok(panel.y > 500);
  assert.equal(panel.width, 1000);
  assert.ok(panel.height > 100);
});

test("right panel occupies the right strip", () => {
  const panel = layout.panelRect("right", 1000, 1000, 0.22, "comfortable");
  assert.ok(panel.x > 500);
  assert.equal(panel.y, 0);
  assert.equal(panel.height, 1000);
});

test("chart offset free-floats without clamping to panel", () => {
  const home = { x: 100, y: 600, width: 800, height: 200 };
  const moved = layout.offsetRect(home, 0.1, -0.2, 1000, 1000);
  assert.equal(moved.x, 200);
  assert.equal(moved.y, 400);
});

test("solid-band panel grows with stat count up to 42% height", () => {
  const few = layout.panelRect("bottom", 1000, 1000, 0.24, "comfortable", {
    statCount: 2,
    presentation: "solid-band",
  });
  const many = layout.panelRect("bottom", 1000, 1000, 0.24, "comfortable", {
    statCount: 10,
    presentation: "solid-band",
  });
  assert.ok(many.height > few.height);
  assert.ok(many.height <= 1000 * 0.42 + 1e-6);
  assert.equal(many.y + many.height, 1000);
});

test("chart-to-dock gap leaves space above the bottom panel", () => {
  const panel = layout.panelRect("bottom", 1600, 900, 0.28, "comfortable", {
    statCount: 3,
    presentation: "icon-grid",
  });
  const chart = layout.chartHomeRect(
    "above-panel",
    panel,
    1600,
    900,
    0.28,
    40,
    { chartPanelGap: 0.028 },
  );
  assert.ok(panel.y - (chart.y + chart.height) >= 900 * 0.028 - 1e-6);
});

test("in-panel chart starts under titles and leaves room for bottom stats", () => {
  const panel = { x: 660, y: 0, width: 340, height: 1000 };
  const chart = layout.chartHomeRect(
    "in-panel",
    panel,
    1000,
    1000,
    0.22,
    20,
    { titleReserveTop: 140, statsReserveBottom: 220 },
  );
  assert.ok(chart.y >= panel.y + 20 + 140 - 1e-6);
  assert.ok(chart.y + chart.height <= panel.y + panel.height - 20 - 220 + 1e-6);
});
