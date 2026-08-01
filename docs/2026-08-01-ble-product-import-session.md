# Session notes — BLE product import on Android (2026-08-01)

## Where things stand

Product Bluetooth download works on hardware (Peregrine, Perdix 2) through the
main DiveFrame Android app. Incremental persist, transfer UX polish, and
packaging the real app into the APK are committed on `main`.

Validated on device:

- Scan → connect → **Last N** history download and persist into IndexedDB v8
- Merge: later **Last 15** reported `7 new / 8 already present` after an earlier
  **Last 8**
- Folded sync UI after a checkpoint exists: primary **Download new dives**
  (last-synced date inline), always-visible **Get more history** (Last N /
  Last 200 / Full under Advanced)
- Typing or stepping Last N selects that radio even if Last 200 / Full was
  selected
- Cancel mid-transfer keeps already-saved dives; checkpoint advances only on
  successful completion
- Summary shows computer + date range of newly saved dives

## Shipped this session

### Product APK packaging

- `npm run native:sync` builds a static DiveFrame export into `dist-native`
  (no PC server required for the shipped APK).
- Optional LAN live-reload still uses `DIVEFRAME_NATIVE_SERVER_URL` +
  `adb reverse tcp:3000 tcp:3000` with `http://localhost:3000` (secure
  context). Spike shell remains `npm run native:spike`.

### Incremental persist

- Spec/plan:
  `docs/superpowers/specs/2026-08-01-ble-incremental-persist-design.md`,
  `docs/superpowers/plans/2026-08-01-ble-incremental-persist.md`
- Native `diveCaptured` streams `dataBase64` + parsed fields; JS persists each
  dive as it arrives.
- Cancel / process kill keeps already-saved dives; sync checkpoint still
  advances only on successful completion.

### Transfer UX

- Status-bar safe-area insets
- **Download history** primary styling; last synced beside **Download new**
- During transfer: no accidental backdrop dismiss; Cancel confirms; Close
  while downloading cancels only and stays open for the summary
- Android `FLAG_KEEP_SCREEN_ON` during BLE transfer only
- Last N field / steppers auto-select the Last N radio

## Resume checklist

1. Smoke-test cancel-with-summary / crash-keeps-dives on device when convenient
   (do not `adb install` while a download is running).
2. Next product steps:
   - Trip / user-GPS editors — **done** on `feature/trip-user-gps-editors`
     (list blocks, select mode, details assignment, user GPS + JPEG EXIF, alias
     chips, date/computer filters + reset)
   - Site display: pick a catalog alias or type a custom name — **done** on
     same branch (alias expand-in-picker)
   - BLE hardening / failure matrix / privacy–LGPL release work
   - About copy: classic Shearwater BLE only (not Perdix 3)
3. Parked / lower priority: pinned in-app download strip; PC Web Bluetooth;
   background notification / foreground service

## Known leftovers

- Spike shell remains as `npm run native:spike` for research.
- Creating a *replacement* root `vite.config.ts` that drops vinext/cloudflare
  plugins breaks the production build — keep the existing vinext config.
- Web Bluetooth / PC download: deliberately deferred.
- vinext static export on Windows may abort during Node teardown after a
  successful prerender; `scripts/build-native-web.mjs` continues when
  `dist/client/index.html` is valid.
- **About / product copy (later):** Bluetooth import supports classic
  Shearwater BLE computers only (not Perdix 3). Other brands: use Subsurface
  (or Shearwater Cloud DB, UDDF, FIT) and import that file into DiveFrame.
