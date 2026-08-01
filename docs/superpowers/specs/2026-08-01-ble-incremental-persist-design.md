# BLE incremental persist design

**Date:** 2026-08-01  
**Status:** Approved for implementation

## Problem

BLE downloads currently keep every dive in native memory and only write
IndexedDB after `downloadDives` returns. If the Android process dies mid-
transfer (install, OOM, crash), the computer times out and DiveFrame keeps
nothing from that run — even dives that had already been captured.

## Goals

1. Persist each successfully captured dive as soon as it is available on the
   JS bridge, so a process kill does not lose already-received dives.
2. On **Cancel**, keep dives already persisted (same as a crash).
3. Advance the device **checkpoint only** when a transfer finishes
   successfully (not cancelled, not failed). Newest-first downloads make
   early checkpoint updates unsafe: they would skip older history never
   received.
4. After cancel, incomplete success, or full success, show a summary with
   counts plus a **human-facing date range** of newly saved dives (and
   computer name/serial) so a mistaken import (e.g. someone else’s computer
   on a boat) can be found and deleted in the logbook.

## Non-goals

- Background download / pinned notification strip (parked).
- Changing BLE↔Cloud matching heuristics.
- Using display date/time as the dive identity.

## Identity (unchanged)

- Stable BLE id remains the libdivecomputer **fingerprint**
  (`sourceId` / `dive:v1:shearwater-ble:<fingerprint>`).
- Summary date/time is a **UI label only**, analogous to a dive number for
  finding rows — not the fingerprint and not the Cloud/Subsurface match key.
- Cross-source matching stays on serial + time window + duration + depth.

## Approach

**Stream full dive payloads on `diveCaptured` and persist in JS (option A).**

1. Native: when each dive is collected, parse it (move parse into the per-dive
   path) and notify listeners with `fingerprintHex`, `dataBase64`, `parsed`,
   plus device fields already known (`serial`, product/name from the session).
2. JS session: on each rich `diveCaptured`, normalize + `persistBleImport` for
   that single dive **without** a checkpoint.
3. When `downloadDives` completes:
   - If cancelled or failed: do not advance checkpoint; return summary of
     what was already saved (including date range of **new** dives).
   - If successful: write checkpoint from newest fingerprint; return the same
     style of summary.
4. End-of-run bulk re-persist of the full array is unnecessary; merges are
   idempotent but skipped to avoid double work. Final result may still return
   dive metadata for diagnostics.

## Summary copy

Include at least:

- received / new / already present / failed-parse counts
- computer product + serial when known
- earliest–latest `diveDate` among **newly** saved dives in this run
  (omit range if no new dives)

Update cancel copy: cancelled runs may have saved dives; do not say
“Nothing new was saved” when `newCount > 0`.

## Error handling

- Persist failures for one dive: log/status note, continue download; count as
  failed for summary. Do not abort the whole transfer solely because one
  IndexedDB write failed.
- Missing parse (`parseOk` false): still store raw record when possible;
  count toward failed-parse; no logbook dive row without usable preview.
- Process death: no further JS work; already-written IndexedDB rows remain;
  checkpoint unchanged → retry re-downloads overlaps, merge dedupes.

## Testing

- Unit: session accumulates per-dive persist counts; checkpoint only on
  successful completion; cancel keeps counts and does not advance checkpoint;
  summary date-range helper.
- Contract: `diveCaptured` payload includes `dataBase64` / parsed wiring in
  Java/capability types.
- Manual: long Last-N / history run, cancel mid-way, confirm dives in logbook
  and checkpoint unchanged.

## Out of scope leftovers

- Reparse path for raw-only orphans if parse failed at capture time.
- Search operator for “imported this BLE session” (date range + computer is
  enough for v1).
