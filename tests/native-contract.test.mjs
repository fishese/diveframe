import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  capacitor: new URL("../capacitor.config.ts", import.meta.url),
  cmake: new URL(
    "../android/app/src/main/cpp/CMakeLists.txt",
    import.meta.url,
  ),
  javaPlugin: new URL(
    "../android/app/src/main/java/cc/fishese/divelog/DiveComputerPlugin.java",
    import.meta.url,
  ),
  mainActivity: new URL(
    "../android/app/src/main/java/cc/fishese/divelog/MainActivity.java",
    import.meta.url,
  ),
  photoLocationPlugin: new URL(
    "../android/app/src/main/java/cc/fishese/divelog/PhotoLocationPlugin.java",
    import.meta.url,
  ),
  gatt: new URL(
    "../android/app/src/main/java/cc/fishese/divelog/DiveComputerGattClient.java",
    import.meta.url,
  ),
  manifest: new URL(
    "../android/app/src/main/AndroidManifest.xml",
    import.meta.url,
  ),
  buildGradle: new URL("../android/app/build.gradle", import.meta.url),
  previewStrings: new URL(
    "../android/app/src/preview/res/values/strings.xml",
    import.meta.url,
  ),
  previewShortcuts: new URL(
    "../android/app/src/preview/res/xml/shortcuts.xml",
    import.meta.url,
  ),
  capability: new URL(
    "../lib/dive-computer-capability.ts",
    import.meta.url,
  ),
  photoLocationCapability: new URL(
    "../lib/photo-location-capability.ts",
    import.meta.url,
  ),
  package: new URL("../package.json", import.meta.url),
  pin: new URL(
    "../android/app/src/main/cpp/libdivecomputer.pin",
    import.meta.url,
  ),
  gitmodules: new URL("../.gitmodules", import.meta.url),
  fetchShell: new URL(
    "../scripts/fetch-libdivecomputer.sh",
    import.meta.url,
  ),
  fetchPowerShell: new URL(
    "../scripts/fetch-libdivecomputer.ps1",
    import.meta.url,
  ),
  fdroidWorkflow: new URL(
    "../.github/workflows/fdroid-reference-apk.yml",
    import.meta.url,
  ),
  previewWorkflow: new URL(
    "../.github/workflows/preview-apk.yml",
    import.meta.url,
  ),
};

test("native shell remains isolated from the deployed web build", async () => {
  const [capacitor, packageJson] = await Promise.all([
    readFile(files.capacitor, "utf8"),
    readFile(files.package, "utf8").then(JSON.parse),
  ]);

  assert.match(capacitor, /appId:\s*"cc\.fishese\.divelog"/);
  assert.match(capacitor, /webDir:\s*"dist-native"/);
  assert.match(packageJson.scripts["native:sync"], /native:web/);
  assert.equal(
    major(packageJson.dependencies["@capacitor/core"]),
    major(packageJson.dependencies["@capacitor/android"]),
  );
  assert.equal(
    major(packageJson.dependencies["@capacitor/core"]),
    major(packageJson.devDependencies["@capacitor/cli"]),
  );
});

test("native bridge and linked library use the recorded source pin", async () => {
  const [
    pin,
    javaPlugin,
    cmake,
    capability,
    buildGradle,
    gitmodules,
    fetchShell,
    fetchPowerShell,
    fdroidWorkflow,
    previewWorkflow,
  ] = await Promise.all([
    readFile(files.pin, "utf8"),
    readFile(files.javaPlugin, "utf8"),
    readFile(files.cmake, "utf8"),
    readFile(files.capability, "utf8"),
    readFile(files.buildGradle, "utf8"),
    readFile(files.gitmodules, "utf8"),
    readFile(files.fetchShell, "utf8"),
    readFile(files.fetchPowerShell, "utf8"),
    readFile(files.fdroidWorkflow, "utf8"),
    readFile(files.previewWorkflow, "utf8"),
  ]);
  const commit = pin.match(/^commit=([a-f0-9]{40})$/m)?.[1];

  assert.ok(commit, "expected a full libdivecomputer commit pin");
  assert.match(pin, /^license=LGPL-2\.1-or-later$/m);
  assert.match(javaPlugin, /BuildConfig\.LIBDIVECOMPUTER_COMMIT/);
  assert.doesNotMatch(javaPlugin, new RegExp(commit));
  assert.match(buildGradle, /libdivecomputer\.pin/);
  assert.match(buildGradle, /buildConfig\s*=\s*true/);
  assert.match(buildGradle, /buildConfigField "String", "LIBDIVECOMPUTER_COMMIT"/);
  assert.doesNotMatch(buildGradle, new RegExp(commit));
  assert.match(
    gitmodules,
    /path = android\/app\/src\/main\/cpp\/vendor\/libdivecomputer/,
  );
  assert.match(
    gitmodules,
    /url = https:\/\/github\.com\/libdivecomputer\/libdivecomputer\.git/,
  );
  assert.match(fetchShell, /libdivecomputer\.pin/);
  assert.match(fetchPowerShell, /libdivecomputer\.pin/);
  assert.doesNotMatch(fetchShell, new RegExp(commit));
  assert.doesNotMatch(fetchPowerShell, new RegExp(commit));
  assert.match(fdroidWorkflow, /submodules: recursive/);
  assert.match(previewWorkflow, /submodules: recursive/);
  assert.match(javaPlugin, /DiveComputerNative\.libdivecomputerVersion\(\)/);
  assert.match(cmake, /add_library\(libdivecomputer SHARED/);
  assert.match(cmake, /add_library\(diveframe_dc SHARED/);
  assert.match(cmake, /target_link_libraries\(diveframe_dc PRIVATE libdivecomputer/);
  assert.match(capability, /Capacitor\.getPlatform\(\) === "android"/);
  assert.match(capability, /Capacitor\.isPluginAvailable\("DiveComputer"\)/);
});

test("BLE permissions, scan, cancel, and classic GATT transport are wired", async () => {
  const [manifest, javaPlugin, gatt, capability] = await Promise.all([
    readFile(files.manifest, "utf8"),
    readFile(files.javaPlugin, "utf8"),
    readFile(files.gatt, "utf8"),
    readFile(files.capability, "utf8"),
  ]);

  assert.match(manifest, /android\.permission\.BLUETOOTH_SCAN/);
  assert.match(manifest, /android\.permission\.BLUETOOTH_CONNECT/);
  assert.match(manifest, /android\.permission\.ACCESS_MEDIA_LOCATION/);
  assert.match(manifest, /neverForLocation/);
  assert.match(manifest, /android\.hardware\.bluetooth_le/);
  assert.match(manifest, /android:required="false"/);

  assert.match(javaPlugin, /requestPermissions/);
  assert.match(javaPlugin, /startScan/);
  assert.match(javaPlugin, /stopScan/);
  assert.match(javaPlugin, /connect/);
  assert.match(javaPlugin, /downloadDives/);
  assert.match(javaPlugin, /cancel/);
  assert.match(javaPlugin, /deviceFound/);

  assert.match(
    gatt,
    /fe25c237-0ece-443c-b0aa-e02033e7029d/,
  );
  assert.match(
    gatt,
    /27b7570b-359e-45a3-91bb-cf7e70049bd2/,
  );

  assert.match(capability, /requestPermissions/);
  assert.match(capability, /startScan/);
  assert.match(capability, /connect/);
  assert.match(capability, /downloadDives/);
  assert.match(capability, /fingerprintHex/);
  assert.match(capability, /downloadProgress/);
  assert.match(capability, /diveCaptured/);
  assert.match(capability, /deviceFound/);
});

test("Preview Android identity is isolated from production", async () => {
  const [buildGradle, previewStrings, previewShortcuts] = await Promise.all([
    readFile(files.buildGradle, "utf8"),
    readFile(files.previewStrings, "utf8"),
    readFile(files.previewShortcuts, "utf8"),
  ]);

  assert.match(buildGradle, /applicationId "cc\.fishese\.divelog"/);
  assert.match(buildGradle, /previewVersionCode/);
  assert.match(buildGradle, /previewVersionName/);
  assert.match(buildGradle, /preview\s*\{[\s\S]*applicationIdSuffix "\.preview"/);
  assert.doesNotMatch(buildGradle, /nightlyVersion/);
  assert.match(previewStrings, /app_name">DiveFrame Preview</);
  assert.match(previewStrings, /package_name">cc\.fishese\.divelog\.preview</);
  assert.match(previewStrings, /custom_url_scheme">cc\.fishese\.divelog\.preview</);
  assert.match(
    previewShortcuts,
    /android:targetPackage="cc\.fishese\.divelog\.preview"/,
  );
  assert.match(
    previewShortcuts,
    /android:targetClass="cc\.fishese\.divelog\.MainActivity"/,
  );
});

test("Android native build pins the NDK version", async () => {
  const [buildGradle, variables] = await Promise.all([
    readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8"),
    readFile(new URL("../android/variables.gradle", import.meta.url), "utf8"),
  ]);

  assert.match(buildGradle, /ndkVersion = rootProject\.ext\.ndkVersion/);
  assert.match(variables, /ndkVersion = '27\.0\.12077973'/);
});

test("Android location-photo picker requests original MediaStore EXIF and releases temporary photos", async () => {
  const [manifest, plugin, capability, mainActivity, gradle] = await Promise.all([
    readFile(files.manifest, "utf8"),
    readFile(files.photoLocationPlugin, "utf8"),
    readFile(files.photoLocationCapability, "utf8"),
    readFile(files.mainActivity, "utf8"),
    readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8"),
  ]);

  assert.match(manifest, /android\.permission\.ACCESS_MEDIA_LOCATION/);
  assert.match(plugin, /name = "PhotoLocation"/);
  assert.match(plugin, /requestPermissionForAlias/);
  assert.match(plugin, /Intent\.ACTION_PICK/);
  assert.match(plugin, /MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI/);
  assert.match(plugin, /MediaStore\.setRequireOriginal/);
  assert.doesNotMatch(plugin, /MediaStore\.ACTION_PICK_IMAGES/);
  assert.match(plugin, /new ExifInterface\(stream\)\.getLatLong\(\)/);
  assert.match(plugin, /includePhoto/);
  assert.match(plugin, /releasePickedPhoto/);
  assert.match(mainActivity, /registerPlugin\(PhotoLocationPlugin\.class\)/);
  assert.match(capability, /Capacitor\.isPluginAvailable\("PhotoLocation"\)/);
  assert.match(capability, /Capacitor\.convertFileSrc/);
  assert.match(gradle, /androidx\.exifinterface:exifinterface:1\.4\.2/);
});

test("BLE downloads keep the Android screen awake only during transfer", async () => {
  const javaPlugin = await readFile(files.javaPlugin, "utf8");

  assert.match(javaPlugin, /FLAG_KEEP_SCREEN_ON/);
  assert.match(javaPlugin, /addFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/);
  assert.match(javaPlugin, /clearFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/);
  assert.match(
    javaPlugin,
    /downloadExecutor\.execute\([\s\S]+setKeepScreenOn\(true\)[\s\S]+finally[\s\S]+setKeepScreenOn\(false\)/,
  );
});

test("diveCaptured events carry payload for incremental IndexedDB persist", async () => {
  const [javaPlugin, nativeJava, collector, capability, nativeC] =
    await Promise.all([
      readFile(files.javaPlugin, "utf8"),
      readFile(
        new URL(
          "../android/app/src/main/java/cc/fishese/divelog/DiveComputerNative.java",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../android/app/src/main/java/cc/fishese/divelog/DiveComputerDownloadCollector.java",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(files.capability, "utf8"),
      readFile(
        new URL("../android/app/src/main/cpp/diveframe_dc.c", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(capability, /dataBase64/);
  assert.match(
    nativeJava,
    /onDiveCaptured\(\s*int index,\s*int size,\s*String fingerprintHex,\s*String dataBase64/s,
  );
  assert.match(collector, /emitDiveCaptured\(/);
  assert.match(collector, /dataBase64\(\)|Base64\.encodeToString/);
  assert.match(javaPlugin, /put\("dataBase64"/);
  assert.match(javaPlugin, /put\("parsed"/);
  assert.match(nativeC, /state\.context/);
  assert.match(nativeC, /parse_dive\(/);
});

test("download path uses dc_custom_open and does not claim persistence", async () => {
  const [nativeC, javaPlugin, docs] = await Promise.all([
    readFile(
      new URL("../android/app/src/main/cpp/diveframe_dc.c", import.meta.url),
      "utf8",
    ),
    readFile(files.javaPlugin, "utf8"),
    readFile(
      new URL("../docs/native-android-spike.md", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(nativeC, /dc_custom_open/);
  assert.match(nativeC, /dc_device_foreach/);
  assert.match(nativeC, /dc_device_set_fingerprint/);
  assert.match(nativeC, /dc_parser_new/);
  assert.match(nativeC, /dc_parser_samples_foreach/);
  assert.match(nativeC, /DC_SAMPLE_TEMPERATURE/);
  assert.match(nativeC, /DC_SAMPLE_PRESSURE/);
  assert.match(nativeC, /temperature_min/);
  assert.match(nativeC, /addProfilePoint", "\(IDD\)V/);
  assert.match(nativeC, /addProfilePressure", "\(IID\)V/);
  assert.match(nativeC, /DC_FIELD_DIVEMODE/);
  assert.match(nativeC, /DC_FIELD_SALINITY/);
  assert.match(nativeC, /DC_FIELD_ATMOSPHERIC/);
  assert.match(nativeC, /DC_FIELD_DECOMODEL/);
  assert.match(nativeC, /tank\.volume/);
  assert.match(nativeC, /tank\.usage/);
  assert.match(nativeC, /DC_TRANSPORT_BLE/);
  assert.match(javaPlugin, /persisted\",\s*false|put\("persisted", false\)/);
  assert.match(javaPlugin, /downloadProgress/);
  assert.match(javaPlugin, /diveCaptured/);
  assert.match(javaPlugin, /parsedToJson|put\("parsed"/);
  assert.match(docs, /erase-reimport|IndexedDB/);
  assert.match(docs, /spike still does not write|does not write|non-persisting|Nothing is written|persisted: false/i);
  assert.match(docs, /fingerprint|checkpoint/i);
  assert.match(docs, /Peregrine|Perdix 2/);
});

test("BLE normalizer exists and is wired into the spike without persistence", async () => {
  const [normalizer, spike, docs, javaPlugin, persist, session, sessionJava, nativeC] =
    await Promise.all([
      readFile(new URL("../lib/ble-dive-normalizer.ts", import.meta.url), "utf8"),
      readFile(new URL("../native-spike/src/main.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../docs/native-android-spike.md", import.meta.url),
        "utf8",
      ),
      readFile(files.javaPlugin, "utf8"),
      readFile(new URL("../lib/ble-persist.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/ble-import-session.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../android/app/src/main/java/cc/fishese/divelog/DiveComputerSession.java",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../android/app/src/main/cpp/diveframe_dc.c", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(normalizer, /shearwater-ble/);
  assert.match(persist, /previewToImportedDive/);
  assert.match(persist, /persistBleImport|prepareBlePersistFromFixture/);
  assert.match(persist, /prepareBlePersistFromDownload/);
  assert.match(persist, /prepareBlePersistFromCapturedDive/);
  assert.match(session, /prepareBlePersistFromCapturedDive/);
  assert.match(session, /summarizeNewDiveDates/);
  assert.match(normalizer, /proposedCanonicalId/);
  assert.match(spike, /normalizeBleDownloadPreview/);
  assert.match(spike, /saveCaptureFixture|Save full capture|save-capture/);
  assert.match(javaPlugin, /saveCaptureFixture/);
  assert.match(docs, /import-shaped preview|normalize/i);
  assert.match(docs, /BLE_CAPTURE_FIXTURE|fixtures\/ble|MediaStore|Downloads/);
  assert.match(session, /nativeLimitForQuantity/);
  assert.match(sessionJava, /effectiveLimit = limit <= 0 \? 0 : limit/);
  assert.match(nativeC, /dive_limit = limit > 0 \? \(unsigned int\) limit : 0/);
  assert.doesNotMatch(sessionJava, /Math\.min\(limit, 50\)/);
});

test("Shearwater GNSS survives the sample callback into the dive record", async () => {
  const [nativeC, nativeJava, javaPlugin, capability, normalizer, persist] =
    await Promise.all([
      readFile(
        new URL("../android/app/src/main/cpp/diveframe_dc.c", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../android/app/src/main/java/cc/fishese/divelog/DiveComputerNative.java",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(files.javaPlugin, "utf8"),
      readFile(files.capability, "utf8"),
      readFile(new URL("../lib/ble-dive-normalizer.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/ble-persist.ts", import.meta.url), "utf8"),
    ]);

  // libdivecomputer reports Shearwater GPS as a sample, not a parser field.
  assert.match(nativeC, /DC_SAMPLE_LOCATION/);
  assert.match(nativeC, /value->location\.latitude/);
  assert.match(nativeC, /setEntryLocation/);
  assert.match(nativeC, /setExitLocation/);
  assert.match(nativeJava, /void setEntryLocation\(double latitude, double longitude\)/);
  assert.match(javaPlugin, /put(OptionalDouble)?\(out, "gpsEntryLat"/);
  assert.match(capability, /gpsEntryLat\?: number/);
  assert.match(normalizer, /gpsEntryLat: entryFix\?\.latitude \?\? null/);
  assert.match(persist, /gpsEntryLat: preview\.gpsEntryLat/);
  assert.doesNotMatch(persist, /gpsEntryLat: null/);
});

test("BLE temperature samples survive the native bridge contract", async () => {
  const [nativeC, nativeJava, javaPlugin, capability, normalizer] =
    await Promise.all([
      readFile(
        new URL("../android/app/src/main/cpp/diveframe_dc.c", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../android/app/src/main/java/cc/fishese/divelog/DiveComputerNative.java",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(files.javaPlugin, "utf8"),
      readFile(files.capability, "utf8"),
      readFile(new URL("../lib/ble-dive-normalizer.ts", import.meta.url), "utf8"),
    ]);

  assert.match(nativeC, /value->temperature/);
  assert.match(nativeJava, /void addProfilePoint\(int timeMs, double depthM, double temperatureC\)/);
  assert.match(nativeJava, /final double temperatureC/);
  assert.match(javaPlugin, /"temperatureC", point\.temperatureC/);
  assert.match(capability, /temperatureC\?: number/);
  assert.match(normalizer, /point\.temperatureC/);
});

test("exports are written natively because the WebView drops blob downloads", async () => {
  const [plugin, mainActivity, helper, settings, app, composer, exporter, pwa] =
    await Promise.all([
      readFile(
        new URL(
          "../android/app/src/main/java/cc/fishese/divelog/FileExportPlugin.java",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(files.mainActivity, "utf8"),
      readFile(new URL("../lib/file-export.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/settings/SettingsApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/DiveFrameApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/compose/ComposerApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/exporter.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/PwaInstall.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(plugin, /name = "FileExport"/);
  assert.match(plugin, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(plugin, /beginFile|writeChunk|finishFile|abortFile/);
  assert.match(plugin, /Base64\.decode/);
  assert.match(plugin, /Intent\.ACTION_SEND/);
  assert.match(mainActivity, /registerPlugin\(FileExportPlugin\.class\)/);
  assert.match(mainActivity, /DEFAULT_TEXT_ZOOM_PERCENT = 100/);
  assert.match(mainActivity, /setTextZoom\(DEFAULT_TEXT_ZOOM_PERCENT\)/);

  assert.match(helper, /Capacitor\.isPluginAvailable\("FileExport"\)/);
  assert.match(helper, /blob\.slice\(offset/);
  assert.match(helper, /abortFile/);
  assert.match(helper, /link\.download = fileName/);

  // No screen may fall back to an anchor download of its own.
  for (const source of [settings, app, composer, exporter]) {
    assert.doesNotMatch(source, /\.download = /);
  }
  assert.match(settings, /saveExportFile\(/);
  assert.match(settings, /shareExportFile\(/);
  assert.match(exporter, /saveExportFile\(/);
  assert.match(pwa, /Capacitor\.isNativePlatform\(\)/);
  // The install and browser-storage card is a PWA concern. Rendering it in the
  // native shell duplicated Android's own storage/export UI and misleadingly
  // reported WebView persistence semantics.
  assert.match(pwa, /if \(!mounted \|\| isNative\) return null/);
  assert.doesNotMatch(pwa, /deviceStorageTitle|storageNativeApp/);
  assert.match(pwa, /getLocalStoragePersistenceStatus\(!native\)/);
});

test("Android launcher exposes a localized Memos shortcut to /memo", async () => {
  const [manifest, mainActivity, shortcuts, strings] = await Promise.all([
    readFile(files.manifest, "utf8"),
    readFile(files.mainActivity, "utf8"),
    readFile(
      new URL("../android/app/src/main/res/xml/shortcuts.xml", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../android/app/src/main/res/values/strings.xml", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(manifest, /android\.app\.shortcuts/);
  assert.match(manifest, /@xml\/shortcuts/);
  assert.match(manifest, /android:pathPrefix="\/memo"/);
  assert.match(manifest, /android\.intent\.category\.BROWSABLE/);
  assert.match(shortcuts, /android:shortcutId="memos"/);
  assert.match(shortcuts, /https:\/\/localhost\/memo/);
  assert.match(strings, /shortcut_memos_short/);
  assert.match(mainActivity, /handleLaunchPath/);
  assert.match(mainActivity, /nativeStaticPath/);
  assert.match(mainActivity, /normalized \+ "\.html"/);
  assert.match(mainActivity, /DiveFrameNative/);
  assert.match(mainActivity, /setLightStatusBars/);
  assert.match(mainActivity, /refreshSafeAreaInsets/);
  assert.match(mainActivity, /getInsetsIgnoringVisibility/);
  assert.match(mainActivity, /diveframe-native-safe-area-top/);
});

function major(versionRange) {
  const match = String(versionRange).match(/\d+/);
  assert.ok(match, `expected a semver range, received ${versionRange}`);
  return Number(match[0]);
}
