import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DiveFrame import, map, photo, and share-card workflow", async () => {
  const [app, hosting, manifest, migration] = await Promise.all([
    readFile("app/DiveFrameApp.tsx", "utf8"),
    readFile(".openai/hosting.json", "utf8"),
    readFile("public/manifest.webmanifest", "utf8"),
    readFile("drizzle/0000_keen_hex.sql", "utf8"),
  ]);

  assert.match(app, /GnssEntryLocation/);
  assert.match(app, /readShearwaterDatabase/);
  assert.match(app, /createShareCard/);
  assert.match(app, /Add photos/);
  assert.match(app, /openstreetmap\.org/);

  const bindings = JSON.parse(hosting);
  assert.equal(bindings.d1, "DB");
  assert.equal(bindings.r2, "PHOTOS");

  const pwa = JSON.parse(manifest);
  assert.equal(pwa.name, "DiveFrame — Shearwater companion");
  assert.equal(pwa.display, "standalone");

  assert.match(migration, /CREATE TABLE `dives`/);
  assert.match(migration, /CREATE TABLE `attachments`/);
});
