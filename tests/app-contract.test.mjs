import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DiveFrame import, map, photo, and composer workflow", async () => {
  const [app, settings, about, composer, chart, imageComposer, templates, composerSettings, composerPresets, backup, fonts, i18n, gasCalculations, shearwater, subsurface, subsurfaceExport, uddf, fit, matching, storage, storeManifest, hosting, manifest, serviceWorker, pwaInstall, catalog, userGuide, license] = await Promise.all([
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
    readFile("lib/store-manifest.ts", "utf8"),
    readFile(".openai/hosting.json", "utf8"),
    readFile("public/manifest.webmanifest", "utf8"),
    readFile("public/sw.js", "utf8"),
    readFile("app/PwaInstall.tsx", "utf8"),
    readFile("data/dive-sites.json", "utf8"),
    readFile("docs/USER-GUIDE.md", "utf8"),
    readFile("LICENSE", "utf8"),
  ]);
  const [appI18n, catalogTools, catalogPrompt, assetLicenses] = await Promise.all([
    readFile("lib/app-i18n.ts", "utf8"),
    readFile("lib/dive-site-catalog.ts", "utf8"),
    readFile("public/examples/dive-site-catalog-ai-prompt.md", "utf8"),
    readFile("ASSET-LICENSES.md", "utf8"),
  ]);
  const importGuide = await readFile("app/components/ImportGuide.tsx", "utf8");
  const androidPage = await readFile("app/android/AndroidAppPage.tsx", "utf8");
  const androidLink = await readFile("app/components/AndroidAppLink.tsx", "utf8");

  assert.match(shearwater, /GnssEntryLocation/);
  assert.match(shearwater, /StoredDiveComputer/);
  assert.match(shearwater, /DeviceName/);
  assert.match(shearwater, /serialLookupKeys/);
  assert.match(app, /readShearwaterDatabase/);
  assert.match(app, /readSubsurfaceLog/);
  assert.match(app, /readUddfLog/);
  assert.match(app, /readFitDive/);
  assert.match(app, /setImportGuideOpen/);
  assert.match(importGuide, /importGuidePreferredLabel/);
  assert.match(importGuide, /importGuideSubsurfaceName/);
  assert.match(importGuide, /importGuideCombineBullet/);
  assert.match(importGuide, /importGuideSubsurfaceLabel/);
  assert.match(importGuide, /href="\/settings#backup-transfer"/);
  assert.match(importGuide, /import Link from "next\/link"/);
  assert.match(importGuide, /importGuideBackupPrompt/);
  assert.match(settings, /id="backup-transfer"/);
  assert.match(settings, /window\.location\.hash !== "#backup-transfer"/);
  assert.match(settings, /eraseDivePhotosAction/);
  assert.match(settings, /eraseAllDataAction/);
  assert.match(appI18n, /Erase dive photos only/);
  assert.match(appI18n, /Erase all local DiveFrame data/);
  assert.match(appI18n, /Perdix 3/);
  assert.match(importGuide, /supported-dive-computers/);
  assert.match(app, /href="\/about"/);
  assert.match(app, /status !== t\("importDiveLog"\)/);
  assert.match(about, /t\("aboutImportsTitle"\)/);
  assert.match(about, /t\("aboutSourceStepFilter"\)/);
  assert.match(about, /t\("aboutLicenseTitle"\)/);
  assert.match(about, /t\("aboutCatalogTitle"\)/);
  assert.match(about, /t\("aboutAssetLicense"\)/);
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
  assert.match(fit, /fitDepthMetres/);
  assert.match(fit, /stablePortableSourceId/);
  assert.doesNotMatch(fit, /file\.name/);
  assert.match(subsurface, /querySelectorAll\("sample"\)/);
  assert.match(app, /\.ssrf/);
  assert.match(subsurface, /sourceId/);
  assert.match(storage, /sourceMappings/);
  assert.match(storage, /canonicalDiveId/);
  assert.match(storage, /shouldPromoteCanonicalSource/);
  assert.match(storage, /rekeyDive/);
  assert.match(storage, /clearLocalDivePhotos/);
  assert.match(storage, /getLocalBackupSizeEstimate/);
  assert.match(storage, /optimizeLocalStoredPhotos/);
  assert.match(storage, /bundledBackgroundHidden/);
  assert.match(storage, /mergeLocalDuplicateDives/);
  assert.match(backup, /SHA-256/);
  assert.match(backup, /encryptBackupText/);
  assert.match(settings, /unlockEncryptedBackup/);
  assert.match(backup, /previewLocalAppBackup/);
  assert.match(backup, /restorePreparedAppBackup/);
  assert.match(settings, /restoreAppData\("merge"\)/);
  assert.match(settings, /restoreAppData\("replace"\)/);
  assert.match(settings, /restoreAppData\("replace-dives"\)/);
  assert.match(storage, /BackupImportMode = "merge" \| "replace" \| "replace-dives"/);
  assert.match(storage, /storeNamesForErase\("dive-data-only"\)/);
  assert.match(storage, /attachmentsStore\.put\(\{ \.\.\.attachment, diveId: nextId \}\)/);
  assert.match(matching, /normalizeSerial/);
  assert.match(matching, /secondsApart > 300/);
  assert.match(matching, /sameOrAdjacentCalendarDay/);
  assert.match(storage, /preferRicherSamples/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /attachmentStore\.createIndex\("diveId"/);
  assert.match(storage, /blob: file\.slice/);
  assert.match(storage, /export async function deleteLocalAttachment/);
  assert.match(storage, /BACKGROUNDS_STORE/);
  assert.match(storage, /BRANDING_ASSETS_STORE/);
  assert.match(storage, /saveLocalOverlayLogo/);
  assert.match(storage, /exportLocalBackupSnapshot/);
  assert.match(storage, /getLocalStoragePersistenceStatus/);
  assert.match(settings, /resolveManualDuplicate/);
  assert.match(storage, /importLocalBackupSnapshot/);
  assert.match(storage, /clearLocalDiveData/);
  const diveOnlyReset = storage.match(
    /export async function clearLocalDiveData\(\)[\s\S]+?(?=async function updateDive)/,
  )?.[0] ?? "";
  assert.match(diveOnlyReset, /storeNamesForErase\("dive-data-only"\)/);
  assert.doesNotMatch(diveOnlyReset, /ATTACHMENTS_STORE/);
  assert.doesNotMatch(diveOnlyReset, /COMPOSER_SETTINGS_STORE/);
  assert.match(backup, /diveframe-local-backup/);
  assert.match(backup, /blobBase64/);
  assert.match(app, /deleteLocalAttachment/);
  assert.match(app, /deleteLocalDive/);
  assert.match(app, /deleteLocalDiveBySource/);
  assert.match(app, /loadSampleLog/);
  assert.match(app, /deleteDiveConfirmOpen/);
  assert.match(app, /onDeletePhoto/);
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
  assert.doesNotMatch(settings, /diveframe-added-sites\.json/);
  assert.doesNotMatch(settings, /t\("downloadMergedCatalog"\)/);
  assert.match(settings, /mergeContributions/);
  assert.match(settings, /createSubsurfaceLogbook/);
  assert.match(settings, /validateSubsurfaceLogbookExport/);
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
  assert.match(composer, /composer-home-link/);
  assert.match(composer, /composer-back-link/);
  assert.doesNotMatch(composer, /AndroidAppLink/);
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
  assert.match(appI18n, /moreFilters:/);
  assert.match(appI18n, /computerFilterLabel:/);
  assert.match(appI18n, /allComputers:/);
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
  assert.match(composer, /!appPreferences\?\.bundledBackgroundHidden/);
  assert.match(settings, /BundledBackgroundTile/);
  assert.match(composer, /loadBundledBackground/);
  assert.match(composer, /removeBundledBackground/);
  assert.match(composer, /photo-choice-grid/);
  assert.match(composer, /transparentPhotoChoice/);
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
  assert.match(storage, /DATABASE_VERSION = 10/);
  assert.match(storage, /previousVersion < 8/);
  assert.match(storage, /supplementaryCatalog/);
  assert.doesNotMatch(
    storage,
    /previousVersion > 0 && previousVersion < DATABASE_VERSION/,
  );
  assert.match(storeManifest, /supplementaryCatalog/);
  assert.match(
    storeManifest,
    /supplementaryCatalog:[\s\S]*eraseAllData: true[\s\S]*eraseDiveDataOnly: false/,
  );
  assert.match(storage, /createV8ObjectStores/);
  assert.match(storage, /createV9ObjectStores/);
  assert.match(storage, /createV10ObjectStores/);
  assert.match(storage, /deleteObjectStore/);
  assert.match(storage, /getLocalSupplementaryCatalog/);
  assert.match(storage, /saveLocalSupplementaryCatalog/);
  assert.match(storage, /clearLocalSupplementaryCatalog/);
  assert.match(storage, /persistBleImport/);
  assert.match(storage, /getLocalDeviceCheckpoint/);
  assert.match(storage, /clearLocalDeviceCheckpoint/);
  assert.match(storage, /rawDiveRecords/);
  assert.match(storage, /deviceCheckpoints/);
  assert.match(storage, /storeNamesForErase/);
  assert.match(storage, /export async function listLocalTrips/);
  assert.match(storage, /export async function createLocalTrip/);
  assert.match(storage, /export async function renameLocalTrip/);
  assert.match(storage, /export async function deleteLocalTrip/);
  assert.match(storage, /export async function setLocalDiveTripIds/);
  assert.match(storage, /export async function updateLocalDiveUserGps/);
  assert.match(app, /from "@\/lib\/dive-gps"/);
  assert.match(app, /resolveDiveMapCoordinates/);
  assert.match(app, /from "@\/lib\/photo-exif-gps"/);
  assert.match(app, /readPhotoExifGps/);
  assert.match(app, /from "@\/lib\/coordinate-input"/);
  assert.match(app, /parseCoordinatePair/);
  assert.match(app, /from "@\/lib\/photo-location-capability"/);
  assert.match(app, /photoLocationCapability\.pickPhotoLocation/);
  assert.match(app, /onSaveUserGps/);
  assert.match(app, /onAddPhotoFiles/);
  assert.match(app, /"user-gps-editor"/);
  assert.match(app, /t\("editLocation"\)/);
  assert.match(app, /t\("useLocationFromPhoto"\)/);
  assert.match(app, /file\.arrayBuffer\(\)/);
  assert.match(app, /accept="\.jpg,\.jpeg,\.heic,\.heif,image\/jpeg,image\/heic,image\/heif"/);
  assert.match(app, /photo-location-help-backdrop/);
  assert.match(app, /href="\/android"/);
  assert.match(app, /photoLocationHelpSocial/);
  assert.match(app, /addLocationPhotoToDive/);
  assert.match(app, /photoLocationPermissionDenied/);
  assert.match(app, /photoGpsBusy/);
  assert.match(app, /nearbySitesLoading/);
  assert.match(app, /nearbySessionCatalogSites/);
  assert.match(catalogTools, /NEARBY_SITE_RADIUS_KM = 6/);
  assert.match(app, /setTimeout\(\(\) => controller\.abort\(\), 10000\)/);
  assert.match(app, /source: "manual"/);
  assert.match(app, /source: "photo-exif"/);
  assert.doesNotMatch(app, /exportGpsPreference/);
  const diveGps = await readFile("lib/dive-gps.ts", "utf8");
  assert.match(diveGps, /export function resolveDiveMapCoordinates/);
  assert.match(diveGps, /validatedPair\(dive\.gpsEntryLat, dive\.gpsEntryLng\)/);
  assert.match(diveGps, /Math\.abs\(latitude\) <= 90/);
  const photoExifGps = await readFile("lib/photo-exif-gps.ts", "utf8");
  assert.match(photoExifGps, /export async function readJpegExifGps/);
  assert.match(photoExifGps, /export async function readPhotoExifGps/);
  assert.match(photoExifGps, /JPEG or HEIC\/HEIF/);
  assert.match(photoExifGps, /0x8825/);
  assert.match(app, /selectMode/);
  assert.match(app, /toggleSelectMode/);
  assert.match(app, /collapsedTripIds/);
  assert.match(app, /"dive-row-trip-member"/);
  assert.match(app, /className="trip-header"/);
  assert.match(app, /className="trip-block"/);
  assert.match(app, /className="select-action-bar"/);
  assert.match(app, /setLocalDiveTripIds\(ids, trip\.id\)/);
  assert.match(app, /setLocalDiveTripIds\(ids, null\)/);
  assert.match(app, /deleteLocalTrip\(tripId, \{ clearAssignments: assignedCount > 0 \}\)/);
  assert.match(app, /expandedAliasSiteId/);
  assert.match(app, /toggleSiteAliasExpand/);
  assert.match(app, /className="site-alias-expand"/);
  assert.match(app, /className="site-alias-chip"/);
  assert.match(app, /t\("showSiteAliases"\)/);
  assert.match(appI18n, /showSiteAliases/);
  assert.match(appI18n, /chooseSiteAlias/);
  assert.match(app, /t\("trip"\)/);
  assert.match(app, /t\("noTrip"\)/);
  assert.match(app, /t\("newTripOption"\)/);
  assert.match(appI18n, /newTripOption/);
  assert.match(appI18n, /deleteTripConfirmWithDives/);
  assert.match(app, /resetTripEditorDrafts/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{\s*setTripDraft/);
  assert.match(app, /visibleDiveIds/);
  assert.match(app, /function visibleSelectedDiveIds/);
  assert.match(app, /const ids = visibleSelectedDiveIds\(\);/);
  assert.match(app, /const visibleSelectedCount = visibleSelectedDiveIds\(\)\.length;/);
  assert.doesNotMatch(app, /\}, \[visibleDiveIds\]\);/);
  assert.match(app, /onClick=\{\(\) => void onDeleteTrip\(dive\.tripId as string\)\}/);
  assert.doesNotMatch(app, /onClick=\{\(\) => void onDeleteTrip\(tripDraft\)\}/);
  assert.match(app, /const tripName = trips\.find\(\(trip\) => trip\.id === tripId\)\?\.name/);
  assert.match(appI18n, /deleteTripConfirm: "Delete trip \\"\{name\}\\"/);
  assert.match(appI18n, /deleteTripConfirmWithDives: "Delete trip \\"\{name\}\\"/);
  assert.match(app, /const hasResolvedGps = mapCoordinates !== null;/);
  assert.match(app, /\{hasResolvedGps && !dive\.site && \(/);
  const diveListModel = await readFile("lib/dive-list-model.ts", "utf8");
  assert.match(diveListModel, /userGpsLat/);
  assert.match(diveListModel, /function diveHasGps/);
  assert.match(diveListModel, /if \(gpsOnly && !diveHasGps\(dive\)\) \{/);
  assert.doesNotMatch(app, /<input type="checkbox" checked=\{isChecked\}/);
  assert.match(userGuide, /On the dive's map card, tap \*\*Edit location\*\*/);
  assert.doesNotMatch(userGuide, /Save user GPS/);
  assert.doesNotMatch(userGuide, /Clear user GPS/);
  assert.match(await readFile("lib/ble-import-session.ts", "utf8"), /nativeLimitForQuantity/);
  assert.match(await readFile("lib/ble-import-session.ts", "utf8"), /kind: "full"/);
  assert.match(app, /BleImportPanel/);
  assert.match(app, /downloadFromComputer/);
  assert.match(appI18n, /downloadFromComputer/);
  assert.match(app, /AndroidAppLink/);
  assert.match(androidLink, /href="\/android"/);
  assert.match(androidLink, /diveComputerCapability.isAvailable/);
  assert.match(androidPage, /releases\/latest/);
  assert.match(androidPage, /androidAppPermissionsTitle/);
  assert.match(androidPage, /androidAppIosTitle/);
  assert.match(androidPage, /androidAppPcTitle/);
  assert.match(appI18n, /bleImportFullWarning/);
  assert.match(appI18n, /bleImportCancelConfirm/);
  assert.match(appI18n, /bleImportCancelledSaved/);
  assert.match(appI18n, /bleImportNewDivesLabel/);
  assert.match(appI18n, /bleImportSummaryFindHint/);
  assert.match(
    await readFile(new URL("../lib/ble-import-session.ts", import.meta.url), "utf8"),
    /formatBleDiveStamp/,
  );
  assert.match(
    await readFile(new URL("../lib/ble-import-session.ts", import.meta.url), "utf8"),
    /prepareBlePersistFromCapturedDive/,
  );
  assert.match(
    await readFile(new URL("../lib/ble-import-session.ts", import.meta.url), "utf8"),
    /summarizeNewDiveDates/,
  );
  const bleImportPanel = await readFile(
    new URL("../app/components/BleImportPanel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(bleImportPanel, /async function requestClose/);
  assert.match(bleImportPanel, /async function stopDownload/);
  assert.match(
    bleImportPanel,
    /window\.confirm\(t\("bleImportCancelConfirm"\)\)/,
  );
  assert.match(
    bleImportPanel,
    /phase === "downloading"[\s\S]*await cancelDownload\(\);\s*return;/,
  );
  assert.doesNotMatch(
    bleImportPanel,
    /await stopDownload\(\);\s*\}?\s*onClose\(\)/,
  );
  assert.match(
    bleImportPanel,
    /className="button button-primary ble-history-download"/,
  );
  assert.match(backup, /BACKUP_VERSION = 3/);
  assert.match(backup, /rawBytesBase64/);
  assert.match(backup, /fingerprintBase64/);
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
  assert.match(settings, /removeSessionCatalog/);
  assert.match(settings, /dive-site-catalog-ai-prompt\.md/);
  assert.match(settings, /catalogSharingInvitation/);
  assert.match(settings, /saveLocalSupplementaryCatalog|getLocalSupplementaryCatalog/);
  assert.doesNotMatch(settings, /saveSessionDiveSiteCatalog/);
  assert.match(app, /resolveActiveDiveSiteCatalog|getLocalSupplementaryCatalog/);
  assert.match(catalogTools, /sessionStorage/);
  assert.match(catalogTools, /combineDiveSiteCatalogs/);
  assert.match(catalogTools, /nearbySessionCatalogSites/);
  assert.match(catalogPrompt, /Return only the final UTF-8 JSON object/);
  assert.match(assetLicenses, /public\/backgrounds\/bubbles-bg\.jpg/);
  assert.match(assetLicenses, /excluded from the GNU General Public License/);
  assert.match(app, /useAppI18n/);
  assert.doesNotMatch(app, /catalogNotesForDive/);
  assert.match(app, /photo-gallery-actions/);
  assert.match(app, /mobile-home-button/);
  assert.doesNotMatch(app, /mobile-back/);
  assert.match(app, /from "@\/lib\/dive-list-model"/);
  assert.match(app, /buildDiveListRows/);
  assert.match(app, /diveMatchesListFilters/);
  assert.doesNotMatch(app, /function compareDives\(/);
  assert.match(app, /const \[dateFrom, setDateFrom\]/);
  assert.match(app, /const \[computerFilter, setComputerFilter\]/);
  assert.match(app, /const \[filtersOpen, setFiltersOpen\]/);
  assert.match(app, /className="filter-panel"/);
  assert.match(app, /t\("moreFilters"\)/);
  assert.match(app, /t\("dateFrom"\)/);
  assert.match(app, /t\("dateTo"\)/);
  assert.match(app, /t\("computerFilterLabel"\)/);
  assert.match(app, /t\("allComputers"\)/);
  assert.match(app, /computerModels\.map/);
  assert.match(app, /onClick=\{resetFilters\}/);
  assert.match(app, /disabled=\{!hasActiveFilters\}/);
  const resetFiltersBody =
    app.match(/const resetFilters = useCallback\(\(\) => \{[\s\S]+?\}, \[\]\);/)?.[0] ?? "";
  assert.match(resetFiltersBody, /setDateFrom\(null\)/);
  assert.match(resetFiltersBody, /setComputerFilter\(null\)/);
  assert.doesNotMatch(resetFiltersBody, /setQuery/);
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
  assert.match(serviceWorker, /diveframe-shell-v7/);
  assert.match(serviceWorker, /backgrounds\/bubbles-bg\.jpg/);
  assert.match(serviceWorker, /examples\/sample-dive\.uddf/);
  assert.match(serviceWorker, /examples\/dive-site-catalog-ai-prompt\.md/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(pwaInstall, /beforeinstallprompt/);
  assert.match(pwaInstall, /navigator\.serviceWorker\.register/);
  assert.match(settings, /PwaInstallCard/);
  assert.match(
    settings,
    /fetchWhatsNewDocument|whatsNewCache|lastSeenWhatsNewVersion/,
  );
  assert.match(settings, /entry\.links|sanitizeWhatsNewHref/);

  const globalStyles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(globalStyles, /select option/);
  assert.match(globalStyles, /color-scheme: dark/);
  assert.match(globalStyles, /env\(safe-area-inset-top/);
  assert.match(globalStyles, /var\(--safe-area-inset-top/);
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
  assert.match(nearbyRoute, /radiusKm = NEARBY_SITE_RADIUS_KM/);

  const geocodeRoute = await readFile(
    new URL("../app/api/geocode/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(geocodeRoute, /locationQueries/);
  assert.match(geocodeRoute, /@\/lib\/geocode-query/);
  const geocodeQuery = await readFile(
    new URL("../lib/geocode-query.ts", import.meta.url),
    "utf8",
  );
  assert.match(geocodeQuery, /parts\.slice\(1\)/);

  const sites = JSON.parse(catalog);
  assert.equal(sites.schemaVersion, 1);
  assert.ok(sites.sites.length > 300);
  assert.ok(sites.sites.every((site) => site.coordinates));
  assert.ok(sites.sites.every((site) => !("notes" in site)));

  const bindings = JSON.parse(hosting);
  assert.equal(bindings.d1, null);
  assert.equal(bindings.r2, null);

  const pwa = JSON.parse(manifest);
  assert.equal(pwa.name, "DiveFrame (Web)");
  assert.equal(pwa.short_name, "DiveFrame (Web)");
  assert.equal(pwa.display, "standalone");

  const sampleLog = await readFile("public/examples/sample-dive.uddf", "utf8");
  assert.match(sampleLog, /<name>Sample Dive<\/name>/);
  assert.match(sampleLog, /<latitude>1\.67241<\/latitude>/);
  assert.match(sampleLog, /<longitude>-91\.9906<\/longitude>/);
  assert.match(sampleLog, /sample dive log to test functions/);

});
