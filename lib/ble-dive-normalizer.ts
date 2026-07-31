import { gasMixLabel, type DiveSample, type GasMix } from "./dive-model";

/**
 * Import-contract preview for BLE captures. Structurally aligned with
 * {@link import("./indexed-db").LocalImportedDive} but intentionally not typed
 * as that until persistence and DiveSource identity are unblocked — callers
 * must not pass these objects to {@code upsertLocalDives}.
 */
export const BLE_NORMALIZER_CONTRACT_VERSION = "0.1-spike";

export type BleDeviceContext = {
  vendor: string;
  product: string;
  serial: number;
  serialHex?: string;
  firmware: number;
  model: number;
};

export type BleParsedDiveInput = {
  parseStatus: number;
  parseMessage: string;
  datetime: string;
  diveTimeSeconds: number;
  maxDepthM?: number;
  avgDepthM?: number;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  atmosphericBar?: number;
  diveMode: string;
  sampleCount: number;
  gasmixes: Array<{ o2Percent: number; hePercent: number }>;
  tanks: Array<{
    beginBar?: number;
    endBar?: number;
    beginPressureBar?: number;
    endPressureBar?: number;
    gasmixIndex: number;
  }>;
  profile: Array<{ timeMs: number; depthM: number }>;
};

export type BleRawDiveInput = {
  size: number;
  fingerprintHex: string;
  parsed?: BleParsedDiveInput;
};

export type BleNormalizedDivePreview = {
  contractVersion: string;
  /** Provisional source label; not yet a {@code DiveSource} enum value. */
  provisionalSource: "shearwater-ble";
  /**
   * Stable per-dive id for a given computer: fingerprint hex. Must not be
   * confused with Shearwater Cloud {@code DiveId}.
   */
  sourceId: string;
  /**
   * Preview of {@code canonicalDiveId} once {@code shearwater-ble} is a real
   * {@code DiveSource}: {@code dive:v1:shearwater-ble:<fingerprint>}.
   */
  proposedCanonicalId: string;
  diveDate: string | null;
  durationSeconds: number | null;
  lengthText: string | null;
  maxDepthM: number | null;
  depth: string | null;
  averageDepth: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  waterTemperatureC: number | null;
  serialNumber: string | null;
  computerModel: string | null;
  category: "scuba" | "freediving" | "snorkelling";
  categorySource: "import";
  diveMode: string | null;
  gasMixes: GasMix[];
  tankPressuresStartBar: Array<number | null>;
  tankPressuresEndBar: Array<number | null>;
  /**
   * Downsampled profile from the native spike only. Full-resolution samples
   * remain in the raw payload until persistence lands.
   */
  samples: DiveSample[];
  sampleCountReported: number;
  rawSize: number;
  fingerprintHex: string;
  device: {
    vendor: string;
    product: string;
    model: number;
    firmware: number;
    serialHex: string;
  };
  /** Fields present on computer/raw that this preview deliberately omits. */
  omissions: string[];
  parseOk: boolean;
};

export function normalizeBleDivePreview(
  device: BleDeviceContext,
  dive: BleRawDiveInput,
): BleNormalizedDivePreview {
  const fingerprintHex = (dive.fingerprintHex || "").trim().toUpperCase();
  const serialHex =
    (device.serialHex || unsignedSerialHex(device.serial)).toUpperCase();
  const parsed = dive.parsed;
  const parseOk = Boolean(parsed && parsed.parseStatus === 0);
  const omissions: string[] = [
    "full-resolution profile samples (raw bytes only until persistence)",
    "Shearwater Cloud DiveId / dive number",
    "site, location, buddy, notes, GPS from computer when absent in parser",
    "not written to IndexedDB",
  ];

  if (!parsed || !parseOk) {
    return {
      contractVersion: BLE_NORMALIZER_CONTRACT_VERSION,
      provisionalSource: "shearwater-ble",
      sourceId: fingerprintHex || `raw:${dive.size}`,
      proposedCanonicalId: proposedId(fingerprintHex || `raw:${dive.size}`),
      diveDate: null,
      durationSeconds: null,
      lengthText: null,
      maxDepthM: null,
      depth: null,
      averageDepth: null,
      minTemp: null,
      maxTemp: null,
      waterTemperatureC: null,
      serialNumber: serialHex || null,
      computerModel: device.product || null,
      category: "scuba",
      categorySource: "import",
      diveMode: null,
      gasMixes: [],
      tankPressuresStartBar: [],
      tankPressuresEndBar: [],
      samples: [],
      sampleCountReported: 0,
      rawSize: dive.size,
      fingerprintHex,
      device: {
        vendor: device.vendor,
        product: device.product,
        model: device.model,
        firmware: device.firmware,
        serialHex,
      },
      omissions: [
        ...omissions,
        parsed
          ? `parser status ${parsed.parseStatus}: ${parsed.parseMessage}`
          : "missing parsed block",
      ],
      parseOk: false,
    };
  }

  const durationSeconds =
    parsed.diveTimeSeconds > 0 ? parsed.diveTimeSeconds : null;
  const maxDepthM =
    parsed.maxDepthM != null && !Number.isNaN(parsed.maxDepthM)
      ? parsed.maxDepthM
      : null;
  const averageDepth =
    parsed.avgDepthM != null && !Number.isNaN(parsed.avgDepthM)
      ? parsed.avgDepthM
      : null;
  const minTemp =
    parsed.temperatureMinC != null && !Number.isNaN(parsed.temperatureMinC)
      ? parsed.temperatureMinC
      : null;
  const maxTemp =
    parsed.temperatureMaxC != null && !Number.isNaN(parsed.temperatureMaxC)
      ? parsed.temperatureMaxC
      : null;

  if (averageDepth == null) omissions.push("average depth (unsupported by parser)");
  if (minTemp == null && maxTemp == null) {
    omissions.push("temperature extrema (unsupported by parser for this dive)");
  }

  const gasMixes: GasMix[] = parsed.gasmixes.map((gas) => {
    const oxygenPercent = Number.isFinite(gas.o2Percent) ? gas.o2Percent : null;
    const heliumPercent = Number.isFinite(gas.hePercent) ? gas.hePercent : null;
    return {
      oxygenPercent,
      heliumPercent,
      label: gasMixLabel(oxygenPercent, heliumPercent),
    };
  });

  const tankPressuresStartBar: Array<number | null> = [];
  const tankPressuresEndBar: Array<number | null> = [];
  for (const tank of parsed.tanks) {
    const begin = tank.beginBar ?? tank.beginPressureBar ?? null;
    const end = tank.endBar ?? tank.endPressureBar ?? null;
    tankPressuresStartBar.push(begin);
    tankPressuresEndBar.push(end);
  }

  const samples: DiveSample[] = parsed.profile.map((point) => ({
    elapsedSeconds: Math.round(point.timeMs / 1000),
    depthM: point.depthM,
    pressuresBar: [],
  }));

  if (parsed.sampleCount > samples.length) {
    omissions.push(
      `profile downsampled for UI (${samples.length} of ${parsed.sampleCount} time samples)`,
    );
  }

  return {
    contractVersion: BLE_NORMALIZER_CONTRACT_VERSION,
    provisionalSource: "shearwater-ble",
    sourceId: fingerprintHex,
    proposedCanonicalId: proposedId(fingerprintHex),
    diveDate: parsed.datetime || null,
    durationSeconds,
    lengthText: durationSeconds != null ? String(durationSeconds) : null,
    maxDepthM,
    depth: maxDepthM != null ? String(maxDepthM) : null,
    averageDepth,
    minTemp,
    maxTemp,
    waterTemperatureC: minTemp ?? maxTemp,
    serialNumber: serialHex || null,
    computerModel: device.product || null,
    category: categoryFromDiveMode(parsed.diveMode),
    categorySource: "import",
    diveMode: parsed.diveMode || null,
    gasMixes,
    tankPressuresStartBar,
    tankPressuresEndBar,
    samples,
    sampleCountReported: parsed.sampleCount,
    rawSize: dive.size,
    fingerprintHex,
    device: {
      vendor: device.vendor,
      product: device.product,
      model: device.model,
      firmware: device.firmware,
      serialHex,
    },
    omissions,
    parseOk: true,
  };
}

export function normalizeBleDownloadPreview(
  device: BleDeviceContext,
  dives: BleRawDiveInput[],
) {
  return dives.map((dive) => normalizeBleDivePreview(device, dive));
}

function proposedId(sourceId: string) {
  return `dive:v1:shearwater-ble:${encodeURIComponent(sourceId)}`;
}

function unsignedSerialHex(serial: number) {
  return (serial >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function categoryFromDiveMode(
  diveMode: string,
): "scuba" | "freediving" | "snorkelling" {
  const mode = diveMode.toLowerCase();
  if (mode === "freedive") return "freediving";
  return "scuba";
}
