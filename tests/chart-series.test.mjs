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

test("overlay sampling retains sparse readings and its own extrema", () => {
  const samples = Array.from({ length: 2000 }, (_, elapsedSeconds) => ({ elapsedSeconds, depthM: 10, pressuresBar: [], temperatureC: undefined }));
  samples[123].temperatureC = 20;
  samples[987].temperatureC = 30;
  assert.deepEqual(chart.downsampleChartSeries(samples, (sample) => sample.temperatureC, 240).map((point) => point.value), [20, 30]);
  for (const sample of samples) sample.temperatureC = 25;
  samples[123].temperatureC = 10;
  samples[987].temperatureC = 40;
  const reduced = chart.downsampleChartSeries(samples, (sample) => sample.temperatureC, 240);
  assert.ok(reduced.length <= 242);
  assert.ok(reduced.some((point) => point.value === 10));
  assert.ok(reduced.some((point) => point.value === 40));
  assert.equal(reduced[0].sample.elapsedSeconds, 0);
  assert.equal(reduced.at(-1).sample.elapsedSeconds, 1999);
});

test("chart modes independently draw sparse pressure cylinders and single temperature readings", () => {
  const original = globalThis.Path2D;
  globalThis.Path2D = class { moveTo() {} lineTo() {} };
  try {
    const samples = Array.from({ length: 2000 }, (_, elapsedSeconds) => ({ elapsedSeconds, depthM: 10, pressuresBar: [] }));
    samples[123].temperatureC = 24;
    samples[456].pressuresBar = [190, 180];
    samples[987].pressuresBar = [150];
    for (const [chartMode, expected] of [["depth", ["depth"]], ["depth-pressure", ["depth", "pressure", "pressure"]], ["depth-temperature", ["depth", "temperature"]], ["depth-pressure-temperature", ["depth", "pressure", "pressure", "temperature"]]]) {
      const strokes = [];
      const points = [];
      const context = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, setLineDash() {}, moveTo(x, y) { points.push([x, y]); }, lineTo(x, y) { points.push([x, y]); }, stroke() { strokes.push(this.strokeStyle); } };
      chart.renderDiveChart(context, { x: 0, y: 0, width: 320, height: 180 }, { samples }, { chartMode, showAxisLabels: false, fillOpacity: 0, lineThickness: 2, depthColor: "depth", pressureColor: "pressure", temperatureColor: "temperature" });
      assert.deepEqual(strokes, expected);
      assert.ok(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
      if (chartMode.includes("temperature")) assert.ok(points.length >= 2, "single reading gets a visible stroke");
    }
  } finally { globalThis.Path2D = original; }
});
