# Web and Preview review fixes — 2026-09-06

Published for maintainer testing. **F-Droid/stable was deliberately held.**
This is a dated record; use the live feed/release for later Preview versions.

## Published source and artifacts

- Shared source: [`bbc96f747d1002ff761270daa9d150a7cf8763a3`](https://github.com/fishese/diveframe/commit/bbc96f747d1002ff761270daa9d150a7cf8763a3).
- Web: [divelog.fishese.cc](https://divelog.fishese.cc). The source commit's
  **Workers Builds: diveframe** check succeeded. The deployed memos page returned
  HTTP 200 and its translation bundle included the new memo placeholder key.
- Preview workflow: [34004481155](https://github.com/fishese/diveframe/actions/runs/34004481155),
  run number 45; both APK publication and dependent feed jobs succeeded.
- [Preview APK](https://github.com/fishese/diveframe/releases/download/preview/diveframe-preview.apk):
  `preview.45.bbc96f7`, code `100045`, package `cc.fishese.divelog.preview`,
  label `DiveFrame Preview`, ABI `arm64-v8a`.
- APK size: `15769121` bytes; SHA-256:
  `26fca0b95abe42b43dc66754291418c05bb29db06557978a44221654a6b8d91d`.
- Signature verified with `apksigner`: existing `CN=Fishese` certificate,
  SHA-256 `90311d4a659f32a767199164791dba0aa5e05ffa5ed9f73b93baffc9112bb25a`.
- The actual `preview` Git tag, release target/notes, and APK identity agree
  with the shared source. The previously stale Preview tag was corrected by
  the authorized publication workflow; no stable/reference tag was moved.
- Feed-only commit: [`3744407acd4b11104466cf1243703349720f0300`](https://github.com/fishese/diveframe/commit/3744407acd4b11104466cf1243703349720f0300).
  Its web deployment succeeded. Both `/whats-new.json` and `/api/whats-new`
  advertised the exact Preview name, code, and source above.

The feed commit and this documentation-only follow-up intentionally leave the
APK at `bbc96f7`; neither changes application runtime behavior.

## Changes and validation

- Import Subsurface dives inside trips; preserve site metadata and case-only
  renames during pass-through export. Source GPS remains the default, with the
  existing explicit per-dive user override documented and preserved.
- Revalidate memo fill-empty writes inside the storage transaction; copying
  buddy/notes writes only the selected field and preserves newer sibling edits.
- Downsample pressure/temperature independently of depth and draw single
  readings; wrapped profile controls align left.
- Reject failed native web builds instead of copying old assets.
- Localize the memo notes placeholder in English, Japanese, and Traditional
  Chinese. Existing translated wording was deliberately left unchanged.
- Verify signed APK identity/digest and mutable-tag provenance before feed
  advancement; reject stale/conflicting reruns and keep identical runs idempotent.
- Consolidate release/parity instructions, shorten the active handoff, add a
  documentation index, and archive superseded public/local records.

`npm test` passed (web build, TypeScript, **275 passed / 3 optional fixture
skips**), as did lint, native synchronization, default `assembleRelease`, and
explicit `assemblePreview` local builds. All 341 intended web assets matched
the local APKs byte-for-byte. The downloaded signed APK also contained the
trip-aware parser and localized memo key; its manifest, digest, and signature
were independently inspected.

Local browser checks covered independent chart controls, left-aligned wrapping
at 440px, first-click navigation from a dive deep link, both new translated
placeholders, and synthetic memo persistence after reload. Current v5 backup
round trips are covered for plain and encrypted backups. No pre-v8 migration
support was added; current-save compatibility remains required.

Physical Android regression testing remains the maintainer's next step,
especially in-place updates preserving saves, native import/export, BLE,
offline behavior, and photo-location access.

## Stable/F-Droid hold

Stable remains 1.0.28 / code 29 at
`1d676d2929be03d6786d777018dc77b7b757d7ef`. Both immutable `v1.0.28` and
`fdroid-v1.0.28` remote refs were checked unchanged. The stable feed entry,
production identity/version, signing configuration, native dependency pin,
F-Droid recipes, and MR were not modified.

The fresh read-only GitLab check was blocked by expired `glab` OAuth credentials;
the documentation clearly dates the last successful MR observation. F-Droid
requires a separate explicit update request after testing.
