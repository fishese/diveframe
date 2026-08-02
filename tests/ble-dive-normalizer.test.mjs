import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule(path, imports = {}) {
  const source = await readFile(path, "utf8");
  let javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  for (const [specifier, url] of Object.entries(imports)) {
    javascript = javascript.replaceAll(
      new RegExp(`from\\s+["']${specifier}["']`, "g"),
      `from "${url}"`,
    );
  }

  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

const diveModel = await loadModule("lib/dive-model.ts");
const normalizer = await loadModule("lib/ble-dive-normalizer.ts", {
  "./dive-model": `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(await readFile("lib/dive-model.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`,
});

test("BLE normalizer maps a parsed Perdix-shaped dive into an import preview", () => {
  const preview = normalizer.normalizeBleDivePreview(
    {
      vendor: "Shearwater",
      product: "Perdix 2",
      serial: 2833712573,
      serialHex: "A8E705BD",
      firmware: 102,
      model: 11,
    },
    {
      size: 3712,
      fingerprintHex: "6A3FDA66",
      parsed: {
        parseStatus: 0,
        parseMessage: "Success",
        datetime: "2026-06-27T14:12:54",
        diveTimeSeconds: 518,
        maxDepthM: 4.2,
        diveMode: "oc",
        temperatureSurfaceC: 30,
        atmosphericBar: 1.012,
        salinity: { waterType: "salt", densityKgM3: 1025 },
        decompressionModel: {
          type: "buhlmann",
          conservatism: 0,
          gfLow: 40,
          gfHigh: 85,
        },
        sampleCount: 59,
        gasmixes: [{ o2Percent: 21, hePercent: 0 }],
        tanks: [{
          beginBar: 113.2,
          endBar: 108.4,
          gasmixIndex: -1,
          volumeL: 12,
          workPressureBar: 232,
          volumeType: 1,
          usage: "sidemount",
        }, {
          beginBar: 201.4,
          endBar: 184.1,
          gasmixIndex: 0,
          volumeL: 11.1,
          workPressureBar: 207,
          volumeType: 2,
          usage: "sidemount",
        }],
        profile: [
          {
            timeMs: 10000,
            depthM: 3,
            temperatureC: 28.5,
            pressuresBar: [113.2, 201.4],
          },
          {
            timeMs: 60000,
            depthM: 4.2,
            temperatureC: 29,
            pressuresBar: [108.4, 184.1],
          },
        ],
      },
    },
  );

  assert.equal(preview.parseOk, true);
  assert.equal(preview.provisionalSource, "shearwater-ble");
  assert.equal(preview.sourceId, "6A3FDA66");
  assert.equal(
    preview.proposedCanonicalId,
    "dive:v1:shearwater-ble:6A3FDA66",
  );
  assert.equal(preview.diveDate, "2026-06-27T14:12:54");
  assert.equal(preview.durationSeconds, 518);
  assert.equal(preview.maxDepthM, 4.2);
  assert.equal(preview.minTemp, 28.5);
  assert.equal(preview.maxTemp, 29);
  assert.equal(preview.waterTemperatureC, 28.5);
  assert.equal(preview.surfaceTemperatureC, 30);
  assert.equal(preview.atmosphericPressureBar, 1.012);
  assert.deepEqual(preview.salinity, {
    waterType: "salt",
    densityKgM3: 1025,
  });
  assert.deepEqual(preview.decompressionModel, {
    type: "buhlmann",
    conservatism: 0,
    gfLow: 40,
    gfHigh: 85,
  });
  assert.equal(preview.diveMode, "oc");
  assert.equal(preview.serialNumber, "A8E705BD");
  assert.equal(preview.computerModel, "Perdix 2");
  assert.equal(preview.gasMixes[0]?.label, "Air");
  assert.deepEqual(preview.tankPressuresStartBar, [113.2, 201.4]);
  assert.deepEqual(preview.tankPressuresEndBar, [108.4, 184.1]);
  assert.deepEqual(preview.tanks, [
    {
      index: 0,
      gasMixIndex: null,
      volumeL: 12,
      workPressureBar: 232,
      startPressureBar: 113.2,
      endPressureBar: 108.4,
      usage: "sidemount",
    },
    {
      index: 1,
      gasMixIndex: 0,
      volumeL: 11.1,
      workPressureBar: 207,
      startPressureBar: 201.4,
      endPressureBar: 184.1,
      usage: "sidemount",
    },
  ]);
  assert.equal(preview.samples.length, 2);
  assert.equal(preview.samples[0]?.temperatureC, 28.5);
  assert.deepEqual(preview.samples[0]?.pressuresBar, [113.2, 201.4]);
  assert.ok(preview.omissions.some((item) => /Cloud DiveId/i.test(item)));
  assert.equal(diveModel.gasMixLabel(21, 0), "Air");
});

test("BLE normalizer records parse failure without inventing dive fields", () => {
  const preview = normalizer.normalizeBleDivePreview(
    {
      vendor: "Shearwater",
      product: "Peregrine",
      serial: -1645449446,
      firmware: 89,
      model: 9,
    },
    {
      size: 100,
      fingerprintHex: "deadbeef",
      parsed: {
        parseStatus: -7,
        parseMessage: "Timeout",
        datetime: "",
        diveTimeSeconds: 0,
        diveMode: "",
        sampleCount: 0,
        gasmixes: [],
        tanks: [],
        profile: [],
      },
    },
  );

  assert.equal(preview.parseOk, false);
  assert.equal(preview.sourceId, "DEADBEEF");
  assert.equal(preview.diveDate, null);
  assert.equal(preview.serialNumber, "9DEC6F1A");
  assert.ok(preview.omissions.some((item) => /parser status -7/.test(item)));
});
