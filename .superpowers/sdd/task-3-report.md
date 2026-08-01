# Task 3 Report: Trip UI — list blocks, select mode, details assignment

## Status

**DONE**

**Branch:** `feature/trip-user-gps-editors`
**Commit:** `eb7d0b6` — Add trip list blocks, select mode, and detail assignment.

## Summary

Wired trip presentation into `DiveFrameApp.tsx`: dive list now renders `buildDiveListRows` output (solo dives + collapsible trip blocks), added a list Select mode with bulk trip actions (New trip / Add to existing / Remove from trip), and extended the Edit dive details form with per-dive trip assignment, rename, and delete. Removed the duplicate `compareDives`/date-sort helpers from the app in favor of the `lib/dive-list-model.ts` exports from Task 1.

## Files changed

| File | Action |
|---|---|
| `app/DiveFrameApp.tsx` | Modified — trip state, list-block rendering, select mode, trip CRUD wiring in `DiveDetail`, removed duplicate sort helpers |
| `app/globals.css` | Modified — select-mode toggle/action bar, trip block/header, member indent, trip editor styles |
| `lib/app-i18n.ts` | Modified — added trip/select-mode strings (EN, zh-Hant, ja) |
| `tests/app-contract.test.mjs` | Modified — replaced stale `compareDivesByDate` assert with `lib/dive-list-model` import/usage asserts; added `selectMode`, `buildDiveListRows`, and trip class-name asserts |

## What shipped

### List rendering (Step 1–2)

- `refreshDives` and the initial load effect now fetch `listLocalTrips()` alongside `listLocalDives()`; `trips` kept in state.
- `diveListRows = buildDiveListRows(visibleDives, trips, sortOption)` replaces the flat `visibleDives.map`. Solo dives and trip blocks render in one interleaved list via a new `DiveRowButton` helper component (shared for solo + indented member rows).
- Trip header is a button that toggles `collapsedTripIds` (session-only `Set<string>`, default empty = all expanded); collapsed header shows trip name + dive count (`t("tripDiveCount")`).
- Members use `dive-row dive-row-trip-member` (indented via CSS `padding-left`).

### Select mode (Step 3)

- `selectMode` boolean + `selectedDiveIds: Set<string>`, toggled via a new `select-mode-toggle` button in the filter row.
- While active, `DiveRowButton` renders a checkbox and row clicks call `toggleDiveSelected` instead of `chooseDive` (via `handleDiveRowClick`).
- Action bar (`select-action-bar`) shows selected count + New trip (inline name form → `createLocalTrip` + `setLocalDiveTripIds`) / Add to existing (`<select>` of trips → `setLocalDiveTripIds`) / Remove from trip (`setLocalDiveTripIds(ids, null)`).
- Turning select mode off clears `selectedDiveIds`; successful bulk actions also clear the selection and refresh dives/trips.

### Edit dive details trip controls (Step 4)

- `DiveDetail` gained `trips`, `onAssignTrip`, `onCreateTrip`, `onRenameTrip`, `onDeleteTrip` props (backed by `setLocalDiveTripId`, `createLocalTrip`+`setLocalDiveTripId`, `renameLocalTrip`, `deleteLocalTrip`).
- Details editor form: Trip `<select>` (None / existing trips / "New trip…"); a name input appears for "New trip…"; when an existing trip is selected, inline **Rename trip** (immediate, own input) and **Delete trip** buttons appear.
- Trip assignment/creation is applied on the same form submit as site/details; rename and delete are immediate `type="button"` actions.
- Delete confirms via `window.confirm` (existing app pattern) — counts other dives referencing the trip and passes `clearAssignments: true` only when needed, otherwise a plain confirm; matches "empty only, or confirm clears all `tripId`s then deletes" edge case from the design doc.
- Read-only `details-list` now shows the current trip name (or "No trip").

### CSS + i18n + contract asserts (Step 5)

- New CSS: `.select-mode-toggle`, `.select-action-bar`/`-buttons`/`-count`, `.select-new-trip-form`, `.dive-row-selectable`, `.dive-row-checkbox`, `.dive-row-trip-member`, `.trip-block`, `.trip-header` (+ chevron/name/count), `.trip-editor`, `.trip-rename-row`, `.trip-manage-row`.
- i18n: added `trip`, `noTrip`, `newTripOption`, `newTripNamePlaceholder`, `renameTrip`, `deleteTrip`, `deleteTripConfirm(WithDives)`, `savingTripAssignment`, `tripAssignmentSaved/Failed`, `tripRenamed`, `tripDeleted`, `tripDeleteFailed`, `selectDives`, `exitSelectMode`, `selectedCount`, `createTrip`, `addToExistingTrip`, `removeFromTrip`, `tripDiveCount` — all three languages (EN, zh-Hant, ja).
- Contract asserts added: `selectMode`, `toggleSelectMode`, `collapsedTripIds`, `dive-row-trip-member`, `trip-header`, `trip-block`, `select-action-bar`, bulk `setLocalDiveTripIds` call sites, `deleteLocalTrip(tripId, { clearAssignments: ... })`, `t("trip")`/`t("noTrip")`/`t("newTripOption")`, and i18n-file presence of `newTripOption` / `deleteTripConfirmWithDives`. Replaced the now-stale `compareDivesByDate` assert with asserts for the `lib/dive-list-model` import, `buildDiveListRows` usage, and absence of a re-declared `compareDives`.

## Deviations from brief

- Brief said "New trip (prompt/name)"; implemented as an inline form (name input + Create button) inside the select-mode action bar and details editor, rather than `window.prompt`, to match the app's existing inline-form conventions (e.g. manual site entry). `window.confirm` is used for delete, matching existing usage elsewhere (`SettingsApp.tsx`).
- Trip rename/delete in Edit dive details are immediate actions (their own button, not deferred to the main form's Save), since they are independent IndexedDB writes from the trip *assignment* (which is deferred to Save, consistent with how site/location editing already worked).

## Tests

```
node --test tests/app-contract.test.mjs tests/dive-list-model.test.mjs
```
7/7 pass.

```
npm test
```
Runs `vinext build` (TypeScript + bundling) then the full `node --test` suite: **59 pass, 3 skipped (pre-existing, native/offline-only), 0 fail**.

```
npx tsc --noEmit -p tsconfig.json
```
No errors.

## Self-review

### Correctness vs. brief/design

- List blocks, indent class, expand/collapse (session-only, default expanded), select mode with checkboxes + action bar, and Edit dive details trip select/rename/delete all implemented per the brief's 6 steps.
- Design doc's "Trip headers are not themselves selectable targets" honored — header only toggles collapse; selection/opening applies to `DiveRowButton` rows (solo + members).
- "Actions apply to the currently visible (filtered) selection" — `selectedDiveIds` only ever contains IDs rendered from `visibleDives`/`diveListRows`, so bulk actions are implicitly scoped to what's visible.
- Partial-match approach A is naturally satisfied for future filter work: `buildDiveListRows` groups whatever pre-filtered array it's given, so once Task 6 adds date/computer filters, no additional grouping logic is needed here.
- `compareDives` duplicate removed from `DiveFrameApp.tsx` per Task 1's note; `DiveSortOption` and `compareDives` now imported from `lib/dive-list-model`. Also removed now-dead `compareNullableNumbers`/`compareDivesByDate`/`diveTimestamp` helpers (only used by the deleted `compareDives`).
- Global constraints: no schema bump, no `exportGpsPreference` UI touched, no consecutive-date validation added, collapse state kept in component `useState` only (not IndexedDB/preferences), committed once for this task.

### Known minor gaps / edge cases

- If a dive's `tripId` references a trip that no longer exists (shouldn't happen given delete always clears or requires empty), the Edit-details `<select>` would have a `value` not matching any `<option>` — browsers fall back to showing the first option without changing the underlying value; harmless but slightly surprising. Not reachable through this app's own flows since `deleteLocalTrip` always clears references first.
- Bulk "Add to existing" dropdown resets its own selection (`addToTripDraft`) after firing, so re-picking the same trip triggers `onChange` again as expected (value cycles back through the placeholder).
- No dedicated automated UI/interaction test for select mode or trip CRUD wiring was added (per brief, only contract asserts + the existing pure-helper tests apply here); manual PC verification of click-through flows was not run in this pass (no browser/dev-server smoke test performed), consistent with Task 2's note that "runtime IDB behavior should be smoke-tested manually in browser."

## Concerns

None blocking. Recommend a quick manual smoke test in the browser (create dive, select two dives, create a trip, expand/collapse, rename, delete) before Task 4 builds on top of this list UI.

## Review fixes (Critical/Important findings)

**Commit:** `a5b7c39` — Fix trip draft resync and scope bulk trip actions to visible dives.

1. **Critical — Duplicate trip on re-save:** `DiveDetail` now has a `useEffect` keyed on `[dive.id, dive.tripId, editingDetails]` that resets `tripDraft` (to `dive.tripId ?? ""`), `newTripNameDraft`, `tripRenameOpen`, and `tripRenameDraft`. Because `DiveDetail` is not remounted when the same dive's fields change (only `key`d by `dive.id`), this effect fires on every open/close of the editor (covering Cancel) and whenever the dive's actual `tripId` changes (covering successful save), so a lingering `"__new__"` sentinel can no longer survive into the next save.
2. **Important — Stale trip after delete:** Same effect covers this — `removeTrip` clears `tripId` via `refreshDives`/`setDives`, which updates the `dive` prop; the effect's `dive.tripId` dependency fires and resets `tripDraft` (and rename drafts) so Rename/Delete no longer point at a deleted trip id.
3. **Important — Select-mode bulk actions vs filters:** Added a `visibleDiveIds` memo (from `visibleDives`) and a `visibleSelectedDiveIds()` helper that intersects `selectedDiveIds` with it; `createTripFromSelection`, `addSelectionToTrip`, and `removeSelectionFromTrip` now all use this helper instead of raw `Array.from(selectedDiveIds)`. Additionally, a `useEffect` on `visibleDiveIds` proactively prunes `selectedDiveIds` when filters change, so the selection count and bulk actions never reference dives hidden by the current filters.

### Covering tests

- Added contract asserts in `tests/app-contract.test.mjs` proving the fix code paths exist: the `[dive.id, dive.tripId, editingDetails]` effect dependency array, presence of `visibleDiveIds`, the `visibleSelectedDiveIds` helper function, and its use (`const ids = visibleSelectedDiveIds();`) in the bulk-action handlers.
- No behavioral browser test was added (per Task 3's existing precedent of contract-only coverage for this UI); the static asserts fail if the reset/intersection code is later removed or the effect's dependency list is narrowed.

```
node --test tests/app-contract.test.mjs tests/dive-list-model.test.mjs
```
Result: **7/7 pass, 0 fail** (ran after the fix; includes 4 new asserts covering the fixes above).

```
npx tsc --noEmit -p tsconfig.json
```
No errors.
