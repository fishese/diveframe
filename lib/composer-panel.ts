import type { LayoutRect } from "./composer-layout";
import type { ComposerSettings, PanelGradient } from "./composer-settings";

export function drawComposerPanel(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  settings: ComposerSettings,
  redrawPhoto: () => void,
  backgroundDimming = 0,
) {
  if (settings.panelFillMode === "none") {
    return;
  }

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
    // redrawPhoto wipes canvas dimming; restore it before frost tint
    applyBackgroundDimming(context, panel, backgroundDimming);
    context.fillStyle = hexToRgba(settings.panelColor, opacity * 0.55);
    context.fillRect(panel.x, panel.y, panel.width, panel.height);
    context.restore();
    return;
  }

  context.save();
  if (settings.panelGradient.enabled) {
    context.fillStyle = gradientForPanel(
      context,
      panel,
      settings.panelGradient,
      opacity,
    );
  } else {
    context.fillStyle = hexToRgba(settings.panelColor, opacity);
  }
  context.fillRect(panel.x, panel.y, panel.width, panel.height);
  context.restore();
}

/** Soft blur of the photo under the panel when fill is not already frosted. */
export function blurBehindPanel(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  canvasWidth: number,
  canvasHeight: number,
  redrawPhoto: () => void,
  backgroundDimming = 0,
) {
  context.save();
  context.beginPath();
  context.rect(panel.x, panel.y, panel.width, panel.height);
  context.clip();
  try {
    context.filter = `blur(${Math.round(Math.min(canvasWidth, canvasHeight) * 0.012)}px)`;
    redrawPhoto();
  } catch {
    // ignore unsupported filter
  }
  context.filter = "none";
  // redrawPhoto wipes canvas dimming; restore it under the panel
  applyBackgroundDimming(context, panel, backgroundDimming);
  context.restore();
}

function applyBackgroundDimming(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  backgroundDimming: number,
) {
  if (!(backgroundDimming > 0)) return;
  context.fillStyle = `rgba(2, 14, 21, ${backgroundDimming})`;
  context.fillRect(panel.x, panel.y, panel.width, panel.height);
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(3, 20, 29, ${alpha})`;
  }
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function gradientForPanel(
  context: CanvasRenderingContext2D,
  panel: LayoutRect,
  gradient: PanelGradient,
  opacity: number,
): CanvasGradient {
  // CSS-like angles: 0deg = to top, 90deg = to right.
  const radians = ((gradient.angle - 90) * Math.PI) / 180;
  const cx = panel.x + panel.width / 2;
  const cy = panel.y + panel.height / 2;
  const half =
    Math.hypot(panel.width, panel.height) / 2;
  const dx = Math.cos(radians) * half;
  const dy = Math.sin(radians) * half;
  const fill = context.createLinearGradient(
    cx - dx,
    cy - dy,
    cx + dx,
    cy + dy,
  );
  fill.addColorStop(0, hexToRgba(gradient.colorA, opacity * 0.15));
  fill.addColorStop(1, hexToRgba(gradient.colorB, opacity));
  return fill;
}
