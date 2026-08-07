import type {
  BlockPosition,
  CanvasRatio,
  ComposerSettings,
  PanelDensity,
  PanelEdge,
  PanelFillMode,
  PanelGradient,
  TemplateId,
} from "./composer-settings";

export type TemplateDefinition = {
  id: TemplateId;
  name: string;
  description: string;
  accent: string;
  defaultRatio: CanvasRatio;
  defaultChartHeight: number;
  /** Transitional until Task 3 removes layout branches in image-composer */
  layout: "bottom" | "right";
  /** How stats are laid out inside the panel */
  statsPresentation: "text-stack" | "icon-grid" | "solid-band";
  /** Chart home: lower band above horizontal panel, or compact inside vertical panel stack */
  chartRegion: "above-panel" | "in-panel";
  panel: {
    edge: PanelEdge;
    fillMode: PanelFillMode;
    color: string;
    gradient: PanelGradient;
    opacity: number;
    density: PanelDensity;
    textContrastBoost: boolean;
  };
  defaultPositions: ComposerSettings["blockPositions"];
  defaultVisibleFields: ComposerSettings["visibleFields"];
};

const defaultVisibleFields: ComposerSettings["visibleFields"] = {
  site: true,
  category: true,
  date: true,
  startTime: true,
  duration: true,
  maxDepth: true,
  averageDepth: true,
  temperature: true,
  gasMix: true,
  startPressure: true,
  endPressure: true,
  coordinates: false,
  diveNumber: false,
  computerModel: false,
};

const bottomStatsDockVisibleFields: ComposerSettings["visibleFields"] = {
  site: true,
  category: true,
  date: true,
  startTime: false,
  duration: true,
  maxDepth: true,
  averageDepth: false,
  temperature: true,
  gasMix: false,
  startPressure: false,
  endPressure: false,
  coordinates: false,
  diveNumber: false,
  computerModel: false,
};

const solidInfoBandVisibleFields: ComposerSettings["visibleFields"] = {
  site: true,
  category: true,
  date: true,
  startTime: false,
  duration: true,
  maxDepth: true,
  averageDepth: true,
  temperature: true,
  gasMix: true,
  startPressure: true,
  endPressure: true,
  coordinates: false,
  diveNumber: false,
  computerModel: false,
};

const tintPanel = {
  edge: "bottom" as const,
  fillMode: "tint" as const,
  color: "#03141d",
  gradient: {
    enabled: true,
    colorA: "#03141d",
    colorB: "#03141d",
    angle: 90,
  },
  opacity: 0.68,
  density: "comfortable" as const,
  textContrastBoost: false,
};

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "bottom-profile",
    name: "Bottom Profile",
    description: "Profile and statistics anchored across the lower third.",
    accent: "#8debd7",
    defaultRatio: "4:5",
    defaultChartHeight: 0.27,
    layout: "bottom",
    statsPresentation: "text-stack",
    chartRegion: "above-panel",
    panel: tintPanel,
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "top-centre",
    },
    defaultVisibleFields: { ...defaultVisibleFields },
  },
  {
    id: "right-panel",
    name: "Right Information Panel",
    description: "A structured vertical panel with a compact profile.",
    accent: "#73d7ff",
    defaultRatio: "4:5",
    defaultChartHeight: 0.22,
    layout: "right",
    statsPresentation: "text-stack",
    chartRegion: "in-panel",
    panel: {
      ...tintPanel,
      edge: "right",
    },
    defaultPositions: {
      site: "inside-panel",
      category: "inside-panel",
      date: "inside-panel",
      chart: "inside-panel",
      statistics: "inside-panel",
      logo: "top-left",
    },
    defaultVisibleFields: { ...defaultVisibleFields },
  },
  {
    id: "bottom-stats-dock",
    name: "Bottom Stats Dock",
    description: "A frosted stats dock with icon grid over a wide profile.",
    accent: "#8debd7",
    defaultRatio: "16:9",
    defaultChartHeight: 0.28,
    layout: "bottom",
    statsPresentation: "icon-grid",
    chartRegion: "above-panel",
    panel: {
      edge: "bottom",
      fillMode: "frosted",
      color: "#03141d",
      gradient: {
        enabled: false,
        colorA: "#03141d",
        colorB: "#03141d",
        angle: 90,
      },
      opacity: 0.55,
      density: "comfortable",
      textContrastBoost: false,
    },
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "top-centre",
    },
    defaultVisibleFields: { ...bottomStatsDockVisibleFields },
  },
  {
    id: "solid-info-band",
    name: "Solid Info Band",
    description: "A solid horizontal band that scales with more dive fields.",
    accent: "#8debd7",
    defaultRatio: "4:5",
    defaultChartHeight: 0.24,
    layout: "bottom",
    statsPresentation: "solid-band",
    chartRegion: "above-panel",
    panel: {
      edge: "bottom",
      fillMode: "solid",
      color: "#03141d",
      gradient: {
        enabled: false,
        colorA: "#03141d",
        colorB: "#03141d",
        angle: 90,
      },
      opacity: 1,
      density: "comfortable",
      textContrastBoost: false,
    },
    defaultPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "top-centre",
    },
    defaultVisibleFields: { ...solidInfoBandVisibleFields },
  },
];

export const FALLBACK_TEMPLATE_ID: TemplateId = "bottom-stats-dock";

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATES.some((template) => template.id === value);
}

export function getTemplate(id: string): TemplateDefinition {
  return TEMPLATES.find((template) => template.id === id) ?? getTemplate(FALLBACK_TEMPLATE_ID);
}

export function applyTemplateRecipe(
  settings: ComposerSettings,
  templateId: TemplateId,
): ComposerSettings {
  const recipe = getTemplate(templateId);
  return {
    ...settings,
    templateId: recipe.id,
    ratio: recipe.defaultRatio,
    chartHeight: recipe.defaultChartHeight,
    chartOffsetX: 0,
    chartOffsetY: 0,
    blockPositions: { ...recipe.defaultPositions },
    visibleFields: { ...recipe.defaultVisibleFields },
    panelEdge: recipe.panel.edge,
    panelFillMode: recipe.panel.fillMode,
    panelColor: recipe.panel.color,
    panelGradient: { ...recipe.panel.gradient },
    panelOpacity: recipe.panel.opacity,
    panelDensity: recipe.panel.density,
    textContrastBoost: recipe.panel.textContrastBoost,
  };
}

export function normalizeComposerSettings(raw: ComposerSettings): ComposerSettings {
  const templateId = isTemplateId(raw.templateId)
    ? raw.templateId
    : FALLBACK_TEMPLATE_ID;
  const recipe = getTemplate(templateId);
  const withTemplate =
    templateId === raw.templateId
      ? { ...raw, templateId }
      : applyTemplateRecipe(raw, templateId);
  return {
    ...withTemplate,
    panelEdge: withTemplate.panelEdge ?? recipe.panel.edge,
    panelFillMode: withTemplate.panelFillMode ?? recipe.panel.fillMode,
    panelColor: withTemplate.panelColor ?? recipe.panel.color,
    panelGradient: withTemplate.panelGradient ?? { ...recipe.panel.gradient },
    panelDensity: withTemplate.panelDensity ?? recipe.panel.density,
    textContrastBoost: withTemplate.textContrastBoost ?? recipe.panel.textContrastBoost,
    chartOffsetX: withTemplate.chartOffsetX ?? 0,
    chartOffsetY: withTemplate.chartOffsetY ?? 0,
  };
}
