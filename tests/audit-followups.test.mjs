import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule(path) {
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

const backupSize = await loadModule("lib/backup-size-estimate.ts");
const osm = await loadModule("lib/osm-upstream.ts");
const crossTab = await loadModule("lib/cross-tab-sync.ts");

test("backup size estimate expands binary bytes without encoding them", () => {
  assert.equal(backupSize.base64EncodedLength(3), 4);
  assert.equal(backupSize.base64EncodedLength(0), 0);
  assert.deepEqual(
    backupSize.buildBackupSizeEstimate({
      metadataJsonBytes: 100,
      mediaBytes: 300,
      rawBytes: 0,
      fingerprintBytes: 0,
      divePhotos: 2,
      backgrounds: 1,
      rawDiveRecords: 0,
    }),
    {
      mediaBytes: 300,
      rawBytes: 0,
      estimatedBackupBytes: 100 + Math.ceil((300 * 4) / 3),
      divePhotos: 2,
      backgrounds: 1,
      rawDiveRecords: 0,
    },
  );
});

test("omitBinaryFields drops only the listed keys", () => {
  assert.deepEqual(
    backupSize.omitBinaryFields(
      { id: "a", size: 12, blob: "secret", keep: true },
      ["blob"],
    ),
    { id: "a", size: 12, keep: true },
  );
});

test("osm cache stores hits and explicit misses without logging coordinates", () => {
  osm.clearOsmUpstreamForTests();
  const key = osm.osmCacheKey({ provider: "nominatim", op: "reverse", lat: "22.300", lng: "114.200" });
  assert.equal(osm.readOsmCacheEntry(key).hit, false);
  osm.writeOsmCache(key, { location: { label: "Hong Kong", city: "Hong Kong", country: "China" } });
  assert.deepEqual(osm.readOsmCacheEntry(key), {
    hit: true,
    value: { location: { label: "Hong Kong", city: "Hong Kong", country: "China" } },
  });
  osm.writeOsmCache(key, null);
  assert.deepEqual(osm.readOsmCacheEntry(key), { hit: true, value: null });

  const lines = [];
  osm.logOsmUpstreamError(
    {
      provider: "nominatim",
      operation: "reverse",
      status: 502,
      reason: "http",
    },
    (line) => lines.push(line),
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /"event":"osm_upstream_error"/);
  assert.doesNotMatch(lines[0], /22\.3|114\.2|lat|lng|coordinate/i);
});

test("upstream rate limit spaces calls by the configured interval", async () => {
  osm.clearOsmUpstreamForTests();
  let clock = 0;
  const now = () => clock;
  const started = [];
  const first = osm.withUpstreamRateLimit(
    "nominatim-test",
    100,
    async () => {
      started.push(clock);
      return "a";
    },
    now,
  );
  const second = osm.withUpstreamRateLimit(
    "nominatim-test",
    100,
    async () => {
      started.push(clock);
      return "b";
    },
    now,
  );
  // Advance the fake clock while the second call waits.
  const tick = setInterval(() => {
    clock += 50;
  }, 5);
  assert.deepEqual(await Promise.all([first, second]), ["a", "b"]);
  clearInterval(tick);
  assert.equal(started[0], 0);
  assert.ok(started[1] >= 100);
});

test("local data revision bumps and conflict detection work", () => {
  crossTab.resetCrossTabSyncForTests();
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  assert.equal(crossTab.readLocalDataRevision(), 0);
  const first = crossTab.bumpLocalDataRevision();
  assert.equal(first, 1);
  crossTab.assertLocalDataRevision(1);
  crossTab.bumpLocalDataRevision();
  assert.throws(
    () => crossTab.assertLocalDataRevision(1),
    (error) => error?.name === "LocalDataConflictError",
  );
});
