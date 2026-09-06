# DiveFrame maintainer handoff

Start with [the documentation index](docs/README.md),
[AGENTS.md](AGENTS.md), and the [release/parity procedure](docs/RELEASE-CHANNELS.md).
Rolling release numbers belong in the update feed and dated release records,
not duplicated here.

## Current boundaries

- Production web is deployed from GitHub `main` by Cloudflare Workers Builds.
  `.openai/hosting.json` is retained project metadata; D1/R2 remain disabled.
- Shared application changes ship to web and the separately installable Preview
  APK. Stable/F-Droid stays pinned until a separate stable release is requested.
- Preserve current IndexedDB saves (schema 12) and app-data backups (format 5).
  No pre-v8 migration support is required. Do not reset current saves as a fix.
- Source GPS is preserved by default. A valid, explicitly enabled per-dive user
  GPS override wins for export/site suggestions; imported coordinates remain
  stored and map display keeps its existing computer-first policy.
- Add translations for new UI strings. Existing translated wording awaits the
  maintainer's review; do not assume unusual wording is accidental.

## Code entry points

| Area | Entry points |
| --- | --- |
| Logbook and navigation | `app/DiveFrameApp.tsx`, `app/components/AppTopbar.tsx`, `lib/app-back.ts` |
| Memos | `app/memos/MemosApp.tsx`, `app/components/MemoDiveMatchHints.tsx`, `lib/memo-dive-apply.ts` |
| Import/export | `lib/parsers/`, `lib/subsurface-site-export.ts`, `lib/subsurface-logbook-export.ts` |
| Current saves and backups | `lib/indexed-db.ts`, `lib/store-manifest.ts`, `lib/app-backup.ts` |
| Maps and profiles | `app/map/`, `lib/chart-renderer.ts`, `docs/dive-map.md` |
| Native bridges | `android/`, `lib/file-export.ts`, `lib/photo-location-capability.ts` |
| Preview publication/feed | `.github/workflows/preview-apk.yml`, `scripts/update-preview-feed.mjs`, `scripts/verify-preview-release.mjs` |

## Validation and follow-ups

Run `npm test`, `npm run lint`, and the applicable native checks in the release
guide. Personal dive/ BLE fixtures remain local and optional; report skipped
fixture-dependent tests accurately.

Physical Android testing still matters for BLE interruption/reconnection,
WebView offline behavior, native import/export, photo location, and in-place
updates preserving saves. Broader map failure/retry and rapid-navigation
scenarios remain test work; do not rewrite them without a reproduced defect.

The superseded [August handoff](docs/archive/2026-08-23-handoff.md) is retained
as historical evidence. Its old release numbers, reset advice, and task lists
are not current instructions. Local planning documents remain outside the
public documentation set.
