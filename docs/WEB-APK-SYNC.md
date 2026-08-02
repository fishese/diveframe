# Web and Android APK parity

This is the maintainer reference for deciding whether a change to DiveFrame
requires only a web deployment or also a new Android APK.

## The rule before every push

Before every push to `main`, explicitly answer:

> Does this change affect shared client behavior, bundled data/assets, the
> IndexedDB/backup contract, or Android-native behavior?

If yes, validate both surfaces and publish a new APK built from the same commit.
A push to `main` updates the hosted web app through Cloudflare, but it does
**not** update the APK on GitHub or any APK already installed on a phone.

Documentation-, test-, or server-only pushes may intentionally leave the APK
unchanged. Record that decision in the commit/release notes when it is not
obvious. Do not describe the APK as matching the web app if their runtime
commits differ.

## What must stay in sync

The web/PWA and APK are two delivery surfaces for the same application. These
areas must behave the same unless an intentional difference is listed below:

- normalized dive model, parsers, source identity, matching, and merge rules;
- IndexedDB version, store manifest, additive migrations, and data deletion
  scopes;
- app-data backup format and merge/replace restore behavior;
- trips, site/location edits, filters, statistics, and catalog behavior;
- image composer, templates, reusable backgrounds, branding, and exports;
- application translations and user-facing product/support copy;
- bundled `data/dive-sites.json`, icons, fonts, sample backgrounds, and other
  client assets; and
- client expectations for hosted API response shapes and errors.

In practice, changes under shared client paths such as `app/` (except a purely
server-side `app/api/` change), `lib/`, `data/`, client-facing `public/` assets,
or shared dependencies normally require both a web deployment and a new APK.
Schema upgrades after IndexedDB v8 must remain additive on both surfaces unless
a destructive migration has been discussed and agreed in advance.

## Intentional differences

| Area | Web/PWA | Android APK |
| --- | --- | --- |
| Delivery | Cloudflare deploy from `main`; PWA shell may be service-worker cached | Static client export copied into the Capacitor package by `npm run native:sync` |
| Updates | Reload/service-worker update receives the deployed client | No automatic update; replace the GitHub release asset and reinstall/update the APK |
| Origin and data | Production is `https://divelog.fishese.cc` | WebView origin is `https://localhost` |
| Local logbook | IndexedDB partition for the exact browser/origin | Separate private WebView IndexedDB partition |
| Moving data | Export/import app-data backup | Export/import app-data backup; data is not shared with the PWA automatically |
| Hosted APIs | Uses relative `/api/...` requests on the deployed origin | Uses `https://divelog.fishese.cc/api/...` by default through `lib/diveframe-api.ts`; production must allow the Capacitor origin with CORS |
| Installation UI | Shows browser/PWA install and storage-persistence guidance | Hides that card because the APK is already installed and uses app-private storage |
| Top-bar native action | Shows the phone link to `/android`; no Web Bluetooth import | Shows classic Shearwater Bluetooth download instead of the phone link |
| File export | Browser blob download | `FileExportPlugin` writes to Android Downloads and can open the share sheet |
| Photo GPS | Browser file picker and exifr-lite JavaScript GPS reader for JPEG/HEIC/HEIF; browser-controlled pickers may redact GPS, especially on Android | `PhotoLocationPlugin` requests `ACCESS_MEDIA_LOCATION` and uses the MediaStore picker plus original selected photo URI |
| Nearby site suggestions | Bundled/supplementary/online suggestions are limited to 12 km from available coordinates | Same bundled client behavior; rebuild the APK when the shared cutoff changes |
| Dive-computer Bluetooth | Not supported | `DiveComputerPlugin` plus JNI/libdivecomputer; classic Shearwater only, not Perdix 3 |
| Service worker | Registered and used | Unregistered/cleared by `PwaManager`; the packaged client is the offline shell |
| Permissions | Browser-selected file/location capabilities | Android manifest permissions for Bluetooth, older-Android BLE discovery, internet, and unredacted photo location |

Native-only code lives mainly under `android/`, with capability adapters such
as `lib/dive-computer-capability.ts`, `lib/file-export.ts`, and
`lib/photo-location-capability.ts`. `capacitor.config.ts` controls whether the
APK loads bundled `dist-native` assets or an explicitly configured development
server.

## Change-to-release matrix

| Change | Web deploy | New APK | Extra check |
| --- | --- | --- | --- |
| Shared UI, translations, styles, import/merge logic, IndexedDB, backup, composer, or bundled catalog/assets | Yes | Yes | Run full tests and smoke the affected flow on Android |
| Android Java/C++ plugin, manifest permission, Gradle dependency, Capacitor configuration, or native adapter | Only if shared web code also changed | Yes | Run `native:sync`, Gradle build, and device test |
| Hosted `app/api/`, Worker, or CORS change only | Yes | Usually no | Test the installed APK against production, especially from `https://localhost` |
| `public/whats-new.json` feed content only | Yes | No | Confirm the APK can fetch/cache the production feed |
| PWA manifest, service worker, or browser install behavior only | Yes | No | Test update/install behavior in the browser |
| Tests, developer docs, or build notes only | As required by the hosting workflow | No | State that the change is non-runtime |
| Dependency change used by shared client code | Yes | Yes | Rebuild both; check bundle and APK size |

When a push mixes categories, follow the broadest requirement.

## APK build and publication checklist

Use the exact commit that was pushed to `main`; the release tag must point to
that commit. Do not commit the generated APK into the Git repository—publish it
as a GitHub Release asset.

1. Review `git diff --name-only` and use the matrix above.
2. For an APK release, increment `versionCode` and update `versionName` in
   `android/app/build.gradle`. The first debug release used `versionCode 1` /
   `versionName "1.0"`; the current debug build uses `versionCode 6` /
   `versionName "1.0.5"`. Confirm the build uses the same signing key as the
   APK it is expected to update.
3. Run `npm test`, commit the intended source changes, and push that commit to
   `main`. Record the commit ID; the APK release tag must target it.
4. Confirm the checkout still points to the pushed commit, then build the
   native client and sync Capacitor:

   ```powershell
   npm run native:sync
   ```

5. Assemble the debug APK:

   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   Push-Location android
   .\gradlew.bat assembleDebug
   Pop-Location
   ```

6. Install it over the existing test build and smoke-test the changed paths:

   ```powershell
   adb install -r android\app\build\outputs\apk\debug\app-debug.apk
   ```

   At minimum, open the logbook and verify existing IndexedDB data remains.
   For relevant changes also test app-data export/import, native Downloads,
   photo-location EXIF, hosted API/CORS calls, and classic Shearwater BLE.

7. Give every published build a unique release tag targeting the exact commit,
   for example `v0.1.0-debug.1`, and keep the asset name exactly
   `diveframe-debug.apk`. The web download page uses the stable URL:

   ```text
   https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk
   ```

   The current release is `v0.1.0-debug.5`. Because the stable URL uses GitHub's
   `releases/latest` alias, debug releases are currently published as normal
   latest releases rather than GitHub prereleases. If that policy changes, the
   download-link strategy must change too.
8. Copy/rename the Gradle output before uploading it as the release asset:

   ```powershell
   $releaseTag = "v0.1.0-debug.5"
   $releaseCommit = git rev-parse HEAD
   $releaseHash = (Get-FileHash `
     android\app\build\outputs\apk\debug\app-debug.apk `
     -Algorithm SHA256).Hash
   $releaseNotes = "Debug Android APK built from $releaseCommit.`n`n" +
     "Classic Shearwater Bluetooth only; Perdix 3 is not supported.`n" +
     "SHA-256: $releaseHash"
   Copy-Item `
     android\app\build\outputs\apk\debug\app-debug.apk `
     diveframe-debug.apk
   gh release create $releaseTag diveframe-debug.apk `
     --repo fishese/diveframe `
     --target $releaseCommit `
     --title "DiveFrame $releaseTag" `
     --notes $releaseNotes `
     --latest
   Remove-Item diveframe-debug.apk
   ```

   The temporary renamed copy is disposable; the Gradle output remains under
   `android/app/build/outputs/` and can be rebuilt from the tagged source.
9. Include the source commit, supported hardware limits, debug/signing status,
   and SHA-256 digest in the release notes. Verify that the release asset size
   and digest match the local build and that the stable download URL resolves.
10. Update `public/whats-new.json` when the APK update should be announced in the
   app, and confirm the production feed is deployed.

## Current distribution boundary

As of 2026-08-02, the published Android build is an arm64 debug APK for manual
installation. It is not a Play Store, signed production, or F-Droid release.
The current GitHub release is:

- release: `https://github.com/fishese/diveframe/releases/tag/v0.1.0-debug.5`
- asset: `diveframe-debug.apk`
- source commit: `61aa3427c98e6badcbb1e457fa803ae0b422d31f`
- SHA-256:
  `FD9732B5CAAF30F55665C5B00B2BF346B9CD849E73737EDD551589E94DC9ECB4`

The debug APK is still signed by Android's debug tooling. An in-place Android
update requires the same application ID, a compatible/higher `versionCode`,
and the same signing key. A debug build produced with a different debug key
will not update the installed release. Keep the key used for the published
debug channel in a private backup and never commit it. Before changing to a
production or F-Droid signing key, tell users to export an app-data backup;
changing signatures may require uninstalling the debug APK, which removes its
private IndexedDB data.

When signing/F-Droid work begins, document signing-key custody, reproducible
build inputs, supported ABIs, update channels, versioning, and whether the
stable web download link should point to a universal APK or a release page.
