import type { TemplateDefinition } from "./templates";

export function lowerPanelY(
  layout: TemplateDefinition["layout"],
  chartHeight: number,
  height: number,
) {
  const baseY =
    height *
    (layout === "graph" ? 0.46 : layout === "dashboard" ? 0.56 : 0.58);
  const reserveBelowChart = height * (layout === "dashboard" ? 0.12 : 0.26);
  const requestedY = height - height * chartHeight - reserveBelowChart;
  return Math.min(baseY, Math.max(height * 0.18, requestedY));
}
