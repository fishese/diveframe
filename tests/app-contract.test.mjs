import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DiveFrame import, map, photo, and composer workflow", async () => {
  const [app, settings, composer, shearwater, subsurface, matching, storage, hosting, manifest, catalog] = await Promise.all([
    readFile("app/DiveFrameApp.tsx", "utf8"),
    readFile("app/settings/SettingsApp.tsx", "utf8"),
    readFile("app/compose/ComposerApp.tsx", "utf8"),
    readFile("lib/parsers/shearwater.ts", "utf8"),
    readFile("lib/parsers/subsurface.ts", "utf8"),
    readFile("lib/dive-matching.ts", "utf8"),
    readFile("lib/indexed-db.ts", "utf8"),
    readFile(".openai/hosting.json", "utf8"),
    readFile("public/manifest.webmanifest", "utf8"),
    readFile("data/dive-sites.json", "utf8"),
  ]);

  assert.match(shearwater, /GnssEntryLocation/);
  assert.match(app, /readShearwaterDatabase/);
  assert.match(app, /readSubsurfaceLog/);
  assert.match(subsurface, /querySelectorAll\("sample"\)/);
  assert.match(app, /\.ssrf/);
  assert.match(subsurface, /sourceId/);
  assert.match(storage, /sourceMappings/);
  assert.match(matching, /normalizeSerial/);
  assert.match(matching, /secondsApart > 300/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /attachmentStore\.createIndex\("diveId"/);
  assert.match(storage, /blob: file\.slice/);
  assert.match(storage, /BACKGROUNDS_STORE/);
  assert.match(app, /createShareCard/);
  assert.match(app, /Add photos/);
  assert.match(app, /openstreetmap\.org/);
  assert.match(app, /api\/geocode/);
  assert.match(app, /api\/nearby-sites/);
  assert.match(app, /Site Named/);
  assert.match(app, /GPS Data/);
  assert.match(app, /Set in App/);
  assert.match(app, /sitePickerOpen/);
  assert.match(app, /saveSiteAndCollapse/);
  assert.match(app, /sourceDiveNumber/);
  assert.match(settings, /diveframe-added-sites\.json/);
  assert.match(settings, /Download merged dive-sites\.json/);
  assert.match(settings, /mergeContributions/);
  assert.match(settings, /Reusable diving backgrounds/);
  assert.match(composer, /TEMPLATES/);
  assert.match(composer, /exportComposition/);
  assert.match(composer, /depth-pressure-temperature/);
  assert.match(composer, /zh-Hant/);
  assert.match(composer, /Manage reusable backgrounds/);
  assert.match(settings, /distanceKm/);
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
  assert.match(nearbyRoute, /LOCAL_DIVE_SITES/);
  assert.match(nearbyRoute, /dive-sites\.json/);
  assert.match(nearbyRoute, /source: "openstreetmap"/);

  const sites = JSON.parse(catalog);
  assert.equal(sites.schemaVersion, 1);
  assert.ok(sites.sites.length > 300);
  assert.ok(sites.sites.every((site) => site.coordinates));

  const bindings = JSON.parse(hosting);
  assert.equal(bindings.d1, null);
  assert.equal(bindings.r2, null);

  const pwa = JSON.parse(manifest);
  assert.equal(pwa.name, "DiveFrame — Shearwater companion");
  assert.equal(pwa.display, "standalone");

});
