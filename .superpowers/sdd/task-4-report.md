# Task 4 Report: Chart series helper + offsets already wired

**Status:** DONE
**Branch:** `feature/compose-preset-redesign`

## Summary

Extracted `ChartSeries` type and `buildPressureSeries(dive, settings)` from the inline multi-cylinder pressure loop in `renderDiveChart`. All series still use `settings.pressureColor`; dash/widthScale match prior visual parity. Chart offsets remain wired in `image-composer` (Task 3); no changes there.

## TDD workflow

1. Wrote `tests/chart-series.test.mjs` — one series per cylinder, shared color.
2. Initial run: **fail** (`buildPressureSeries is not a function`).
3. Implemented extract + rewired `renderDiveChart` to map series list.
4. Final: **1/1 pass**; `npm run typecheck`: **pass**.

## Changes by file

### `lib/chart-renderer.ts`

- Added `ChartSeries` type and exported `buildPressureSeries`.
- `renderDiveChart` pressure branch iterates `buildPressureSeries(dive, settings)` instead of inline cylinder loop.

### `tests/chart-series.test.mjs` (new)

Recursive TS transpile loader (same pattern as `composer-stats.test.mjs`).

## Scope adherence

- No multi-tank UI or per-tank color settings.
- Did not commit `data/dive-sites.*` or `__pycache__`.

## Verification

```bash
node --test tests/chart-series.test.mjs
# 1 pass, 0 fail

npm run typecheck
# pass
```

## Commit

```
Extract chart pressure series list for future multi-tank colors.
```

Files: `lib/chart-renderer.ts`, `tests/chart-series.test.mjs`
Hash: `653fa5a`

## Concerns

None blocking. Per-tank colors are one map change away when Task/plan calls for it.
