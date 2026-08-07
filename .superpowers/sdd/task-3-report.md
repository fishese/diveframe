# Task 3 Report: Panel fill drawing + stats presentations

**Status:** DONE  
**Branch:** `feature/compose-preset-redesign`

## Summary

Introduced shared panel fill (`lib/composer-panel.ts`) and stats presentation (`lib/composer-stats.ts`) modules, rewired `renderComposition` to the recipe-driven pipeline, and removed the Task 2 `lowerPanelY` shim plus retired `layout === "graph"|"dashboard"|"split"|"right"` branches.

## TDD workflow

1. Wrote `tests/composer-stats.test.mjs` for icon-grid cap at 6.
2. Initial run: **fail** (`ENOENT` — `composer-stats.ts` missing).
3. Implemented `limitStatsForPresentation` (+ full stats/panel modules).
4. Loader needed recursive TS transpile-to-temp because data-URL imports cannot resolve relative deps; after that: **pass**.
5. Final suite: **6/6 pass**; `npm run typecheck`: **pass**.

## Changes by file

### `lib/composer-panel.ts` (new)

- `drawComposerPanel` — solid (opacity ≥ 0.92), frosted (clip + blur photo + tint; tint continues on filter failure), tint/gradient fills via `hexToRgba` / `gradientForPanel`.
- `blurBehindPanel` — soft blur pass for non-frosted fills when `blurBehindText` is on.

### `lib/composer-stats.ts` (new)

- `collectStatItems` — field/label/value from dive + visible fields (ported from old `buildStatistics`).
- `limitStatsForPresentation` — icon-grid → `slice(0, 6)`.
- `drawComposerStats` — icon-grid (3×2, canvas path icons), solid-band (multi-column), text-stack (vertical for tall panels, multi-column for bands); honors `panelDensity` and `textContrastBoost`.

### `lib/image-composer.ts`

Pipeline: photo → `panelRect` / `chartHomeRect`+`offsetRect` → dimming → above-panel chart → optional blur-behind → panel fill → in-panel chart → site/category/date → stats → logo.

Deleted layout-string branches. Chart still uses existing `renderDiveChart`.

### `lib/composer-layout.ts`

Removed `lowerPanelY` shim.

### `app/compose/ComposerApp.tsx` (minimal typecheck stub)

- `templateTranslationKeys` maps four recipe ids (new two reuse existing copy until Task 5).
- Dropped retired-id branches in `repairLegacyTemplatePositions`.

### `tests/composer-stats.test.mjs` (new)

Icon-grid cap test with recursive transpile loader.

## Self-review

### Correctness

- Brief pipeline followed; **in-panel chart draws after panel fill** so right-panel chart is not covered by tint (above-panel still draws before frost so blur does not wipe it).
- Frosted fallback paints tint even when blur throws.
- Stats capped at 6 for icon-grid only.

### Scope adherence

- No ComposerApp control IA rebuild (Task 5).
- No chart series extract (Task 4).
- Did not commit `data/dive-sites.*` or `__pycache__`.

### Known follow-ups

- Task 5: real i18n keys for Bottom Stats Dock / Solid Info Band; panel control section.
- Task 4: pressure series extract.
- `graphGradient` setting is unused by the new panel path (panel uses `panelGradient`); Chart section can reclaim it later.
- Right-panel text-stack may overlap in-panel chart if many fields are shown — density/layout polish later.

## Verification

```bash
node --test tests/composer-stats.test.mjs tests/composer-layout.test.mjs tests/composer-settings-normalize.test.mjs
# 6 pass, 0 fail

npm run typecheck
# pass
```

## Commit

```
Draw shared panel fills and dock/solid-band stats layouts.
```

Files: `lib/composer-panel.ts`, `lib/composer-stats.ts`, `lib/image-composer.ts`, `lib/composer-layout.ts`, `tests/composer-stats.test.mjs`, `app/compose/ComposerApp.tsx`

## Review fix: frosted / blurBehind dimming

**Problem:** After clipped `redrawPhoto()`, frosted and blurBehind panels redrew the undimmed photo, so Bottom Stats Dock looked brighter than the surrounding dimmed canvas.

**Fix:** Pass `backgroundDimming` into `drawComposerPanel` / `blurBehindPanel`. After `redrawPhoto()` inside the clip, when `backgroundDimming > 0`, re-apply `rgba(2, 14, 21, …)` over the panel rect before frost tint (frosted) or before restore (blurBehind). Tint behavior otherwise unchanged.

**Verification:**

```bash
npm run typecheck
# pass

node --test tests/composer-stats.test.mjs tests/composer-layout.test.mjs tests/composer-settings-normalize.test.mjs
# 6 pass, 0 fail
```

**Commit:**

```
Re-apply background dimming inside frosted panel redraw.
```

Files: `lib/composer-panel.ts`, `lib/image-composer.ts`
