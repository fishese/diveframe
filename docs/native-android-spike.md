# Android capture spike

Status: **capture path validated on hardware** (research shell). Product
Bluetooth import lives in the main DiveFrame Android app (`BleImportPanel`);
this spike remains a non-persisting research shell (`npm run native:spike`).

## Current status (2026-08-01)

| Area | State |
|---|---|
| Capacitor Android + pinned libdivecomputer (JNI) | Working |
| Permissions / Shearwater BLE scan / cancel | Working |
| Classic GATT + ATT MTU negotiation (517) | Working |
| `dc_custom_open` download + `dc_parser` | Working |
| Multi-dive limit (1–50) + progress / diveCaptured events | Working |
| Fingerprint checkpoint (`dc_device_set_fingerprint`) | Working |
| In-memory incremental “new since last FP” in spike UI | Working |
| Map BLE capture → import-shaped preview (no persist) | Working |
| Save full capture fixture (Downloads via MediaStore) | Working |
| Offline BLE↔Cloud identity matcher (fixture-driven) | Working — 5/5 high matches on Perdix 2 |
| IndexedDB v8 + raw/checkpoint/trips stores | **Shipped** (destructive upgrade once; spike still non-persisting) |
| IndexedDB v9 supplementary catalog + What's new prefs; v10 missing-store repair | **Shipped** (additive) |
| Production Import UI | **Shipped** — `BleImportPanel` in main app; spike shell still separate |
| Shearwater GNSS via `DC_SAMPLE_LOCATION` → dive GPS fields | **Shipped** in product BLE path |
| Native Downloads export (`FileExportPlugin`) | **Shipped** |

### Hardware exercised

| Computer | Firmware notes | Result |
|---|---|---|
| Shearwater Peregrine | model 9, firmware 89, serial `9DEC6F1A` | Single-dive download + parse OK after MTU fix |
| Shearwater Perdix 2 | model 11, firmware 102, serial `A8E705BD` | Download up to 5 OK; “new since last FP” returned `diveCount: 0` with `fingerprintHexUsed` set |

Perdix 3 remains out of scope (different GATT service).

### Known deliberate limits

- Spike returns downsampled depth profiles for UI (full raw bytes still in
  `dataBase64`); full-resolution sample arrays are not yet mirrored into the
  web import model.
- Fingerprint checkpoints in the spike UI are **process memory only**, not the
  planned `deviceCheckpoints` store.
- `persisted` is always `false`.
- Logging is mostly `WARNING` on-device; `logTail` is quiet unless errors occur.

## Schema / erase-reimport gate

IndexedDB v8 is live: destructive recreate of all stores, backup format v3,
and store coverage in `lib/store-manifest.ts`. The spike UI still keeps
`persisted: false` and does not call `persistBleImport` — wire that from the
product import flow, not this research shell. Overlay fields for user GPS,
trips, and a future generate-from-DiveFrame Subsurface/UDDF export are in
`docs/2026-07-30-indexeddb-v8-planning.md`. This checkpoint only returns
capture payloads (and an import-shaped preview)
to the temporary native screen.

## Purpose

The spike keeps native uncertainty isolated from the production web app. Its
current checkpoint proves:

- the Capacitor Android shell builds with linked libdivecomputer;
- the local JavaScript-to-Java bridge is available only in the native shell;
- JNI loads a pinned libdivecomputer build and reports its version/commit;
- Android 12+ requests only `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` (with
  `neverForLocation`);
- scan results are filtered to libdivecomputer Shearwater advertisement names;
- classic Shearwater GATT (`fe25c237-…` / `27b7570b-…`) can connect, raise the
  ATT MTU, and enable notifications;
- cancel stops an active scan, download, or GATT session;
- `downloadDives` can open the matching Shearwater descriptor, optionally set
  a fingerprint checkpoint via `dc_device_set_fingerprint`, run
  `dc_device_foreach` for up to 50 dives, emit `downloadProgress` /
  `diveCaptured` events, parse each raw dive with `dc_parser`, and return
  device info plus structured fields and raw bytes/fingerprints without
  persisting them; and
- a TypeScript normalizer can project that payload into an import-shaped
  preview (identity + fields) without calling `upsertLocalDives`.

## ATT MTU

libdivecomputer reads Shearwater packets of up to 514 bytes
(`BLE_MTU_MAX`), so the transport requests an MTU of 517 after service
discovery and only enables notifications once the negotiation settles. On the
default 23-byte ATT MTU the controller silently truncates replies at 20 bytes,
which strips the trailing SLIP `END` byte and makes every response time out.

Downloads also return a `logTail` with libdivecomputer's own log lines; the
same output goes to logcat under the `DiveFrameDC` and `DiveFrameGatt` tags.

## Offline capture fixtures

Prefer developing against a saved capture instead of re-pairing the computer
for every change.

1. On device: download one or more dives, then tap **Save full capture**.
   The spike writes a JSON file into the phone’s **Downloads** folder via
   Android MediaStore (WebView “download” links are unreliable and often do
   nothing). The on-screen result shows `filename`, `location`, and a hint.
2. Copy that file to the PC (USB, Nearby Share, etc.) into
   `fixtures/ble/` (gitignored; contains serial + raw bytes).
3. Point tests at it:

```powershell
$env:BLE_CAPTURE_FIXTURE="D:\Projects\Dive log\web\fixtures\ble\your-file.json"
$env:SHEARWATER_DB_FIXTURE="D:\Projects\Dive log\Shearwater Cloud 2026-07-27.db"
npm test
```

Re-capture from the computer when GATT/MTU/libdivecomputer behavior might have
changed, at a milestone regression check, or when adding a new model/firmware
to the matrix. Routine normalizer and identity work should use the fixture.

### Identity findings (Perdix 2, 2026-08-01)

Local fixture `fixtures/ble/perdix-2-a8e705bd-2026-07-31.json` (5 dives) vs
`Shearwater Cloud 2026-07-27.db` (189 Cloud dives):

| BLE fingerprint | Cloud DiveId | Cloud # | Confidence |
|---|---|---|---|
| `6A3FDA66` | `1493580231782569574` | 31 | high |
| `6A3FCE50` | `1493580231782566480` | 30 | high |
| `6A2D597A` | `1493580231781356922` | 29 | high |
| `6A2D35D7` | `1493580231781347799` | 28 | high |
| `6A1C5532` | `1493580231780241714` | 27 | high |

All five matched on serial (hex ↔ decimal), identical local datetime (0s skew),
duration, and max depth (`lib/ble-cloud-identity.ts`). No unmatched BLE dives.

Settled for now:

- BLE durable id = libdivecomputer fingerprint hex (not Cloud `DiveId`).
- Cross-source link to Shearwater Cloud uses serial + device-local datetime +
  duration + max depth; do not invent a shared id from Cloud alone.
- `shearwater-ble` is a real `DiveSource`; product UI should call
  `persistBleImport` / `persistBleCaptureFromFixture`, not the spike shell.
- Spike download responses still set `persisted: false` until that UI exists.

Report helper: `node scripts/report-ble-cloud-identity.mjs` (same env vars).

## Fingerprint checkpoints

`downloadDives({ fingerprintHex })` passes the hex-decoded bytes to
`dc_device_set_fingerprint`. Shearwater stops when that dive is reached and
does not include it. The spike UI keeps the last `newestFingerprintHex` in
memory so incremental downloads can be exercised without persistence.

## Reproduce the native build

1. Run `powershell -ExecutionPolicy Bypass -File
   scripts/fetch-libdivecomputer.ps1`.
2. Run `npm run native:sync`.
3. Open the `android` directory in Android Studio or build the `assembleDebug`
   target with its bundled Java runtime and the installed Android SDK.
4. On device: request permissions → scan → connect → **Download 1 dive** or
   **Download up to 5**. After a success, **New since last FP** reuses the
   returned `newestFingerprintHex` as the next checkpoint (in-memory only for
   this spike; not stored in IndexedDB).

## Testing the product app on device

The APK packages a **static export of the real DiveFrame app** into
`dist-native` (`npm run native:web` -> `scripts/build-native-web.mjs`). The
research spike remains available as `npm run native:spike`. Geocode /
nearby-sites calls from the APK hit `https://divelog.fishese.cc` (CORS for
Capacitor localhost origins). Logbook data stays on-device.

Optional live-reload against a PC server:

1. `npm run dev:lan`
2. `adb reverse tcp:3000 tcp:3000`
3. `$env:DIVEFRAME_NATIVE_SERVER_URL="http://localhost:3000"; npx cap sync android`
4. Rebuild and install the **debug** variant; only debug allows cleartext http.

Use `http://localhost:3000` with `adb reverse` rather than a LAN address.
`crypto.subtle` exists only in a secure context, and a LAN origin such as
`http://192.168.x.x:3000` is not one, so raw-record hashing in
`ble-persist.ts` fails with `Cannot read properties of undefined (reading
'digest')` after a download completes. `http://localhost` is treated as
trustworthy, and production Capacitor builds serve `https://localhost`, so
neither hits this. Re-run `adb reverse` after the device reconnects.

On native platforms the app unregisters the PWA service worker and clears its
caches (`PwaManager`). The worker is cache-first on stable module URLs, which
pinned stale BLE UI during LAN/dev testing.

Clear `DIVEFRAME_NATIVE_SERVER_URL` and re-run `npm run native:sync` to go back
to the bundled product app.

The exact source is tracked as the Git submodule at
`android/app/src/main/cpp/vendor/libdivecomputer`. Its gitlink must match the
commit recorded in `android/app/src/main/cpp/libdivecomputer.pin`; generated
version headers and compiled artifacts remain untracked. The matching upstream
Android source list is retained in `libdivecomputer-sources.cmake`. CMake is
used instead of ndk-build because the latter cannot configure a project from
this workspace's space-containing path.

## Current boundary

The research spike still does **not** write the logbook (`persisted: false`).
Product Android builds expose **Download from computer** in the main app
(`BleImportPanel` → `runBleImportSession` → `persistBleImport`), including
Last N / Last 200 / Full import and new-since-last-sync. Native `limit <= 0`
means unlimited enumeration for full import.

## Licensing gate

libdivecomputer is LGPL-2.1-or-later. The spike dynamically links its shared
library. Before distributing an APK, complete the planned compliance review,
ship all required notices, retain the exact corresponding source, and document
a practical relinking/replacement path. A public source URL alone is not
treated as sufficient release evidence.
