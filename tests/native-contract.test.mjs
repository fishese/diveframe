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
  gatt: new URL(
    "../android/app/src/main/java/cc/fishese/divelog/DiveComputerGattClient.java",
    import.meta.url,
  ),
  manifest: new URL(
    "../android/app/src/main/AndroidManifest.xml",
    import.meta.url,
  ),
  capability: new URL(
    "../lib/dive-computer-capability.ts",
    import.meta.url,
  ),
  package: new URL("../package.json", import.meta.url),
  pin: new URL(
    "../android/app/src/main/cpp/libdivecomputer.pin",
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
  const [pin, javaPlugin, cmake, capability] = await Promise.all([
    readFile(files.pin, "utf8"),
    readFile(files.javaPlugin, "utf8"),
    readFile(files.cmake, "utf8"),
    readFile(files.capability, "utf8"),
  ]);
  const commit = pin.match(/^commit=([a-f0-9]{40})$/m)?.[1];

  assert.ok(commit, "expected a full libdivecomputer commit pin");
  assert.match(pin, /^license=LGPL-2\.1-or-later$/m);
  assert.match(javaPlugin, new RegExp(commit));
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
  assert.match(manifest, /neverForLocation/);
  assert.match(manifest, /android\.hardware\.bluetooth_le/);

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

function major(versionRange) {
  const match = String(versionRange).match(/\d+/);
  assert.ok(match, `expected a semver range, received ${versionRange}`);
  return Number(match[0]);
}
