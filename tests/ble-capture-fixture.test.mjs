import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTs(path, imports = {}) {
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

function dataUrlFor(path) {
  return readFile(path, "utf8").then(
    (source) =>
      `data:text/javascript;base64,${Buffer.from(
        ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
      ).toString("base64")}`,
  );
}

const diveModelUrl = await dataUrlFor("lib/dive-model.ts");
const readerUrl = await dataUrlFor("lib/shearwater-raw-dive-number.ts");
const normalizerUrl = await dataUrlFor("lib/ble-dive-normalizer.ts").then(
  async () => {
    const source = await readFile("lib/ble-dive-normalizer.ts", "utf8");
    let javascript = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    javascript = javascript
      .replaceAll(/from\s+["']\.\/dive-model["']/g, `from "${diveModelUrl}"`)
      .replaceAll(
        /from\s+["']\.\/shearwater-raw-dive-number["']/g,
        `from "${readerUrl}"`,
      );
    return `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
  },
);

const fixtureMod = await loadTs("lib/ble-capture-fixture.ts", {
  "./dive-computer-capability":
    "data:text/javascript;base64," +
    Buffer.from("export {};").toString("base64"),
  "./ble-dive-normalizer": normalizerUrl,
});

const identity = await loadTs("lib/ble-cloud-identity.ts", {
  "./ble-dive-normalizer": normalizerUrl,
});

const normalizer = await import(normalizerUrl);

function sampleDownload() {
  return {
    status: 0,
    message: "Success",
    vendor: "Shearwater",
    product: "Perdix 2",
    family: 655361,
    model: 11,
    firmware: 102,
    serial: 2833712573,
    serialHex: "A8E705BD",
    cancelled: false,
    persisted: false,
    diveCount: 1,
    logTail: "",
    newestFingerprintHex: "6A3FDA66",
    dives: [
      {
        size: 12,
        fingerprintHex: "6A3FDA66",
        dataBase64: "AQIDBAUGBwgJCgsM",
        parsed: {
          parseStatus: 0,
          parseMessage: "Success",
          datetime: "2026-06-27T14:12:54",
          diveTimeSeconds: 518,
          maxDepthM: 4.2,
          diveMode: "oc",
          sampleCount: 2,
          gasmixes: [{ o2Percent: 21, hePercent: 0 }],
          tanks: [],
          profile: [
            { timeMs: 0, depthM: 1 },
            { timeMs: 10000, depthM: 4.2 },
          ],
        },
      },
    ],
  };
}

test("BLE capture fixture round-trips full raw bytes", () => {
  const built = fixtureMod.buildBleCaptureFixture({
    download: sampleDownload(),
    apiVersion: "0.5-spike",
  });
  assert.equal(built.format, "diveframe-ble-capture");
  assert.equal(built.download.dives[0].dataBase64, "AQIDBAUGBwgJCgsM");
  assert.equal(built.normalizedPreview[0].sourceId, "6A3FDA66");

  const parsed = fixtureMod.parseBleCaptureFixture(
    JSON.parse(JSON.stringify(built)),
  );
  assert.equal(parsed.download.dives[0].fingerprintHex, "6A3FDA66");
  assert.match(fixtureMod.bleCaptureFixtureFilename(built.download), /perdix-2/);
});

test("BLE↔Cloud identity matcher links serial+time+depth+duration", () => {
  const ble = normalizer.normalizeBleDivePreview(
    {
      vendor: "Shearwater",
      product: "Perdix 2",
      serial: 2833712573,
      serialHex: "A8E705BD",
      firmware: 102,
      model: 11,
    },
    {
      size: 12,
      fingerprintHex: "6A3FDA66",
      parsed: {
        parseStatus: 0,
        parseMessage: "Success",
        datetime: "2026-06-27T14:12:54",
        diveTimeSeconds: 518,
        maxDepthM: 4.2,
        diveMode: "oc",
        sampleCount: 2,
        gasmixes: [],
        tanks: [],
        profile: [],
      },
    },
  );

  const report = identity.matchBleToCloudDives(
    [ble],
    [
      {
        diveId: "cloud-1",
        diveNumber: 42,
        diveDate: "2026-06-27 14:12:54",
        serialNumber: "2833712573",
        durationSeconds: 518,
        maxDepthM: 4.2,
      },
      {
        diveId: "cloud-other",
        diveNumber: 1,
        diveDate: "2020-01-01 00:00:00",
        serialNumber: "2833712573",
        durationSeconds: 100,
        maxDepthM: 30,
      },
    ],
  );

  assert.equal(report.matches[0].confidence, "high");
  assert.equal(report.matches[0].cloudDiveId, "cloud-1");
  assert.deepEqual(report.unmatchedCloud, ["cloud-other"]);
});
