# Session notes — BLE product import on Android (2026-08-01)

## Where things stand

Product Bluetooth download is working on hardware (Peregrine) through the main
DiveFrame app, not the spike shell.

Validated on device:

- Scan → connect → **Last N** history download and persist into IndexedDB v8
- Merge: later **Last 15** reported `7 new / 8 already present` after an earlier
  **Last 8**
- Folded sync UI after a checkpoint exists: primary **Download new dives**,
  always-visible **Get more history** (Last N / Last 200 / Full under Advanced)

## What changed this session (uncommitted unless you commit later)

### Serving the real app in the APK (dev)

- Capacitor still packages `dist-native` (spike) by default.
- Optional `DIVEFRAME_NATIVE_SERVER_URL` in `capacitor.config.ts` points the
  debug shell at a live DiveFrame server.
- Debug-only cleartext: `android/app/src/debug/AndroidManifest.xml`
- Script: `npm run dev:lan` (`vinext dev -H 0.0.0.0`)
- **Must use** `http://localhost:3000` + `adb reverse tcp:3000 tcp:3000`, not a
  LAN IP — `crypto.subtle` / `randomUUID` need a secure context.

### BLE panel / session

- `app/components/BleImportPanel.tsx` — product import UI
- `lib/ble-import-session.ts` — orchestration (history vs incremental, limits)
- Connect allowed while scanning; native session adopted on reopen and released
  on close; explicit **Disconnect**; recover from stale `READY` before scan/connect
- Folded sync: no sync-mode radios; intent implied by which button is pressed
- Last N: clearable text field + −/+ steppers
- Native unlimited full import: `limit <= 0` in Java/C (already from prior work)

### Native packaging / 16 KB pages

- `android/app/src/main/cpp/CMakeLists.txt` — 16 KB page-size linker flags for
  `libdivecomputer` and `diveframe_dc`

### Service worker vs Capacitor

- Native platforms unregister the PWA service worker and clear `diveframe-*`
  caches (`app/PwaInstall.tsx`). Cache-first SW was pinning stale module URLs
  during LAN/dev testing. Cache name bumped to `diveframe-shell-v4`.

### Docs updated

- `docs/USER-GUIDE.md` — folded Android download UX
- `docs/native-android-spike.md` — product UI status + secure-context / SW notes
- `docs/superpowers/plans/2026-07-30-shearwater-ble-import.md` — Product UX note

## Resume checklist (when you return)

1. Confirm `npm run dev:lan` is running and `adb reverse tcp:3000 tcp:3000` is
   listed (`adb reverse --list`). Rebuild only if Capacitor server URL changed.
2. Optional: commit the uncommitted tree (large — ask before committing).
3. Likely next product steps (pick when you are back):
   - Package the real app into the APK (static export / option C) so testing
     does not need the PC dev server
   - Hardening / failure matrix / privacy–LGPL release work from the BLE plan
   - Trip / user-GPS editors (v8 fields exist; editors not productized)
   - PC Web Bluetooth remains deferred

## Known leftovers

- Spike shell (`native-spike/`, `dist-native`) is still the default packaged
  webDir; product path is via `DIVEFRAME_NATIVE_SERVER_URL` in debug.
- Creating a root `vite.config.ts` breaks vinext’s production build entry —
  do not use that to ignore `android/` watch noise.
- Web Bluetooth / PC download: deliberately deferred; reuse
  `diveComputerCapability` + persist path later if wanted.
