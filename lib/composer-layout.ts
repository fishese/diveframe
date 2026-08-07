import type { PanelDensity, PanelEdge } from "./composer-settings";

export type LayoutRect = { x: number; y: number; width: number; height: number };

export type PanelContentHint = {
  statCount?: number;
  presentation?: "text-stack" | "icon-grid" | "solid-band";
};

const DENSITY_PAD = { compact: 0.85, comfortable: 1, roomy: 1.18 } as const;
const MAX_BAND_FRAC = 0.42;

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
    const strip = width * (0.34 * padScale);
    return edge === "right"
      ? { x: width - strip, y: 0, width: strip, height }
      : { x: 0, y: 0, width: strip, height };
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
  let frac = Math.min(MAX_BAND_FRAC, 0.18 * padScale + chartHeight * 0.35);
  const count = contentHint?.statCount ?? 0;
  if (count <= 0) return frac;

  const presentation = contentHint?.presentation ?? "text-stack";
  let contentFrac = frac;
  if (presentation === "solid-band") {
    const columns = Math.min(4, count);
    const rows = Math.ceil(count / Math.max(1, columns));
    contentFrac = 0.14 * padScale + rows * 0.09 * padScale;
  } else if (presentation === "icon-grid") {
    const rows = Math.ceil(Math.min(count, 6) / 3);
    contentFrac = 0.14 * padScale + rows * 0.1 * padScale;
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
): LayoutRect {
  if (region === "in-panel") {
    return {
      x: panel.x + margin,
      y: panel.y + panel.height * 0.55,
      width: panel.width - margin * 2,
      height: panel.height * chartHeight,
    };
  }
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
    const h = height * chartHeight;
    return {
      x: margin,
      y: panel.height + height * 0.01,
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
