# Session: memo–dive match + shared top bar (2026-08-06)

## Branch

`feature/memo-dive-match` → merged to `main`

## Classification

**APK-affecting.** Shared web UI (memo match hints, top bar, dive navigation,
composer chrome) plus Android `versionCode` bump. Rebuild and publish the debug
APK from the same commit.

## Delivered

### Memo ↔ dive match hints

- Soft hints on dive detail when the dive lacks a place name and ≥1 memo is
  within ±24h; heading **Possible Memo Match** with callout styling.
- Always show nearby-dive hints on `/memos`.
- Progressive windows (±6h preferred, ±12h / ±24h expand), apply empty fields,
  per-field copy, post-apply Keep/Delete; missing memo hour defaults to 10:00 AM.

### Shared top bar (`AppTopbar`)

- Order: Home (when not on list) → About (except compose) → Settings →
  Bluetooth/Android app → Memo notepad → Import log (last three / About hidden
  on Image Compose).
- Brand on dive-related surfaces returns to the dive list at the current dive
  (pinned to the top of the viewport); Home on dive edit matches Brand.
- Composer: Home + back arrow to `/?dive=…`, Export; no import cluster.

### Dive edit / list navigation

- Opening a dive hides the overview on mobile and lands on the dive number.
- Share image scrolls to the gallery (safe scroll, no yank-back).
- Dive date shows **HH:MM** next to the calendar date.
- Delete dive moved to bottom left, away from Create share image.

## Dogfood / release

- APK **1.0.18** (`versionCode 19`), GitHub tag **`v0.1.0-debug.16`**, asset
  `diveframe-debug.apk`, commit `5dc6740`.
- SHA-256:
  `12B1A80CA0A53C22D5E33875D494B45B9A28B0E896559F012C3100A58A461EFB`.
- Stable download:
  https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk
