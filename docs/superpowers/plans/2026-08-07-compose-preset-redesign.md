# Compose Preset Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three look-alike composer templates with Bottom Stats Dock and Solid Info Band, and make the info panel a first-class placeable/stylable block with a reorganized composer control UI.

**Architecture:** Layout presets become thin recipes that seed defaults. Runtime always draws photo → chart (recipe home rect + free-float offsets) → panel (edge + fill/gradient) → overlays. Unknown/retired `templateId`s coerce to `bottom-stats-dock` with no legacy migration map.

**Tech Stack:** TypeScript, canvas (`lib/image-composer.ts`, `lib/chart-renderer.ts`), React composer (`app/compose/ComposerApp.tsx`), i18n (`lib/app-i18n/{en,ja,zh-Hant}.ts`), Node test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-08-07-compose-preset-redesign-design.md`

## Global Constraints

- Four `TemplateId`s only: `bottom-profile`, `right-panel`, `bottom-stats-dock`, `solid-info-band`
- Chart **on by default** for all four recipes
- Panel edges: `top` | `bottom` | `left` | `right`
- Panel fill modes: `solid` | `frosted` | `tint`
- Preset pick = **full reset** of layout + panel style + density + contrast boost + chart offsets to recipe seeds
- Retired/unknown template → `bottom-stats-dock` (no per-id migration table)
- Chart X/Y offsets free-float (no clamp to panel)
- Multi-tank UI out of scope; chart series helper must accept N pressure series
- Full composer control IA replace allowed; keep collapsible `ControlSection`
- Do not commit unrelated `data/dive-sites.*` or `__pycache__` changes

## File map

| File | Responsibility |
|---|---|
| `lib/composer-settings.ts` | Types, defaults, `normalizeComposerSettings`, panel/chart offset fields |
| `lib/templates.ts` | Four recipes with panel + chart + field seeds; `applyTemplateRecipe` |
| `lib/composer-layout.ts` | `panelRect`, `chartHomeRect`, `offsetRect` (replace layout-string `lowerPanelY`) |
| `lib/composer-panel.ts` | Draw panel fill (solid/frosted/tint + gradient); density padding helpers |
| `lib/composer-stats.ts` | Build visible stats list; draw text stack vs dock icon grid vs solid-band columns |
| `lib/image-composer.ts` | Orchestrate render pipeline; use layout/panel/stats helpers |
| `lib/chart-renderer.ts` | `buildPressureSeries` + draw from series list (colors ready for later) |
| `lib/composer-presets.ts` | Unchanged API; new fields ride along via `ComposerSettings` |
| `app/compose/ComposerApp.tsx` | New control IA; recipe apply; normalize on load |
| `lib/app-i18n/{en,ja,zh-Hant}.ts` | New preset + panel control strings; remove retired preset keys |
| `tests/composer-layout.test.mjs` | Panel/chart geometry + offsets |
| `tests/composer-settings-normalize.test.mjs` | Coercion + missing-field fill |
| `tests/composer-presets.test.mjs` | Drop retired template ids from fixtures |
| `tests/composer-output.test.mjs` | Update layout tests for new API |
| `tests/app-contract.test.mjs` | Assert four templates + new default fields |

---

### Task 1: Settings types, normalize, and four recipes

**Files:**
- Modify: `lib/composer-settings.ts`
- Modify: `lib/templates.ts`
- Create: `tests/composer-settings-normalize.test.mjs`
- Modify: `tests/app-contract.test.mjs` (template id / default field asserts only as needed)
- Modify: `tests/composer-presets.test.mjs` (fixture ids)

**Interfaces:**
- Produces:
  - `TemplateId = "bottom-profile" | "right-panel" | "bottom-stats-dock" | "solid-info-band"`
  - `PanelEdge = "top" | "bottom" | "left" | "right"`
  - `PanelFillMode = "solid" | "frosted" | "tint"`
  - `PanelDensity = "compact" | "comfortable" | "roomy"`
  - `PanelGradient = { enabled: boolean; colorA: string; colorB: string; angle: number }`
  - `ComposerSettings` gains: `panelEdge`, `panelFillMode`, `panelColor`, `panelGradient`, `panelDensity`, `textContrastBoost`, `chartOffsetX`, `chartOffsetY` (keep `panelOpacity`)
  - `normalizeComposerSettings(raw: ComposerSettings): ComposerSettings`
  - `TemplateDefinition` recipe shape below
  - `applyTemplateRecipe(settings: ComposerSettings, templateId: TemplateId): ComposerSettings`

- [ ] **Step 1: Write failing normalize tests**

Create `tests/composer-settings-normalize.test.mjs` using the same `loadTypeScriptModule` pattern as `tests/composer-output.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(path) {
  const source = await readFile(path, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

const settingsMod = await loadTypeScriptModule("lib/composer-settings.ts");
// templates imports composer-settings — load templates after settings exists, or test normalize via a small export that uses getTemplate internally once templates are updated in Step 3.

test("retired templateId coerces to bottom-stats-dock", () => {
  const base = settingsMod.defaultComposerSettings("dive-1");
  const normalized = settingsMod.normalizeComposerSettings({
    ...base,
    templateId: "landscape-dashboard",
  });
  assert.equal(normalized.templateId, "bottom-stats-dock");
});

test("missing panel fields fill from active recipe", () => {
  const base = settingsMod.defaultComposerSettings("dive-1");
  const { panelEdge, panelFillMode, chartOffsetX, ...rest } = base;
  const normalized = settingsMod.normalizeComposerSettings(rest);
  assert.equal(typeof normalized.panelEdge, "string");
  assert.equal(typeof normalized.panelFillMode, "string");
  assert.equal(normalized.chartOffsetX, 0);
  assert.equal(normalized.chartOffsetY, 0);
});
```

Note: if circular import makes transpile awkward, put `normalizeComposerSettings` in `lib/composer-settings.ts` and have it import `getTemplate` / `KNOWN_TEMPLATE_IDS` from `templates.ts` (templates already imports settings types — break the cycle by exporting `FALLBACK_TEMPLATE_ID` and recipe seed defaults from `templates.ts`, and keep `normalizeComposerSettings` in `templates.ts` instead if needed). Prefer: **`normalizeComposerSettings` lives in `lib/templates.ts`** next to recipes, re-exported or imported by ComposerApp. Adjust the test to load `lib/templates.ts` (and its deps) the same way other tests do, or split seed constants into `lib/composer-recipe-seeds.ts` with no cycles.

Recommended no-cycle split:

- `lib/composer-settings.ts` — types + `defaultComposerSettings` including new fields with Bottom Profile seeds
- `lib/templates.ts` — `TEMPLATES`, `getTemplate`, `isTemplateId`, `normalizeComposerSettings`, `applyTemplateRecipe`

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/composer-settings-normalize.test.mjs`  
Expected: FAIL (missing exports / wrong template union)

- [ ] **Step 3: Implement types + defaults + recipes**

In `lib/composer-settings.ts`, replace `TemplateId` and extend `ComposerSettings` + `defaultComposerSettings`:

```ts
export type TemplateId =
  | "bottom-profile"
  | "right-panel"
  | "bottom-stats-dock"
  | "solid-info-band";

export type PanelEdge = "top" | "bottom" | "left" | "right";
export type PanelFillMode = "solid" | "frosted" | "tint";
export type PanelDensity = "compact" | "comfortable" | "roomy";
export type PanelGradient = {
  enabled: boolean;
  colorA: string;
  colorB: string;
  angle: number;
};
```

Default new fields (Bottom Profile seeds):

```ts
panelEdge: "bottom",
panelFillMode: "tint",
panelColor: "#03141d",
panelGradient: {
  enabled: true,
  colorA: "#03141d",
  colorB: "#03141d",
  angle: 90,
},
panelDensity: "comfortable",
textContrastBoost: false,
chartOffsetX: 0,
chartOffsetY: 0,
// keep panelOpacity: 0.68
```

Rewrite `lib/templates.ts`:

```ts
export type TemplateDefinition = {
  id: TemplateId;
  name: string;
  description: string;
  accent: string;
  defaultRatio: CanvasRatio;
  defaultChartHeight: number;
  /** How stats are laid out inside the panel */
  statsPresentation: "text-stack" | "icon-grid" | "solid-band";
  /** Chart home: lower band above horizontal panel, or compact inside vertical panel stack */
  chartRegion: "above-panel" | "in-panel";
  panel: {
    edge: PanelEdge;
    fillMode: PanelFillMode;
    color: string;
    gradient: PanelGradient;
    opacity: number;
    density: PanelDensity;
    textContrastBoost: boolean;
  };
  defaultPositions: ComposerSettings["blockPositions"];
  defaultVisibleFields: ComposerSettings["visibleFields"];
};
```

Seed the four recipes per spec:

| id | ratio | chartHeight | chartRegion | statsPresentation | panel |
|---|---|---|---|---|---|
| `bottom-profile` | 4:5 | 0.27 | above-panel | text-stack | bottom / tint / opacity 0.68 |
| `right-panel` | 4:5 | 0.22 | in-panel | text-stack | right / tint / opacity 0.68 |
| `bottom-stats-dock` | 16:9 | 0.28 | above-panel | icon-grid | bottom / frosted / opacity ~0.55 |
| `solid-info-band` | 4:5 | 0.24 | above-panel | solid-band | bottom / solid / opacity 1 |

`bottom-stats-dock` `defaultVisibleFields`: only `duration`, `maxDepth`, `temperature` true among stats; keep site/category/date true as today for overlay; pressures/gas false.  
`solid-info-band`: duration, maxDepth, averageDepth, temperature, startPressure, endPressure, gasMix true.

```ts
export const FALLBACK_TEMPLATE_ID: TemplateId = "bottom-stats-dock";

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATES.some((template) => template.id === value);
}

export function getTemplate(id: string) {
  return TEMPLATES.find((template) => template.id === id) ?? getTemplate(FALLBACK_TEMPLATE_ID);
}

export function applyTemplateRecipe(
  settings: ComposerSettings,
  templateId: TemplateId,
): ComposerSettings {
  const recipe = getTemplate(templateId);
  return {
    ...settings,
    templateId: recipe.id,
    ratio: recipe.defaultRatio,
    chartHeight: recipe.defaultChartHeight,
    chartOffsetX: 0,
    chartOffsetY: 0,
    blockPositions: { ...recipe.defaultPositions },
    visibleFields: { ...recipe.defaultVisibleFields },
    panelEdge: recipe.panel.edge,
    panelFillMode: recipe.panel.fillMode,
    panelColor: recipe.panel.color,
    panelGradient: { ...recipe.panel.gradient },
    panelOpacity: recipe.panel.opacity,
    panelDensity: recipe.panel.density,
    textContrastBoost: recipe.panel.textContrastBoost,
  };
}

export function normalizeComposerSettings(raw: ComposerSettings): ComposerSettings {
  const templateId = isTemplateId(raw.templateId)
    ? raw.templateId
    : FALLBACK_TEMPLATE_ID;
  const recipe = getTemplate(templateId);
  const withTemplate =
    templateId === raw.templateId
      ? { ...raw, templateId }
      : applyTemplateRecipe(raw, templateId);
  return {
    ...withTemplate,
    panelEdge: withTemplate.panelEdge ?? recipe.panel.edge,
    panelFillMode: withTemplate.panelFillMode ?? recipe.panel.fillMode,
    panelColor: withTemplate.panelColor ?? recipe.panel.color,
    panelGradient: withTemplate.panelGradient ?? { ...recipe.panel.gradient },
    panelDensity: withTemplate.panelDensity ?? recipe.panel.density,
    textContrastBoost: withTemplate.textContrastBoost ?? recipe.panel.textContrastBoost,
    chartOffsetX: withTemplate.chartOffsetX ?? 0,
    chartOffsetY: withTemplate.chartOffsetY ?? 0,
  };
}
```

When coercing retired ids, always `applyTemplateRecipe` (full seed), not partial merge.

- [ ] **Step 4: Update dependent fixtures**

In `tests/composer-presets.test.mjs`, replace `landscape-dashboard` / `cinematic-split` with `bottom-stats-dock` / `right-panel`.  
Update `tests/app-contract.test.mjs` assertions that mention five templates or retired ids (search for `full-width-graph`, `landscape-dashboard`, `cinematic-split`, `TEMPLATES`).

- [ ] **Step 5: Run tests — expect PASS**

Run:

```bash
node --test tests/composer-settings-normalize.test.mjs tests/composer-presets.test.mjs
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/composer-settings.ts lib/templates.ts tests/composer-settings-normalize.test.mjs tests/composer-presets.test.mjs tests/app-contract.test.mjs
git commit -m "Add four composer recipes and normalize retired template ids."
```

---

### Task 2: Panel and chart layout geometry

**Files:**
- Modify: `lib/composer-layout.ts`
- Create: `tests/composer-layout.test.mjs` (or replace contents of geometry tests currently in `tests/composer-output.test.mjs`)
- Modify: `tests/composer-output.test.mjs` (remove obsolete `lowerPanelY("dashboard")` tests)

**Interfaces:**
- Consumes: `PanelEdge`, `ComposerSettings` chartHeight / offsets, recipe `chartRegion`
- Produces:
  - `panelRect(edge, width, height, chartHeight, density, contentHint?): { x,y,width,height }`
  - `chartHomeRect(region, panel, width, height, chartHeight): ChartRect`
  - `offsetRect(rect, offsetX, offsetY, canvasWidth, canvasHeight): ChartRect` — free float: `x += offsetX * canvasWidth`, `y += offsetY * canvasHeight` (same convention as logo)

- [ ] **Step 1: Write failing geometry tests**

```js
const layout = await loadTypeScriptModule("lib/composer-layout.ts");

test("bottom panel occupies the lower band", () => {
  const panel = layout.panelRect("bottom", 1000, 1000, 0.25, "comfortable");
  assert.equal(panel.x, 0);
  assert.ok(panel.y > 500);
  assert.equal(panel.width, 1000);
  assert.ok(panel.height > 100);
});

test("right panel occupies the right strip", () => {
  const panel = layout.panelRect("right", 1000, 1000, 0.22, "comfortable");
  assert.ok(panel.x > 500);
  assert.equal(panel.y, 0);
  assert.equal(panel.height, 1000);
});

test("chart offset free-floats without clamping to panel", () => {
  const home = { x: 100, y: 600, width: 800, height: 200 };
  const moved = layout.offsetRect(home, 0.1, -0.2, 1000, 1000);
  assert.equal(moved.x, 200);
  assert.equal(moved.y, 400);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/composer-layout.test.mjs`  
Expected: FAIL

- [ ] **Step 3: Implement layout helpers**

Replace `lowerPanelY` usage with edge-based geometry:

```ts
export type LayoutRect = { x: number; y: number; width: number; height: number };

const DENSITY_PAD = { compact: 0.85, comfortable: 1, roomy: 1.18 } as const;

export function panelRect(
  edge: PanelEdge,
  width: number,
  height: number,
  chartHeight: number,
  density: PanelDensity,
): LayoutRect {
  const padScale = DENSITY_PAD[density];
  if (edge === "left" || edge === "right") {
    const strip = width * (0.34 * padScale);
    return edge === "right"
      ? { x: width - strip, y: 0, width: strip, height }
      : { x: 0, y: 0, width: strip, height };
  }
  // Reserve chart band for above-panel recipes when edge is bottom/top.
  const band = height * Math.min(0.42, 0.18 * padScale + chartHeight * 0.35);
  return edge === "top"
    ? { x: 0, y: 0, width, height: band }
    : { x: 0, y: height - band, width, height: band };
}

export function chartHomeRect(
  region: "above-panel" | "in-panel",
  panel: LayoutRect,
  width: number,
  height: number,
  chartHeight: number,
  margin: number,
): LayoutRect {
  if (region === "in-panel") {
    return {
      x: panel.x + margin,
      y: panel.y + panel.height * 0.55,
      width: panel.width - margin * 2,
      height: panel.height * chartHeight,
    };
  }
  // above-panel: sit just above bottom/top panel, or beside vertical panel in photo area
  if (panel.y > 0) {
    const h = height * chartHeight;
    return {
      x: margin,
      y: panel.y - h - height * 0.01,
      width: width - margin * 2,
      height: h,
    };
  }
  if (panel.height < height && panel.x === 0 && panel.width === width) {
    // top edge panel — chart just below panel
    const h = height * chartHeight;
    return { x: margin, y: panel.height + height * 0.01, width: width - margin * 2, height: h };
  }
  // vertical panel — chart in remaining photo width
  const photoWidth = panel.x > 0 ? panel.x : width - panel.width;
  const photoX = panel.x > 0 ? 0 : panel.width;
  const h = height * chartHeight;
  return {
    x: photoX + margin,
    y: height - h - margin,
    width: photoWidth - margin * 2,
    height: h,
  };
}

export function offsetRect(
  rect: LayoutRect,
  offsetX: number,
  offsetY: number,
  canvasWidth: number,
  canvasHeight: number,
): LayoutRect {
  return {
    ...rect,
    x: rect.x + offsetX * canvasWidth,
    y: rect.y + offsetY * canvasHeight,
  };
}
```

Tune constants so Bottom Profile / Dock still look balanced; tests assert relative geometry, not exact pixels beyond offset math.

- [ ] **Step 4: Run — expect PASS**

Run: `node --test tests/composer-layout.test.mjs tests/composer-output.test.mjs`  
Expected: PASS (after removing/updating old `lowerPanelY` tests)

- [ ] **Step 5: Commit**

```bash
git add lib/composer-layout.ts tests/composer-layout.test.mjs tests/composer-output.test.mjs
git commit -m "Add edge-based panel and free-float chart layout helpers."
```

---

### Task 3: Panel fill drawing + stats presentations

**Files:**
- Create: `lib/composer-panel.ts`
- Create: `lib/composer-stats.ts`
- Modify: `lib/image-composer.ts` (wire pipeline; remove `layout === "graph"|"dashboard"|"split"` branches)
- Optional small unit test: `tests/composer-stats.test.mjs` for “icon-grid caps at 6”

**Interfaces:**
- Consumes: panel settings, recipe `statsPresentation`, dive + visible fields
- Produces:
  - `drawComposerPanel(ctx, panel, settings, photoDrawer): void`
  - `collectStatItems(dive, settings): { field, label, value }[]`
  - `drawComposerStats(ctx, panel, items, presentation, settings, fontStack): void`

- [ ] **Step 1: Write failing stats cap test**

```js
test("icon-grid presentation keeps at most six items", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({
    field: "duration",
    label: `L${i}`,
    value: `${i}`,
  }));
  const capped = stats.limitStatsForPresentation(items, "icon-grid");
  assert.equal(capped.length, 6);
});
```

- [ ] **Step 2: Implement `lib/composer-panel.ts`**

```ts
export function drawComposerPanel(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  settings: ComposerSettings,
  redrawPhoto: () => void,
) {
  const opacity =
    settings.panelFillMode === "solid"
      ? Math.max(settings.panelOpacity, 0.92)
      : settings.panelOpacity;

  if (settings.panelFillMode === "frosted") {
    context.save();
    context.beginPath();
    context.rect(panel.x, panel.y, panel.width, panel.height);
    context.clip();
    try {
      context.filter = `blur(${Math.round(Math.min(panel.width, panel.height) * 0.04)}px)`;
      redrawPhoto();
    } catch {
      // filter unsupported — fall through to tint
    }
    context.filter = "none";
    context.fillStyle = hexToRgba(settings.panelColor, opacity * 0.55);
    context.fillRect(panel.x, panel.y, panel.width, panel.height);
    context.restore();
    return;
  }

  context.save();
  if (settings.panelGradient.enabled) {
    const gradient = gradientForPanel(context, panel, settings.panelGradient);
    // apply opacity via color stops using colorA/colorB + opacity
    context.fillStyle = gradient;
  } else {
    context.fillStyle = hexToRgba(settings.panelColor, opacity);
  }
  context.fillRect(panel.x, panel.y, panel.width, panel.height);
  context.restore();
}
```

Implement `hexToRgba` and `gradientForPanel` (angle degrees → linear gradient endpoints). For `tint`, use opacity as today; for `solid`, near-opaque fill. Keep `blurBehindText` as an extra soft blur pass when enabled and fill is not already frosted (Composer UI places it under Panel).

- [ ] **Step 3: Implement `lib/composer-stats.ts`**

- Move / adapt `collectStatistics`-style logic from `image-composer.ts`.
- `limitStatsForPresentation(items, "icon-grid")` → `items.slice(0, 6)`.
- **icon-grid:** 3 columns, wrap to 2 rows; draw simple canvas icons (clock / depth chevron / thermometer paths) by field; value large, label small.
- **solid-band:** multi-column label/value pairs; increase rows as count grows.
- **text-stack:** keep current vertical list behavior.
- Honor `panelDensity` via padding/font multipliers.
- If `textContrastBoost`, draw a soft dark scrim behind each text run or stronger stroke (reuse/extend `applyTextTreatment`).

- [ ] **Step 4: Rewire `renderComposition`**

Order:

1. `drawPhoto`
2. compute `panel` via `panelRect(settings.panelEdge, …)`
3. compute `chartRect = offsetRect(chartHomeRect(recipe.chartRegion, panel, …), settings.chartOffsetX, settings.chartOffsetY, width, height)`
4. optional whole-canvas dimming (`backgroundDimming`)
5. draw chart if not hidden (`renderDiveChart`)
6. `drawComposerPanel` (frosted may call `redrawPhoto` clipped)
7. site/category/date/logo via `blockPositions` (existing anchors; `inside-panel` uses new panel rect)
8. `drawComposerStats` when statistics not hidden

Delete branches on `template.layout === "graph" | "dashboard" | "split" | "right"`. Use `recipe.statsPresentation` / `recipe.chartRegion` only.

- [ ] **Step 5: Run unit tests + typecheck**

```bash
node --test tests/composer-stats.test.mjs tests/composer-layout.test.mjs tests/composer-settings-normalize.test.mjs
npm run typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/composer-panel.ts lib/composer-stats.ts lib/image-composer.ts tests/composer-stats.test.mjs
git commit -m "Draw shared panel fills and dock/solid-band stats layouts."
```

---

### Task 4: Chart series helper + offsets already wired

**Files:**
- Modify: `lib/chart-renderer.ts`
- Create: `tests/chart-series.test.mjs`

**Interfaces:**
- Produces: `export type ChartSeries = { id: string; color: string; dash?: number[]; widthScale?: number; valuesFor(sample: DiveSample): number | null }`
- Produces: `buildPressureSeries(dive, settings): ChartSeries[]` — one entry per cylinder index present; **today all use `settings.pressureColor`** (multi-color later)
- `renderDiveChart` draws depth, then maps `buildPressureSeries`, then temperature

Note: pressure multi-cylinder loop already exists; extract it so future per-tank colors are one map away.

- [ ] **Step 1: Failing test**

```js
test("buildPressureSeries returns one series per cylinder", () => {
  const dive = {
    samples: [
      { elapsedSeconds: 0, depthM: 1, temperatureC: 24, pressuresBar: [200, 180] },
      { elapsedSeconds: 10, depthM: 5, temperatureC: 24, pressuresBar: [190, 170] },
    ],
  };
  const series = chart.buildPressureSeries(dive, { pressureColor: "#ffb36b" });
  assert.equal(series.length, 2);
  assert.equal(series[0].color, "#ffb36b");
  assert.equal(series[1].color, "#ffb36b");
});
```

- [ ] **Step 2: Implement extract + keep visual parity**

```ts
export function buildPressureSeries(
  dive: Dive,
  settings: Pick<ComposerSettings, "pressureColor">,
): ChartSeries[] {
  const cylinders = Math.max(
    0,
    ...dive.samples.map((sample) => sample.pressuresBar.length),
  );
  return Array.from({ length: cylinders }, (_, cylinder) => ({
    id: `pressure-${cylinder}`,
    color: settings.pressureColor,
    dash: cylinder ? [10, 7] : undefined,
    widthScale: Math.max(0.55, 1 - cylinder * 0.12),
    valuesFor: (sample: DiveSample) => sample.pressuresBar[cylinder] ?? null,
  }));
}
```

Use this inside `renderDiveChart` instead of the inline loop.

- [ ] **Step 3: Run tests — PASS**

Run: `node --test tests/chart-series.test.mjs`

- [ ] **Step 4: Commit**

```bash
git add lib/chart-renderer.ts tests/chart-series.test.mjs
git commit -m "Extract chart pressure series list for future multi-tank colors."
```

---

### Task 5: Composer control IA + recipe apply + load normalize

**Files:**
- Modify: `app/compose/ComposerApp.tsx`
- Modify: `lib/app-i18n/en.ts`, `lib/app-i18n/ja.ts`, `lib/app-i18n/zh-Hant.ts`

**Interfaces:**
- Consumes: `applyTemplateRecipe`, `normalizeComposerSettings`, new settings fields
- Produces: reorganized sidebar per spec section 5

- [ ] **Step 1: Add i18n keys (all three locales)**

Add (EN copy; translate JA/ZH-Hant appropriately):

```ts
bottomStatsDock: "Bottom Stats Dock",
bottomStatsDockDescription: "Frosted bottom stats with a compact chart above — built for wide frames.",
solidInfoBand: "Solid Info Band",
solidInfoBandDescription: "Opaque horizontal data band that grows with the fields you show.",
layoutPreset: "Layout preset",
panel: "Panel",
panelEdge: "Panel edge",
panelFillMode: "Panel fill",
panelColor: "Panel color",
panelGradient: "Panel gradient",
panelDensity: "Panel density",
textContrastBoost: "Boost text contrast",
edgeTop: "Top",
edgeBottom: "Bottom",
edgeLeft: "Left",
edgeRight: "Right",
fillSolid: "Solid",
fillFrosted: "Frosted",
fillTint: "Tint",
densityCompact: "Compact",
densityComfortable: "Comfortable",
densityRoomy: "Roomy",
fields: "Fields",
overlayPositions: "Overlay positions",
typeAndUnits: "Type & units",
canvasAndExport: "Canvas & export",
savedLooks: "Saved looks",
chartHorizontalPosition: "Chart horizontal position",
chartVerticalPosition: "Chart vertical position",
```

Remove or stop referencing: `fullWidthGraph*`, `landscapeDashboard*`, `cinematicSplit*` (delete keys once unused).

Update `templateTranslationKeys` in ComposerApp to the four ids only.

- [ ] **Step 2: Normalize on load; replace `repairLegacyTemplatePositions`**

Where settings are loaded from IndexedDB, run:

```ts
const normalized = normalizeComposerSettings(loaded);
setSettings(normalized);
```

Replace `repairLegacyTemplatePositions` with normalize (retired ids + missing fields). Keep any still-needed logo position soft fixes only if normalize/recipes already set them.

- [ ] **Step 3: Preset button applies full recipe**

```ts
onClick={() =>
  setSettings((current) =>
    current ? applyTemplateRecipe(current, template.id) : current,
  )
}
```

- [ ] **Step 4: Rebuild control sections**

Order and `initialOpen` per spec:

1. Photo — open  
2. Layout preset — open (four cards)  
3. Panel — open: edge select, fill mode, color, gradient enabled + colorA/colorB/angle, opacity, density, contrast boost, `blurBehindText`  
4. Fields — closed: site override, category, field checkboxes  
5. Chart — closed: existing chart controls + `chartOffsetX` / `chartOffsetY` ranges (−0.5…0.5); `graphGradient` here  
6. Overlay positions — closed: site/category/date/chart/statistics positions  
7. Type & units — closed: language, font, colors, units, date/time, decimals, align, text treatment, font size  
8. Logo — closed  
9. Canvas & export — closed: ratio, resolution, format, jpeg, dimming, safe margins, export  
10. Saved looks — closed: personal presets  

Remove old Appearance / Content / Template section titles.

- [ ] **Step 5: Manual smoke (dev)**

Run: `npm run dev`  
Check: four presets; each resets panel; dock shows ≤6 icon cells; solid band opaque; panel edge left/right works; chart sliders move freely; collapsed sections stay collapsed on reload of page state (in-memory only — no need to persist open/closed).

- [ ] **Step 6: Commit**

```bash
git add app/compose/ComposerApp.tsx lib/app-i18n/en.ts lib/app-i18n/ja.ts lib/app-i18n/zh-Hant.ts
git commit -m "Reorganize composer controls around layout presets and panel settings."
```

---

### Task 6: Contract tests, polish, verification

**Files:**
- Modify: `tests/app-contract.test.mjs`
- Modify: any remaining references to retired templates (`rg` the repo)
- Optional: `docs/PRODUCT-SPEC.md` or `public/whats-new.json` only if this ships in the same release train — otherwise skip (YAGNI for this branch until release)

- [ ] **Step 1: Search and clear retired ids**

```bash
rg "full-width-graph|landscape-dashboard|cinematic-split|lowerPanelY|layout === \"graph\"" -g "!node_modules" -g "!docs/**"
```

Fix remaining code references (docs/spec may still mention them historically — fine).

- [ ] **Step 2: Strengthen app-contract asserts**

Assert `composer-settings` / `templates` contain the four ids and new default keys (`panelEdge`, `chartOffsetX`, etc.), and do **not** contain retired ids in `TEMPLATES`.

- [ ] **Step 3: Full verification**

```bash
npm run typecheck
node --test tests/composer-settings-normalize.test.mjs tests/composer-layout.test.mjs tests/composer-stats.test.mjs tests/chart-series.test.mjs tests/composer-presets.test.mjs tests/composer-output.test.mjs tests/app-contract.test.mjs
```

Expected: all PASS. If time allows: `npm test` (includes build).

- [ ] **Step 4: Commit**

```bash
git add tests/app-contract.test.mjs
git commit -m "Lock composer preset redesign with contract and unit coverage."
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Four presets; retire three | Task 1 |
| Bottom Stats Dock / Solid Info Band seeds + chart on | Task 1 + 3 |
| Panel edge + fill/gradient/opacity/density/contrast | Tasks 1–3, 5 |
| Preset full reset | Tasks 1, 5 |
| Unknown → bottom-stats-dock | Task 1 |
| Chart offsets free-float | Tasks 2, 5 |
| Chart series future-proof | Task 4 (cylinder loop already existed; extract) |
| Control IA + collapse | Task 5 |
| Frosted blur fallback | Task 3 |
| Tests | Tasks 1–4, 6 |
| No multi-tank UI / no chart-edge placer | Honored (non-goals) |

No TBD placeholders. Types use `panelEdge` / `panelFillMode` / `chartOffsetX` consistently across tasks.
