import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DiveFrame import, map, photo, and composer workflow", async () => {
  const [app, settings, about, composer, chart, imageComposer, templates, composerSettings, composerPresets, backup, fonts, i18n, gasCalculations, shearwater, subsurface, subsurfaceExport, uddf, fit, matching, storage, hosting, manifest, serviceWorker, pwaInstall, catalog, userGuide, license] = await Promise.all([
    readFile("app/DiveFrameApp.tsx", "utf8"),
    readFile("app/settings/SettingsApp.tsx", "utf8"),
    readFile("app/about/AboutApp.tsx", "utf8"),
    readFile("app/compose/ComposerApp.tsx", "utf8"),
    readFile("lib/chart-renderer.ts", "utf8"),
    readFile("lib/image-composer.ts", "utf8"),
    readFile("lib/templates.ts", "utf8"),
    readFile("lib/composer-settings.ts", "utf8"),
    readFile("lib/composer-presets.ts", "utf8"),
    readFile("lib/app-backup.ts", "utf8"),
    readFile("lib/composer-fonts.ts", "utf8"),
    readFile("lib/i18n.ts", "utf8"),
    readFile("lib/gas-calculations.ts", "utf8"),
    readFile("lib/parsers/shearwater.ts", "utf8"),
    readFile("lib/parsers/subsurface.ts", "utf8"),
    readFile("lib/subsurface-site-export.ts", "utf8"),
    readFile("lib/parsers/uddf.ts", "utf8"),
    readFile("lib/parsers/fit.ts", "utf8"),
    readFile("lib/dive-matching.ts", "utf8"),
    readFile("lib/indexed-db.ts", "utf8"),
    readFile(".openai/hosting.json", "utf8"),
    readFile("public/manifest.webmanifest", "utf8"),
    readFile("public/sw.js", "utf8"),
    readFile("app/PwaInstall.tsx", "utf8"),
    readFile("data/dive-sites.json", "utf8"),
    readFile("docs/USER-GUIDE.md", "utf8"),
    readFile("LICENSE", "utf8"),
  ]);
  const [appI18n, catalogTools, catalogPrompt] = await Promise.all([
    readFile("lib/app-i18n.ts", "utf8"),
    readFile("lib/dive-site-catalog.ts", "utf8"),
    readFile("public/examples/dive-site-catalog-ai-prompt.md", "utf8"),
  ]);

  assert.match(shearwater, /GnssEntryLocation/);
  assert.match(shearwater, /StoredDiveComputer/);
  assert.match(shearwater, /DeviceName/);
  assert.match(shearwater, /serialLookupKeys/);
  assert.match(app, /readShearwaterDatabase/);
  assert.match(app, /readSubsurfaceLog/);
  assert.match(app, /readUddfLog/);
  assert.match(app, /readFitDive/);
  assert.match(app, /href="\/about"/);
  assert.match(app, /status !== t\("importDiveLog"\)/);
  assert.match(about, /t\("aboutImportsTitle"\)/);
  assert.match(about, /t\("aboutSourceStepFilter"\)/);
  assert.match(about, /t\("aboutLicenseTitle"\)/);
  assert.match(about, /source:shearwater-only/);
  assert.match(about, /source:subsurface-only/);
  assert.match(userGuide, /\*\*Set in App\*\*/);
  assert.match(license, /GPL-3\.0-or-later/);
  assert.match(app, /\.uddf/);
  assert.match(app, /\.fit/);
  assert.match(uddf, /source: "uddf"/);
  assert.match(uddf, /kelvinToCelsius/);
  assert.match(uddf, /stablePortableSourceId/);
  assert.doesNotMatch(uddf, /index \+ 1/);
  assert.match(fit, /source: "fit"/);
  assert.match(fit, /fitDepth/);
  assert.match(fit, /stablePortableSourceId/);
  assert.doesNotMatch(fit, /file\.name/);
  assert.match(subsurface, /querySelectorAll\("sample"\)/);
  assert.match(app, /\.ssrf/);
  assert.match(subsurface, /sourceId/);
  assert.match(storage, /sourceMappings/);
  assert.match(storage, /canonicalDiveId/);
  assert.match(storage, /shouldPromoteCanonicalSource/);
  assert.match(storage, /rekeyDive/);
  assert.match(storage, /attachmentsStore\.put\(\{ \.\.\.attachment, diveId: nextId \}\)/);
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
  assert.match(storage, /clearLocalDiveData/);
  const diveOnlyReset = storage.match(
    /export async function clearLocalDiveData\(\)[\s\S]+?(?=async function updateDive)/,
  )?.[0] ?? "";
  assert.match(diveOnlyReset, /DIVES_STORE/);
  assert.match(diveOnlyReset, /SOURCES_STORE/);
  assert.doesNotMatch(diveOnlyReset, /ATTACHMENTS_STORE/);
  assert.doesNotMatch(diveOnlyReset, /COMPOSER_SETTINGS_STORE/);
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
  assert.match(app, /t\("clearFilter"\)/);
  assert.match(app, /sitePickerOpen/);
  assert.match(app, /saveSiteAndCollapse/);
  assert.match(app, /sourceDiveNumber/);
  assert.match(app, /dive\.computerModel \|\| t\("unknown"\)/);
  assert.match(app, /updateLocalDiveDetails/);
  assert.match(app, /details-editor/);
  assert.match(app, /DiveProfilePanel/);
  assert.match(app, /showPressure/);
  assert.match(app, /averageSampleTemperatureC/);
  assert.match(app, /calculateSacLitresPerMinute/);
  assert.match(settings, /diveframe-added-sites\.json/);
  assert.match(settings, /t\("downloadMergedCatalog"\)/);
  assert.match(settings, /mergeContributions/);
  assert.match(settings, /t\("reusableBackgrounds"\)/);
  assert.match(settings, /updateLocalBackgroundName/);
  assert.match(settings, /t\("backgroundName"\)/);
  assert.match(composer, /TEMPLATES/);
  assert.match(composer, /exportComposition/);
  assert.match(composer, /depth-pressure-temperature/);
  assert.match(composer, /zh-Hant/);
  assert.match(composer, /OVERLAY_FONTS/);
  assert.match(composer, /getLocalOverlayLogo/);
  assert.match(composer, /showLogo/);
  assert.match(composer, /logoOffsetX/);
  assert.match(composer, /logoOffsetY/);
  assert.match(composer, /composer-back-to-dives/);
  assert.doesNotMatch(composer, /className="composer-back"/);
  assert.match(composerSettings, /logoOffsetX: 0/);
  assert.match(composerSettings, /logoOffsetY: 0/);
  assert.match(composer, /repairLegacyTemplatePositions/);
  assert.match(composer, /cropMode/);
  assert.match(composer, /onPointerMove/);
  assert.match(composer, /drawCropGuide/);
  assert.match(composer, /resetCrop/);
  assert.match(templates, /defaultChartHeight/);
  assert.match(templates, /defaultRatio/);
  assert.match(templates, /landscape-dashboard/);
  assert.match(templates, /cinematic-split/);
  assert.doesNotMatch(templates, /id: "minimal"/);
  assert.doesNotMatch(templates, /id: "poster"/);
  assert.match(imageComposer, /template\.layout === "graph"/);
  assert.match(imageComposer, /template\.layout === "dashboard"/);
  assert.match(imageComposer, /template\.layout === "split"/);
  assert.match(imageComposer, /settings\.textColor/);
  assert.match(chart, /drawAxisLabels/);
  assert.match(chart, /strokeInset/);
  assert.match(chart, /depthFillMode === "fade"/);
  assert.match(composerSettings, /showAxisLabels: true/);
  assert.match(composerSettings, /depthFillMode: "fade"/);
  assert.match(settings, /useAppI18n/);
  assert.match(settings, /setLanguage/);
  assert.match(settings, /<option value="ja">/);
  assert.match(appI18n, /const ja: Record<keyof typeof en, string>/);
  assert.match(settings, /getLocalAppPreferences/);
  assert.match(settings, /aliasesText/);
  assert.match(fonts, /Noto Sans TC/);
  assert.match(fonts, /Inter/);
  assert.match(fonts, /Outfit/);
  assert.match(fonts, /Space Mono/);
  assert.match(fonts, /Huninn/);
  assert.match(fonts, /Device Sans/);
  assert.doesNotMatch(fonts, /Noto Sans HK/);
  assert.doesNotMatch(fonts, /Noto Serif TC/);
  assert.doesNotMatch(fonts, /LXGW WenKai TC/);
  assert.match(composerSettings, /textColor: "#ffffff"/);
  assert.match(composerSettings, /outputSize: "social"/);
  assert.match(composerSettings, /format: "jpeg"/);
  assert.match(composer, /template\.defaultRatio/);
  assert.match(composer, /composer-section-toggle/);
  assert.match(composer, /photo\.displayName \|\| photo\.fileName/);
  assert.match(composer, /loadBundledBackground/);
  assert.match(composer, /removeBundledBackgroundForSession/);
  assert.match(composer, /personalComposerPresets/);
  assert.match(composer, /<option value="ja">/);
  assert.match(composer, /lastComposerOutputSize/);
  assert.match(storage, /lastComposerFormat/);
  assert.match(composer, /saveLocalComposerPreset/);
  assert.match(composer, /applyComposerPreset/);
  assert.match(composer, /deleteLocalComposerPreset/);
  assert.match(composerPresets, /DIVE_SPECIFIC_KEYS/);
  assert.match(composerPresets, /selectedPhotoId/);
  assert.match(composerPresets, /photoOffsetX/);
  assert.match(storage, /composerPresets/);
  assert.match(storage, /DATABASE_VERSION = 7/);
  assert.match(backup, /composerPresets/);
  assert.doesNotMatch(settings, /overlayStyles/);
  assert.match(i18n, /Manage reusable backgrounds/);
  assert.match(settings, /distanceKm/);
  assert.match(settings, /defaultCylinderPresetId/);
  assert.match(gasCalculations, /DEFAULT_CYLINDER_PRESET_ID = "al80"/);
  assert.match(gasCalculations, /averageAmbientPressureBar/);
  assert.match(gasCalculations, /normalizeShearwaterPressurePair/);
  assert.match(settings, /addDiveFrameSitesToSubsurface/);
  assert.match(settings, /-diveframe-updated\.ssrf/);
  assert.match(subsurfaceExport, /XMLSerializer/);
  assert.match(subsurfaceExport, /divesiteid/);
  assert.match(subsurfaceExport, /"buddy"/);
  assert.match(subsurfaceExport, /"notes"/);
  assert.match(storage, /listLocalSourceRecords/);
  assert.match(storage, /"en" \| "zh-Hant" \| "ja"/);
  assert.match(settings, /saveSessionDiveSiteCatalog/);
  assert.match(settings, /removeSessionCatalog/);
  assert.match(settings, /dive-site-catalog-ai-prompt\.md/);
  assert.match(app, /nearbySessionCatalogSites/);
  assert.match(catalogTools, /sessionStorage/);
  assert.match(catalogTools, /nearbySessionCatalogSites/);
  assert.match(catalogPrompt, /Return only the final UTF-8 JSON object/);
  assert.match(app, /useAppI18n/);
  assert.doesNotMatch(app, /catalogNotesForDive/);
  assert.match(app, /photo-gallery-actions/);
  assert.match(app, /mobile-home-button/);
  assert.doesNotMatch(app, /mobile-back/);
  assert.match(app, /compareDivesByDate/);
  assert.match(app, /duration-desc/);
  assert.match(app, /depth-desc/);
  assert.match(app, /dive\.durationSeconds \?\? dive\.lengthText/);
  assert.match(app, /namedDives/);
  assert.match(app, /underwaterSeconds/);
  assert.match(app, /averageSac/);
  assert.match(app, /MINIMUM_AVERAGE_SAC_DURATION_SECONDS/);
  assert.match(app, /normalizeLocation/);
  assert.match(app, /sacRateForDive/);
  assert.match(app, /parseDiveSearch/);
  assert.match(app, /siteSuggestions/);
  assert.match(app, /locationDraft/);
  assert.match(storage, /details\.location/);
  assert.match(app, /const files = Array\.from\(event\.target\.files/);
  assert.match(manifest, /diveframe-maskable-512\.png/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /diveframe-shell-v3/);
  assert.match(serviceWorker, /backgrounds\/bubbles-bg\.jpg/);
  assert.match(serviceWorker, /examples\/dive-site-catalog-ai-prompt\.md/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(pwaInstall, /beforeinstallprompt/);
  assert.match(pwaInstall, /navigator\.serviceWorker\.register/);
  assert.match(settings, /PwaInstallCard/);

  const globalStyles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(globalStyles, /select option/);
  assert.match(globalStyles, /color-scheme: dark/);
  assert.match(globalStyles, /\.mobile-home-button/);
  assert.match(globalStyles, /\.composer-preview-pane[\s\S]+position: sticky/);
  assert.match(globalStyles, /\.danger-option \.button[\s\S]+width: 100%/);

  const nearbyRoute = await readFile(
    new URL("../app/api/nearby-sites/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(nearbyRoute, /LOCAL_DIVE_SITES/);
  assert.match(nearbyRoute, /dive-sites\.json/);
  assert.match(nearbyRoute, /source: "openstreetmap"/);

  const geocodeRoute = await readFile(
    new URL("../app/api/geocode/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(geocodeRoute, /locationQueries/);
  assert.match(geocodeRoute, /parts\.slice\(1\)/);

  const sites = JSON.parse(catalog);
  assert.equal(sites.schemaVersion, 1);
  assert.ok(sites.sites.length > 300);
  assert.ok(sites.sites.every((site) => site.coordinates));
  assert.ok(sites.sites.every((site) => !("notes" in site)));

  const bindings = JSON.parse(hosting);
  assert.equal(bindings.d1, null);
  assert.equal(bindings.r2, null);

  const pwa = JSON.parse(manifest);
  assert.equal(pwa.name, "DiveFrame — Dive log companion");
  assert.equal(pwa.display, "standalone");

});
