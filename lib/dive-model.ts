export type DiveCategory = "scuba" | "freediving" | "snorkelling";

export type DiveSample = {
  elapsedSeconds: number;
  depthM: number;
  temperatureC?: number;
  /** Tank-indexed pressure series; indexes match {@link DiveTank.index}. */
  pressuresBar: number[];
  ndlSeconds?: number;
};

export type DiveMode =
  | "freedive"
  | "gauge"
  | "oc"
  | "ccr"
  | "scr"
  | "unknown";

export type DiveTankUsage =
  | "none"
  | "oxygen"
  | "diluent"
  | "sidemount"
  | "unknown";

/**
 * Computer-reported tank metadata. `index` is the stable key into each
 * sample's `pressuresBar` array. Future twin/sidemount grouping can therefore
 * remain a separate user-facing configuration without rewriting samples.
 */
export type DiveTank = {
  index: number;
  gasMixIndex: number | null;
  volumeL: number | null;
  workPressureBar: number | null;
  startPressureBar: number | null;
  endPressureBar: number | null;
  usage: DiveTankUsage;
};

export type DiveSalinity = {
  waterType: "fresh" | "salt" | "unknown";
  densityKgM3: number | null;
};

export type DiveDecompressionModel = {
  type: "none" | "buhlmann" | "vpm" | "rgbm" | "dciem" | "unknown";
  conservatism: number | null;
  gfLow: number | null;
  gfHigh: number | null;
};

export type GasMix = {
  oxygenPercent: number | null;
  heliumPercent: number | null;
  label: string;
};

export type DiveSite = {
  id: string | null;
  originalName: string | null;
  userName: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type SourceMetadata = {
  sources: string[];
  sourceDiveNumbers: Partial<
    Record<"shearwater" | "subsurface" | "uddf" | "fit", number | null>
  >;
  sourceSiteNames: Partial<
    Record<"shearwater" | "subsurface" | "uddf" | "fit", string | null>
  >;
  serialNumber: string | null;
};

export type Dive = {
  id: string;
  number: number | null;
  startDateTime: string | null;
  durationSeconds: number | null;
  category: DiveCategory;
  categorySource: "default" | "import" | "user";
  site: DiveSite;
  maxDepthM: number | null;
  averageDepthM: number | null;
  waterTemperatureC: number | null;
  surfaceTemperatureC: number | null;
  atmosphericPressureBar: number | null;
  salinity: DiveSalinity | null;
  decompressionModel: DiveDecompressionModel | null;
  diveMode: DiveMode | null;
  gasMixes: GasMix[];
  tanks: DiveTank[];
  computerModel: string | null;
  samples: DiveSample[];
  tankPressuresStartBar: Array<number | null>;
  tankPressuresEndBar: Array<number | null>;
  sourceMetadata: SourceMetadata;
};

export function formattedCoordinates(
  latitude: number | null,
  longitude: number | null,
  precision = 5,
) {
  if (latitude === null || longitude === null) return null;
  const latDirection = latitude >= 0 ? "N" : "S";
  const lngDirection = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(precision)}° ${latDirection}, ${Math.abs(longitude).toFixed(precision)}° ${lngDirection}`;
}

export function gasMixLabel(
  oxygenPercent: number | null,
  heliumPercent: number | null,
) {
  if (oxygenPercent === null && heliumPercent === null) return "Unknown";
  if ((heliumPercent ?? 0) > 0) {
    return `Trimix ${Math.round(oxygenPercent ?? 0)}/${Math.round(heliumPercent ?? 0)}`;
  }
  if (oxygenPercent === null || Math.abs(oxygenPercent - 21) < 0.5) return "Air";
  if (oxygenPercent >= 99.5) return "O₂";
  return `Nitrox ${Math.round(oxygenPercent)}`;
}
