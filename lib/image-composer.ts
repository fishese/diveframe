import { chartAvailability, renderDiveChart } from "./chart-renderer";
import { chartHomeRect, offsetRect, panelRect } from "./composer-layout";
import { getOverlayFont } from "./composer-fonts";
import { blurBehindPanel, drawComposerPanel } from "./composer-panel";
import type { ComposerSettings } from "./composer-settings";
import { collectStatItems, drawComposerStats } from "./composer-stats";
import { formattedCoordinates, type Dive } from "./dive-model";
import { translate } from "./i18n";
import { getTemplate } from "./templates";

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
  const recipe = getTemplate(settings.templateId);
  const fontStack = getOverlayFont(settings.fontFamily).stack;
  const margin = Math.round(Math.min(width, height) * settings.safeMargin);

  const redrawPhoto = () => drawPhoto(context, image, width, height, settings);

  // 1. Photo
  redrawPhoto();

  // Stats first so panel height can grow with visible field count (solid-band).
  const stats = collectStatItems(dive, settings);

  // 2–3. Panel + chart geometry
  const panel = panelRect(
    settings.panelEdge,
    width,
    height,
    settings.chartHeight,
    settings.panelDensity,
    {
      statCount: stats.length,
      presentation: recipe.statsPresentation,
    },
  );
  const chartRect = offsetRect(
    chartHomeRect(
      recipe.chartRegion,
      panel,
      width,
      height,
      settings.chartHeight,
      margin,
    ),
    settings.chartOffsetX,
    settings.chartOffsetY,
    width,
    height,
  );

  // 4. Optional whole-canvas dimming
  if (settings.backgroundDimming) {
    context.fillStyle = `rgba(2, 14, 21, ${settings.backgroundDimming})`;
    context.fillRect(0, 0, width, height);
  }

  // 5. Chart when above the panel (before panel fill so frost does not cover it)
  let renderedChart = false;
  if (recipe.chartRegion === "above-panel" && settings.chartMode !== "hidden") {
    if (settings.graphGradient) {
      drawGraphAreaGradient(context, chartRect);
    }
    renderedChart = renderDiveChart(context, chartRect, dive, settings);
  }

  // Soft blur under panel when fill is not already frosted
  if (settings.blurBehindText && settings.panelFillMode !== "frosted") {
    blurBehindPanel(
      context,
      panel,
      width,
      height,
      redrawPhoto,
      settings.backgroundDimming,
    );
  }

  // 6. Panel fill (frosted may call redrawPhoto clipped)
  drawComposerPanel(
    context,
    panel,
    settings,
    redrawPhoto,
    settings.backgroundDimming,
  );

  // Chart inside panel must paint after the fill
  if (recipe.chartRegion === "in-panel" && settings.chartMode !== "hidden") {
    renderedChart = renderDiveChart(context, chartRect, dive, settings);
  }

  // 7. Site / category / date overlays
  context.fillStyle = settings.textColor;
  context.textBaseline = "top";
  applyTextTreatment(context, settings);
  const siteName = settings.visibleFields.site
    ? resolveSiteName(dive, settings.siteNameOverride)
    : null;
  const titleSize = Math.round(Math.min(width, height) * 0.055 * settings.fontSize);
  const siteInside = Boolean(siteName) && isInsidePanel(settings.blockPositions.site);
  const categoryInside =
    settings.visibleFields.category &&
    settings.blockPositions.category !== "hidden" &&
    isInsidePanel(settings.blockPositions.category);
  const dateText = formatDateTime(dive, settings);
  const dateInside =
    Boolean(dateText) &&
    settings.blockPositions.date !== "hidden" &&
    isInsidePanel(settings.blockPositions.date);

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
  context.fillStyle = settings.textColor;
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
    context.fillStyle = settings.textColor;
    drawAlignedText(context, dateText, dateAnchor.x, dateAnchor.y + dateOffset, dateAnchor.width, dateAnchor.align, settings);
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
    let legendX = chartRect.x;
    for (const item of legend) {
      context.fillStyle = item.color;
      context.fillRect(legendX, chartRect.y - titleSize * 0.28, titleSize * 0.3, Math.max(2, settings.lineThickness));
      context.fillStyle = settings.textColor;
      context.fillText(item.label, legendX + titleSize * 0.4, chartRect.y - titleSize * 0.38);
      legendX += context.measureText(item.label).width + titleSize * 0.85;
    }
  }

  // 8. Stats — stack below inside-panel titles / in-panel chart when needed
  let titleReserveTop = 0;
  if (siteInside) titleReserveTop += titleSize * 1.2;
  if (categoryInside) titleReserveTop += titleSize * 0.55;
  if (dateInside) titleReserveTop += titleSize * 0.55;
  if (titleReserveTop > 0) titleReserveTop += titleSize * 0.25;

  if (settings.blockPositions.statistics !== "hidden") {
    drawComposerStats(
      context,
      panel,
      stats,
      recipe.statsPresentation,
      settings,
      fontStack,
      {
        chartRegion: recipe.chartRegion,
        chartRect,
        chartVisible: renderedChart,
        titleReserveTop,
      },
    );
  }

  if (logo && settings.showLogo && settings.blockPositions.logo !== "hidden") {
    const maxWidth = width * 0.16;
    const scale = Math.min(maxWidth / logo.width, (height * 0.09) / logo.height, 1);
    const logoBox = offsetLogoRect(
      logoRect(
        settings.blockPositions.logo,
        panel,
        width,
        height,
        margin,
        logo.width * scale,
        logo.height * scale,
      ),
      settings.logoOffsetX,
      settings.logoOffsetY,
      width,
      height,
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

function formatDateTime(dive: Dive, settings: ComposerSettings) {
  if (!dive.startDateTime || (!settings.visibleFields.date && !settings.visibleFields.startTime)) return null;
  const date = new Date(dive.startDateTime.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return dive.startDateTime;
  const parts: string[] = [];
  if (settings.visibleFields.date) {
    parts.push(settings.dateFormat === "iso"
      ? date.toISOString().slice(0, 10)
      : new Intl.DateTimeFormat(settings.language === "zh-Hant" ? "zh-HK" : settings.language === "ja" ? "ja-JP" : "en", {
        dateStyle: settings.dateFormat === "medium" ? "medium" : "short",
      }).format(date));
  }
  if (settings.visibleFields.startTime) {
    parts.push(new Intl.DateTimeFormat(settings.language === "zh-Hant" ? "zh-HK" : settings.language === "ja" ? "ja-JP" : "en", {
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

/** Soft vertical wash behind above-panel chart (legacy “gradient behind graph”). */
function drawGraphAreaGradient(
  context: CanvasRenderingContext2D,
  chartRect: { x: number; y: number; width: number; height: number },
) {
  const pad = chartRect.height * 0.35;
  const top = Math.max(0, chartRect.y - pad * 0.35);
  const bottom = chartRect.y + chartRect.height + pad * 0.15;
  const gradient = context.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, "rgba(3, 20, 29, 0)");
  gradient.addColorStop(0.4, "rgba(3, 20, 29, 0.28)");
  gradient.addColorStop(1, "rgba(3, 20, 29, 0.5)");
  context.fillStyle = gradient;
  context.fillRect(chartRect.x, top, chartRect.width, bottom - top);
}

function isInsidePanel(position: ComposerSettings["blockPositions"]["site"]) {
  return position === "inside-panel" || position === "above-graph";
}

function drawAlignedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, align: ComposerSettings["textAlign"], settings: ComposerSettings) {
  context.textAlign = align === "centre" ? "center" : align;
  const drawX = align === "centre" ? x + width / 2 : align === "right" ? x + width : x;
  if (settings.textTreatment === "outline" || settings.textContrastBoost) {
    context.strokeStyle = "rgba(0,0,0,.9)";
    const fontPixels = Number(context.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
    context.lineWidth = Math.max(2, fontPixels * (settings.textContrastBoost ? 0.08 : 0.055));
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

function offsetLogoRect(
  rect: { x: number; y: number; width: number; height: number },
  offsetX: number,
  offsetY: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  return {
    ...rect,
    x: Math.min(
      canvasWidth - rect.width,
      Math.max(0, rect.x + offsetX * canvasWidth),
    ),
    y: Math.min(
      canvasHeight - rect.height,
      Math.max(0, rect.y + offsetY * canvasHeight),
    ),
  };
}
