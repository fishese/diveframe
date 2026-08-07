# Compose preset redesign

**Date:** 2026-08-07  
**Status:** Ready for review  
**Branch:** `feature/compose-preset-redesign`  
**Surfaces:** Image composer (`lib/templates.ts`, `lib/composer-settings.ts`, `lib/image-composer.ts`, `app/compose/ComposerApp.tsx`, i18n)

## Problem

Composer layout presets are too similar. Three of five templates (`full-width-graph`, `landscape-dashboard`, `cinematic-split`) do not earn their place. Users want clearly distinct looks — including a bottom frosted stats dock and a solid horizontal info band — plus a first-class info **panel** they can place and style, not only pick via preset.

## Goals

1. Keep **Bottom Profile** and **Right Information Panel**; replace the other three with two new presets.
2. Ship **Bottom Stats Dock**: frosted bottom stats, icon grid up to 3×2, defaults duration / max depth / temperature, default ratio 16:9, **chart on by default**.
3. Ship **Solid Info Band**: non-transparent panel, horizontal bottom by default, scales with more fields, **chart on by default**.
4. Make the info **panel** placeable on any edge and stylable (fill mode, color, optional gradient, opacity, density, contrast boost).
5. Reorganize composer controls into clear collapsible sections (full UI replace allowed).
6. Future-proof chart drawing for multiple tank-pressure series later (structure only; no multi-tank UI now).

## Non-goals

- Multi-tank UI or multiple colored pressure lines in the product UI (structure only).
- Full chart-edge placement parallel to `panelEdge` (chart home rect stays preset-owned).
- Legacy migration maps for retired template IDs (dumb fallback only).
- Personal-preset schema versioning beyond “apply what we can + recipe defaults for gaps.”

## Decisions

| Topic | Choice |
|---|---|
| Preset count | Four total |
| Keep | `bottom-profile`, `right-panel` |
| Add | `bottom-stats-dock` (“Bottom Stats Dock”), `solid-info-band` (“Solid Info Band”) |
| Retire | `full-width-graph`, `landscape-dashboard`, `cinematic-split` |
| Wide / 16:9 default recipe | Bottom Stats Dock |
| Architecture | Presets as **recipes** over a shared panel + chart engine |
| Chart default | **On** for all four presets (samples include charts) |
| Chart ownership | Preset seeds home region + height; not independently edge-placed |
| Chart fine-tune | `chartOffsetX` / `chartOffsetY` free-float sliders (like logo) |
| Panel edges | `top` \| `bottom` \| `left` \| `right` |
| Panel fill | Full control: mode + color + optional 2-stop gradient + opacity |
| Extra controls | Panel density + text contrast boost |
| Preset apply | **Full reset** of layout + panel style + density + chart offsets to recipe defaults |
| Legacy templates | No migration table; unknown/retired → `bottom-stats-dock` + that recipe’s seeds |
| Chart terminology | One **chart** block that may include depth, temperature, tank pressure, etc. — not “depth-only profile” |

## Preset roster

| ID | Name | Default ratio | Chart | Panel seed | Stats presentation | Default visible stats |
|---|---|---|---|---|---|---|
| `bottom-profile` | Bottom Profile | 4:5 | On — lower band | Bottom, **tint** | Text rows with chart | Keep current defaults |
| `right-panel` | Right Information Panel | 4:5 | On — compact | Right, **tint** | Vertical stack | Keep current defaults |
| `bottom-stats-dock` | Bottom Stats Dock | **16:9** | On — lower band above dock | Bottom, **frosted** | Icon + value grid, ≤ **3×2** | Duration, max depth, temperature |
| `solid-info-band` | Solid Info Band | 4:5 | On — lower band above band | Bottom, **solid** | Label + value; columns/height grow with fields | Richer: duration, max depth, average depth, temperature, start/end pressure, gas mix |

### Bottom Stats Dock

- Chart sits in the lower photo region **above** the frosted dock (not inside the frosted strip).
- Dock cells: icon + value (+ short label); max 6 visible stats in a 3×2 grid; fewer fields → fewer cells.
- Site / date / logo stay on the photo via existing block positions (not forced into the dock).

### Solid Info Band

- Solid, non-transparent horizontal bottom band by default.
- Band height grows as more fields are enabled rather than overflowing awkwardly.
- Same panel settings apply if the user later moves the panel to left / right / top.

## Panel model

First-class `ComposerSettings` fields (names may be refined in the plan):

| Field | Values / shape | Notes |
|---|---|---|
| `panelEdge` | `top` \| `bottom` \| `left` \| `right` | Horizontal → band; vertical → sidecar |
| `panelFillMode` | `solid` \| `frosted` \| `tint` | Solid Info Band / Dock / Profile+Right defaults |
| `panelColor` | color string | Base fill |
| `panelGradient` | `{ enabled, colorA, colorB, angle }` | Optional 2-stop |
| `panelOpacity` | 0–1 | Meaningful for tint/frosted; solid clamps toward opaque |
| `panelDensity` | `compact` \| `comfortable` \| `roomy` | Padding + in-panel type scale |
| `textContrastBoost` | boolean | Extra stroke/scrim when text sits on busy photo / frost |

Site / category / date / logo keep `blockPositions`. Chart home region stays recipe-owned; users may hide via `chartMode: hidden` and nudge via offsets.

## Chart model

- Preset seeds home rect (`chartHeight` + recipe region).
- New: `chartOffsetX`, `chartOffsetY` (same −0.5…0.5 range style as logo) — **free float**, no clamp to panel.
- **Future-proof (no UI now):** chart drawer accepts a list of series `{ id, label?, color, points }` so multiple tank-pressure lines can be added later. Today’s single pressure line is `series.length === 1` (or equivalent). Depth and temperature remain separate series channels as today.

## Architecture

Templates become thin **recipes**: id, name, description, `defaultRatio`, chart defaults (height/region, mode on), panel seed (edge, fill mode, colors/gradient/opacity, density, contrast boost), default `visibleFields`, default `blockPositions`, and zeroed chart offsets.

**Render pipeline** (`image-composer`):

1. Photo (+ fit/crop/dimming)
2. Chart (if not hidden) at recipe home rect + offsets
3. Panel (edge + fill/blur/gradient)
4. Text / stats / logo from block positions

Stats layout switches by recipe: icon grid (dock) vs stacked/columns (others). No separate render branch per retired `layout: graph | dashboard | split`.

**Load path:** `TemplateId` union is the four ids only. Unknown or retired stored ids coerce to `bottom-stats-dock` and apply that recipe’s seeds for any missing panel fields.

**Frosted fallback:** if backdrop blur is weak/unavailable, draw a solid-tint at the same opacity so content stays readable.

## Composer control IA

Full replace of composer control grouping is allowed. Keep collapsible `ControlSection` pattern.

| Order | Section | Default | Contents |
|---|---|---|---|
| 1 | Photo | Open | Choice, crop, fit/zoom/offset/rotate |
| 2 | Layout preset | Open | Four recipe cards only (full reset on pick) |
| 3 | Panel | Open | Edge, fill mode, color, gradient, opacity, density, contrast boost |
| 4 | Fields | Closed | Site override, category, visible-field checkboxes |
| 5 | Chart | Closed | Mode, series colors, thickness, fill, height, axis labels, **offset X/Y** |
| 6 | Overlay positions | Closed | Site / category / date / statistics / chart block positions |
| 7 | Type & units | Closed | Overlay language, font, size, color, align, text treatment, units, date/time, decimals |
| 8 | Logo | Closed | Show, position, offsets |
| 9 | Canvas & export | Closed | Ratio, resolution, format, JPEG quality, background dimming, safe margins, export |
| 10 | Saved looks | Closed | Personal composer presets (save / apply / delete) |

### Redistribution notes

- Panel opacity and panel styling leave the old Appearance dump → **Panel**.
- Background dimming + safe margins → **Canvas & export**.
- Prefer: blur-behind-text under **Panel** when useful alongside non-frosted fills; graph gradient under **Chart**.
- Only Photo + Layout preset + Panel start open.

## Fallbacks

- Retired/unknown `templateId` → `bottom-stats-dock` + full recipe seeds.
- Old saved settings missing new panel/offset fields → fill from active recipe seeds.
- Weak blur → tint fallback at same opacity.

## Testing

- Unit: recipe seeds; unknown-id fallback; panel geometry for four edges × three fill modes; chart offset free-float math.
- Composer output checks for each preset’s default look.
- UI: sections collapse; picking a layout preset resets panel fields and chart offsets.

## Success criteria

- Four clearly distinct presets; retired three gone from picker and type union.
- Bottom Stats Dock and Solid Info Band match the intended looks (frosted icon dock vs solid scalable band), both with chart on by default.
- Users can move the panel to any edge and restyle fill/color/gradient/opacity/density without picking a different preset.
- Chart can be nudged freely with X/Y sliders.
- Composer sidebar is scannable: related controls grouped, unrelated sections collapsed by default.
- Chart code path can accept multiple pressure series later without reshaping panel/preset work.
