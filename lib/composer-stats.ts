import type { DisplayField, ComposerSettings } from "./composer-settings";
import type { Dive } from "./dive-model";
import { formattedCoordinates, gasMixLabel } from "./dive-model";
import { translate } from "./i18n";
import {
  formatDepthValue,
  formatDuration,
  formatPressureValue,
  formatTemperatureValue,
} from "./unit-conversion";
import type { LayoutRect } from "./composer-layout";

export type StatsPresentation = "text-stack" | "icon-grid" | "solid-band";

export type StatItem = {
  field: DisplayField;
  label: string;
  value: string;
};

/** Layout hints so text-stack / vertical panels avoid titles and in-panel charts. */
export type StatsLayoutContext = {
  chartRegion?: "above-panel" | "in-panel";
  chartRect?: LayoutRect | null;
  chartVisible?: boolean;
  /** Extra top inset inside the panel reserved for site/category/date. */
  titleReserveTop?: number;
  /** Prefer bottom-aligned stats (classic right-panel / bottom-profile). */
  pinToBottom?: boolean;
  /** Extra left inset (e.g. Bottom Profile over photo). */
  insetLeft?: number;
  /** Extra bottom inset. */
  insetBottom?: number;
  /**
   * Canvas-relative type scale (like the old titleSize base).
   * When set, text-stack uses this instead of a panel-fraction base.
   */
  typeBase?: number;
  /** Cell text alignment for solid-band / icon-grid. */
  align?: "left" | "centre";
};

const DENSITY_SCALE = {
  compact: 0.85,
  comfortable: 1,
  roomy: 1.18,
} as const;

export function limitStatsForPresentation(
  items: StatItem[],
  presentation: StatsPresentation,
): StatItem[] {
  if (presentation === "icon-grid") return items.slice(0, 6);
  return items;
}

/** Keep the icon/value/label block readable when the dock wraps to two rows. */
export function iconGridRowScale(rows: number): number {
  return rows > 1 ? Math.min(1, 0.76 / Math.sqrt(rows / 2)) : 1;
}

export function collectStatItems(
  dive: Dive,
  settings: ComposerSettings,
): StatItem[] {
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(settings.language, key);
  const result: StatItem[] = [];
  const add = (
    field: DisplayField,
    visible: boolean,
    value: string | null,
    label: string,
  ) => {
    if (visible && value) result.push({ field, label, value });
  };

  add(
    "duration",
    settings.visibleFields.duration,
    dive.durationSeconds === null
      ? null
      : formatDuration(dive.durationSeconds),
    t("diveTime"),
  );
  add(
    "maxDepth",
    settings.visibleFields.maxDepth,
    dive.maxDepthM === null
      ? null
      : formatDepthValue(dive.maxDepthM, settings.units, settings.decimals),
    t("maximumDepth"),
  );
  add(
    "averageDepth",
    settings.visibleFields.averageDepth,
    dive.averageDepthM === null
      ? null
      : formatDepthValue(dive.averageDepthM, settings.units, settings.decimals),
    t("averageDepth"),
  );
  add(
    "temperature",
    settings.visibleFields.temperature,
    dive.waterTemperatureC === null
      ? null
      : formatTemperatureValue(
          dive.waterTemperatureC,
          settings.units,
          settings.decimals,
        ),
    t("waterTemperature"),
  );
  add(
    "gasMix",
    settings.visibleFields.gasMix,
    dive.gasMixes.length
      ? dive.gasMixes
          .map(
            (gas) =>
              gas.label ||
              gasMixLabel(gas.oxygenPercent, gas.heliumPercent),
          )
          .join(" · ")
      : null,
    t("gasMix"),
  );
  const start = dive.tankPressuresStartBar.find((value) => value !== null);
  const end = dive.tankPressuresEndBar.find((value) => value !== null);
  add(
    "startPressure",
    settings.visibleFields.startPressure,
    start == null
      ? null
      : formatPressureValue(start, settings.units, settings.decimals),
    t("startingTankPressure"),
  );
  add(
    "endPressure",
    settings.visibleFields.endPressure,
    end == null
      ? null
      : formatPressureValue(end, settings.units, settings.decimals),
    t("endingTankPressure"),
  );
  add(
    "coordinates",
    settings.visibleFields.coordinates,
    formattedCoordinates(dive.site.latitude, dive.site.longitude),
    t("coordinates"),
  );
  add(
    "diveNumber",
    settings.visibleFields.diveNumber,
    dive.number === null ? null : `#${dive.number}`,
    t("diveNumber"),
  );
  add(
    "computerModel",
    settings.visibleFields.computerModel,
    dive.computerModel,
    t("computerModel"),
  );
  return result;
}

/** Estimate vertical text-stack height so in-panel charts can leave room. */
export function estimateTextStackHeight(
  itemCount: number,
  panel: LayoutRect,
  settings: ComposerSettings,
  typeBase?: number,
): number {
  if (itemCount <= 0) return 0;
  const density = DENSITY_SCALE[settings.panelDensity];
  const base = Math.round(
    typeBase ??
      Math.min(panel.width, panel.height) * 0.12 * settings.fontSize * density,
  );
  const innerWidth = panel.width - panel.width * 0.12;
  const columns = panel.height > panel.width * 1.15
    ? Math.min(2, itemCount)
    : Math.min(
        4,
        itemCount,
        Math.max(1, Math.floor(innerWidth / Math.max(1, base * 2.4))),
      );
  const rows = Math.ceil(Math.min(8, itemCount) / columns);
  return rows * base * 1.45;
}

export function drawComposerStats(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  items: StatItem[],
  presentation: StatsPresentation,
  settings: ComposerSettings,
  fontStack: string,
  layout?: StatsLayoutContext,
) {
  const limited = limitStatsForPresentation(items, presentation);
  if (!limited.length) return;

  const density = DENSITY_SCALE[settings.panelDensity];
  const margin = Math.round(
    Math.min(panel.width, panel.height) * 0.06 * density,
  );
  const baseScale =
    presentation === "icon-grid"
      ? 0.28
      : presentation === "solid-band"
        ? 0.34
        : 0.12;
  const base = Math.round(
    (layout?.typeBase ??
      Math.min(panel.width, panel.height) * baseScale * settings.fontSize) *
      density,
  );

  if (presentation === "icon-grid") {
    drawIconGrid(context, panel, limited, settings, fontStack, margin, base);
    return;
  }

  if (presentation === "solid-band") {
    drawSolidBand(
      context,
      panel,
      limited,
      settings,
      fontStack,
      margin,
      base,
      layout?.align ?? "centre",
      layout?.titleReserveTop ?? 0,
    );
    return;
  }

  drawTextStack(
    context,
    panel,
    limited,
    settings,
    fontStack,
    margin,
    base,
    layout,
  );
}

/** Exported for layout tests: where vertical text-stack stats begin. */
export function textStackStartY(
  panel: LayoutRect,
  itemCount: number,
  base: number,
  margin: number,
  layout?: StatsLayoutContext,
): number {
  const rowHeight = base * 1.45;
  const innerWidth = panel.width - margin * 2;
  const columns = Math.min(
    4,
    itemCount,
    Math.max(1, Math.floor(innerWidth / Math.max(1, base * 2.4))),
  );
  const rows = Math.ceil(Math.max(1, itemCount) / columns);
  const totalHeight = rows * rowHeight;
  const insetBottom = Math.max(0, layout?.insetBottom ?? 0);
  if (layout?.pinToBottom !== false) {
    // Classic right-panel / bottom-profile: pin the block to the bottom.
    return panel.y + panel.height - margin - insetBottom - totalHeight;
  }
  const titlePad = Math.max(0, layout?.titleReserveTop ?? 0);
  const afterTitles = panel.y + margin + titlePad;
  const chartInPanel =
    layout?.chartVisible &&
    layout.chartRegion === "in-panel" &&
    layout.chartRect;
  if (chartInPanel && layout.chartRect) {
    const afterChart =
      layout.chartRect.y + layout.chartRect.height + margin * 0.45;
    return Math.min(
      Math.max(afterTitles, afterChart),
      panel.y + panel.height - margin - rowHeight,
    );
  }
  return afterTitles;
}

function drawIconGrid(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  items: StatItem[],
  settings: ComposerSettings,
  fontStack: string,
  margin: number,
  base: number,
) {
  const columns = 3;
  const rows = Math.ceil(items.length / columns);
  const cellWidth = (panel.width - margin * 2) / columns;
  const cellHeight = (panel.height - margin * 2) / Math.max(rows, 1);
  const rowScale = iconGridRowScale(rows);
  const scaledBase = base * rowScale;
  const iconSize = Math.min(
    scaledBase,
    cellHeight * (rows > 1 ? 0.3 : 0.32),
  );

  drawCellDividers(
    context,
    panel,
    margin,
    columns,
    rows,
    items.length,
    settings,
  );

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = panel.x + margin + column * cellWidth;
    const y = panel.y + margin + row * cellHeight;
    const iconX = x + (cellWidth - iconSize) / 2;
    const valueSize = Math.round(scaledBase * 0.86);
    const labelSize = Math.round(scaledBase * 0.24);
    const iconTextGap = cellHeight * (rows > 1 ? 0.025 : 0.035);
    const blockHeight =
      iconSize + valueSize * 1.08 + labelSize * 1.14 + iconTextGap;
    const iconY = y + Math.max(0, (cellHeight - blockHeight) / 2);

    context.save();
    context.fillStyle = settings.textColor;
    context.globalAlpha = 0.9;
    drawStatIcon(context, item.field, iconX, iconY, iconSize);
    context.restore();

    const textX = x + cellWidth / 2;
    paintStatText(
      context,
      item.value,
      textX,
      iconY + iconSize + iconTextGap,
      cellWidth * 0.9,
      `700 ${valueSize}px ${fontStack}`,
      settings,
      valueSize,
      "centre",
    );
    paintStatText(
      context,
      item.label,
      textX,
      iconY + iconSize + valueSize * 1.08 + iconTextGap,
      cellWidth * 0.9,
      `500 ${labelSize}px ${fontStack}`,
      settings,
      labelSize,
      "centre",
    );
  });
}

function drawSolidBand(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  items: StatItem[],
  settings: ComposerSettings,
  fontStack: string,
  margin: number,
  base: number,
  align: "left" | "centre" = "centre",
  titleReserveTop = 0,
) {
  const innerWidth = panel.width - margin * 2;
  const columns = Math.min(
    4,
    items.length,
    Math.max(1, Math.floor(innerWidth / Math.max(1, base * 2.4))),
  );
  const rows = Math.ceil(items.length / columns);
  const cellWidth = innerWidth / columns;
  const contentTop = panel.y + margin + Math.max(0, titleReserveTop);
  const contentHeight = panel.height - margin * 2 - Math.max(0, titleReserveTop);
  const cellHeight = contentHeight / rows;
  const vertical = panel.height > panel.width * 1.15;
  const valueSize = Math.round(
    Math.min(base * (vertical ? 0.56 : 0.62), cellHeight * 0.28, cellWidth * 0.24),
  );
  const labelSize = Math.round(
    Math.min(base * 0.2, cellHeight * 0.14, cellWidth * 0.12),
  );

  drawCellDividers(
    context,
    panel,
    margin,
    columns,
    rows,
    items.length,
    settings,
    contentTop,
    contentHeight,
  );

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = panel.x + margin + column * cellWidth;
    const textBlockHeight = valueSize * 1.14 + labelSize * 1.14;
    const y = contentTop + row * cellHeight + Math.max(0, (cellHeight - textBlockHeight) / 2);
    const textX =
      align === "centre" ? cellX + cellWidth / 2 : cellX + cellWidth * 0.06;
    paintStatText(
      context,
      item.value,
      textX,
      y,
      cellWidth * 0.88,
      `700 ${valueSize}px ${fontStack}`,
      settings,
      valueSize,
      align,
    );
    paintStatText(
      context,
      item.label,
      textX,
      y + valueSize * 1.14,
      cellWidth * 0.88,
      `500 ${labelSize}px ${fontStack}`,
      settings,
      labelSize,
      align,
    );
  });
}

function drawCellDividers(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  margin: number,
  columns: number,
  rows: number,
  itemCount: number,
  settings: ComposerSettings,
  contentTop = panel.y + margin,
  contentHeight = panel.height - margin * 2,
) {
  if (!settings.statsDivider || itemCount < 2) return;
  const opacity = Math.min(1, Math.max(0, settings.statsDividerOpacity));
  if (opacity <= 0) return;

  const innerWidth = panel.width - margin * 2;
  const cellWidth = innerWidth / columns;
  const cellHeight = contentHeight / Math.max(rows, 1);

  context.save();
  context.strokeStyle = settings.textColor;
  context.globalAlpha = opacity;
  context.lineWidth = Math.max(1, Math.min(panel.width, panel.height) * 0.0025);

  for (let column = 1; column < columns; column += 1) {
    const x = panel.x + margin + column * cellWidth;
    context.beginPath();
    context.moveTo(x, panel.y + margin * 0.55);
    context.lineTo(x, panel.y + panel.height - margin * 0.55);
    context.stroke();
  }
  for (let row = 1; row < rows; row += 1) {
    const y = contentTop + row * cellHeight;
    context.beginPath();
    context.moveTo(panel.x + margin * 0.55, y);
    context.lineTo(panel.x + panel.width - margin * 0.55, y);
    context.stroke();
  }
  context.restore();
}

function drawTextStack(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  items: StatItem[],
  settings: ComposerSettings,
  fontStack: string,
  margin: number,
  base: number,
  layout?: StatsLayoutContext,
) {
  const insetLeft = Math.max(0, layout?.insetLeft ?? 0);
  const insetBottom = Math.max(0, layout?.insetBottom ?? 0);
  const innerWidth = panel.width - margin * 2 - insetLeft;
  const columns = Math.min(
    4,
    items.length,
    Math.max(1, Math.floor(innerWidth / Math.max(1, base * 2.4))),
  );
  // Match classic Bottom Profile hierarchy: large values, readable labels.
  const valueSize = Math.round(base * 0.62);
  const labelSize = Math.round(base * 0.36);
  const rowHeight = Math.max(base * 1.45, valueSize + labelSize * 1.35);
  const visible = items.slice(0, 8);
  const totalHeight = Math.ceil(visible.length / columns) * rowHeight;
  const startY = panel.height > panel.width * 1.15
    ? textStackStartY(panel, visible.length, base, margin, {
        ...layout,
        pinToBottom: layout?.pinToBottom !== false,
        insetBottom,
      })
    : panel.y + panel.height - margin - insetBottom - totalHeight;
  const cellWidth = innerWidth / columns;
  const originX = panel.x + margin + insetLeft;

  visible.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = originX + column * cellWidth;
    const y = startY + row * rowHeight;
    paintStatText(
      context,
      item.value,
      x,
      y,
      cellWidth * 0.9,
      `700 ${valueSize}px ${fontStack}`,
      settings,
      valueSize,
    );
    paintStatText(
      context,
      item.label,
      x,
      y + valueSize * 1.12,
      cellWidth * 0.9,
      `500 ${labelSize}px ${fontStack}`,
      settings,
      labelSize,
    );
  });
}

function paintStatText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: string,
  settings: ComposerSettings,
  fontPixels: number,
  align: "left" | "centre" = "left",
) {
  context.save();
  context.font = font;
  context.textAlign = align === "centre" ? "center" : "left";
  context.textBaseline = "top";
  context.fillStyle = settings.textColor;
  const drawX = align === "centre" ? x : x;

  if (settings.textContrastBoost) {
    const metrics = context.measureText(text);
    const width = Math.min(metrics.width, maxWidth);
    const height = fontPixels * 1.15;
    const scrimX =
      align === "centre" ? drawX - width / 2 : drawX;
    context.fillStyle = "rgba(0,0,0,0.35)";
    context.fillRect(scrimX - 2, y - 1, width + 4, height + 2);
    context.fillStyle = settings.textColor;
  }

  if (settings.textTreatment === "outline" || settings.textContrastBoost) {
    context.strokeStyle = "rgba(0,0,0,.85)";
    context.lineWidth = Math.max(
      2,
      fontPixels * (settings.textContrastBoost ? 0.08 : 0.055),
    );
    context.strokeText(text, drawX, y, maxWidth);
  }
  if (settings.textTreatment === "shadow") {
    context.shadowColor = "rgba(0,0,0,.8)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 3;
  }
  context.fillText(text, drawX, y, maxWidth);
  context.restore();
}

function drawStatIcon(
  context: CanvasRenderingContext2D,
  field: DisplayField,
  x: number,
  y: number,
  size: number,
) {
  const color = String(context.fillStyle);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(1.6, size * 0.11);
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (field) {
    case "duration":
    case "startTime":
    case "date":
      drawClockIcon(context, x, y, size);
      break;
    case "maxDepth":
      drawMaxDepthIcon(context, x, y, size);
      break;
    case "averageDepth":
      drawAvgDepthIcon(context, x, y, size);
      break;
    case "temperature":
      drawThermometerIcon(context, x, y, size);
      break;
    case "startPressure":
      drawPressureIcon(context, x, y, size, 0.72);
      break;
    case "endPressure":
      drawPressureIcon(context, x, y, size, 0.28);
      break;
    case "gasMix":
      drawGasIcon(context, x, y, size);
      break;
    default:
      drawDotIcon(context, x, y, size);
      break;
  }
}

function drawClockIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.42;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(cx, cy);
  context.lineTo(cx, cy - r * 0.55);
  context.moveTo(cx, cy);
  context.lineTo(cx + r * 0.4, cy + r * 0.15);
  context.stroke();
  context.beginPath();
  context.arc(cx, cy, Math.max(1.2, size * 0.055), 0, Math.PI * 2);
  context.fill();
}

/** Max depth: arrow pointing to a floor line. */
function drawMaxDepthIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const cx = x + size / 2;
  context.beginPath();
  context.moveTo(cx, y + size * 0.12);
  context.lineTo(cx, y + size * 0.68);
  context.stroke();
  context.beginPath();
  context.moveTo(cx - size * 0.22, y + size * 0.48);
  context.lineTo(cx, y + size * 0.72);
  context.lineTo(cx + size * 0.22, y + size * 0.48);
  context.stroke();
  context.beginPath();
  context.moveTo(x + size * 0.18, y + size * 0.86);
  context.lineTo(x + size * 0.82, y + size * 0.86);
  context.stroke();
}

/** Average depth: a water line with a centred depth marker. */
function drawAvgDepthIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const cx = x + size / 2;
  context.beginPath();
  context.moveTo(cx, y + size * 0.2);
  context.lineTo(cx, y + size * 0.78);
  context.stroke();
  context.beginPath();
  context.moveTo(x + size * 0.12, y + size * 0.48);
  context.bezierCurveTo(
    x + size * 0.25,
    y + size * 0.38,
    x + size * 0.34,
    y + size * 0.58,
    x + size * 0.47,
    y + size * 0.48,
  );
  context.bezierCurveTo(
    x + size * 0.6,
    y + size * 0.38,
    x + size * 0.69,
    y + size * 0.58,
    x + size * 0.88,
    y + size * 0.48,
  );
  context.stroke();
  context.beginPath();
  context.arc(cx, y + size * 0.48, size * 0.105, 0, Math.PI * 2);
  context.fill();
}

function drawThermometerIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const cx = x + size * 0.44;
  const stemRadius = size * 0.12;
  const bulbRadius = size * 0.2;
  context.beginPath();
  context.moveTo(cx - stemRadius, y + size * 0.18);
  context.arc(cx, y + size * 0.18, stemRadius, Math.PI, 0);
  context.lineTo(cx + stemRadius, y + size * 0.62);
  context.arc(cx, y + size * 0.7, bulbRadius, -0.72, Math.PI + 0.72);
  context.lineTo(cx - stemRadius, y + size * 0.18);
  context.stroke();
  context.beginPath();
  context.moveTo(cx, y + size * 0.3);
  context.lineTo(cx, y + size * 0.68);
  context.stroke();
  context.beginPath();
  context.arc(cx, y + size * 0.7, size * 0.105, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(cx + size * 0.16, y + size * 0.22);
  context.lineTo(cx + size * 0.32, y + size * 0.22);
  context.moveTo(cx + size * 0.16, y + size * 0.36);
  context.lineTo(cx + size * 0.28, y + size * 0.36);
  context.stroke();
}

function drawPressureIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  needleFraction: number,
) {
  const cx = x + size / 2;
  const cy = y + size * 0.58;
  const r = size * 0.36;
  context.beginPath();
  context.arc(cx, cy, r, 0.85 * Math.PI, 0.15 * Math.PI);
  context.stroke();
  const angle = Math.PI * (0.85 - needleFraction * 0.7);
  context.beginPath();
  context.moveTo(cx, cy);
  context.lineTo(cx + Math.cos(angle) * r * 0.75, cy - Math.sin(angle) * r * 0.75);
  context.stroke();
  context.beginPath();
  context.arc(cx, cy, size * 0.06, 0, Math.PI * 2);
  context.fill();
}

function drawGasIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  context.beginPath();
  context.moveTo(x + size * 0.34, y + size * 0.28);
  context.quadraticCurveTo(x + size * 0.34, y + size * 0.2, x + size * 0.42, y + size * 0.18);
  context.lineTo(x + size * 0.58, y + size * 0.18);
  context.quadraticCurveTo(x + size * 0.66, y + size * 0.2, x + size * 0.66, y + size * 0.28);
  context.lineTo(x + size * 0.66, y + size * 0.78);
  context.quadraticCurveTo(x + size * 0.66, y + size * 0.86, x + size * 0.58, y + size * 0.88);
  context.lineTo(x + size * 0.42, y + size * 0.88);
  context.quadraticCurveTo(x + size * 0.34, y + size * 0.86, x + size * 0.34, y + size * 0.78);
  context.closePath();
  context.stroke();
  context.beginPath();
  context.moveTo(x + size * 0.41, y + size * 0.18);
  context.lineTo(x + size * 0.41, y + size * 0.08);
  context.lineTo(x + size * 0.59, y + size * 0.08);
  context.lineTo(x + size * 0.59, y + size * 0.18);
  context.stroke();
  context.beginPath();
  context.arc(x + size * 0.5, y + size * 0.51, size * 0.09, 0, Math.PI * 2);
  context.stroke();
}

function drawDotIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
  context.fill();
}
