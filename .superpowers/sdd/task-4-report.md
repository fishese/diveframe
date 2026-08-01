# Task 4 Report: User GPS + map resolution + JPEG EXIF

## Status

**DONE**

**Branch:** `feature/trip-user-gps-editors`
**Commit:** (this task's commit) — Add user GPS editing, map resolution, and JPEG EXIF import.

## Summary

Added `resolveDiveMapCoordinates` (computer GPS → user GPS → null) and a dependency-free `readJpegExifGps` JPEG EXIF GPS-IFD reader, both covered by `tests/dive-gps.test.mjs` written first (TDD). Wired the map card in `DiveDetail` to prefer `resolveDiveMapCoordinates` before falling back to name geocoding, and added a "Edit location" panel (lat/lng inputs, Save, Clear, "Use location from photo") backed by the existing `updateLocalDiveUserGps` writer. Computer `gpsEntry*` fields are never read from or written to by any of this new code.

## Files changed

| File | Action |
|---|---|
| `lib/dive-gps.ts` | Created — `resolveDiveMapCoordinates` |
| `lib/photo-exif-gps.ts` | Created — `readJpegExifGps` (minimal JPEG EXIF GPS-IFD parser) |
| `tests/dive-gps.test.mjs` | Created — resolution-order + EXIF null/valid tests (TDD, written before implementation) |
| `tests/fixtures/jpeg-exif-gps.mjs` | Created — programmatic JPEG/EXIF/GPS-IFD buffer builder used by the tests (no binary fixture checked in) |
| `app/DiveFrameApp.tsx` | Modified — `saveDiveUserGps` wrapper, `DiveDetail` map-source switch, GPS editor UI |
| `lib/app-i18n.ts` | Modified — new location strings (EN, zh-Hant, ja) |
| `package.json` | Modified — added `tests/dive-gps.test.mjs` to the `test` script |
| `tests/app-contract.test.mjs` | Modified — asserts for new imports/wiring |

## Dependency decision: minimal reader vs. `exifr`

Chose a **minimal hand-written GPS-IFD reader** over adding the `exifr` dependency:
- Only need `GPSLatitude`/`GPSLongitude`/refs — a tiny slice of what `exifr` parses (EXIF/IPTC/XMP/ICC/etc.).
- Avoids a new runtime dependency (bundle size, supply-chain surface, and an `npm install` in this pass).
- ~180 lines, fully covered by tests including hemisphere sign handling (S/W negative), EXIF-without-GPS, and non-JPEG input.

Trade-off: doesn't handle orientation-sensitive edge cases or other EXIF quirks `exifr` hardens against (e.g., some encoders' non-standard segment ordering); acceptable for "read GPS off a phone/camera JPEG" scope. Documented here per the brief's "pick one and document" instruction.

## What shipped

### `lib/dive-gps.ts`

`resolveDiveMapCoordinates({ gpsEntryLat, gpsEntryLng, userGpsLat, userGpsLng })` → `{ latitude, longitude, source: "computer" | "user" } | null`. Computer pair wins whenever both its fields are non-null; user pair is used only when the computer pair is incomplete; returns `null` when neither pair is complete (caller falls back to geocoding).

### `lib/photo-exif-gps.ts`

`readJpegExifGps(buffer: ArrayBuffer): Promise<{ latitude, longitude } | null>` — scans JPEG marker segments for APP1/`Exif\0\0`, parses the TIFF header (little/big-endian), reads IFD0 for the GPS-IFD pointer tag (`0x8825`), then reads `GPSLatitudeRef`/`GPSLatitude`/`GPSLongitudeRef`/`GPSLongitude` (DMS rationals) from the GPS IFD, applying S/W sign flips. Returns `null` for non-JPEG input, JPEGs without EXIF, EXIF without a GPS IFD, or a degenerate `(0, 0)` result. All parsing is wrapped in try/catch → `null` on any malformed input.

### Map wiring (`DiveDetail`)

- `mapCoordinates = resolveDiveMapCoordinates(dive)` computed once; the geocode-fetch effect and `mapLookup`/`mapLatitude`/`mapLongitude` derivations now key off `mapCoordinates` instead of the old computer-only `hasGps` check — geocoding only runs when both GPS pairs are absent.
- Map card heading now distinguishes `t("entryLocation")` (computer), `t("yourLocation")` (user), and the existing approximate/finding/none states; a source line under the map shows `t("locationSourceManual")` or `t("locationSourcePhotoExif")` when showing user GPS.
- The pre-existing computer-GPS-only `hasGps` (nearby-site lookup, manual-site-save coordinates, site-picker visibility) is untouched — those stay tied to the dive computer's `gpsEntry*` fields specifically, since Task 4's brief only asked for the map/display switch.

### User GPS editor UI

- New "Edit location" toggle in the map card opens lat/lng number inputs (client-validated to ±90/±180) plus **Save location** (`source: "manual"`), **Clear location** (`updateLocalDiveUserGps(id, null)`, disabled when no user GPS is set), and **Use location from photo**.
- "Use location from photo" iterates the current dive's `attachments`, filters to JPEG content types, reads each blob via `arrayBuffer()` → `readJpegExifGps`, and saves the first hit with `source: "photo-exif"`; shows a status string (`searchingPhotosForLocation` → `noPhotoLocationFound`/`photoLocationSaveFailed`) on miss/failure, per-photo errors are swallowed and the loop continues to the next photo.
- Drafts re-sync from `dive.userGpsLat`/`userGpsLng` via a `useEffect` keyed on `[dive.id, dive.userGpsLat, dive.userGpsLng]` (same pattern as the existing trip-draft resync), so stale drafts don't survive a save/clear or switching dives.
- No `exportGpsPreference` UI was added (per global constraint — default stays `"computer"`, unconfigurable this round).

### i18n

Added 18 new keys (`yourLocation`, `locationSourceManual`, `locationSourcePhotoExif`, `editLocation`, `latitude`, `longitude`, `saveManualLocation`, `clearLocation`, `useLocationFromPhoto`, `invalidLocationValues`, `savingLocation`, `clearingLocation`, `locationSaved`, `locationCleared`, `locationSaveFailed`, `searchingPhotosForLocation`, `noPhotoLocationFound`, `photoLocationSaveFailed`) to `en`, `zhHant`, `ja` — the `Record<keyof typeof en, string>` type on `zhHant`/`ja` means TypeScript build fails if any language is missing a key, which the passing `npm run build` step confirms.

## Deviations from brief

- Brief's Step 3 wording didn't specify where the lat/lng editor lives; placed it inside the existing `map-card` (directly under the map/placeholder) rather than inside the separate "Edit" details form, since it's conceptually part of "dive position" and independent of the buddy/notes/trip save-on-submit flow — Save/Clear/photo-import are each immediate actions, consistent with how trip rename/delete work as immediate actions in Task 3.
- Used a programmatic fixture builder (`tests/fixtures/jpeg-exif-gps.mjs`) instead of a binary `.jpg` fixture file, per the brief's explicit "(or inline base64)" alternative — this is more transparent for review than base64 and lets tests construct edge cases (no-GPS EXIF, non-JPEG) without extra binary files.

## Tests

```
node --test tests/dive-gps.test.mjs
```
8/8 pass (resolution: prefers computer, falls back to user, null when neither, ignores partial computer pair; EXIF: reads N/E, reads S/W with sign flip, null for EXIF-without-GPS, null for non-JPEG).

```
node --test tests/app-contract.test.mjs
```
1/1 pass (new asserts for `dive-gps`/`photo-exif-gps` imports, `onSaveUserGps`, `user-gps-editor`, `source: "manual"`/`"photo-exif"`, absence of `exportGpsPreference`).

```
npm test
```
Runs `vinext build` (TypeScript + bundling) then the full `node --test` suite: **67 pass, 3 skipped (pre-existing, native/offline-only), 0 fail**.

## Self-review

### Correctness vs. brief/design

- Resolution order matches the brief's two example tests exactly (verified via the literal assertions) plus added edge cases (`null` when neither pair complete; partial/inconsistent computer pair falls through to user).
- Map now uses `resolveDiveMapCoordinates` before geocode; geocode fetch only fires when neither GPS pair is present, matching "Geocode remains when both GPS pairs absent."
- `updateLocalDiveUserGps` (pre-existing from Task 2) is the only write path touched — clears all four `userGps*` fields on `null`, never reads/writes `gpsEntry*`. Confirmed by re-reading its implementation; not modified in this task.
- No `exportGpsPreference` UI added (contract-asserted `doesNotMatch`).
- No trip/alias/date-filter logic touched (out of scope for Task 4, confirmed via diff review — only `dive-gps.ts`, `photo-exif-gps.ts`, their tests, i18n, and the map/GPS-editor section of `DiveDetail`/`DiveFrameApp` changed).

### Known minor gaps / edge cases

- The minimal EXIF reader assumes standard TIFF GPS-IFD layout (as most phone/camera JPEGs use); it will silently return `null` (not throw) for GPS data stored in non-standard structures — acceptable given the try/catch-to-null contract the brief specifies ("Return `null` when no GPS / not JPEG").
- `readJpegExifGps` treats an exact `(0, 0)` GPS reading as absent (some cameras/apps write all-zero GPS blocks when location is unavailable rather than omitting the IFD); a genuine dive at `(0, 0)` — off the coast of Ghana — would be treated as "no location." Considered acceptable given how unlikely that exact coordinate is for a real dive.
- No dedicated browser/runtime smoke test of the new UI (attachments blob → EXIF → save round trip) was performed in this pass — only the pure-function unit tests and static contract asserts, consistent with prior tasks' testing approach for `indexed-db`-backed UI flows.

## Concerns

None blocking. Recommend a quick manual smoke test (open a dive with a GPS-tagged JPEG photo attached, use "Use location from photo," confirm the map switches to "Your location" and Clear correctly reverts to geocode/no-map state) before relying on this in production data.
