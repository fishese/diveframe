# 2026-08-03 audit merge, follow-ups, and UI fixes

Session notes for the work landed on `main` on 2026-08-03, covering the deep
code audit merge, follow-up recommendations 3/5/6(partial)/7, and the later
UI/export/settings fixes packaged with debug APK **1.0.12**.

## Deep code audit (already on `main`)

Branch `review/deep-code-audit-2026-08-03` was smoke-tested, committed as
`1c1e35b`, fast-forwarded to `main`, and published as debug APK **1.0.10**
(`v0.1.0-debug.10`). Findings remain in `docs/2026-08-03-deep-code-audit.md`.

Highlights: stale async races, BLE listener teardown, import/export correctness,
hosted API timeouts, and focused regression coverage.

## Audit follow-ups 3, 5, 6 (partial), 7

Shipped in `dc736da` on branch `feature/audit-followups-3-5-7`, then merged to
`main` and published as debug APK **1.0.11** (`v0.1.0-debug.11`).

| # | Recommendation | Outcome |
| --- | --- | --- |
| 3 | Avoid full backup snapshot for size estimate | Done: cursor-walk metadata estimate in `lib/backup-size-estimate.ts` |
| 4 | Stream backup JSON/base64 generation and restore | Deferred: still materializes the encoded document in memory |
| 5 | Cross-tab notification + optimize revision checks | Done: `lib/cross-tab-sync.ts`; Settings/logbook subscribe; optimize asserts revision |
| 6 | Split large modules (`DiveFrameApp`, `SettingsApp`, `app-i18n`) | Partial: `lib/app-i18n/{en,zh-Hant,ja}.ts` + pruned unused keys; large React splits remain open |
| 7 | OSM cache/rate-limit + coord-free error telemetry | Done: `lib/osm-upstream.ts` on geocode and nearby-sites routes |

Supporting scripts: `scripts/find-unused-i18n.mjs`,
`scripts/prune-and-split-app-i18n.mjs`.

## UI / export / settings fixes (this packaging)

User-reported fixes on `main`, shipped with debug APK **1.0.12**:

1. **Delete dive button** — restored next to **Save changes** in the dive
   details editor (it had been moved below the photo gallery and was easy to
   miss / appeared missing).
2. **Full Subsurface logbook export** — incomplete dives are skipped instead of
   failing the whole export; portable dives still export. Inline
   success/failure/preparing status appears under Source log tools via
   `sourceLogStatus` (in addition to the bottom settings status). New copy:
   `subsurfaceLogbookExportCompleteWithSkipped`.
3. **Compact Settings** — removed the redundant language description line;
   tightened PWA install spacing; replaced the visible default-tank “Tank size”
   label with a visually-hidden `defaultTankSize` label (the `tankSize` key
   remains for dive detail UI).

Key files: `app/DiveFrameApp.tsx`, `app/settings/SettingsApp.tsx`,
`app/globals.css`, `lib/subsurface-logbook-export.ts`, `lib/app-i18n/*`,
`tests/subsurface-logbook-export.test.mjs`, `tests/app-contract.test.mjs`.

## Still open from the audit

- Item **4** (streamed backup encode/restore)
- Item **6** remainder (split `DiveFrameApp.tsx` / `SettingsApp.tsx`)
- Item **8** (BLE failure matrix, lifecycle tests, LGPL/source checklist)
- Browser integration tests and a sanitized Garmin FIT fixture (audit items 1–2)

## Classification

Shared client UI and export logic — **APK-affecting**. Web/PWA deploy follows
the `main` push; a matching debug APK must be rebuilt from the same commit.
