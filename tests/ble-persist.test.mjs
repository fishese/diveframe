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
const readerUrl = await dataUrlFor("lib/shearwater-raw-dive-number.ts");
const normalizerUrl = await dataUrlFor("lib/ble-dive-normalizer.ts", {
  "./dive-model": diveModelUrl,
  "./shearwater-raw-dive-number": readerUrl,
});
const persistUrl = await dataUrlFor("lib/ble-persist.ts", {
  "./ble-dive-normalizer": normalizerUrl,
  "./shearwater-raw-dive-number": readerUrl,
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
        temperatureSurfaceC: 30,
        atmosphericBar: 1.012,
        diveMode: "OC",
        salinity: { waterType: "salt", densityKgM3: 1025 },
        decompressionModel: {
          type: "buhlmann",
          conservatism: 0,
          gfLow: 40,
          gfHigh: 85,
        },
        sampleCount: 2,
        gasmixes: [{ o2Percent: 21, hePercent: 0 }],
        tanks: [{
          beginBar: 113.2,
          endBar: 108.4,
          gasmixIndex: 0,
          volumeL: 12,
          workPressureBar: 232,
          usage: "none",
        }],
        profile: [
          { timeMs: 0, depthM: 0, pressuresBar: [113.2] },
          { timeMs: 518000, depthM: 0, pressuresBar: [108.4] },
        ],
      },
    },
  );
  const dive = persist.previewToImportedDive(preview);
  assert.equal(dive.source, "shearwater-ble");
  assert.equal(dive.sourceId, "6A3FDA66");
  assert.equal(dive.id, "dive:v1:shearwater-ble:6A3FDA66");
  assert.equal(dive.diveMode, "oc");
  assert.equal(dive.surfaceTemperatureC, 30);
  assert.equal(dive.atmosphericPressureBar, 1.012);
  assert.equal(dive.tanks[0].volumeL, 12);
  assert.deepEqual(dive.samples[0].pressuresBar, [113.2]);
  assert.equal(
    persist.rawDiveRecordId("6a3fda66"),
    "raw:shearwater-ble:6A3FDA66",
  );
  assert.equal(
    persist.deviceCheckpointId("Perdix 2", "a8e705bd"),
    "Perdix 2\u0000A8E705BD",
  );
});

test("prepareBlePersistFromDownload maps a live-shaped download result", async () => {
  const download = {
    status: 0,
    message: "Success",
    vendor: "Shearwater",
    product: "Perdix 2",
    family: 0,
    model: 16,
    firmware: 89,
    serial: -1461490243,
    serialHex: "A8E705BD",
    cancelled: false,
    persisted: false,
    diveCount: 1,
    newestFingerprintHex: "6A3FDA66",
    logTail: "",
    dives: [
      {
        size: 8,
        fingerprintHex: "6A3FDA66",
        dataBase64: "AQIDBAUGBwg=",
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
    ],
  };
  const payload = await persist.prepareBlePersistFromDownload(download, {
    libdivecomputerVersion: "0.9-test",
  });
  assert.equal(payload.dives.length, 1);
  assert.equal(payload.rawRecords.length, 1);
  assert.equal(payload.failedParseCount, 0);
  assert.equal(payload.dives[0].source, "shearwater-ble");
  assert.equal(payload.dives[0].diveNumber, null);
  assert.ok(payload.checkpoint);
});

function pnfOpening0(diveNumber) {
  const record = new Uint8Array(32);
  record[0] = 0x10;
  record[1] = 0xff;
  record[2] = (diveNumber >> 8) & 0xff;
  record[3] = diveNumber & 0xff;
  return Buffer.from(record).toString("base64");
}

function liveDownload(diveNumber) {
  return {
    status: 0,
    message: "Success",
    vendor: "Shearwater",
    product: "Perdix 2",
    family: 0,
    model: 16,
    firmware: 89,
    serial: -1461490243,
    serialHex: "A8E705BD",
    cancelled: false,
    persisted: false,
    diveCount: 1,
    newestFingerprintHex: "6A3FDA66",
    logTail: "",
    dives: [
      {
        size: 32,
        fingerprintHex: "6A3FDA66",
        dataBase64: pnfOpening0(diveNumber),
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
    ],
  };
}

test("prepareBlePersistFromDownload copies the PNF header dive number", async () => {
  const payload = await persist.prepareBlePersistFromDownload(liveDownload(31), {
    libdivecomputerVersion: "0.9-test",
  });
  assert.equal(payload.dives[0].diveNumber, 31);
});

test("prepareBlePersistFromDownload keeps factory test dive number 0", async () => {
  const payload = await persist.prepareBlePersistFromDownload(liveDownload(0), {
    libdivecomputerVersion: "0.9-test",
  });
  assert.equal(payload.dives[0].diveNumber, 0);
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
