# 2026-08-04 self-hosted overlay fonts

## Done

- Replaced Google Fonts `@import` with committed OFL WOFF2 under `public/fonts/`
  and `app/overlay-fonts.css`.
- Maintainer refresh: `npm run bundle:overlay-fonts` (Node only); rebundle now
  prunes orphan `.woff2` / `OFL-*.txt` files not referenced by the new set.
- Documented OFL in `ASSET-LICENSES.md` and About `aboutAssetLicense`.
- Kept Noto Sans TC as default; `SYSTEM_OVERLAY_FONT_STACK` unchanged for later.
- Android debug APK **1.0.14** (`versionCode 15`) built from `37e7dd0`, installed
  via wireless adb. Airplane-mode Compose on device: preview overlays render
  without Google Fonts (bundled `/fonts/*.woff2` inside the APK).

## Classification

Shared client CSS + `public/` assets — **APK-affecting**.

## Manual check

- Local CSS↔disk mapping: 231 unique `/fonts/` WOFF2 refs, 0 missing.
- APK packages 231 overlay WOFF2 under `assets/public/fonts/`.
- Device airplane-mode Compose: Export image / Ready preview with overlay
  duration, depth, temperature, and gas labels visible while airplane mode was
  on (Wi-Fi left enabled for wireless adb).

## Follow-up

- Publish GitHub `v0.1.0-debug.14` / replace `diveframe-debug.apk` when ready
  so `releases/latest` matches dogfood.
- Push local `main` so Cloudflare web/PWA picks up self-hosted fonts.
- See `docs/FDROID-PATH.md` (outline only; release process unchanged).
