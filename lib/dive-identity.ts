import type { DiveSource, LocalImportedDive } from "./indexed-db";
import type { DiveSample } from "./dive-model";

const SOURCE_PRIORITY: Record<DiveSource, number> = {
  shearwater: 0,
  "shearwater-ble": 0,
  subsurface: 1,
  uddf: 2,
  fit: 3,
};

export function canonicalDiveId(dive: LocalImportedDive) {
  const sourceId = dive.sourceId.trim();
  const stablePart = sourceId || fallbackFingerprint(dive);
  return `dive:v1:${dive.source}:${encodeURIComponent(stablePart)}`;
}

export function stablePortableSourceId(
  explicitId: string | null | undefined,
  dive: {
    startDateTime: string | Date | null;
    serialNumber: string | null;
    maxDepthM: number | null;
    durationSeconds: number | null;
    samples: DiveSample[];
  },
) {
  const normalizedExplicitId = explicitId?.trim();
  return normalizedExplicitId
    ? `id:${normalizedExplicitId}`
    : `fingerprint:${portableDiveFingerprint(dive)}`;
}

export function portableDiveFingerprint(dive: {
  startDateTime: string | Date | null;
  serialNumber: string | null;
  maxDepthM: number | null;
  durationSeconds: number | null;
  samples: DiveSample[];
}) {
  return [
    normalizeDate(dive.startDateTime),
    normalizeSerial(dive.serialNumber),
    rounded(dive.maxDepthM, 10),
    rounded(dive.durationSeconds, 1),
    profileSignature(dive.samples),
  ].join("|");
}

export function shouldPromoteCanonicalSource(
  incomingSource: DiveSource,
  existingSources: string[],
) {
  const incomingPriority = SOURCE_PRIORITY[incomingSource];
  const currentPriority = existingSources.reduce(
    (best, source) =>
      source in SOURCE_PRIORITY
        ? Math.min(best, SOURCE_PRIORITY[source as DiveSource])
        : best,
    Number.POSITIVE_INFINITY,
  );
  return incomingPriority < currentPriority;
}

function fallbackFingerprint(dive: LocalImportedDive) {
  return portableDiveFingerprint({
    startDateTime: dive.diveDate,
    serialNumber: dive.serialNumber,
    maxDepthM: dive.maxDepthM ?? numberOrNull(dive.depth),
    durationSeconds: dive.durationSeconds,
    samples: dive.samples,
  });
}

function normalizeDate(value: string | Date | null) {
  if (!value) return "unknown-time";
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp)
    ? String(value).trim().toLowerCase()
    : new Date(timestamp).toISOString();
}

function normalizeSerial(value: string | null) {
  return value?.replace(/[^a-z0-9]/gi, "").toUpperCase() || "unknown-device";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value: number | null, multiplier: number) {
  return value === null
    ? "unknown"
    : String(Math.round(value * multiplier) / multiplier);
}

function profileSignature(samples: DiveSample[]) {
  if (!samples.length) return "no-profile";
  const indexes = [
    0,
    Math.floor((samples.length - 1) * 0.25),
    Math.floor((samples.length - 1) * 0.5),
    Math.floor((samples.length - 1) * 0.75),
    samples.length - 1,
  ];
  const points = [...new Set(indexes)].map((index) => {
    const sample = samples[index];
    return `${rounded(sample.elapsedSeconds, 1)}@${rounded(sample.depthM, 10)}`;
  });
  return `${samples.length}:${points.join(",")}`;
}
