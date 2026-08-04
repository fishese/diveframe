# Sticky header, export share, home brand, edited-here, dive memos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sticky header safe-area, open share after Export image (Android + Web Share), brand→home, rename/expand “Edited here”, and ship a standalone dive-memos tool with backup support.

**Architecture:** Focused CSS/UI patches for chrome and export; additive `appEditedAt` on dive records for the filter; new IndexedDB `diveMemos` store (v11) + `/memos` page; optional Android static shortcut.

**Tech Stack:** Existing Next/vinext app, Capacitor FileExport + PhotoLocation, IndexedDB, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-04-sticky-export-memos-design.md`

## Global Constraints

- Keep Noto / overlay fonts work untouched.
- Schema changes after v8 must be additive (`DATABASE_VERSION` 10 → 11 for `diveMemos` only).
- Composer/share-image must not set `appEditedAt`.
- Memo photo picker is GPS-only; never persist memo photos.
- Share after export is best-effort; save success must not depend on share.
- Memo headings default `Dive 1`, `Dive 2`, …; time default 10:00 AM; hour wrap 12→1 without flipping AM/PM.
- Classification: **APK-affecting**.

## File structure

| File | Role |
| --- | --- |
| `app/globals.css` | Sticky topbar safe-area fix |
| `lib/file-export.ts` / `lib/exporter.ts` / `ComposerApp.tsx` | Save + share |
| `app/DiveFrameApp.tsx` / other topbars | Brand → home |
| `lib/dive-list-model.ts` + i18n + About | Edited here |
| `lib/indexed-db.ts` + `store-manifest.ts` + `app-backup.ts` | `appEditedAt`, memos store, backup v4 |
| `lib/dive-memos.ts` | Memo helpers (defaults, time steppers) |
| `app/memos/MemosApp.tsx` + `page.tsx` | Memo UI |
| `app/components/ImportGuide.tsx` | Link card |
| `android/...` | Optional shortcut |
| `tests/*` | Contract + unit coverage |

---

### Task 1: Sticky header safe-area

**Files:** `app/globals.css`, `tests/app-contract.test.mjs`

- [ ] Assert `.topbar` / `.composer-topbar` use `top: 0` and padding-top with safe-area (not sticky `top: safe-area` alone).
- [ ] Update `.topbar` and `.composer-topbar` (and mobile overrides if they reset `top`) accordingly; keep min-height usable with inset.
- [ ] Run focused contract asserts; commit.

### Task 2: Export image → save + share

**Files:** `lib/exporter.ts` and/or `app/compose/ComposerApp.tsx`, `lib/file-export.ts` (helper if needed), tests

- [ ] After successful `exportComposition`/`saveExportFile`:
  - Android: `shareExportFile` when `shareable`.
  - Web/iOS: if `navigator.canShare?.({ files })`, `navigator.share({ files: [File], title })`.
  - Catch share errors; still show save success status.
- [ ] Prefer a small helper e.g. `shareSavedExportOrWebShare(saved, blob, fileName, mime)` to keep Composer thin.
- [ ] Contract/unit test for helper branching; commit.

### Task 3: Brand → home

**Files:** `app/DiveFrameApp.tsx`, `app/compose/ComposerApp.tsx`

- [ ] Logbook brand: go home (clear import guide + mobile detail + selected dive chrome); use `Link href="/"` or equivalent reset.
- [ ] Composer brand: `Link href="/"`; keep back-to-dive control.
- [ ] Commit.

### Task 4: Edited here filter

**Files:** `lib/dive-list-model.ts`, `lib/indexed-db.ts`, `app/DiveFrameApp.tsx`, i18n, About, tests

- [ ] Add `appEditedAt?: string | null` on `LocalDive`; set in user save paths (details, site, GPS, trip, category, location) — not import/composer.
- [ ] Filter: `editedHereOnly` matching `appEditedAt` OR userSite OR userGps OR tripId OR cylinder override; keep stored UI flag key compatible (`appSiteOnly` OK if renamed in UI only).
- [ ] Rename i18n to “Edited here”; update About `aboutSourceStepFilter`.
- [ ] Unit tests for predicate; commit.

### Task 5: Dive memos data layer

**Files:** `lib/dive-memos.ts` (new), `lib/indexed-db.ts`, `lib/store-manifest.ts`, `lib/app-backup.ts`, tests

- [ ] `DiveMemo` type + helpers: next heading `Dive N`, default time 10/00/AM, hour step wrap, minute coerce.
- [ ] Store `diveMemos`, `DATABASE_VERSION = 11`, manifest erase-all only.
- [ ] Backup version 4 + `diveMemos` array; v1–3 import → empty memos.
- [ ] CRUD: list/save/delete.
- [ ] Tests; commit.

### Task 6: Memos UI + import guide

**Files:** `app/memos/*`, `ImportGuide.tsx`, i18n, CSS, reuse photo-location help

- [ ] `/memos` page: start with Dive 1; add more; click heading to edit; date; hour±1; minutes 00/15/30/45; AM/PM; location; device GPS; photo GPS (no save photo); buddies; notes with exact placeholder.
- [ ] Import guide second card beside backup.
- [ ] Commit.

### Task 7: Android shortcut (best-effort)

**Files:** `android/app/src/main/res/xml/shortcuts.xml`, Manifest, Capacitor launch URL handling if needed

- [ ] Static shortcut to open app at `/memos` if straightforward; otherwise document skip in session note.
- [ ] Commit if shipped.

### Task 8: Docs + verify

- [ ] HANDOFF, session note, USER-GUIDE snippet; APK-affecting.
- [ ] `npm test`; commit docs.

## Spec coverage

| Spec item | Task |
| --- | --- |
| Sticky header | 1 |
| Export save+share Android+Web Share | 2 |
| Brand home | 3 |
| Edited here option A | 4 |
| Memos store/backup/UI/import link | 5–6 |
| Shortcut best-effort | 7 |
| Docs/tests | 1–8 |
