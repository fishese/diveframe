import type { DiveSample } from "./dive-model";

export type CylinderPreset = {
  id: string;
  label: string;
  material: "aluminium" | "steel";
  volumeL: number;
};

export const DEFAULT_CYLINDER_PRESET_ID = "al80";

export const CYLINDER_PRESETS: CylinderPreset[] = [
  { id: "al63", label: "Aluminium 63 · 8.7 L", material: "aluminium", volumeL: 8.7 },
  { id: "al80", label: "Aluminium 80 · 11.1 L", material: "aluminium", volumeL: 11.1 },
  { id: "al100", label: "Aluminium 100 · 13.2 L", material: "aluminium", volumeL: 13.2 },
  { id: "steel10", label: "Steel 10 L", material: "steel", volumeL: 10 },
  { id: "steel12", label: "Steel 12 L", material: "steel", volumeL: 12 },
  { id: "steel15", label: "Steel 15 L", material: "steel", volumeL: 15 },
];

export function cylinderPreset(id: string | null | undefined) {
  return (
    CYLINDER_PRESETS.find((preset) => preset.id === id) ??
    CYLINDER_PRESETS.find((preset) => preset.id === DEFAULT_CYLINDER_PRESET_ID)!
  );
}

export function averageSampleTemperatureC(samples: DiveSample[]) {
  const readings = samples
    .filter(
      (sample): sample is DiveSample & { temperatureC: number } =>
        Number.isFinite(sample.temperatureC),
    )
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  if (!readings.length) return null;
  if (readings.length === 1) return readings[0].temperatureC;

  let weightedTotal = 0;
  let totalSeconds = 0;
  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const current = readings[index];
    const interval = current.elapsedSeconds - previous.elapsedSeconds;
    if (interval <= 0) continue;
    weightedTotal += ((previous.temperatureC + current.temperatureC) / 2) * interval;
    totalSeconds += interval;
  }
  return totalSeconds > 0
    ? weightedTotal / totalSeconds
    : readings.reduce((total, reading) => total + reading.temperatureC, 0) /
        readings.length;
}

export function averageSampleDepthM(samples: DiveSample[]) {
  const readings = samples
    .filter((sample) => Number.isFinite(sample.depthM))
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  if (!readings.length) return null;
  if (readings.length === 1) return readings[0].depthM;
  let weightedTotal = 0;
  let totalSeconds = 0;
  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const current = readings[index];
    const interval = current.elapsedSeconds - previous.elapsedSeconds;
    if (interval <= 0) continue;
    weightedTotal += ((previous.depthM + current.depthM) / 2) * interval;
    totalSeconds += interval;
  }
  return totalSeconds > 0 ? weightedTotal / totalSeconds : null;
}

export function firstCompletePressurePair(
  start: Array<number | null>,
  end: Array<number | null>,
) {
  const pairs = Array.from(
    { length: Math.max(start.length, end.length) },
    (_, index) => ({ start: start[index], end: end[index] }),
  ).filter(
    (pair): pair is { start: number; end: number } =>
      Number.isFinite(pair.start) &&
      Number.isFinite(pair.end) &&
      pair.start! > pair.end!,
  );
  return pairs.length === 1 ? pairs[0] : null;
}

export function calculateSacLitresPerMinute(input: {
  startPressureBar: number | null;
  endPressureBar: number | null;
  cylinderVolumeL: number | null;
  durationSeconds: number | null;
  averageDepthM: number | null;
}) {
  const {
    startPressureBar,
    endPressureBar,
    cylinderVolumeL,
    durationSeconds,
    averageDepthM,
  } = input;
  if (
    startPressureBar === null ||
    endPressureBar === null ||
    cylinderVolumeL === null ||
    durationSeconds === null ||
    averageDepthM === null ||
    startPressureBar <= endPressureBar ||
    cylinderVolumeL <= 0 ||
    durationSeconds <= 0 ||
    averageDepthM < 0
  ) {
    return null;
  }
  const consumedSurfaceLitres =
    (startPressureBar - endPressureBar) * cylinderVolumeL;
  const averageAmbientPressureBar = 1 + averageDepthM / 10;
  return consumedSurfaceLitres / (durationSeconds / 60) / averageAmbientPressureBar;
}
