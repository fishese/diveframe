# Session: composer preset redesign (2026-08-08)

## Branch

`feature/compose-preset-redesign`, merged into `main` after verification.

## Classification

**APK-affecting.** The work changes shared composer UI, rendering, translations,
styles, and the bundled dive-site catalog. The web app and Android package must
ship from the same release commit.

## Delivered

- Replaced the retired composer templates with four presets: Bottom Profile,
  Right Information Panel, Bottom Stats Dock, and Solid Info Band.
- Added a shared edge-based panel engine, preset-owned chart homes, free-float
  chart offsets, customizable stat layouts, and optional dock/band dividers.
- Restored the classic Bottom Profile and Right Information Panel proportions.
- Refined Dock icon graphics, centering, and responsive one-/two-row sizing.
- Refined Solid Info Band typography and moved its seeded logo to the photo's
  top-right to avoid the site/date block.
- Reduced the mobile preset picker to compact name-only buttons.
- Updated the bundled dive-site catalog.
- Kept every seeded preset choice reproducible through the customization UI.

## Product decisions

- Four presets only; retired IDs normalize to Bottom Stats Dock.
- No compatibility layer for pre-existing custom presets.
- Charts default on; panels support all four edges; chart offsets remain free.
- English overlay labels use Max Depth, Avg Depth, and Avg Temp.
- Bottom Stats Dock defaults to Dive Time, Max Depth, and Avg Temp.
- Solid Info Band defaults to Dive Time, Max Depth, Avg Temp, and Gas Mix.

## Verification

- Full web build, TypeScript check, and automated test suite.
- Browser visual checks for all four presets, including the Dock's 3-item and
  6-item layouts and the compact mobile preset selector.
- Dive-site catalog validation.
- Capacitor native sync and Android `assembleDebug` for APK 1.0.21
  (`versionCode 22`).

## Dogfood release

- GitHub tag: `v0.1.0-debug.19`
- Release/source commit: `cce6fa1ffd82ef3d0682fd910b3882a149f7e6e0`
- Asset: `diveframe-debug.apk` (15,828,183 bytes)
- SHA-256:
  `AC4EC92688EF32AAC63C2745C4017B93B73F88D7363A6F9BF2FBC2B6EBCF48B6`
- Stable download:
  https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk
- Debug-signed arm64 package; classic Shearwater Bluetooth only. Perdix 3 is
  not supported.
