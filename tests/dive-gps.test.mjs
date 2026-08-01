import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  buildJpegWithGps,
  buildJpegWithoutGps,
  buildNonJpegBuffer,
} from "./fixtures/jpeg-exif-gps.mjs";

async function loadTsModule(path) {
  const source = await readFile(path, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

const { resolveDiveMapCoordinates } = await loadTsModule("lib/dive-gps.ts");
const { readJpegExifGps } = await loadTsModule("lib/photo-exif-gps.ts");

function diveGps(overrides = {}) {
  return {
    gpsEntryLat: null,
    gpsEntryLng: null,
    userGpsLat: null,
    userGpsLng: null,
    ...overrides,
  };
}

test("prefers computer GPS over user GPS", () => {
  const coords = resolveDiveMapCoordinates(
    diveGps({
      gpsEntryLat: 22.1,
      gpsEntryLng: 114.1,
      userGpsLat: 1,
      userGpsLng: 2,
    }),
  );
  assert.deepEqual(coords, { latitude: 22.1, longitude: 114.1, source: "computer" });
});

test("falls back to user GPS", () => {
  const coords = resolveDiveMapCoordinates(
    diveGps({
      gpsEntryLat: null,
      gpsEntryLng: null,
      userGpsLat: 3,
      userGpsLng: 4,
    }),
  );
  assert.deepEqual(coords, { latitude: 3, longitude: 4, source: "user" });
});

test("returns null when neither computer nor user GPS is present", () => {
  const coords = resolveDiveMapCoordinates(diveGps());
  assert.equal(coords, null);
});

test("ignores a partial computer GPS pair and falls back to user GPS", () => {
  const coords = resolveDiveMapCoordinates(
    diveGps({ gpsEntryLat: 22.1, gpsEntryLng: null, userGpsLat: 3, userGpsLng: 4 }),
  );
  assert.deepEqual(coords, { latitude: 3, longitude: 4, source: "user" });
});

test("readJpegExifGps reads latitude/longitude from a JPEG EXIF GPS IFD", async () => {
  const buffer = buildJpegWithGps({ latitude: 22.305, longitude: 114.1875 });
  const gps = await readJpegExifGps(buffer);
  assert.ok(gps);
  assert.ok(Math.abs(gps.latitude - 22.305) < 1e-4);
  assert.ok(Math.abs(gps.longitude - 114.1875) < 1e-4);
});

test("readJpegExifGps handles southern/western hemispheres", async () => {
  const buffer = buildJpegWithGps({ latitude: -33.85, longitude: -18.42 });
  const gps = await readJpegExifGps(buffer);
  assert.ok(gps);
  assert.ok(Math.abs(gps.latitude - -33.85) < 1e-4);
  assert.ok(Math.abs(gps.longitude - -18.42) < 1e-4);
});

test("readJpegExifGps returns null for a JPEG with EXIF but no GPS IFD", async () => {
  const buffer = buildJpegWithoutGps();
  const gps = await readJpegExifGps(buffer);
  assert.equal(gps, null);
});

test("readJpegExifGps returns null for a non-JPEG buffer", async () => {
  const buffer = buildNonJpegBuffer();
  const gps = await readJpegExifGps(buffer);
  assert.equal(gps, null);
});
