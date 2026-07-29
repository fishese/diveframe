import type { BlockPosition, CanvasRatio, TemplateId } from "./composer-settings";

export type TemplateDefinition = {
  id: TemplateId;
  name: string;
  description: string;
  layout: "bottom" | "right" | "graph" | "dashboard" | "split";
  accent: string;
  defaultRatio: CanvasRatio;
  defaultChartHeight: number;
  panelSide?: "left" | "right";
  defaultPositions: {
    site: BlockPosition;
    category: BlockPosition;
    date: BlockPosition;
    chart: BlockPosition;
    statistics: BlockPosition;
    logo: BlockPosition;
  };
};

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "bottom-profile",
    name: "Bottom Profile",
    description: "Profile and statistics anchored across the lower third.",
    layout: "bottom",
    accent: "#8debd7",
    defaultRatio: "4:5",
    defaultChartHeight: 0.27,
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "top-centre",
    },
  },
  {
    id: "right-panel",
    name: "Right Information Panel",
    description: "A structured vertical panel with a compact profile.",
    layout: "right",
    accent: "#73d7ff",
    defaultRatio: "4:5",
    defaultChartHeight: 0.22,
    panelSide: "right",
    defaultPositions: {
      site: "inside-panel",
      category: "inside-panel",
      date: "inside-panel",
      chart: "inside-panel",
      statistics: "inside-panel",
      logo: "top-left",
    },
  },
  {
    id: "full-width-graph",
    name: "Full-width Graph",
    description: "A strong wide profile dividing image and statistics.",
    layout: "graph",
    accent: "#a8f2df",
    defaultRatio: "4:5",
    defaultChartHeight: 0.36,
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "top-centre",
    },
  },
  {
    id: "landscape-dashboard",
    name: "Landscape Dashboard",
    description: "A wide profile and statistics dashboard across the lower band.",
    layout: "dashboard",
    accent: "#8debd7",
    defaultRatio: "16:9",
    defaultChartHeight: 0.3,
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "inside-panel",
      statistics: "inside-panel",
      logo: "top-centre",
    },
  },
  {
    id: "cinematic-split",
    name: "Cinematic Split",
    description: "A landscape photo with a dedicated sidecar for profile and data.",
    layout: "split",
    accent: "#73d7ff",
    defaultRatio: "16:9",
    defaultChartHeight: 0.25,
    panelSide: "right",
    defaultPositions: {
      site: "inside-panel",
      category: "inside-panel",
      date: "inside-panel",
      chart: "inside-panel",
      statistics: "inside-panel",
      logo: "top-left",
    },
  },
];

export function getTemplate(id: TemplateId) {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}
