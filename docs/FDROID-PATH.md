# F-Droid path

Status: build preparation. The current public Android build remains the GitHub
`diveframe-debug.apk` debug channel (`docs/WEB-APK-SYNC.md`). F-Droid metadata
belongs in the separate `fdroiddata` repository and should point to a full
release commit from this repository.

## Direction

- Prefer F-Droid (or another reproducible free-software channel) over hosting
  a long-lived private keystore for the debug APK channel.
- Self-hosted OFL overlay fonts are a prerequisite for offline / anti-feature
  hygiene; that work is tracked separately and should already be on `main`
  before packaging changes.

## Signing

- Moving off the Android debug keystore changes the signing identity.
- Tell users to **Export app data** before installing a differently signed
  build; uninstalling the debug APK deletes private WebView IndexedDB.
- Avoid committing any production keystore. Prefer F-Droid's signing model
  (or documented maintainer key custody) over ad-hoc private debug keys.

## Reproducible / build notes

- Pin Node (`engines` in `package.json`), the JDK, and the NDK used for Gradle.
- Overlay fonts are vendored under `public/fonts/`; builds must not require
  `fonts.googleapis.com` at compile or runtime.
- A clean local Linux/macOS packaging path is:

  ```sh
  sh scripts/prepare-fdroid-build.sh
  (cd android && ./gradlew assembleRelease)
  ```

  The script installs the locked npm dependencies, fetches the pinned native
  source, regenerates the sql.js wasm asset, builds the static web client, and
  runs Capacitor sync.
- Record ABI targets (today: arm64) and versionCode/versionName policy before
  the first non-debug channel. The current NDK pin is `27.0.12077973`.

## LGPL / libdivecomputer

- Classic Shearwater BLE uses libdivecomputer (LGPL). Any F-Droid or store
  release must ship or link corresponding source and meet LGPL obligations
  (JNI bridge + fetched native sources).
- The local helper is portable, but the F-Droid recipe should fetch the exact
  libdivecomputer revision through an F-Droid `srclib`; build steps must not
  clone from the network.
- Keep the existing BLE/LGPL release checklist item from the audit open until
  explicitly completed.

## Shared source strategy

- Keep application source on `main`; do not maintain a long-lived F-Droid fork.
- Submit an exact release commit to `fdroiddata` and update the metadata when a
  later main release is ready.
- If Play-specific behavior is ever needed, add a narrowly scoped build
  variant. Keep signing keys and update channels separate: F-Droid normally
  signs its own APKs, so a Play-installed APK and an F-Droid-installed APK
  should not be presented as interchangeable updates.

## Distribution UX

- Decide whether `/android` and What's new CTAs keep using GitHub
  `releases/latest/download/diveframe-debug.apk` or point at an F-Droid /
  release page once a signed channel exists.
- Do not flip the stable download URL until the new channel is ready and
  documented.

## Still open (separate)

- Streamed backup encode/restore (audit item 4)
- Large React module splits
- BLE hardening / failure matrix
- Generate `public/sql-wasm.wasm` during the F-Droid build or document the
  narrowly scoped scanner handling required for this prebuilt MIT asset.
- Add and test the final `fdroiddata` metadata, including the exact NDK version,
  `srclibs`, npm build commands, `scandelete: public/sql-wasm.wasm` followed by
  `npm run prepare:sql-wasm`, and unsigned release APK output.
