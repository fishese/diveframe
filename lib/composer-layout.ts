import type { PanelDensity, PanelEdge } from "./composer-settings";

export type LayoutRect = { x: number; y: number; width: number; height: number };

export type PanelContentHint = {
  statCount?: number;
  presentation?: "text-stack" | "icon-grid" | "solid-band";
};

export type ChartHomeOptions = {
  /** Space already used by site/category/date inside a vertical panel. */
  titleReserveTop?: number;
  /** Space reserved at the bottom for stats inside a vertical panel. */
  statsReserveBottom?: number;
  /** Extra gap between an above-panel chart and the dock/band. */
  chartPanelGap?: number;
};

const DENSITY_PAD = { compact: 0.85, comfortable: 1, roomy: 1.18 } as const;
const MAX_BAND_FRAC = 0.42;
/** Default breathing room between chart bottom and dock/band top. */
const DEFAULT_CHART_PANEL_GAP = 0.028;

export function panelRect(
  edge: PanelEdge,
  width: number,
  height: number,
  chartHeight: number,
  density: PanelDensity,
  contentHint?: PanelContentHint,
): LayoutRect {
  const padScale = DENSITY_PAD[density];
  if (edge === "left" || edge === "right") {
    const strip = width * ((contentHint?.presentation === "solid-band" ? 0.27 : 0.34) * padScale);
    return edge === "right"
      ? { x: width - strip, y: 0, width: strip, height }
      : { x: 0, y: 0, width: strip, height };
  }
  if (contentHint?.presentation === "icon-grid") {
    const rows = Math.ceil(Math.min(contentHint.statCount ?? 0, 6) / 3);
    const dock = 0.18 + Math.max(0, rows - 1) * 0.1;
    const band = height * dock * padScale;
    return edge === "top"
      ? { x: 0, y: 0, width, height: band }
      : { x: 0, y: height - band, width, height: band };
  }
  const band = height * bandFraction(chartHeight, padScale, contentHint);
  return edge === "top"
    ? { x: 0, y: 0, width, height: band }
    : { x: 0, y: height - band, width, height: band };
}

function bandFraction(
  chartHeight: number,
  padScale: number,
  contentHint?: PanelContentHint,
): number {
  const frac = Math.min(MAX_BAND_FRAC, 0.18 * padScale + chartHeight * 0.35);
  const count = contentHint?.statCount ?? 0;
  if (count <= 0) return frac;

  const presentation = contentHint?.presentation ?? "text-stack";
  let contentFrac = frac;
  if (presentation === "solid-band") {
    const columns = Math.min(4, count);
    const rows = Math.ceil(count / Math.max(1, columns));
    contentFrac = 0.16 * padScale + rows * 0.11 * padScale;
  } else if (presentation === "icon-grid") {
    const rows = Math.ceil(Math.min(count, 6) / 3);
    contentFrac = 0.16 * padScale + rows * 0.13 * padScale;
  } else {
    const columns = Math.min(4, count);
    const rows = Math.ceil(count / Math.max(1, columns));
    contentFrac = 0.12 * padScale + rows * 0.07 * padScale;
  }
  return Math.min(MAX_BAND_FRAC, Math.max(frac, contentFrac));
}

export function chartHomeRect(
  region: "above-panel" | "in-panel",
  panel: LayoutRect,
  width: number,
  height: number,
  chartHeight: number,
  margin: number,
  options?: ChartHomeOptions,
): LayoutRect {
  if (region === "in-panel") {
    const titleReserve = Math.max(0, options?.titleReserveTop ?? 0);
    const statsReserve = Math.max(0, options?.statsReserveBottom ?? 0);
    // Compact gaps like the classic right panel: chart fills the mid band.
    const gap = Math.max(8, margin * 0.35);
    const top = panel.y + margin + titleReserve + gap;
    const bottom = panel.y + panel.height - margin - statsReserve - gap;
    const available = Math.max(1, bottom - top);
    // Prefer filling the open mid-band so titles / chart / stats stack tightly.
    const desired = height * chartHeight;
    const h = Math.max(desired * 0.85, available * 0.92);
    return {
      x: panel.x + margin,
      y: top,
      width: panel.width - margin * 2,
      height: Math.min(h, available),
    };
  }
  const gap = height * (options?.chartPanelGap ?? DEFAULT_CHART_PANEL_GAP);
  if (panel.y > 0) {
    const h = height * chartHeight;
    return {
      x: margin,
      y: panel.y - h - gap,
      width: width - margin * 2,
      height: h,
    };
  }
  if (panel.height < height && panel.x === 0 && panel.width === width) {
    const h = height * chartHeight;
    return {
      x: margin,
      y: panel.height + gap,
      width: width - margin * 2,
      height: h,
    };
  }
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
