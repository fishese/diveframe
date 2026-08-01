import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import path from "node:path";

async function loadTsModule(modulePath) {
  const source = await readFile(modulePath, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

const extractorPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "shearwater-raw-gnss.ts",
);
const { readShearwaterRawGnss, SHEARWATER_GNSS_MIN_LOG_VERSION } =
  await loadTsModule(extractorPath);

const RECORD = 32;
const OPENING_4 = 0x14;
const OPENING_9 = 0x19;
const CLOSING_9 = 0x29;

function buildPayload({
  logVersion = SHEARWATER_GNSS_MIN_LOG_VERSION,
  entry = null,
  exit = null,
  legacyHeader = false,
} = {}) {
  const records = [];

  const opening0 = new Uint8Array(RECORD);
  opening0[0] = 0x10;
  if (legacyHeader) {
    opening0[0] = 0xff;
    opening0[1] = 0xff;
  }
  records.push(opening0);

  const opening4 = new Uint8Array(RECORD);
  opening4[0] = OPENING_4;
  opening4[16] = logVersion;
  records.push(opening4);

  if (entry) records.push(gnssRecord(OPENING_9, entry));

  const sample = new Uint8Array(RECORD);
  sample[0] = 0x01;
  records.push(sample);

  if (exit) records.push(gnssRecord(CLOSING_9, exit));

  const out = new Uint8Array(records.length * RECORD);
  records.forEach((record, index) => out.set(record, index * RECORD));
  return out;
}

function gnssRecord(type, { status, latitude, longitude }) {
  const record = new Uint8Array(RECORD);
  record[0] = type;
  record[16] = status;
  const view = new DataView(record.buffer);
  view.setInt32(21, Math.round(latitude * 100000), false);
  view.setInt32(25, Math.round(longitude * 100000), false);
  return record;
}

test("reads a 3D entry fix and leaves a no-fix exit null", () => {
  const payload = buildPayload({
    entry: { status: 3, latitude: 22.36267, longitude: 114.29074 },
    exit: { status: 1, latitude: 22.36318, longitude: 114.2917 },
  });

  const result = readShearwaterRawGnss(payload);

  assert.equal(result.logVersion, 17);
  assert.deepEqual(result.entry, { latitude: 22.36267, longitude: 114.29074 });
  assert.equal(result.exit, null);
});

test("reads negative (southern / western) coordinates", () => {
  const payload = buildPayload({
    entry: { status: 2, latitude: -16.5, longitude: -151.75 },
  });

  assert.deepEqual(readShearwaterRawGnss(payload).entry, {
    latitude: -16.5,
    longitude: -151.75,
  });
});

test("ignores fixes below the GNSS log version", () => {
  const payload = buildPayload({
    logVersion: 14,
    entry: { status: 3, latitude: 22.36267, longitude: 114.29074 },
  });

  const result = readShearwaterRawGnss(payload);

  assert.equal(result.logVersion, 14);
  assert.equal(result.entry, null);
});

test("ignores the legacy Predator block format", () => {
  const payload = buildPayload({
    legacyHeader: true,
    entry: { status: 3, latitude: 22.36267, longitude: 114.29074 },
  });

  assert.deepEqual(readShearwaterRawGnss(payload), {
    logVersion: null,
    entry: null,
    exit: null,
  });
});

test("rejects out-of-range and null-island coordinates", () => {
  const nullIsland = buildPayload({
    entry: { status: 3, latitude: 0, longitude: 0 },
  });
  assert.equal(readShearwaterRawGnss(nullIsland).entry, null);

  const outOfRange = buildPayload({
    entry: { status: 3, latitude: 120, longitude: 200 },
  });
  assert.equal(readShearwaterRawGnss(outOfRange).entry, null);
});

test("returns empty for truncated payloads", () => {
  assert.deepEqual(readShearwaterRawGnss(new Uint8Array(8)), {
    logVersion: null,
    entry: null,
    exit: null,
  });
});
