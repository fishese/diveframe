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

export function drawComposerStats(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  items: StatItem[],
  presentation: StatsPresentation,
  settings: ComposerSettings,
  fontStack: string,
) {
  const limited = limitStatsForPresentation(items, presentation);
  if (!limited.length) return;

  const density = DENSITY_SCALE[settings.panelDensity];
  const margin = Math.round(
    Math.min(panel.width, panel.height) * 0.06 * density,
  );
  const base = Math.round(
    Math.min(panel.width, panel.height) * 0.12 * settings.fontSize * density,
  );

  if (presentation === "icon-grid") {
    drawIconGrid(context, panel, limited, settings, fontStack, margin, base);
    return;
  }

  if (presentation === "solid-band") {
    drawSolidBand(context, panel, limited, settings, fontStack, margin, base);
    return;
  }

  drawTextStack(context, panel, limited, settings, fontStack, margin, base);
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
  const iconSize = Math.min(base * 0.55, cellHeight * 0.28);

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = panel.x + margin + column * cellWidth;
    const y = panel.y + margin + row * cellHeight;
    const iconX = x + cellWidth * 0.08;
    const iconY = y + cellHeight * 0.22;

    context.save();
    context.fillStyle = settings.textColor;
    context.globalAlpha = 0.85;
    drawStatIcon(context, item.field, iconX, iconY, iconSize);
    context.restore();

    const textX = iconX + iconSize * 1.35;
    const valueSize = Math.round(base * 0.72);
    const labelSize = Math.round(base * 0.28);
    paintStatText(
      context,
      item.value,
      textX,
      y + cellHeight * 0.18,
      cellWidth * 0.7,
      `700 ${valueSize}px ${fontStack}`,
      settings,
      valueSize,
    );
    paintStatText(
      context,
      item.label,
      textX,
      y + cellHeight * 0.18 + valueSize * 1.05,
      cellWidth * 0.7,
      `500 ${labelSize}px ${fontStack}`,
      settings,
      labelSize,
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
) {
  const innerWidth = panel.width - margin * 2;
  const columns = Math.min(
    4,
    items.length,
    Math.max(1, Math.floor(innerWidth / Math.max(1, base * 2.4))),
  );
  const rows = Math.ceil(items.length / columns);
  const cellWidth = innerWidth / columns;
  const cellHeight = (panel.height - margin * 2) / rows;
  const valueSize = Math.round(Math.min(base * 0.58, cellHeight * 0.42));
  const labelSize = Math.round(Math.min(base * 0.26, cellHeight * 0.22));

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = panel.x + margin + column * cellWidth;
    const y = panel.y + margin + row * cellHeight + cellHeight * 0.12;
    paintStatText(
      context,
      item.value,
      x,
      y,
      cellWidth * 0.92,
      `700 ${valueSize}px ${fontStack}`,
      settings,
      valueSize,
    );
    paintStatText(
      context,
      item.label,
      x,
      y + valueSize * 1.12,
      cellWidth * 0.92,
      `500 ${labelSize}px ${fontStack}`,
      settings,
      labelSize,
    );
  });
}

function drawTextStack(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  items: StatItem[],
  settings: ComposerSettings,
  fontStack: string,
  margin: number,
  base: number,
) {
  const isVertical = panel.height > panel.width * 1.15;
  const innerWidth = panel.width - margin * 2;
  const columns = isVertical
    ? 1
    : Math.min(
        4,
        items.length,
        Math.max(1, Math.floor(innerWidth / Math.max(1, base * 2.55))),
      );
  const rowHeight = base * 1.35;
  const totalHeight = Math.ceil(items.length / columns) * rowHeight;
  const startY = isVertical
    ? panel.y + margin
    : panel.y + panel.height - margin - totalHeight;
  const cellWidth = innerWidth / columns;
  const valueSize = Math.round(base * 0.55);
  const labelSize = Math.round(base * 0.25);

  items.slice(0, 8).forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = panel.x + margin + column * cellWidth;
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
      y + base * 0.62,
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
) {
  context.save();
  context.font = font;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = settings.textColor;

  if (settings.textContrastBoost) {
    const metrics = context.measureText(text);
    const width = Math.min(metrics.width, maxWidth);
    const height = fontPixels * 1.15;
    context.fillStyle = "rgba(0,0,0,0.35)";
    context.fillRect(x - 2, y - 1, width + 4, height + 2);
    context.fillStyle = settings.textColor;
  }

  if (settings.textTreatment === "outline" || settings.textContrastBoost) {
    context.strokeStyle = "rgba(0,0,0,.85)";
    context.lineWidth = Math.max(
      2,
      fontPixels * (settings.textContrastBoost ? 0.08 : 0.055),
    );
    context.strokeText(text, x, y, maxWidth);
  }
  if (settings.textTreatment === "shadow") {
    context.shadowColor = "rgba(0,0,0,.8)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 3;
  }
  context.fillText(text, x, y, maxWidth);
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
  context.lineWidth = Math.max(1.5, size * 0.1);
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (field) {
    case "duration":
    case "startTime":
    case "date":
      drawClockIcon(context, x, y, size);
      break;
    case "maxDepth":
    case "averageDepth":
      drawDepthIcon(context, x, y, size);
      break;
    case "temperature":
      drawThermometerIcon(context, x, y, size);
      break;
    case "startPressure":
    case "endPressure":
      drawPressureIcon(context, x, y, size);
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
}

function drawDepthIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  context.beginPath();
  context.moveTo(x + size * 0.2, y + size * 0.2);
  context.lineTo(x + size * 0.5, y + size * 0.82);
  context.lineTo(x + size * 0.8, y + size * 0.2);
  context.stroke();
}

function drawThermometerIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const cx = x + size * 0.45;
  context.beginPath();
  context.moveTo(cx, y + size * 0.12);
  context.lineTo(cx, y + size * 0.62);
  context.stroke();
  context.beginPath();
  context.arc(cx, y + size * 0.72, size * 0.18, 0, Math.PI * 2);
  context.fill();
}

function drawPressureIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size * 0.38, 0.75 * Math.PI, 0.25 * Math.PI);
  context.stroke();
  context.beginPath();
  context.moveTo(x + size * 0.5, y + size * 0.5);
  context.lineTo(x + size * 0.72, y + size * 0.28);
  context.stroke();
}

function drawGasIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  context.beginPath();
  context.rect(x + size * 0.3, y + size * 0.15, size * 0.4, size * 0.7);
  context.stroke();
  context.beginPath();
  context.moveTo(x + size * 0.38, y + size * 0.15);
  context.lineTo(x + size * 0.38, y + size * 0.05);
  context.lineTo(x + size * 0.62, y + size * 0.05);
  context.lineTo(x + size * 0.62, y + size * 0.15);
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
