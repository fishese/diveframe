# F-Droid path (outline)

Status: planning notes only. The current public Android build remains the
GitHub `diveframe-debug.apk` debug channel (`docs/WEB-APK-SYNC.md`). Do not
treat this document as an active release checklist until signing work starts.

## Direction

- Prefer F-Droid (or another reproducible free-software channel) over hosting
  a long-lived private keystore for the current debug APK channel.
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

- Pin Node (`engines` in `package.json`) and the JDK used for Gradle.
- Overlay fonts are vendored under `public/fonts/`; builds must not require
  `fonts.googleapis.com` at compile or runtime.
- Client packaging path: `npm test` → commit → `npm run native:sync` →
  Gradle assemble (see `docs/WEB-APK-SYNC.md`).
- Record ABI targets (today: arm64 debug) and versionCode/versionName policy
  before the first non-debug channel.

## LGPL / libdivecomputer

- Classic Shearwater BLE uses libdivecomputer (LGPL). Any F-Droid or store
  release must ship or link corresponding source and meet LGPL obligations
  (JNI bridge + fetched native sources).
- Keep the existing BLE/LGPL release checklist item from the audit open until
  explicitly completed.

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
