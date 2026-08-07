# Session: light theme + memos shortcuts (2026-08-07)

## Branch

`main`

## Classification

**APK-affecting.** Shared UI theme/settings/styles, PWA manifest shortcuts,
Android static launcher shortcut + launch-URL handling, and `versionCode`
bump. Rebuild and publish the debug APK from the same release commit.

## Delivered

### Light / dark theme

- Explicit **Light / Dark** control in Settings (default Dark; no system-follow).
- `colorTheme` on `LocalAppPreferences` (IndexedDB), mirrored to
  `localStorage` for flash-free boot via `data-theme` + inline bootstrap.
- Real light tokens in `globals.css` (cool teal identity; not invert/cream/purple).
- Trilingual strings (EN / ja / zh-Hant). Language + Theme sit side by side
  under eyebrows only.

### Light-theme polish

- White dive-detail tiles/cards and memo inputs; teal filter bar with white
  chips; clearer site-suggestion borders; theme-aware dive-profile axes;
  composer top bar follows theme; included-background badges stay white-on-black;
  chart mode unavailable options prefixed with `—` and faded.

### Desktop logbook scroll

- Sticky dive workspace under the top bar; page scroll clamps at the list so
  overview/stats can scroll away without a broken sticky top bar.
- Avoided `overflow: hidden` on `html` (it broke sticky chrome).
- Deferred chart ResizeObserver work to avoid the fast-scroll overlay error.

### Memos shortcuts

- PWA: `/memos` entry in `manifest.webmanifest`.
- Android: static long-press shortcut (Memos / メモ / 備忘) opens
  `https://localhost/memos`; `MainActivity` handles the launch URL and exposes
  `DiveFrameNative.setLightStatusBars` for theme contrast.

## Dogfood / release

- APK **1.0.20** (`versionCode 21`), GitHub tag **`v0.1.0-debug.18`**, asset
  `diveframe-debug.apk`, commit `84e0f4b`.
- SHA-256:
  `419EA0C0D6793D6073767A9D39F99CB5E83201F1DBC2BF96E4CC3EA78FAC38F7`.
- Stable download:
  https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk
- Installed over wireless adb on the maintainer Galaxy S24 Ultra after publish.