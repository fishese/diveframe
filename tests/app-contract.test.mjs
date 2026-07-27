import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DiveFrame import, map, photo, and share-card workflow", async () => {
  const [app, storage, hosting, manifest, migration, sourceMigration] = await Promise.all([
    readFile("app/DiveFrameApp.tsx", "utf8"),
    readFile("lib/storage.ts", "utf8"),
    readFile(".openai/hosting.json", "utf8"),
    readFile("public/manifest.webmanifest", "utf8"),
    readFile("drizzle/0000_keen_hex.sql", "utf8"),
    readFile("drizzle/0004_sudden_ego.sql", "utf8"),
  ]);

  assert.match(app, /GnssEntryLocation/);
  assert.match(app, /readShearwaterDatabase/);
  assert.match(app, /readSubsurfaceLog/);
  assert.match(app, /\.ssrf/);
  assert.match(app, /sourceId/);
  assert.match(storage, /sourceMappings/);
  assert.match(storage, /normalizeSerial/);
  assert.match(storage, /secondsApart > 300/);
  assert.match(storage, /env\.DB\.batch/);
  assert.match(app, /createShareCard/);
  assert.match(app, /Add photos/);
  assert.match(app, /openstreetmap\.org/);
  assert.match(app, /api\/geocode/);
  assert.match(app, /api\/nearby-sites/);
  assert.match(app, /Named location/);
  assert.match(app, /GPS recorded/);
  assert.match(app, /Save site/);
  assert.match(app, /DiveFrame catalog/);
  assert.match(app, /Newest first/);
  assert.match(app, /Oldest first/);
  assert.match(app, /compareDivesByDate/);
  assert.match(app, /const files = Array\.from\(event\.target\.files/);

  const nearbyRoute = await readFile(
    new URL("../app/api/nearby-sites/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(nearbyRoute, /listCatalogSitesNear/);
  assert.match(nearbyRoute, /source: "openstreetmap"/);

  const bindings = JSON.parse(hosting);
  assert.equal(bindings.d1, "DB");
  assert.equal(bindings.r2, "PHOTOS");

  const pwa = JSON.parse(manifest);
  assert.equal(pwa.name, "DiveFrame — Shearwater companion");
  assert.equal(pwa.display, "standalone");

  assert.match(migration, /CREATE TABLE `dives`/);
  assert.match(migration, /CREATE TABLE `attachments`/);
  assert.match(sourceMigration, /CREATE TABLE `dive_sources`/);
  assert.match(sourceMigration, /PRIMARY KEY\(`source`, `source_record_id`\)/);
});
