# Deep code audit — 2026-08-03

Branch: `review/deep-code-audit-2026-08-03`

This audit covers the shared React client, IndexedDB/import/export code,
service worker and hosted API routes, plus the Android Capacitor bridge. It
does not change the IndexedDB schema, rebuild an APK, publish a release, or
deploy the web app.

## Correctness and resilience fixes

- BLE panel listener registration is now teardown-safe. A panel closed while
  native listener promises are still resolving removes every partially
  registered listener instead of leaking callbacks into a later panel.
- Logbook refreshes carry a generation token, preventing an older slow
  IndexedDB/storage-size read from replacing newer UI state.
- Reverse-geocode attempts are no longer marked complete when their request was
  aborted by a rerender. Completed results and attempt markers are applied as
  one batch.
- Nearby-site suggestions derive bundled/supplementary results synchronously
  and key remote results to the exact coordinates. Clearing or changing GPS no
  longer displays a previous dive's sites, and timeouts no longer leave a
  permanent loading state.
- Duplicate-dive merge moves photos after the kept gallery with unique sort
  orders and recalculates `photoCount` from actual attachment rows. Individual
  photo deletion also recalculates the count instead of trusting stale cached
  metadata.
- Duplicate review now detects source-set differences in both directions and
  normalizes SQL-style date strings before timestamp comparison.
- Mixed sample-plus-real imports filter the sample before upsert, so the sample
  is not reinserted immediately after automatic removal.
- Encrypted backup imports cap attacker-controlled PBKDF2 iterations to avoid
  a local CPU-denial file. Existing checksum, duplicate-key, blob-size, and
  dive-domain reference checks remain intact; photo/composer orphans remain
  valid because dive-only erase deliberately retains them for reattachment.
- Stored/manual/photo GPS paths reject non-finite and out-of-range coordinates.
  Map selection falls back from an invalid computer pair to a valid user pair.
- FIT import now converts the pinned parser's raw semicircle positions to
  degrees and explicitly applies its missing depth scale. Shearwater database
  import tolerates absent optional tables/columns and rejects invalid GNSS
  ranges instead of failing the whole basic-detail import.
- UDDF timestamps with fractional seconds or a timezone suffix normalize to
  the local wall-clock shape used by the rest of the logbook.
- Generated Subsurface logbooks require distinct profile times and at least one
  positive depth. They use complete coordinate pairs, honor
  `exportGpsPreference`, avoid hybrid computer/user GPS, and derive missing
  average depth with elapsed-time weighting. The output filename typo was also
  fixed.
- Composer loading is cancellation-safe. Stale photo decode failures no longer
  overwrite current status, font-load rejection no longer creates an unhandled
  promise, corrupt optional logos do not block the composer, failed autosaves
  are reported, and replaced `ImageBitmap` objects are closed.
- Settings initial loading ignores stale completions after language changes or
  unmount. Failed language persistence rolls the controlled UI back.
- Hosted geocode calls have timeouts and return CORS-aware 502 responses for
  network/invalid-JSON failures. Nearby-site JSON failure falls back to the
  second OpenStreetMap path, and haversine input is clamped against floating
  point overflow.
- Service-worker runtime cache writes are awaited while the fetch event is
  active and quota failures no longer risk hiding the live network response.

## Quality gates and comments

- `npm run typecheck` is now a first-class script and part of `npm test`. It
  caught missing delete-dive translation keys that the normal bundler did not.
- ESLint excludes generated Android/Vite output and archived one-off recovery
  scripts. The active source tree now lints without errors or warnings.
- Added focused regression tests for attachment ordering, FIT units, sample
  removal, invalid GPS fallback, unknown-depth sorting, asymmetric duplicate
  sources, Subsurface export validation/GPS, and weighted average depth.
- Rewrote stale active-code comments that still called the shipped BLE
  transport a future research backend. Comments now describe ownership,
  teardown, persistence, parser-unit, cache, and hydration constraints rather
  than restating individual lines.
- Updated the product spec, handoff, user guide, and BLE session notes to remove
  archived catalog-export controls, describe the current Capacitor wrapper,
  preserve the additive-after-v8 rule, and distinguish implemented CORS headers
  from production smoke verification.

## Verification

- `npm run lint -- --quiet`: passed.
- `npm run typecheck`: passed.
- Node test suite: 100 checks; 97 passed and 3 fixture-dependent checks skipped.
- Bundled catalogue: 566 structurally valid sites, 0 errors, and 5 existing
  review warnings for one locality outlier and four close site pairs.
- `git diff --check`: passed; Git reported only the repository's normal
  LF-to-CRLF working-tree notices.
- A final production build could not be completed in this Codex session because
  the filesystem sandbox denied Vite access to `node_modules/.vite-temp`, and
  the unsandboxed retry was unavailable after the session reached its execution
  limit. This is an environment limitation, not a compiler diagnostic; run
  `npm test` locally before merging.

## Further improvements worth considering

1. Add real browser integration tests around IndexedDB transactions,
   backup merge/replace, cross-tab writes, service-worker upgrades, and canvas
   export. Most current storage tests are deterministic unit/contract tests.
2. Obtain one real Garmin Dive FIT export as a non-private sanitized fixture.
   Unit conversion is now covered, but the full FIT message layout remains
   explicitly untested.
3. Avoid building a complete backup snapshot merely to estimate size. The
   current estimate clones every IndexedDB record; a maintained aggregate or
   metadata-only store would scale better for large photo/raw-record libraries,
   but would require an additive schema/design discussion.
4. Stream backup JSON/base64 generation and restore. The Android file writer is
   chunked, but backup construction still materializes the encoded document in
   memory before it reaches that writer.
5. Add cross-tab change notification (for example `BroadcastChannel`) and
   optimistic revision checks around long media optimization. IndexedDB
   serializes transactions, but a second tab can leave the first tab's React
   state stale or race a long read/transform/write cycle.
6. Split `DiveFrameApp.tsx`, `SettingsApp.tsx`, and `app-i18n.ts` into bounded
   feature modules. Their current size makes review and targeted test setup
   harder even though the runtime behavior is valid.
7. Add server-side caching/rate controls for Nominatim and Overpass that comply
   with the providers' policies, plus telemetry limited to operational errors
   without logging private dive coordinates.
8. Complete the native BLE failure matrix, lifecycle/instrumentation tests,
   and LGPL/source-release checklist before store distribution.
