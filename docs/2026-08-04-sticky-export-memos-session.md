# Session: sticky header, export share, edited-here, dive memos (2026-08-04)

## Branch

`feature/sticky-export-memos`

## Classification

**APK-affecting.** Sticky safe-area, export share, brand→home, Edited here,
and `/memos` ship in the shared web client; Android APK needs a rebuild to
pick them up.

## Delivered

1. Sticky `.topbar` / `.composer-topbar`: `top: 0` + safe-area padding (not
   sticky `top: safe-area` alone).
2. Export image: save, then best-effort share (Android `FileExport` /
   Web Share). Share failure does not fail the export.
3. Brand mark → home (logbook clears import/BLE/detail chrome; composer
   links to `/`).
4. Filter label **Edited here**; `appEditedAt` on in-app dive-data saves;
   predicate also matches user site / GPS / trip / cylinder override.
5. Dive memos: IndexedDB `diveMemos` (v11), backup v4, `/memos` UI, import
   guide card. Photo GPS only (no memo photo storage). Erase-all only.

## Deferred

- Android long-press shortcut to `/memos`: skipped (Capacitor deep-link /
  BridgeActivity path wiring is messy for a cold-start static shortcut).
- Memo ↔ dive auto-match UI.
- GitHub Release asset for **1.0.15** (local dogfood installed; publish when
  ready).

## Dogfood

- APK **1.0.15** (`versionCode 16`) from `5046ab5`, installed via wireless adb
  on SM-S9280.
- SHA-256:
  `FAADEBAEEB1C5D84D90A30C7EB69DAB4E63C708DD148831359AE9FF348DAB103`.

## Spec / plan

- `docs/superpowers/specs/2026-08-04-sticky-export-memos-design.md`
- `docs/superpowers/plans/2026-08-04-sticky-export-memos.md`
