import type { DiveSource, LocalImportedDive } from "./indexed-db";

const SOURCE_PRIORITY: Record<DiveSource, number> = {
  shearwater: 0,
  subsurface: 1,
  uddf: 2,
  fit: 3,
};

export function canonicalDiveId(dive: LocalImportedDive) {
  const sourceId = dive.sourceId.trim();
  const stablePart = sourceId || fallbackFingerprint(dive);
  return `dive:v1:${dive.source}:${encodeURIComponent(stablePart)}`;
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
  return [
    normalizeDate(dive.diveDate),
    normalizeSerial(dive.serialNumber),
    rounded(dive.maxDepthM ?? numberOrNull(dive.depth), 10),
    rounded(dive.durationSeconds, 1),
  ].join("|");
}

function normalizeDate(value: string | null) {
  if (!value) return "unknown-time";
  const timestamp = new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp)
    ? value.trim().toLowerCase()
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
