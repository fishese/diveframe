import type { BleNormalizedDivePreview } from "./ble-dive-normalizer";

/**
 * Conservative offline match between a BLE-normalized dive and a Shearwater
 * Cloud import row. Fingerprints are BLE-only; Cloud uses DiveId, so we match
 * on serial + local datetime + duration + max depth until a stronger link is
 * proven on paired captures.
 */
export type CloudDiveIdentityRow = {
  diveId: string;
  diveNumber: number | null;
  diveDate: string | null;
  serialNumber: string | null;
  durationSeconds: number | null;
  maxDepthM: number | null;
};

export type BleCloudIdentityMatch = {
  bleSourceId: string;
  cloudDiveId: string | null;
  cloudDiveNumber: number | null;
  confidence: "high" | "medium" | "none";
  reasons: string[];
};

export type BleCloudIdentityReport = {
  bleCount: number;
  cloudCount: number;
  matches: BleCloudIdentityMatch[];
  unmatchedBle: string[];
  unmatchedCloud: string[];
};

const TIME_SKEW_MS = 120_000;
const DURATION_SKEW_SECONDS = 5;
const DEPTH_SKEW_M = 0.3;

export function matchBleToCloudDives(
  bleDives: BleNormalizedDivePreview[],
  cloudDives: CloudDiveIdentityRow[],
): BleCloudIdentityReport {
  const usedCloud = new Set<string>();
  const matches: BleCloudIdentityMatch[] = [];
  const unmatchedBle: string[] = [];

  for (const ble of bleDives) {
    if (!ble.parseOk) {
      unmatchedBle.push(ble.sourceId);
      matches.push({
        bleSourceId: ble.sourceId,
        cloudDiveId: null,
        cloudDiveNumber: null,
        confidence: "none",
        reasons: ["BLE parse was not successful"],
      });
      continue;
    }

    const candidates = cloudDives
      .filter((cloud) => !usedCloud.has(cloud.diveId))
      .map((cloud) => scorePair(ble, cloud))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best || best.confidence === "none") {
      unmatchedBle.push(ble.sourceId);
      matches.push({
        bleSourceId: ble.sourceId,
        cloudDiveId: null,
        cloudDiveNumber: null,
        confidence: "none",
        reasons: best?.reasons ?? ["no Cloud dive within serial/time/depth/duration windows"],
      });
      continue;
    }

    usedCloud.add(best.cloud.diveId);
    matches.push({
      bleSourceId: ble.sourceId,
      cloudDiveId: best.cloud.diveId,
      cloudDiveNumber: best.cloud.diveNumber,
      confidence: best.confidence,
      reasons: best.reasons,
    });
  }

  const unmatchedCloud = cloudDives
    .filter((cloud) => !usedCloud.has(cloud.diveId))
    .map((cloud) => cloud.diveId);

  return {
    bleCount: bleDives.length,
    cloudCount: cloudDives.length,
    matches,
    unmatchedBle,
    unmatchedCloud,
  };
}

function scorePair(ble: BleNormalizedDivePreview, cloud: CloudDiveIdentityRow) {
  const reasons: string[] = [];
  let score = 0;

  const bleSerial = normalizeSerial(ble.serialNumber);
  const cloudSerial = normalizeSerial(cloud.serialNumber);
  if (bleSerial && cloudSerial && bleSerial === cloudSerial) {
    score += 4;
    reasons.push("serial match");
  } else if (bleSerial && cloudSerial) {
    return { cloud, score: 0, confidence: "none" as const, reasons: ["serial mismatch"] };
  }

  const bleTime = parseLocalTime(ble.diveDate);
  const cloudTime = parseLocalTime(cloud.diveDate);
  if (bleTime != null && cloudTime != null) {
    const delta = Math.abs(bleTime - cloudTime);
    if (delta <= TIME_SKEW_MS) {
      score += 4;
      reasons.push(`datetime within ${Math.round(delta / 1000)}s`);
    } else {
      return {
        cloud,
        score: 0,
        confidence: "none" as const,
        reasons: [`datetime skew ${Math.round(delta / 1000)}s`],
      };
    }
  }

  if (
    ble.durationSeconds != null &&
    cloud.durationSeconds != null &&
    Math.abs(ble.durationSeconds - cloud.durationSeconds) <= DURATION_SKEW_SECONDS
  ) {
    score += 2;
    reasons.push("duration match");
  }

  if (
    ble.maxDepthM != null &&
    cloud.maxDepthM != null &&
    Math.abs(ble.maxDepthM - cloud.maxDepthM) <= DEPTH_SKEW_M
  ) {
    score += 2;
    reasons.push("max depth match");
  }

  const confidence =
    score >= 10 ? "high" : score >= 6 ? "medium" : score > 0 ? "medium" : "none";

  return { cloud, score, confidence: confidence as "high" | "medium" | "none", reasons };
}

function normalizeSerial(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim().toUpperCase();
  // Decimal digit strings must be converted before the hex check — digits are
  // a subset of hex and Cloud often stores serials as decimal integers.
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed).toString(16).toUpperCase();
  }
  if (/^[0-9A-F]+$/.test(trimmed)) {
    return trimmed.replace(/^0+/, "") || "0";
  }
  return trimmed;
}

function parseLocalTime(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace(" ", "T");
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : timestamp;
}
