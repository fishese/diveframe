import type { BlockPosition, TemplateId } from "./composer-settings";

export type TemplateDefinition = {
  id: TemplateId;
  name: string;
  description: string;
  layout: "bottom" | "right" | "minimal" | "poster" | "graph";
  accent: string;
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
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "top-right",
    },
  },
  {
    id: "right-panel",
    name: "Right Information Panel",
    description: "A structured vertical panel with a compact profile.",
    layout: "right",
    accent: "#73d7ff",
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
    id: "minimal",
    name: "Minimal",
    description: "Small type and a fine profile with maximum photo area.",
    layout: "minimal",
    accent: "#ffffff",
    defaultPositions: {
      site: "top-left",
      category: "hidden",
      date: "bottom-left",
      chart: "bottom-centre",
      statistics: "bottom-right",
      logo: "top-right",
    },
  },
  {
    id: "poster",
    name: "Poster",
    description: "Large site typography and editorial statistics.",
    layout: "poster",
    accent: "#ffd36b",
    defaultPositions: {
      site: "top-centre",
      category: "top-centre",
      date: "inside-panel",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "bottom-right",
    },
  },
  {
    id: "full-width-graph",
    name: "Full-width Graph",
    description: "A strong wide profile dividing image and statistics.",
    layout: "graph",
    accent: "#a8f2df",
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "bottom-centre",
      statistics: "bottom-centre",
      logo: "top-right",
    },
  },
];

export function getTemplate(id: TemplateId) {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}
