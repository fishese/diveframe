import { chartAvailability, renderDiveChart } from "./chart-renderer";
import { getOverlayFont } from "./composer-fonts";
import type { ComposerSettings } from "./composer-settings";
import { formattedCoordinates, gasMixLabel, type Dive } from "./dive-model";
import { translate } from "./i18n";
import { getTemplate } from "./templates";
import {
  formatDepthValue,
  formatDuration,
  formatPressureValue,
  formatTemperatureValue,
} from "./unit-conversion";

export async function loadPhoto(blob: Blob) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Some browsers do not decode SVG through createImageBitmap.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function resolveSiteName(dive: Dive, override: string) {
  return (
    override.trim() ||
    dive.site.originalName ||
    dive.site.userName ||
    formattedCoordinates(dive.site.latitude, dive.site.longitude) ||
    null
  );
}

export function renderComposition(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource & { width: number; height: number },
  dive: Dive,
  settings: ComposerSettings,
  width: number,
  height: number,
  logo?: CanvasImageSource & { width: number; height: number },
) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  const template = getTemplate(settings.templateId);
  const fontStack = getOverlayFont(settings.fontFamily).stack;
  const margin = Math.round(Math.min(width, height) * settings.safeMargin);
  const panel =
    template.layout === "right"
      ? { x: width * 0.61, y: 0, width: width * 0.39, height }
      : (() => {
          const y =
            height *
            (template.layout === "graph"
              ? 0.46
              : template.layout === "minimal"
                ? 0.62
                : 0.58);
          return { x: 0, y, width, height: height - y };
        })();
  drawPhoto(context, image, width, height, settings);
  if (settings.blurBehindText) {
    context.save();
    context.beginPath();
    context.rect(panel.x, panel.y, panel.width, panel.height);
    context.clip();
    context.filter = `blur(${Math.round(Math.min(width, height) * 0.012)}px)`;
    drawPhoto(context, image, width, height, settings);
    context.restore();
  }
  if (settings.backgroundDimming) {
    context.fillStyle = `rgba(2, 14, 21, ${settings.backgroundDimming})`;
    context.fillRect(0, 0, width, height);
  }
  if (template.layout !== "minimal") {
    if (settings.graphGradient) {
      const gradient = context.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height);
      gradient.addColorStop(0, `rgba(3, 20, 29, ${settings.panelOpacity * 0.15})`);
      gradient.addColorStop(1, `rgba(3, 20, 29, ${settings.panelOpacity})`);
      context.fillStyle = gradient;
    } else {
      context.fillStyle = `rgba(3, 20, 29, ${settings.panelOpacity})`;
    }
    context.fillRect(panel.x, panel.y, panel.width, panel.height);
    if (template.layout === "graph") {
      context.fillStyle = template.accent;
      context.globalAlpha = 0.7;
      context.fillRect(panel.x, panel.y, panel.width, Math.max(2, height * 0.003));
      context.globalAlpha = 1;
    }
  }

  context.fillStyle = "#fff";
  context.textBaseline = "top";
  applyTextTreatment(context, settings);
  const siteName = settings.visibleFields.site
    ? resolveSiteName(dive, settings.siteNameOverride)
    : null;
  const titleSize = Math.round(Math.min(width, height) * 0.055 * settings.fontSize);
  if (siteName && settings.blockPositions.site !== "hidden") {
    const siteAnchor = blockAnchor(settings.blockPositions.site, panel, width, height, margin);
    context.font = `700 ${titleSize}px ${fontStack}`;
    drawAlignedText(context, siteName, siteAnchor.x, siteAnchor.y, siteAnchor.width, siteAnchor.align, settings);
  }

  const metaAnchor = blockAnchor(settings.blockPositions.category, panel, width, height, margin);
  const categorySharesSite =
    Boolean(siteName) &&
    settings.blockPositions.category === settings.blockPositions.site;
  let metaY = metaAnchor.y + (categorySharesSite ? titleSize * 1.18 : 0);
  context.font = `600 ${Math.round(titleSize * 0.38)}px ${fontStack}`;
  context.fillStyle = template.accent;
  if (settings.visibleFields.category && settings.blockPositions.category !== "hidden") {
    drawAlignedText(
      context,
      translate(settings.language, settings.categoryOverride),
      metaAnchor.x,
      metaY,
      metaAnchor.width,
      metaAnchor.align,
      settings,
    );
    metaY += titleSize * 0.55;
  }
  const dateText = formatDateTime(dive, settings);
  if (dateText && settings.blockPositions.date !== "hidden") {
    const dateAnchor = blockAnchor(settings.blockPositions.date, panel, width, height, margin);
    const dateSharesSite =
      Boolean(siteName) &&
      settings.blockPositions.date === settings.blockPositions.site;
    const dateSharesCategory =
      settings.visibleFields.category &&
      settings.blockPositions.category !== "hidden" &&
      settings.blockPositions.date === settings.blockPositions.category;
    const dateOffset =
      (dateSharesSite ? titleSize * 1.18 : 0) +
      (dateSharesCategory ? titleSize * 0.55 : 0);
    context.fillStyle = "#fff";
    drawAlignedText(context, dateText, dateAnchor.x, dateAnchor.y + dateOffset, dateAnchor.width, dateAnchor.align, settings);
  }

  const stats = buildStatistics(dive, settings);
  const statsWidth =
    template.layout === "right"
      ? panel.width - margin * 2
      : width - margin * 2;
  const statHeight = statisticsHeight(stats, statsWidth, titleSize);
  const statsBox = blockRect(
    settings.blockPositions.statistics,
    panel,
    width,
    height,
    margin,
    statsWidth,
    statHeight,
  );
  if (settings.blockPositions.statistics === "inside-panel") {
    statsBox.y = panel.y + panel.height - margin - statHeight;
  }

  const chartHeight = Math.min(
    height * settings.chartHeight,
    panel.height * (template.layout === "graph" ? 0.62 : 0.5),
  );
  const chartBox = blockRect(
    settings.blockPositions.chart,
    panel,
    width,
    height,
    margin,
    template.layout === "right" ? panel.width - margin * 2 : width - margin * 2,
    chartHeight,
  );
  if (
    settings.blockPositions.chart === "inside-panel" ||
    settings.blockPositions.chart === "above-graph"
  ) {
    if (template.layout === "right") {
      chartBox.y = panel.y + Math.max(panel.height * 0.25, margin + titleSize * 2.6);
    }
    const chartBottom =
      settings.blockPositions.statistics === "inside-panel"
        ? statsBox.y - Math.max(8, titleSize * 0.25)
        : panel.y + panel.height - margin;
    chartBox.height = Math.max(
      1,
      Math.min(chartBox.height, chartBottom - chartBox.y),
    );
  }
  let renderedChart = false;
  if (settings.blockPositions.chart !== "hidden") {
    renderedChart = renderDiveChart(
      context,
      chartBox,
      dive,
      settings,
    );
  }
  if (renderedChart) {
    const availability = chartAvailability(dive);
    const legend: Array<{ label: string; color: string }> = [];
    if (settings.chartMode.includes("pressure") && availability.pressure) {
      legend.push({ label: translate(settings.language, "tankPressure"), color: settings.pressureColor });
    }
    if (settings.chartMode.includes("temperature") && availability.temperature) {
      legend.push({ label: translate(settings.language, "waterTemperature"), color: settings.temperatureColor });
    }
    context.font = `600 ${Math.round(titleSize * 0.22)}px ${fontStack}`;
    let legendX = chartBox.x;
    for (const item of legend) {
      context.fillStyle = item.color;
      context.fillRect(legendX, chartBox.y - titleSize * 0.28, titleSize * 0.3, Math.max(2, settings.lineThickness));
      context.fillStyle = "#fff";
      context.fillText(item.label, legendX + titleSize * 0.4, chartBox.y - titleSize * 0.38);
      legendX += context.measureText(item.label).width + titleSize * 0.85;
    }
  }

  if (settings.blockPositions.statistics !== "hidden") {
    drawStatistics(context, stats, statsBox.x, statsBox.y, statsBox.width, titleSize, settings, fontStack);
  }

  if (logo && settings.showLogo && settings.blockPositions.logo !== "hidden") {
    const maxWidth = width * 0.16;
    const scale = Math.min(maxWidth / logo.width, (height * 0.09) / logo.height, 1);
    const logoBox = logoRect(
      settings.blockPositions.logo,
      panel,
      width,
      height,
      margin,
      logo.width * scale,
      logo.height * scale,
    );
    context.drawImage(logo, logoBox.x, logoBox.y, logoBox.width, logoBox.height);
  }
  return { hasChart: chartAvailability(dive).depth, siteName, stats };
}

function drawPhoto(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
  settings: ComposerSettings,
) {
  context.save();
  context.translate(width / 2 + settings.photoOffsetX * width, height / 2 + settings.photoOffsetY * height);
  context.rotate((settings.photoRotation * Math.PI) / 180);
  const base =
    settings.photoFit === "fill"
      ? Math.max(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height);
  const scale = base * settings.photoZoom;
  context.drawImage(image, (-image.width * scale) / 2, (-image.height * scale) / 2, image.width * scale, image.height * scale);
  context.restore();
}

function buildStatistics(dive: Dive, settings: ComposerSettings) {
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.language, key);
  const result: Array<{ label: string; value: string }> = [];
  const add = (visible: boolean, value: string | null, label: string) => {
    if (visible && value) result.push({ label, value });
  };
  add(settings.visibleFields.duration, dive.durationSeconds === null ? null : formatDuration(dive.durationSeconds), t("diveTime"));
  add(settings.visibleFields.maxDepth, dive.maxDepthM === null ? null : formatDepthValue(dive.maxDepthM, settings.units, settings.decimals), t("maximumDepth"));
  add(settings.visibleFields.averageDepth, dive.averageDepthM === null ? null : formatDepthValue(dive.averageDepthM, settings.units, settings.decimals), t("averageDepth"));
  add(settings.visibleFields.temperature, dive.waterTemperatureC === null ? null : formatTemperatureValue(dive.waterTemperatureC, settings.units, settings.decimals), t("waterTemperature"));
  add(settings.visibleFields.gasMix, dive.gasMixes.length ? dive.gasMixes.map((gas) => gas.label || gasMixLabel(gas.oxygenPercent, gas.heliumPercent)).join(" · ") : null, t("gasMix"));
  const start = dive.tankPressuresStartBar.find((value) => value !== null);
  const end = dive.tankPressuresEndBar.find((value) => value !== null);
  add(settings.visibleFields.startPressure, start == null ? null : formatPressureValue(start, settings.units, settings.decimals), t("startingTankPressure"));
  add(settings.visibleFields.endPressure, end == null ? null : formatPressureValue(end, settings.units, settings.decimals), t("endingTankPressure"));
  add(settings.visibleFields.coordinates, formattedCoordinates(dive.site.latitude, dive.site.longitude), t("coordinates"));
  add(settings.visibleFields.diveNumber, dive.number === null ? null : `#${dive.number}`, t("diveNumber"));
  add(settings.visibleFields.computerModel, dive.computerModel, t("computerModel"));
  return result;
}

function drawStatistics(context: CanvasRenderingContext2D, stats: Array<{ label: string; value: string }>, x: number, y: number, width: number, base: number, settings: ComposerSettings, fontStack: string) {
  if (!stats.length) return;
  const columns = statisticsColumnCount(stats, width, base);
  stats.slice(0, 8).forEach((stat, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellWidth = width / columns;
    const top = y + row * base * 1.35;
    context.fillStyle = "#fff";
    context.font = `700 ${Math.round(base * 0.55)}px ${fontStack}`;
    if (settings.textTreatment === "outline") {
      context.strokeStyle = "rgba(0,0,0,.85)";
      context.lineWidth = Math.max(2, base * 0.055);
      context.strokeText(stat.value, x + column * cellWidth, top, cellWidth * 0.9);
    }
    context.fillText(stat.value, x + column * cellWidth, top, cellWidth * 0.9);
    context.fillStyle = "rgba(255,255,255,.78)";
    context.font = `500 ${Math.round(base * 0.25)}px ${fontStack}`;
    context.fillText(stat.label, x + column * cellWidth, top + base * 0.62, cellWidth * 0.9);
  });
}

function statisticsColumnCount(
  stats: Array<{ label: string; value: string }>,
  width: number,
  base: number,
) {
  return Math.min(
    4,
    stats.length,
    Math.max(1, Math.floor(width / Math.max(1, base * 2.55))),
  );
}

function statisticsHeight(
  stats: Array<{ label: string; value: string }>,
  width: number,
  base: number,
) {
  if (!stats.length) return 0;
  const rows = Math.ceil(Math.min(8, stats.length) / statisticsColumnCount(stats, width, base));
  return rows * base * 1.35;
}

function formatDateTime(dive: Dive, settings: ComposerSettings) {
  if (!dive.startDateTime || (!settings.visibleFields.date && !settings.visibleFields.startTime)) return null;
  const date = new Date(dive.startDateTime.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return dive.startDateTime;
  const parts: string[] = [];
  if (settings.visibleFields.date) {
    parts.push(settings.dateFormat === "iso"
      ? date.toISOString().slice(0, 10)
      : new Intl.DateTimeFormat(settings.language === "zh-Hant" ? "zh-HK" : "en", {
        dateStyle: settings.dateFormat === "medium" ? "medium" : "short",
      }).format(date));
  }
  if (settings.visibleFields.startTime) {
    parts.push(new Intl.DateTimeFormat(settings.language === "zh-Hant" ? "zh-HK" : "en", {
      hour: "numeric", minute: "2-digit", hour12: settings.hourCycle === "12",
    }).format(date));
  }
  return parts.join(" · ");
}

function applyTextTreatment(context: CanvasRenderingContext2D, settings: ComposerSettings) {
  context.shadowColor = settings.textTreatment === "shadow" ? "rgba(0,0,0,.8)" : "transparent";
  context.shadowBlur = settings.textTreatment === "shadow" ? 12 : 0;
  context.shadowOffsetY = settings.textTreatment === "shadow" ? 3 : 0;
}

function drawAlignedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, align: ComposerSettings["textAlign"], settings: ComposerSettings) {
  context.textAlign = align === "centre" ? "center" : align;
  const drawX = align === "centre" ? x + width / 2 : align === "right" ? x + width : x;
  if (settings.textTreatment === "outline") {
    context.strokeStyle = "rgba(0,0,0,.9)";
    const fontPixels = Number(context.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
    context.lineWidth = Math.max(2, fontPixels * 0.055);
    context.strokeText(text, drawX, y, width);
  }
  context.fillText(text, drawX, y, width);
  context.textAlign = "left";
}

function blockAnchor(
  position: ComposerSettings["blockPositions"]["site"],
  panel: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  margin: number,
) {
  if (position === "inside-panel" || position === "above-graph") {
    return { x: panel.x + margin, y: panel.y + margin, width: panel.width - margin * 2, align: "left" as const };
  }
  const bottom = position.startsWith("bottom");
  const centre = position.endsWith("centre");
  const right = position.endsWith("right");
  return {
    x: margin,
    y: bottom ? height - margin * 2.4 : margin,
    width: width - margin * 2,
    align: centre ? "centre" as const : right ? "right" as const : "left" as const,
  };
}

function blockRect(
  position: ComposerSettings["blockPositions"]["chart"],
  panel: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  margin: number,
  desiredWidth: number,
  desiredHeight: number,
) {
  if (position === "inside-panel" || position === "above-graph") {
    return {
      x: panel.x + margin,
      y: position === "above-graph"
        ? panel.y + panel.height * 0.08
        : panel.y + (panel.height - desiredHeight) / 2,
      width: Math.min(desiredWidth, panel.width - margin * 2),
      height: desiredHeight,
    };
  }
  const centre = position.endsWith("centre");
  const right = position.endsWith("right");
  const bottom = position.startsWith("bottom");
  const actualWidth = Math.min(desiredWidth, width - margin * 2);
  return {
    x: centre
      ? (width - actualWidth) / 2
      : right
        ? width - margin - actualWidth
        : margin,
    y: bottom ? height - margin - desiredHeight : margin + height * 0.16,
    width: actualWidth,
    height: desiredHeight,
  };
}

function logoRect(
  position: ComposerSettings["blockPositions"]["logo"],
  panel: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  margin: number,
  desiredWidth: number,
  desiredHeight: number,
) {
  if (position === "inside-panel" || position === "above-graph") {
    return {
      x: panel.x + margin,
      y: panel.y + margin,
      width: Math.min(desiredWidth, panel.width - margin * 2),
      height: desiredHeight,
    };
  }
  const centre = position.endsWith("centre");
  const right = position.endsWith("right");
  const bottom = position.startsWith("bottom");
  return {
    x: centre
      ? (width - desiredWidth) / 2
      : right
        ? width - margin - desiredWidth
        : margin,
    y: bottom ? height - margin - desiredHeight : margin,
    width: desiredWidth,
    height: desiredHeight,
  };
}
