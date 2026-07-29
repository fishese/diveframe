import type { ComposerSettings } from "./composer-settings";

export type ComposerPresetSettings = Omit<
  ComposerSettings,
  | "id"
  | "diveId"
  | "selectedPhotoId"
  | "categoryOverride"
  | "siteNameOverride"
  | "photoZoom"
  | "photoOffsetX"
  | "photoOffsetY"
  | "photoRotation"
  | "updatedAt"
>;

const DIVE_SPECIFIC_KEYS = [
  "id",
  "diveId",
  "selectedPhotoId",
  "categoryOverride",
  "siteNameOverride",
  "photoZoom",
  "photoOffsetX",
  "photoOffsetY",
  "photoRotation",
  "updatedAt",
] as const;

export function reusableComposerSettings(settings: ComposerSettings) {
  const reusable = structuredClone(settings) as unknown as Record<
    string,
    unknown
  >;
  for (const key of DIVE_SPECIFIC_KEYS) delete reusable[key];
  return reusable as unknown as ComposerPresetSettings;
}

export function applyComposerPreset(
  current: ComposerSettings,
  preset: ComposerPresetSettings,
): ComposerSettings {
  return {
    ...current,
    ...structuredClone(preset),
    id: current.id,
    diveId: current.diveId,
    selectedPhotoId: current.selectedPhotoId,
    categoryOverride: current.categoryOverride,
    siteNameOverride: current.siteNameOverride,
    photoZoom: current.photoZoom,
    photoOffsetX: current.photoOffsetX,
    photoOffsetY: current.photoOffsetY,
    photoRotation: current.photoRotation,
    updatedAt: new Date().toISOString(),
  };
}
