# IndexedDB schema v8 planning: BLE stores + future-proofing

Status: **implemented** (2026-08). IndexedDB `DATABASE_VERSION` is 8 with a
destructive upgrade that deletes and recreates all stores. Backup format is v3.
Store coverage lives in `lib/store-manifest.ts`. BLE persistence helpers are in
`lib/ble-persist.ts` (`persistBleImport` / fixture prepare / incremental
captured-dive prepare). Product Android BLE download into the logbook is
shipped (`BleImportPanel`). Trip assignment, user GPS editing (manual + JPEG
EXIF), catalog alias display, and date/computer list filters shipped on the
shared web/Android UI (2026-08-01). The native spike shell remains
non-persisting for research.

Capture status (2026-08): Shearwater classic BLE download + `dc_parser`
summaries work on real Peregrine and Perdix 2 hardware, including multi-dive
limits, fingerprint checkpoints, and per-dive incremental persist. Preview
normalizer: `lib/ble-dive-normalizer.ts`.

## Why this is one version bump, not several

Several open questions resolve to "the database schema changes":

1. BLE raw-record and checkpoint stores (from the Shearwater BLE plan).
2. Whether the backup format / store-manifest coverage needs hardening before
   more data accumulates (`PRODUCT-SPEC.md` engineering-reviewer section).
3. First-class **user overlays** that should ride the same clean reset:
   user-supplied GPS (distinct from computer GPS), trip grouping, and export
   preference hooks for a future full Subsurface/UDDF generator.
4. Optional profile-store split if the profile-storage benchmark justifies it.

Doing these in one deliberate `v7 → v8` change avoids bumping the schema
twice for related reasons. This document does not, on its own merits, redesign
the JSON+Base64 backup format — see §6.

Do not perform the bump merely to reserve empty stores while BLE is parked.
Finalize it after the native/libdivecomputer capture spike confirms the raw
payload, checkpoint type, device identity, and required indexes. Complete the
profile-storage performance benchmark before freezing v8 as well, so profiles
can move to a separate store in the same bump if the measurements justify it.

Do **not** ship a separate erase-reimport only for trips or user GPS. Stage-1
site-from-coords (suggest a name, discard the coordinate) needs no schema
change and can ship before v8.

## Single-user context permits an intentional clean reset

No other user's data exists yet, so this migration doesn't need to preserve
strict backward compatibility. The owner has all source logs and has explicitly
chosen the lower-complexity clean-reset path for this solo-beta migration.
That decision is specific to the current beta state; it is not a precedent for
destructive migrations after other users or non-reconstructable records exist.

The scope stays deliberately narrow per the parked BLE plan's own instruction:
*"Do not add speculative per-field sync machinery to the BLE milestone...
avoid choices that make the [readiness] metadata impossible."* This plan
preserves stable identities and clean serialization boundaries, but does not
add sync logic, conflict resolution, or tombstones.

## Layered data model (export future-proofing)

Keep three layers distinct. Full Subsurface/UDDF export later **generates a
new file** by composing them; it does not require making `LocalDive` a lossless
Subsurface document, and it does not mutate raw bytes.

| Layer | What it is | Export role |
|---|---|---|
| **Raw capture** | `rawDiveRecords` bytes + device/parser provenance | Reparse for profile, gases, computer metadata, and any field the normalizer omitted |
| **Canonical dive** | Normalized `dives` row (may stay lossy vs SSRF) | UI, maps, matching, fast summaries; optional sample cache |
| **User overlays** | Site name, buddy, notes, user GPS, trip, export prefs, photos | Applied on top at export / display time |

Rules:

- Never overwrite computer/import `gpsEntry*` / `gpsExit*` from a user pin or
  photo EXIF flow.
- Never fold user edits into the raw blob; raw must remain reparseable and
  auditable with the recorded `libdivecomputerVersion` /
  `parserContractVersion`.
- Today's Subsurface **pass-through** (patch site/buddy/notes into a supplied
  file) remains a compatibility tool. The long-term BLE-first path is a
  **generator**: reparse raw (or use retained samples) + apply overlays →
  write a new `.ssrf` / `.uddf`. Do not implement that writer in the v8 bump;
  only keep inputs clean enough that it can be added later.
- A dive-locations map page can ship before v8 using existing `gpsEntry*`.
  After overlays exist, display resolution is: computer GPS if present, else
  user GPS, else name-only geocode (existing approximate path).

## 1. New stores (from the BLE plan's capture contract — reuse directly)

### `rawDiveRecords`

| Field | Notes |
|---|---|
| `id` | Immutable source-capture identity; must not be identical to or derived solely from the canonical dive ID |
| `diveId` | Mutable foreign key to `dives`, indexed; update it when dives are merged or rekeyed |
| `sourceKind` | Capture provenance/transport, such as Shearwater BLE |
| `rawFormat` | Identifies the binary record format independently of the parser contract |
| `deviceDescriptor` | libdivecomputer descriptor/backend |
| `deviceSerial` | Normalized serial |
| `libdivecomputerVersion` | Pinned version/commit used at capture time |
| `parserContractVersion` | This app's normalizer contract version |
| `capturedAt` | Capture timestamp |
| `rawBytes` | `Blob`, stored binary — not Base64 for normal local storage |
| `checksum` / `length` | For deterministic reparse verification |

### `deviceCheckpoints`

| Field | Notes |
|---|---|
| `id` | Keyed by libdivecomputer descriptor + normalized serial — explicitly not BLE MAC address or display name, per the BLE plan's identity gate |
| `fingerprint` | Opaque binary libdivecomputer checkpoint value (`Blob` or `ArrayBuffer`, decided by the capture spike) |
| `lastSyncedAt` | For troubleshooting/display only |
| `lastOutcomeCounts` | Optional display/diagnostic summary only; not part of checkpoint correctness |

Both stores follow the existing backup/erase coverage table already defined
in the BLE plan (full backup includes both; "erase dive data only" clears
both so re-download works; "erase all data" clears both). That table is
already correct — reuse it as-is rather than redefining it here.

The BLE import transaction must write canonical dives, source mappings, raw
records, and the new checkpoint atomically. Advance the checkpoint only after
every retained dive and raw record has been committed successfully.

## 2. Overlay fields and stores folded into the same v8 reset

These are product features planned beyond BLE capture. They are included in
the v8 **design** so one erase-reimport covers them. Implementation of the UI
flows can still land in stages after the stores exist.

### 2a. User GPS on `dives` (never replaces computer GPS)

| Field | Notes |
|---|---|
| `userGpsLat` / `userGpsLng` | Optional user-supplied coordinate; `null` when unset |
| `userGpsSource` | `"manual"` \| `"photo-exif"` \| `null` |
| `userGpsUpdatedAt` | Wall-clock when the user pin/EXIF assignment changed |
| `exportGpsPreference` | `"computer"` \| `"user"` \| `"user-if-missing"`; default `"computer"` |

Stage 1 (pre-v8 OK): paste coords or read EXIF only to **suggest** a dive-site
name, then discard the coordinate — write `userSite` / `userSiteSource` only.
No schema change.

Stage 2 (v8 fields): persist the coordinate in `userGps*` without touching
`gpsEntry*`. If a `siteContributions` row is created from that flow, use the
**user** coordinates, not computer GPS.

Stage 3 (later exporters, not v8 code): when generating Subsurface/UDDF, honor
`exportGpsPreference` to choose which coordinate pair is written. Pass-through
export does not need to gain GPS rewriting in v8.

### 2b. Trips store + `tripId` on dives

Trip grouping is a label only — no non-dive itinerary fields.

### `trips`

| Field | Notes |
|---|---|
| `id` | Stable trip identity (not derived from the display name) |
| `name` | e.g. `"Green Island 2026"`, `"Maldives 2025"` |
| `updatedAt` | For display/diagnostics |

On each dive: `tripId: string | null`, with an IndexedDB index for
group-by-trip queries. Renaming a trip updates one `trips` row; dives keep
their `tripId`.

A plain `tripLabel` string on the dive would avoid a store but makes rename
rewrite N dives; prefer `trips` + `tripId` in the v8 reset since the index is
understood.

Erase-dive-data: clear `tripId` from dives or delete trips that become empty —
decide in the store manifest. Full erase clears `trips`.

### 2c. Attachment role for optional geo photos

Reuse the existing `attachments` store. Add an optional:

| Field | Notes |
|---|---|
| `role` | `"dive-photo"` (default / absent) \| `"geo-reference"` |

UI checkbox: keep the image → store attachment with `role: "geo-reference"`
and (stage 2) set `userGpsSource: "photo-exif"`. Discard the image → no
attachment row; stage 1 may still set `userSite` only.

Android EXIF privacy limits and iPhone HEIC decoding are implementation
details for a later milestone; the storage shape does not depend on them.

### 2d. What still stays out of v8

Do not add speculative equipment, tags, or sync tombstones. IndexedDB records
remain schemaless for truly unknown future properties; reserve further version
bumps for **new stores or indexes** whose query requirements are understood.

## 3. Sync-readiness decisions for v8

- Keep canonical, raw-record, trip, and checkpoint IDs stable and independent
  of account, installation, native device, and storage-provider IDs.
- Keep store serialization and hydration centralized so a future account
  layer can add record migrations without changing every caller.
- Do not add blanket `schemaVersion`, `createdAt`, or `updatedAt` fields to
  every store in this milestone. Existing timestamps that already serve an
  application purpose remain.
- Browser wall-clock `updatedAt` values may be useful for display and
  diagnostics, but they must not become the sole conflict-ordering mechanism:
  clocks can disagree across devices.
- Decide record-family versioning, server revisions, deletion propagation,
  merge rules, and the syncable/non-syncable classification of attachments
  and preferences as part of the hosted-sync design.

This leaves room for accounts without freezing an incomplete sync protocol
into the local format. Dive-domain date/time remains device-local unless the
source supplies a real offset; future record metadata must not alter that rule.

## 4. Migration mechanics: explicit destructive v8 upgrade

Given the explicit priority of minimizing implementation and support effort
over preserving UX/continuity for a single beta user, this bump uses the
existing **erase + re-import** recovery model rather than backfilling old
records.

An additive migration is more resource-intensive than it first looks: it
means writing and testing backfill logic, handling records that predate
fields being backfilled, and keeping that upgrade code correct and in the
codebase indefinitely (the SAC/PSI hydration is a real example of this cost
— it's a small, targeted fix, and even that adds a permanent read-path
branch). A destructive bump needs none of that.

Merely incrementing `DATABASE_VERSION` does **not** create a clean schema:
IndexedDB retains existing stores and rows unless upgrade code explicitly
removes them. The v8 `onupgradeneeded` transaction must delete the v7 object
stores and recreate the complete v8 store set and indexes. IndexedDB performs
that upgrade transaction atomically; if it aborts, the previous database
remains rather than leaving a half-reset schema.

Concretely:

1. Before release, verify that the sole beta dataset is reconstructable from
   retained source logs and make a backup only as an additional safety copy,
   not as a v7-to-v8 migration mechanism.
2. Bump to v8 and explicitly delete/recreate all object stores inside the
   upgrade transaction. Do not write record-backfill code.
3. Show/document that this beta update erases all local records, photos,
   presets, branding, and settings on first launch.
4. Re-import source logs and recreate any non-source state that is still
   wanted.

This keeps the general policy for schema changes during the solo-beta
period: reset-and-reimport is acceptable while the owner explicitly approves
it and the required data is reconstructable. Revisit this policy before
announcing the app, adding accounts, or storing records that cannot be
reconstructed.

## 5. Backup/export changes

- Extend the backup-size estimator using the same method as existing blobs:
  measure `rawBytes.size` directly for local binary bytes, then include the
  approximately 4/3 Base64 expansion in the JSON backup estimate.
- Extend both erase actions and the full-backup/replace path to cover
  `rawDiveRecords`, `deviceCheckpoints`, and `trips` per the store manifest.
- The backup already has a top-level format version distinct from the
  IndexedDB schema version. Increment it when the BLE stores ship.
- Continue accepting older backup versions by treating absent BLE/trips stores
  and absent overlay fields as empty/default. Older app versions must reject
  the newer format rather than silently dropping raw records, checkpoints,
  trips, or user GPS.
- Test native → web → native backup round trips. The web app must preserve
  app-only records even though it cannot initiate a Bluetooth download.
- Replace duplicated hardcoded store lists with a typed store manifest (or an
  equivalently centralized coverage definition) used by database creation,
  backup export/import, replacement, erase-all, erase-dive-data, size
  estimation, and validation. Store-specific policy such as whether
  erase-dive-data clears a store remains explicit in that manifest.

Logbook **file** exports (Subsurface/UDDF generators) are product features
outside the backup format. v8 only guarantees that raw + overlays + trips are
present in backups so a later generator has portable inputs.

## 6. What this bump deliberately does *not* do

- **No Subsurface/UDDF writer yet.** Structure the stores for a future
  generate-from-DiveFrame export; do not implement SSRF/UDDF emission in v8.
  Keep the existing pass-through tool as-is until the generator exists.
- **No backup archive-format redesign.** Raw records are small — the BLE
  plan's own measurement is roughly 4.7 KiB average, ~8.6 KiB max, per dive
  — so they don't force a move off the JSON+Base64 format on their own.
  Reserve the JSON → streaming-archive migration (`HANDOFF.md`'s zip sketch)
  for whenever photo libraries actually get large enough to need it. Don't
  bundle it into v8 just because both are schema-shaped changes.
- **No conflict-resolution or merge-rule changes.** Today's rule — an
  incoming complete record replaces a matching local record — stays exactly
  as documented, and stays explicitly insufficient for real-time
  multi-device sync, exactly as the BLE plan already states. Computer GPS
  merge remains fill-missing / richer-source; user GPS is DiveFrame-owned and
  must not be clobbered by re-import of the same computer dive.
- **No Android EXIF / HEIC pipeline.** Storage accepts the outcome; platform
  media work is later.

## 7. Decisions to write down now, not build

- Canonical dive IDs, `rawDiveRecords` IDs, `deviceCheckpoints` IDs, and
  `trips` IDs must never incorporate an account ID, device ID, or
  storage-provider ID. Build the v8 stores to that from the start.
- A raw-record ID identifies a source capture, not a canonical dive. Several
  captures may legitimately point at the same `diveId`.
- Content-hash-based dedup for large blobs (photos, and eventually raw
  records) should remain a known future optimization, not something this
  bump needs to implement.
- Import of computer logs must preserve existing `userGps*`, `tripId`,
  `exportGpsPreference`, `userSite*`, buddy, and notes on matched dives
  (same spirit as today's "never erase user location/site/buddy/notes/GPS
  overlays" rule, extended to the new overlay fields).

## Suggested rollout

1. Finish any remaining native capture hardening (multi-dive, fingerprints,
   progress) while still **not** writing IndexedDB.
2. Complete the profile-storage benchmark; decide whether samples move to a
   separate store in the same bump.
3. Freeze raw-record, checkpoint, trips, overlay-field, and optional
   profile-store contracts, including indexes and the atomic BLE commit
   boundary.
4. Bump IndexedDB version 7 → 8 and explicitly recreate the complete database
   from scratch in the upgrade transaction; do not backfill v7 records.
5. Introduce the centralized store manifest and update backup export/import,
   both erase actions, replacement, validation, and size estimation.
6. Increment the backup format, retain import support for older backups, and
   add native/web round-trip tests.
7. Add a prominent v8 data-loss and re-import instruction to `README.md` and
   `USER-GUIDE.md` before release.
8. After v8 ships, stage product UI independently: site-from-coords (stage 1
   can even precede v8), map aggregation, trips, persist user GPS, then much
   later a full Subsurface/UDDF generator that honors `exportGpsPreference`.

## Pre-v8 work that needs no schema bump

- Suggest dive site from pasted coordinates or (later) photo EXIF, then keep
  only the chosen name.
- Map page aggregating existing computer GPS into counts / detail on
  select.
- Spike-only native download/parse (current research shell).
