# Task 6 Report: Collapsible date/computer filters + Reset + search haystack

## Status

**DONE**

**Branch:** `feature/trip-user-gps-editors`
**Commit:** `34fd83f` — Add collapsible date and computer dive list filters.

## Summary

Refactored `visibleDives` to filter via `diveMatchesListFilters` (from `lib/dive-list-model.ts`) instead of the old inline predicate, then sort and hand off to `buildDiveListRows` — search now includes `computerModel` for free via the shared model. Added a collapsible "Filters" panel (chevron toggle, `filtersOpen` state) below the existing chip row with From/To date inputs and a computer `<select>` populated from distinct `dive.computerModel` values (sorted). The existing "Clear" button now calls `resetFilters`, which clears `namedOnly`/`gpsOnly`/`appSiteOnly`/`dateFrom`/`dateTo`/`computerFilter` but leaves the search query untouched; it's disabled via `hasActiveFilters` when nothing is active.

## Files changed

| File | Action |
|---|---|
| `app/DiveFrameApp.tsx` | Modified — `dateFrom`/`dateTo`/`computerFilter`/`filtersOpen` state, `computerModels` memo, `hasActiveFilters`, `resetFilters`, refactored `visibleDives` to use `diveMatchesListFilters`, filter-panel JSX |
| `app/globals.css` | Modified — `.filter-toggle-chevron`, `.filter-panel`, `.filter-panel-field` |
| `lib/app-i18n.ts` | Modified — `moreFilters`, `dateFrom`, `dateTo`, `computerFilterLabel`, `allComputers` (EN, zh-Hant, ja) |
| `tests/app-contract.test.mjs` | Modified — filter state/handler/class/i18n asserts, `resetFilters` body checks it doesn't touch `setQuery` |

## Tests

```
npm test
```
67 pass, 3 skipped (pre-existing), 0 fail — includes `vinext build` (TS/type check) and `tests/dive-list-model.test.mjs` (already covered dateFrom/dateTo/computerModel predicates and search-includes-computerModel from Task 1, unchanged).

## Concerns

None blocking. `lib/dive-list-model.ts` and its tests already fully implemented `diveMatchesListFilters`/`buildDiveListRows` per Task 1, so this task was pure UI wiring + refactor of the stale inline filter in `DiveFrameApp.tsx`. Did not touch Task 7 docs or run `adb install`.
