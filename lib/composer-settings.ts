import type { ComposerLanguage } from "./i18n";
import type { DiveCategory } from "./dive-model";
import type { UnitSystem } from "./unit-conversion";
import type { OverlayFontId } from "./composer-fonts";

export type TemplateId =
  | "bottom-profile"
  | "right-panel"
  | "full-width-graph"
  | "landscape-dashboard"
  | "cinematic-split";
export type CanvasRatio = "original" | "1:1" | "4:5" | "9:16" | "16:9";
export type ChartMode =
  | "depth"
  | "depth-pressure"
  | "depth-temperature"
  | "depth-pressure-temperature"
  | "hidden";
export type DepthFillMode = "solid" | "fade";
export type PhotoFit = "fill" | "fit";
export type BlockPosition =
  | "top-left"
  | "top-centre"
  | "top-right"
  | "above-graph"
  | "inside-panel"
  | "bottom-left"
  | "bottom-centre"
  | "bottom-right"
  | "hidden";

export type DisplayField =
  | "site"
  | "category"
  | "date"
  | "startTime"
  | "duration"
  | "maxDepth"
  | "averageDepth"
  | "temperature"
  | "gasMix"
  | "startPressure"
  | "endPressure"
  | "coordinates"
  | "diveNumber"
  | "computerModel";

export type ComposerSettings = {
  id: string;
  diveId: string;
  selectedPhotoId: string | null;
  templateId: TemplateId;
  categoryOverride: DiveCategory;
  siteNameOverride: string;
  language: ComposerLanguage;
  units: UnitSystem;
  dateFormat: "medium" | "numeric" | "iso";
  hourCycle: "12" | "24";
  decimals: 0 | 1 | 2;
  ratio: CanvasRatio;
  outputSize: "social" | "high" | "source";
  format: "png" | "jpeg";
  jpegQuality: number;
  photoFit: PhotoFit;
  photoZoom: number;
  photoOffsetX: number;
  photoOffsetY: number;
  photoRotation: number;
  backgroundDimming: number;
  blurBehindText: boolean;
  graphGradient: boolean;
  fontSize: number;
  fontFamily: OverlayFontId;
  textColor: string;
  textAlign: "left" | "centre" | "right";
  textTreatment: "shadow" | "outline" | "none";
  panelOpacity: number;
  chartHeight: number;
  safeMargin: number;
  chartMode: ChartMode;
  showAxisLabels: boolean;
  showLogo: boolean;
  logoOffsetX: number;
  logoOffsetY: number;
  depthColor: string;
  pressureColor: string;
  temperatureColor: string;
  lineThickness: number;
  fillOpacity: number;
  depthFillMode: DepthFillMode;
  blockPositions: {
    site: BlockPosition;
    category: BlockPosition;
    date: BlockPosition;
    chart: BlockPosition;
    statistics: BlockPosition;
    logo: BlockPosition;
  };
  visibleFields: Record<DisplayField, boolean>;
  updatedAt: string;
};

export function defaultComposerSettings(diveId: string): ComposerSettings {
  return {
    id: diveId,
    diveId,
    selectedPhotoId: null,
    templateId: "bottom-profile",
    categoryOverride: "scuba",
    siteNameOverride: "",
    language: "en",
    units: "metric",
    dateFormat: "medium",
    hourCycle: "24",
    decimals: 1,
    ratio: "4:5",
    outputSize: "high",
    format: "png",
    jpegQuality: 0.92,
    photoFit: "fill",
    photoZoom: 1,
    photoOffsetX: 0,
    photoOffsetY: 0,
    photoRotation: 0,
    backgroundDimming: 0.16,
    blurBehindText: false,
    graphGradient: true,
    fontSize: 1,
    fontFamily: "noto-sans-tc",
    textColor: "#ffffff",
    textAlign: "left",
    textTreatment: "shadow",
    panelOpacity: 0.68,
    chartHeight: 0.27,
    safeMargin: 0.055,
    chartMode: "depth",
    showAxisLabels: true,
    showLogo: true,
    logoOffsetX: 0,
    logoOffsetY: 0,
    depthColor: "#8debd7",
    pressureColor: "#ffb36b",
    temperatureColor: "#a9c7ff",
    lineThickness: 3,
    fillOpacity: 0.2,
    depthFillMode: "fade",
    blockPositions: {
      site: "top-left",
      category: "top-left",
      date: "top-right",
      chart: "above-graph",
      statistics: "inside-panel",
      logo: "top-right",
    },
    visibleFields: {
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
    },
    updatedAt: new Date().toISOString(),
  };
}
