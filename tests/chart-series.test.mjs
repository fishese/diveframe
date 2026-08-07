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

const tempDir = await mkdtemp(join(tmpdir(), "chart-series-"));
const chart = await import(
  await transpileToTemp("lib/chart-renderer.ts", tempDir)
);

test("buildPressureSeries returns one series per cylinder", () => {
  const dive = {
    samples: [
      { elapsedSeconds: 0, depthM: 1, temperatureC: 24, pressuresBar: [200, 180] },
      { elapsedSeconds: 10, depthM: 5, temperatureC: 24, pressuresBar: [190, 170] },
    ],
  };
  const series = chart.buildPressureSeries(dive, { pressureColor: "#ffb36b" });
  assert.equal(series.length, 2);
  assert.equal(series[0].color, "#ffb36b");
  assert.equal(series[1].color, "#ffb36b");
});
