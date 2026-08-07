import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function transpileToTemp(relativePath, tempDir, cache = new Map()) {
  const abs = resolve(relativePath);
  if (cache.has(abs)) return cache.get(abs);

  const source = await readFile(abs, "utf8");
  let javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = dirname(abs);
  const specifiers = [
    ...javascript.matchAll(/from\s+["'](\.[^"']+)["']/g),
  ].map((match) => match[1]);

  for (const specifier of specifiers) {
    const depTs = resolve(dir, specifier.endsWith(".ts") ? specifier : `${specifier}.ts`);
    const depUrl = await transpileToTemp(depTs, tempDir, cache);
    javascript = javascript.replaceAll(
      new RegExp(
        `from\\s+["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "g",
      ),
      `from ${JSON.stringify(depUrl)}`,
    );
  }

  const outPath = join(
    tempDir,
    `${abs.replace(/[^a-zA-Z0-9]+/g, "_")}.mjs`,
  );
  await writeFile(outPath, javascript);
  const url = pathToFileURL(outPath).href;
  cache.set(abs, url);
  return url;
}

const tempDir = await mkdtemp(join(tmpdir(), "composer-stats-"));
const stats = await import(
  await transpileToTemp("lib/composer-stats.ts", tempDir)
);

test("icon-grid presentation keeps at most six items", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({
    field: "duration",
    label: `L${i}`,
    value: `${i}`,
  }));
  const capped = stats.limitStatsForPresentation(items, "icon-grid");
  assert.equal(capped.length, 6);
});

test("vertical text-stack starts below titles and in-panel chart", () => {
  const panel = { x: 660, y: 0, width: 340, height: 1000 };
  const margin = 20;
  const base = 40;
  const titleReserveTop = 120;
  const chartRect = { x: 680, y: 550, width: 300, height: 220 };

  const withTitlesOnly = stats.textStackStartY(panel, 4, base, margin, {
    titleReserveTop,
  });
  assert.ok(withTitlesOnly >= panel.y + margin + titleReserveTop);

  const withChart = stats.textStackStartY(panel, 4, base, margin, {
    titleReserveTop,
    chartRegion: "in-panel",
    chartRect,
    chartVisible: true,
  });
  assert.ok(withChart >= chartRect.y + chartRect.height);
  assert.ok(withChart > withTitlesOnly);
});
