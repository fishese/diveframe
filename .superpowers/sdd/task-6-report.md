# Task 6 Report: Contract tests, polish, verification

**Status:** DONE  
**Branch:** `feature/compose-preset-redesign`

## Summary

Cleared remaining retired layout assertions from `tests/app-contract.test.mjs`, locked the four recipe ids plus new panel/chart default fields, and wired the new unit test files into `npm test`. Skipped whats-new / PRODUCT-SPEC (YAGNI).

## Changes by file

### `tests/app-contract.test.mjs`

- Assert `TEMPLATES` includes `bottom-profile`, `right-panel`, `bottom-stats-dock`, `solid-info-band`.
- Assert retired ids (`full-width-graph`, `landscape-dashboard`, `cinematic-split`) are absent from `TEMPLATES`.
- Assert `defaultComposerSettings` keys: `panelEdge`, `panelFillMode`, `panelDensity`, `textContrastBoost`, `chartOffsetX`, `chartOffsetY`.
- Replace retired `layout === "graph|dashboard|split"` positive matches with recipe pipeline asserts (`panelRect`, `chartHomeRect`, `drawComposerPanel`, `drawComposerStats`) and `doesNotMatch` for retired layout/`lowerPanelY`.

### `package.json`

Added to `test` script: `chart-series`, `composer-layout`, `composer-settings-normalize`, `composer-stats`.

## Scope notes

- `landscape-dashboard` remains only in `tests/composer-settings-normalize.test.mjs` as the retired-id coercion fixture (intentional).
- Docs / `.superpowers` historical mentions left alone.
- Did not commit `data/dive-sites.*` or `__pycache__`.

## Verification

```bash
npm run typecheck
# pass

node --test tests/composer-settings-normalize.test.mjs tests/composer-layout.test.mjs tests/composer-stats.test.mjs tests/chart-series.test.mjs tests/composer-presets.test.mjs tests/composer-output.test.mjs tests/app-contract.test.mjs
# 11 pass, 0 fail

npm test
# build + typecheck + 129 pass, 3 skipped, 0 fail
```

## Commit

```
Lock composer preset redesign with contract and unit coverage.
```

Hash: `72948a7`  
Files: `tests/app-contract.test.mjs`, `package.json`.

## Concerns

- Manual UI smoke for dock/band looks still not run (carried from Task 5).
- `task-6-brief.md` on disk still described an unrelated trip-filters task; used plan Task 6 from `docs/superpowers/plans/2026-08-07-compose-preset-redesign.md`.

---

## Branch review fixes (Critical + Important)

**Status:** DONE  
**Date:** 2026-08-07

### Fixes

1. **Critical — right-panel stats vs titles:** `drawComposerStats` / `textStackStartY` take `StatsLayoutContext` (`titleReserveTop`, `chartRegion`, `chartRect`, `chartVisible`). Vertical text-stack starts below inside-panel titles and below in-panel chart (not at the same top as site/category/date).
2. **Important — `graphGradient`:** When true and chart is `above-panel`, `drawGraphAreaGradient` paints a soft vertical wash behind the chart home rect before the chart. Settings field + Chart checkbox kept; not tied to `panelGradient` (panel fill remains separate).
3. **Important — personal preset apply:** `applySelectedPreset` runs `normalizeComposerSettings(applyComposerPreset(...))` before `setSettings`.
4. **Important — solid-info-band height:** `panelRect` accepts optional `contentHint` `{ statCount, presentation }`; horizontal bands grow with visible stats (esp. `solid-band`), capped at 42% frame height. `image-composer` collects stats before computing the panel.
5. **Important — Overlay Positions honesty:** Removed `chart` and `statistics` from the Overlay Positions UI (positions beyond `hidden` were unused for chart; chart uses Chart mode, stats use field visibility). `blockPositions.statistics === "hidden"` still honored if set. Settings fields retained for compatibility.

### Verification

```bash
npm run typecheck
# pass

node --test tests/composer-layout.test.mjs tests/composer-stats.test.mjs tests/composer-settings-normalize.test.mjs tests/chart-series.test.mjs tests/app-contract.test.mjs
# 10 pass, 0 fail
```

### Files

- `lib/composer-layout.ts`, `lib/composer-stats.ts`, `lib/image-composer.ts`
- `app/compose/ComposerApp.tsx`
- `tests/composer-layout.test.mjs`, `tests/composer-stats.test.mjs`, `tests/app-contract.test.mjs`
