# Session notes — BLE product import on Android (2026-08-01)

## Where things stand

Product Bluetooth download works on hardware (Peregrine, Perdix 2) through the
main DiveFrame Android app. Incremental persist, transfer UX polish, packaging
the real app into the APK, trips / user GPS / filters, offline supplementary
catalog + What's new, and Shearwater computer GPS from BLE samples are
committed and pushed on `main` (`09e3d65` and earlier).

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

### App file exports

- The Android WebView silently ignores `<a download>` blob URLs, so **Export
  app data** appeared to do nothing in the APK.
- `FileExportPlugin` (`beginFile` / `writeChunk` / `finishFile` / `abortFile` /
  `shareFile`) streams base64 chunks into the public Downloads folder via
  MediaStore; `lib/file-export.ts` picks that path on Android and keeps the
  anchor download on the web.
- All exports go through it: backup, added-site log, merged catalog, updated
  Subsurface file, composer image, share card. Status lines report the saved
  file name, and **Send a copy** opens the Android share sheet after a backup.
- Settings now omits the browser install/storage card inside the APK, so the
  PWA install blurb and the former **This device's logbook** card do not show.

## Dive-computer GPS (Shearwater GNSS)

Symptom: the GPS list filter matched nothing even though some Perdix 2 dives had
coordinates in Shearwater's own log.

Root cause was ours, not the download. libdivecomputer does not expose Shearwater
GPS as a parser field — `shearwater_predator_parser.c` has no `DC_FIELD_LOCATION`
case and instead emits `DC_SAMPLE_LOCATION` from `dc_parser_samples_foreach`, on
the first and last sample. `sample_cb` in `diveframe_dc.c` only handled
`DC_SAMPLE_TIME` / `DC_SAMPLE_DEPTH`, so the fix was discarded and
`previewToImportedDive` hardcoded `gpsEntryLat: null`.

Verified against the on-device backup: of 128 raw records (log versions 13 ×10,
14 ×86, 17 ×32), 4 dives carried a real 3D fix and 1 also had an exit fix. GNSS
needs log version ≥ 17 *and* a satellite lock, so most dives having none is
expected.

Fixes (shipped on `main`):

- Native `sample_cb` keeps the first location as entry and the latest as exit,
  passed via `ParsedDive.setEntryLocation` / `setExitLocation` and
  `gpsEntryLat/Lng` + `gpsExitLat/Lng` in the plugin JSON.
- Normalizer + persist no longer force computer GPS to `null`.
- The one-time Settings backfill button was run on this device and then removed
  from the shipped app. The raw-bytes extractor and offline backup repair CLI
  live under `scripts/archive/shearwater-gps-backfill/` for reuse if another
  missing field needs the same pattern later.

## Place names / nearby sites on the APK

Symptom: dive detail stuck on “Resolving GPS location…”, site title stays
unnamed, map still shows the pin.

Cause: the APK calls `https://divelog.fishese.cc/api/geocode` (and nearby-sites).
Production returns 200 JSON but **no** `Access-Control-Allow-Origin` for
Capacitor (`https://localhost`), so the WebView drops the response. Local
`vinext` already sends CORS via `lib/api-cors.ts` — that code is simply not on
the live worker yet.

Mitigations in tree:

- Bundled `dive-sites.json` is queried client-side for nearby suggestions so the
  site picker works without the hosted API.
- Failed reverse-geocode attempts stop the perpetual “Resolving…” spinner and
  show place-name unavailable.
- Native builds can override the API origin with
  `NEXT_PUBLIC_DIVEFRAME_API_ORIGIN` (LAN `vinext` for verification). Deploying
  CORS to production is the lasting fix.

## Offline catalog + What's new (2026-08-01)

Persistent supplementary `dive-sites.json` (IndexedDB v9, backup/restore) and
Settings **What's new** (API feed, cached preferences, APK download links) are
shipped on `main` and documented in `USER-GUIDE.md` / `PRODUCT-SPEC.md`. Plan:
`docs/superpowers/plans/2026-08-01-offline-catalog-whats-new.md`.

## Resume checklist

1. Before every push, apply `docs/WEB-APK-SYNC.md`: classify the change as
   web-only or APK-affecting, and rebuild/publish `diveframe-debug.apk` from the
   same commit for shared client or native changes.
2. Smoke-test cancel-with-summary / crash-keeps-dives on device when convenient
   (do not `adb install` while a download is running).
3. Re-verify **Export app data** and GPS filter on device after the GNSS persist
   fix (new BLE imports should carry computer GPS when the computer recorded a
   lock).
4. Re-download at least one Perdix 2 dive with AI to smoke-test parser contract
   v1.2: temperature samples, tank-indexed pressure samples, exact dive mode,
   atmosphere/salinity/decompression metadata, and tank metadata. Physical tank
   series remain independent for later twin/sidemount display grouping.
5. Deploy production CORS for Capacitor origins on geocode / nearby / what's-new.
6. Next product steps:
   - Trip / user-GPS editors — **done** on `main`
   - Site display alias chips — **done** on `main`
   - BLE hardening / failure matrix / privacy–LGPL release work
   - About copy: classic Shearwater BLE only (not Perdix 3)
7. Parked / lower priority: pinned in-app download strip; PC Web Bluetooth;
   background notification / foreground service

## Known leftovers

- Spike shell remains as `npm run native:spike` for research.
- Creating a *replacement* root `vite.config.ts` that drops vinext/cloudflare
  plugins breaks the production build — keep the existing vinext config.
- Web Bluetooth / PC download: deliberately deferred.
- vinext static export on Windows may abort during Node teardown after a
  successful prerender; `scripts/build-native-web.mjs` continues when
  `dist/client/index.html` is valid.
- Production hosted APIs still need Capacitor CORS headers.
- **About / product copy (later):** Bluetooth import supports classic
  Shearwater BLE computers only (not Perdix 3). Other brands: use Subsurface
  (or Shearwater Cloud DB, UDDF, FIT) and import that file into DiveFrame.
