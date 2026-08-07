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
