# 2026-08-04 sticky header, export share, home brand, edited-here, dive memos

Approved in chat. Approach: small focused fixes plus a standalone `/memos`
page with a new IndexedDB store (Approach 1). Memo-to-dive hint matching is
out of scope for this pass.

## Goals

1. Fix Android sticky top bar sliding under the status bar when scrolling.
2. On **Export image**, save the file and open the Android share sheet.
3. Make the DiveFrame logo/name in the top bar a reliable home navigation
   control.
4. Replace **Set in App** with **Edited here**, matching any in-app dive-data
   edits (not share-image / composer-only work).
5. Add a **dive memo** tool for quick notes before a log exists, linked from
   the import guide, with optional Android long-press shortcut.

## Non-goals

- Auto-matching memos to dives or showing hint boxes on dive detail.
- Saving photos attached to memos (photo picker is GPS-only).
- F-Droid submission / signing process changes.
- Changing web download behavior beyond optional `navigator.share` when
  available.

---

## Sticky header (APK)

**Problem:** `.topbar` (and similar sticky chrome) uses
`top: var(--safe-area-inset-top, …)` with a fixed height and no top padding on
the bar. When the beta/notice banner scrolls away, content can show through
the status-bar region or the bar can sit under system UI if insets are wrong.

**Fix:** For `.topbar`, `.composer-topbar`, and any other matching sticky app
chrome:

- `top: 0`
- `padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`
- Keep the translucent background so the bar visually fills under the status
  bar while controls sit below the inset.

Confirm `viewport-fit=cover` remains appropriate for Capacitor. Do not change
desktop layout meaning beyond correct inset handling.

---

## Export image → save + share

**Current:** `exportComposition` → `saveExportFile` only. Settings backups
already have a separate **Share** action via `shareExportFile`.

**Change:** In the composer `exportImage` flow, after a successful save:

- If the result is a native device save with `shareable: true`, call
  `shareExportFile` (same plugin path as backup share).
- On web, keep the browser download. If `navigator.share` can accept the file
  and the user agent supports it, attempt share after download preparation;
  failures must not fail the export.

Status text should still report where the file was saved.

---

## Brand → home

**Current:** On the main logbook, the brand is a button that only clears
`mobileDetail`. Settings / About / Android pages already `Link` to `/`.
Composer brand links back to the dive.

**Change:**

- Logbook brand: navigate to true home — clear import-guide view, mobile
  detail, and selected-dive detail chrome (equivalent to “back to dive list
  home”).
- Prefer `Link href="/"` or the same router navigation used elsewhere when
  that yields a full home reset; keep accessibility label for home.
- Composer: brand → `/` (home). Keep the existing back control for return to
  the dive.
- Other pages that already link home: leave as-is unless inconsistent.

---

## “Edited here” filter (option A)

**Current:** Filter key `appSiteOnly` matches only `dive.userSite`. i18n label
is **Set in App**. About copy refers to site assignment only.

**Change:**

1. Rename user-facing strings to **Edited here** (en / zh-Hant / ja) and update
   About / guide copy that still says “Set in App”.
2. Add optional `appEditedAt: string | null` on dive records (no destructive
   migration; additive property).
3. Set `appEditedAt` whenever the user saves dive **data** through app paths:
   site selection/clear, user GPS, trip assignment, cylinder, buddy, notes,
   location, category (user). Do **not** set it for imports/merges, composer
   settings/presets, share-image export, or photo attachment metadata alone
   unless those flows also edit dive fields above.
4. Filter predicate (rename internally to something like `editedHereOnly` if
   practical; keep persistence key migration-safe if filter prefs are stored):

   ```text
   appEditedAt != null
   OR userSite
   OR user GPS pair present
   OR tripId
   OR cylinderPresetId / cylinderVolumeL override present
   ```

   This keeps historical site/GPS/trip/cylinder edits visible even before
   `appEditedAt` existed. Buddy/notes/location-only edits from before the flag
   appear after the user re-saves them.

---

## Dive memos

### Entry points

- Route: `/memos` with a dedicated client page.
- Import guide: second card beside the backup card — copy along the lines of
  “Jot a quick note about a dive” linking to `/memos`.
- Android: attempt a static launcher shortcut to `/memos` (long-press app icon).
  If Manifest / Capacitor deep-link wiring becomes messy, ship without the
  shortcut and note it as follow-up.

### Storage

- New object store `diveMemos` (IndexedDB **v11**, additive repair-friendly).
- Register in `store-manifest.ts`: `eraseAllData: true`,
  `eraseDiveDataOnly: false` (clearing dives keeps memos).
- Include in app-data backup/restore; bump backup document coverage for the
  new array; older backups import with an empty memo list.
- Record shape (illustrative):

  ```ts
  type DiveMemo = {
    id: string;
    heading: string;
    date: string; // YYYY-MM-DD
    hour: number | null; // 1–12; default 10
    minute: 0 | 15 | 30 | 45 | null; // empty treated as 0
    meridiem: "AM" | "PM"; // default AM
    location: string | null;
    lat: number | null;
    lng: number | null;
    buddies: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  ```

### Defaults and time UI

- Heading default: `Dive Note 1`, `Dive Note 2`, … based on existing count.
- Date: today.
- Time default: **10 : 00 AM**.
- Hour: typeable + stepper ±1; values 1–12; **12 increments to 1** (and 1
  decrements to 12) **without** automatically flipping AM/PM.
- Minutes: stepper / select among **00 / 15 / 30 / 45**; empty input treated as
  `00` when saving or matching later.
- Meridiem: AM/PM select (default AM).

### Location / GPS

- Optional location text.
- Button: request current device coordinates (geolocation).
- Button: pick a photo for EXIF GPS only — **never** store the image as a memo
  attachment or dive photo from this flow.
- On failure to obtain coordinates from a photo: show the existing help panel
  pattern (iPhone/Safari file-picker location sharing; Android app /
  `ACCESS_MEDIA_LOCATION` guidance).

### Buddies / notes

- Free-text buddy field (reuse buddy separator conventions in UI hints if
  cheap).
- Notes textarea.

### UI

- List memos; create / edit / delete.
- No dive matching UI in this pass.

### Out of scope (memos)

- Hint box on dive detail when a log matches date/rough time.
- Persisting memo photos.

---

## Tests

- Contract/CSS: sticky top bars use `top: 0` and safe-area padding-top.
- Composer export invokes share after native save when shareable.
- Brand home behavior covered where practical (contract or focused unit).
- Dive-list filter: renamed label; matches `appEditedAt` and legacy app-only
  fields; does not treat composer-only state as edited.
- Memos: CRUD; defaults (heading, 10:00 AM); hour wrap 12→1 without meridiem
  flip; minute empty → 00; backup includes store; erase-dives keeps memos;
  erase-all clears memos; photo-GPS path does not persist attachments.
- i18n keys present in en / zh-Hant / ja.

## Docs

- HANDOFF + session note; USER-GUIDE brief memo mention; About filter wording;
  classify shared client + Android shortcut (if any) as **APK-affecting**.

## Success criteria

1. Scrolling the APK logbook no longer tucks the sticky header under the status
   bar.
2. Export image saves to Downloads (or equivalent) and opens the share sheet on
   Android.
3. Top-bar brand returns to the app home.
4. **Edited here** reflects in-app dive-data edits, not share-image creation.
5. Users can create/edit/delete memos from the import-guide entry (and shortcut
   if shipped), including GPS-from-photo without saving photos.

## Classification

**APK-affecting** (shared CSS/UI, IndexedDB/backup, optional Android shortcut).
