# Archived: Shearwater GPS backfill from raw bytes

One-time toolkit from 2026-08-01. Early product BLE downloads kept full
`rawDiveRecords` but discarded Shearwater GNSS because `sample_cb` ignored
`DC_SAMPLE_LOCATION`. The live app now captures that sample on download, so
this UI and IndexedDB helper were removed from the shipped product.

## Why keep this folder

`rawDiveRecords` still store the full libdivecomputer payload. If another
parser field is ever missing from the normalized dive, the same pattern applies:

1. Decode offsets (or re-run libdivecomputer) against `rawBytesBase64`.
2. Fill only empty destination fields so user edits are never overwritten.
3. Prefer a backup-file CLI over shipping a Settings button unless many users
   need the repair.

## Contents

| File | Role |
|---|---|
| `shearwater-raw-gnss.ts` | Read entry/exit fix from a PNF payload |
| `recover-from-backup.mjs` | Patch a DiveFrame backup JSON in place (or dry-run) |
| `shearwater-raw-gnss.test.mjs` | Unit tests for the extractor |
| `recover-computer-gps-from-idb.ts` | Former in-app IndexedDB helper (reference only) |

## Usage

```bash
# Dry-run: list recoverable fixes
node scripts/archive/shearwater-gps-backfill/recover-from-backup.mjs path/to/diveframe-backup.json

# Write gpsEntry*/gpsExit* into empty fields, emit *-recovered.json
node scripts/archive/shearwater-gps-backfill/recover-from-backup.mjs path/to/diveframe-backup.json --write
```

Then import the recovered backup (merge) if the live logbook still needs it.

```bash
node --test scripts/archive/shearwater-gps-backfill/shearwater-raw-gnss.test.mjs
```

## Live path (do not delete)

Future downloads already go through:

- `android/.../diveframe_dc.c` (`DC_SAMPLE_LOCATION`)
- `DiveComputerPlugin` → `gpsEntryLat/Lng` / `gpsExitLat/Lng`
- `lib/ble-dive-normalizer.ts` / `lib/ble-persist.ts`
