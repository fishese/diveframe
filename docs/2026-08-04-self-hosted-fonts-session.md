# 2026-08-04 self-hosted overlay fonts

## Done

- Replaced Google Fonts `@import` with committed OFL WOFF2 under `public/fonts/`
  and `app/overlay-fonts.css`.
- Maintainer refresh: `npm run bundle:overlay-fonts` (Node only).
- Documented OFL in `ASSET-LICENSES.md` and About `aboutAssetLicense`.
- Kept Noto Sans TC as default; `SYSTEM_OVERLAY_FONT_STACK` unchanged for later.

## Classification

Shared client CSS + `public/` assets — **APK-affecting**. Rebuild/publish APK
from the same commit when this lands on `main` if dogfooding needs offline
compose fonts on Android.

## Manual check

- Web Compose with network blocked / airplane mode: overlay fonts still render.
- APK Compose offline: same families available without Google Fonts requests.

## Follow-up

See `docs/FDROID-PATH.md` (outline only; release process unchanged).
