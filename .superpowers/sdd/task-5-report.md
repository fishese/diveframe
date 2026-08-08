# Task 5 Report: Composer control IA + recipe apply + load normalize

**Status:** DONE
**Branch:** `feature/compose-preset-redesign`

## Summary

Rebuilt composer sidebar IA into ten collapsible sections (Photo / Layout preset / Panel open by default). Layout cards call `applyTemplateRecipe` for a full panel+layout reset. Load path uses `normalizeComposerSettings` instead of `repairLegacyTemplatePositions`. Added i18n for new presets and panel controls; removed retired template keys.

## Changes by file

### `app/compose/ComposerApp.tsx`

- Import `applyTemplateRecipe` + `normalizeComposerSettings`.
- Load: merge defaults → `normalizeComposerSettings` → logo soft-fix if `hidden`.
- Preset picker: `applyTemplateRecipe(current, template.id)`.
- Sections rebuilt per spec order; Panel (edge/fill/color/gradient/opacity/density/contrast/blur); Chart offsets + `graphGradient`; Canvas & export includes dimming/safe margins/export; Saved looks at end.
- Removed `repairLegacyTemplatePositions`.

### `lib/app-i18n/{en,ja,zh-Hant}.ts`

- Added layout/panel/section keys (+ gradient A/B/angle labels).
- Removed `fullWidthGraph*`, `landscapeDashboard*`, `cinematicSplit*`.
- `templateTranslationKeys` maps all four template ids.

### `tests/app-contract.test.mjs`

- Assertions updated for normalize / recipe apply / `savedLooks`.

## Verification

```bash
npm run typecheck
# pass
```

Manual smoke (`npm run dev`): **skipped** (no practical browser pass in this run).

## Commit

```
Reorganize composer controls around layout presets and panel settings.
```

Hash: `81eb109`
Files: ComposerApp, en/ja/zh-Hant i18n, app-contract test.

## Concerns

- Manual UI smoke not run; panel left/right + dock/band looks need a quick human check.
- `personalComposerPresets` i18n key retained unused (section title is `savedLooks`).
- Contract still asserts retired `layout === "graph|dashboard|split"` branches in image-composer (pre-existing; outside this task).
