# Empty-state dive-profile background

**Date:** 2026-08-06  
**Status:** Ready for review  
**Surface:** Empty logbook hero (`.empty-state` in `DiveFrameApp.tsx`)

## Problem

The empty-state hero uses two decorative CSS ellipses (`.empty-orbit`) that read as faint rings. We want a background that suggests DiveFrame’s product — a dive depth profile — without competing with the import CTAs.

## Decision

Replace the orbit divs with a single decorative SVG dive-profile line.

## Visual

- **Shape:** Lived-in classic profile — surface → descent → slight bottom undulation → ascent with a short safety-stop ledge → surface.
- **Style:** Stroke only; no fill; no X/Y axes, ticks, or labels.
- **Color / weight:** Match current orbit visibility — `rgba(141, 235, 215, 0.08)` (same as `.empty-orbit` border), ~1–1.5px stroke, non-interactive.
- **Placement:** Absolutely positioned behind `.empty-content` (`aria-hidden`), roughly vertically centered, ~75–90% of the empty-state width so the curve sits mid-screen around the hero copy.
- **Motion:** None required for v1 (static path).

## Implementation sketch

1. Remove `<div className="empty-orbit orbit-one" />` and `orbit-two` from `EmptyState`.
2. Add one inline SVG (or a tiny presentational component) with a fixed `viewBox` and a hand-authored path.
3. Replace `.empty-orbit` / `.orbit-one` / `.orbit-two` CSS with `.empty-dive-profile` sizing/positioning rules.
4. Keep body radial glow and empty-state layout otherwise unchanged.

## Out of scope

- Animating the line
- Using a real imported dive sample for the path
- Changing empty-state copy, CTAs, or proof row

## Success

On a fresh / empty logbook view, the faint rings are gone and a barely-visible teal dive-profile line sits mid-screen behind the hero without hurting text readability.
