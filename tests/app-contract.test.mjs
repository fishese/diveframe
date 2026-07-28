import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DiveFrame import, map, photo, and composer workflow", async () => {
  const [app, settings, composer, chart, composerSettings, backup, fonts, i18n, shearwater, subsurface, uddf, fit, matching, storage, hosting, manifest, catalog] = await Promise.all([
    readFile("app/DiveFrameApp.tsx", "utf8"),
    readFile("app/settings/SettingsApp.tsx", "utf8"),
    readFile("app/compose/ComposerApp.tsx", "utf8"),
    readFile("lib/chart-renderer.ts", "utf8"),
    readFile("lib/composer-settings.ts", "utf8"),
    readFile("lib/app-backup.ts", "utf8"),
    readFile("lib/composer-fonts.ts", "utf8"),
    readFile("lib/i18n.ts", "utf8"),
    readFile("lib/parsers/shearwater.ts", "utf8"),
    readFile("lib/parsers/subsurface.ts", "utf8"),
    readFile("lib/parsers/uddf.ts", "utf8"),
    readFile("lib/parsers/fit.ts", "utf8"),
    readFile("lib/dive-matching.ts", "utf8"),
    readFile("lib/indexed-db.ts", "utf8"),
    readFile(".openai/hosting.json", "utf8"),
    readFile("public/manifest.webmanifest", "utf8"),
    readFile("data/dive-sites.json", "utf8"),
  ]);

  assert.match(shearwater, /GnssEntryLocation/);
  assert.match(shearwater, /StoredDiveComputer/);
  assert.match(shearwater, /DeviceName/);
  assert.match(shearwater, /serialLookupKeys/);
  assert.match(app, /readShearwaterDatabase/);
  assert.match(app, /readSubsurfaceLog/);
  assert.match(app, /readUddfLog/);
  assert.match(app, /readFitDive/);
  assert.match(app, /\.uddf/);
  assert.match(app, /\.fit/);
  assert.match(uddf, /source: "uddf"/);
  assert.match(uddf, /kelvinToCelsius/);
  assert.match(fit, /source: "fit"/);
  assert.match(fit, /fitDepth/);
  assert.match(subsurface, /querySelectorAll\("sample"\)/);
  assert.match(app, /\.ssrf/);
  assert.match(subsurface, /sourceId/);
  assert.match(storage, /sourceMappings/);
  assert.match(matching, /normalizeSerial/);
  assert.match(matching, /secondsApart > 300/);
  assert.match(matching, /sameOrAdjacentCalendarDay/);
  assert.match(storage, /preferRicherSamples/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /attachmentStore\.createIndex\("diveId"/);
  assert.match(storage, /blob: file\.slice/);
  assert.match(storage, /BACKGROUNDS_STORE/);
  assert.match(storage, /BRANDING_ASSETS_STORE/);
  assert.match(storage, /saveLocalOverlayLogo/);
  assert.match(storage, /exportLocalBackupSnapshot/);
  assert.match(storage, /importLocalBackupSnapshot/);
  assert.match(backup, /diveframe-local-backup/);
  assert.match(backup, /blobBase64/);
  assert.match(app, /createShareCard/);
  assert.match(app, /t\("addPhotos"\)/);
  assert.match(app, /t\("createShareImage"\)/);
  assert.match(app, /\/compose\?dive=/);
  assert.match(app, /openstreetmap\.org/);
  assert.match(app, /api\/geocode/);
  assert.match(app, /api\/nearby-sites/);
  assert.match(app, /t\("siteNamed"\)/);
  assert.match(app, /t\("gpsData"\)/);
  assert.match(app, /t\("setInApp"\)/);
  assert.match(app, /sitePickerOpen/);
  assert.match(app, /saveSiteAndCollapse/);
  assert.match(app, /sourceDiveNumber/);
  assert.match(app, /dive\.computerModel \|\| t\("unknown"\)/);
  assert.match(settings, /diveframe-added-sites\.json/);
  assert.match(settings, /t\("downloadMergedCatalog"\)/);
  assert.match(settings, /mergeContributions/);
  assert.match(settings, /t\("reusableBackgrounds"\)/);
  assert.match(composer, /TEMPLATES/);
  assert.match(composer, /exportComposition/);
  assert.match(composer, /depth-pressure-temperature/);
  assert.match(composer, /zh-Hant/);
  assert.match(composer, /OVERLAY_FONTS/);
  assert.match(composer, /getLocalOverlayLogo/);
  assert.match(composer, /showLogo/);
  assert.match(composer, /repairLegacyTemplatePositions/);
  assert.match(chart, /drawAxisLabels/);
  assert.match(chart, /depthFillMode === "fade"/);
  assert.match(composerSettings, /showAxisLabels: true/);
  assert.match(composerSettings, /depthFillMode: "fade"/);
  assert.match(settings, /useAppI18n/);
  assert.match(settings, /setLanguage/);
  assert.match(settings, /getLocalAppPreferences/);
  assert.match(settings, /aliasesText/);
  assert.match(fonts, /Noto Sans HK/);
  assert.match(fonts, /Noto Serif TC/);
  assert.match(fonts, /LXGW WenKai TC/);
  assert.match(i18n, /Manage reusable backgrounds/);
  assert.match(settings, /distanceKm/);
  assert.match(app, /useAppI18n/);
  assert.match(app, /catalogNotesForDive/);
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
  assert.equal(pwa.name, "DiveFrame — Dive log companion");
  assert.equal(pwa.display, "standalone");

});
