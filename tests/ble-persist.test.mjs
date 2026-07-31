import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function dataUrlFor(path, imports = {}) {
  const source = await readFile(path, "utf8");
  let javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  for (const [specifier, url] of Object.entries(imports)) {
    javascript = javascript.replaceAll(
      new RegExp(`from\\s+["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "g"),
      `from "${url}"`,
    );
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
}

const diveModelUrl = await dataUrlFor("lib/dive-model.ts");
const normalizerUrl = await dataUrlFor("lib/ble-dive-normalizer.ts", {
  "./dive-model": diveModelUrl,
});
const persistUrl = await dataUrlFor("lib/ble-persist.ts", {
  "./ble-dive-normalizer": normalizerUrl,
});
const normalizer = await import(normalizerUrl);
const persist = await import(persistUrl);
const manifest = await import(
  await dataUrlFor("lib/store-manifest.ts")
);

test("store manifest covers v8 BLE and trip stores for erase/backup", () => {
  assert.ok(manifest.ALL_STORE_NAMES.includes("rawDiveRecords"));
  assert.ok(manifest.ALL_STORE_NAMES.includes("deviceCheckpoints"));
  assert.ok(manifest.ALL_STORE_NAMES.includes("trips"));
  const diveOnly = manifest.storeNamesForErase("dive-data-only");
  assert.ok(diveOnly.includes("dives"));
  assert.ok(diveOnly.includes("rawDiveRecords"));
  assert.ok(diveOnly.includes("deviceCheckpoints"));
  assert.ok(diveOnly.includes("trips"));
  assert.ok(!diveOnly.includes("attachments"));
  assert.ok(!diveOnly.includes("composerSettings"));
  const all = manifest.storeNamesForErase("all-data");
  assert.equal(all.length, manifest.ALL_STORE_NAMES.length);
});

test("BLE persist helpers build shearwater-ble import + raw record ids", () => {
  const preview = normalizer.normalizeBleDivePreview(
    {
      vendor: "Shearwater",
      product: "Perdix 2",
      serial: -1461490243,
      serialHex: "A8E705BD",
      firmware: 89,
      model: 16,
    },
    {
      size: 12,
      fingerprintHex: "6a3fda66",
      parsed: {
        parseStatus: 0,
        parseMessage: "Success",
        datetime: "2026-06-27T14:12:54",
        diveTimeSeconds: 518,
        maxDepthM: 4.2,
        avgDepthM: 2.1,
        temperatureMinC: 28,
        temperatureMaxC: 29,
        diveMode: "OC",
        sampleCount: 2,
        gasmixes: [{ o2Percent: 21, hePercent: 0 }],
        tanks: [{ beginBar: 113.2, endBar: 108.4, gasmixIndex: 0 }],
        profile: [
          { timeMs: 0, depthM: 0 },
          { timeMs: 518000, depthM: 0 },
        ],
      },
    },
  );
  const dive = persist.previewToImportedDive(preview);
  assert.equal(dive.source, "shearwater-ble");
  assert.equal(dive.sourceId, "6A3FDA66");
  assert.equal(dive.id, "dive:v1:shearwater-ble:6A3FDA66");
  assert.equal(
    persist.rawDiveRecordId("6a3fda66"),
    "raw:shearwater-ble:6A3FDA66",
  );
  assert.equal(
    persist.deviceCheckpointId("Perdix 2", "a8e705bd"),
    "Perdix 2\u0000A8E705BD",
  );
});

test("prepareBlePersistFromFixture maps fixture pairs when present", async () => {
  const preview = normalizer.normalizeBleDivePreview(
    {
      vendor: "Shearwater",
      product: "Perdix 2",
      serial: -1461490243,
      serialHex: "A8E705BD",
      firmware: 89,
      model: 16,
    },
    {
      size: 8,
      fingerprintHex: "6A3FDA66",
      parsed: {
        parseStatus: 0,
        parseMessage: "Success",
        datetime: "2026-06-27T14:12:54",
        diveTimeSeconds: 100,
        maxDepthM: 10,
        diveMode: "OC",
        sampleCount: 0,
        gasmixes: [],
        tanks: [],
        profile: [],
      },
    },
  );
  const fixture = {
    capturedAt: "2026-07-31T12:00:00.000Z",
    apiVersion: "0.1",
    libdivecomputerCommit: "abc123",
    download: {
      vendor: "Shearwater",
      product: "Perdix 2",
      serial: -1461490243,
      serialHex: "A8E705BD",
      firmware: 89,
      model: 16,
      diveCount: 1,
      newestFingerprintHex: "6A3FDA66",
      dives: [
        {
          fingerprintHex: "6A3FDA66",
          size: 8,
          dataBase64: "AQIDBAUGBwg=",
          parsed: preview.diveDate
            ? {
                parseStatus: 0,
                parseMessage: "Success",
                datetime: "2026-06-27T14:12:54",
                diveTimeSeconds: 100,
                maxDepthM: 10,
                diveMode: "OC",
                sampleCount: 0,
                gasmixes: [],
                tanks: [],
                profile: [],
              }
            : undefined,
        },
      ],
    },
    normalizedPreview: [preview],
  };

  const payload = await persist.prepareBlePersistFromFixture(fixture);
  assert.equal(payload.dives.length, 1);
  assert.equal(payload.rawRecords.length, 1);
  assert.equal(payload.rawRecords[0].length, 8);
  assert.equal(payload.rawRecords[0].checksum.length, 64);
  assert.ok(payload.checkpoint);
  assert.equal(payload.checkpoint.fingerprintHex, "6A3FDA66");
});
