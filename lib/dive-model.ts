export type DiveCategory = "scuba" | "freediving" | "snorkelling";

export type DiveSample = {
  elapsedSeconds: number;
  depthM: number;
  temperatureC?: number;
  pressuresBar: number[];
  ndlSeconds?: number;
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
  gasMixes: GasMix[];
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
