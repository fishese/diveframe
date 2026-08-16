import {
  gasMixLabel,
  type DiveDecompressionModel,
  type DiveMode,
  type DiveSalinity,
  type DiveSample,
  type DiveTank,
  type DiveTankUsage,
  type GasMix,
} from "./dive-model";
import { readShearwaterRawDiveNumber } from "./shearwater-raw-dive-number";

/**
 * Import-contract preview for BLE captures. Aligns with
 * {@link import("./indexed-db").LocalImportedDive}; use
 * {@link import("./ble-persist").previewToImportedDive} /
 * {@link import("./ble-persist").persistBleCaptureFromFixture} to write IndexedDB.
 */
export const BLE_NORMALIZER_CONTRACT_VERSION = "1.3";

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
  temperatureSurfaceC?: number;
  atmosphericBar?: number;
  diveMode: string;
  salinity?: {
    waterType: string;
    densityKgM3?: number;
  };
  decompressionModel?: {
    type: string;
    conservatism?: number;
    gfLow?: number;
    gfHigh?: number;
  };
  sampleCount: number;
  gasmixes: Array<{ o2Percent: number; hePercent: number }>;
  tanks: Array<{
    beginBar?: number;
    endBar?: number;
    beginPressureBar?: number;
    endPressureBar?: number;
    gasmixIndex: number;
    volumeL?: number;
    workPressureBar?: number;
    volumeType?: number;
    usage?: string;
  }>;
  profile: Array<{
    timeMs: number;
    depthM: number;
    temperatureC?: number;
    pressuresBar?: Array<number | null>;
  }>;
  /** Shearwater GNSS fix; only present with a satellite lock (log version 17+). */
  gpsEntryLat?: number;
  gpsEntryLng?: number;
  gpsExitLat?: number;
  gpsExitLng?: number;
};

export type BleRawDiveInput = {
  size: number;
  fingerprintHex: string;
  parsed?: BleParsedDiveInput;
  /** Original PNF bytes when available; used to recover the computer dive number. */
  rawBytes?: Uint8Array;
};

export type BleNormalizedDivePreview = {
  contractVersion: string;
  /** Source label matching {@code DiveSource}. */
  provisionalSource: "shearwater-ble";
  /**
   * Stable per-dive id for a given computer: fingerprint hex. Must not be
   * confused with Shearwater Cloud {@code DiveId}.
   */
  sourceId: string;
  /**
   * Canonical dive id: {@code dive:v1:shearwater-ble:<fingerprint>}.
   */
  proposedCanonicalId: string;
  diveDate: string | null;
  /** Computer log number from the PNF header; 0 is a valid factory-test dive. */
  diveNumber: number | null;
  durationSeconds: number | null;
  lengthText: string | null;
  maxDepthM: number | null;
  depth: string | null;
  averageDepth: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  waterTemperatureC: number | null;
  surfaceTemperatureC: number | null;
  atmosphericPressureBar: number | null;
  salinity: DiveSalinity | null;
  decompressionModel: DiveDecompressionModel | null;
  serialNumber: string | null;
  computerModel: string | null;
  category: "scuba" | "freediving" | "snorkelling";
  categorySource: "import";
  diveMode: DiveMode | null;
  gasMixes: GasMix[];
  tanks: DiveTank[];
  tankPressuresStartBar: Array<number | null>;
  tankPressuresEndBar: Array<number | null>;
  /** Native profile points, including tank-indexed pressure readings. */
  samples: DiveSample[];
  sampleCountReported: number;
  /**
   * Dive-computer GNSS fix when the computer recorded one. Shearwater only
   * stores this from log version 17 and only with a satellite lock, so most
   * dives legitimately have none.
   */
  gpsEntryLat: number | null;
  gpsEntryLng: number | null;
  gpsExitLat: number | null;
  gpsExitLng: number | null;
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
  const diveNumber =
    dive.rawBytes != null ? readShearwaterRawDiveNumber(dive.rawBytes) : null;
  const omissions: string[] = [
    "Shearwater Cloud DiveId",
    "site, location, buddy, notes",
  ];
  if (diveNumber == null) omissions.splice(1, 0, "dive number");

  if (!parsed || !parseOk) {
    return {
      contractVersion: BLE_NORMALIZER_CONTRACT_VERSION,
      provisionalSource: "shearwater-ble",
      sourceId: fingerprintHex || `raw:${dive.size}`,
      proposedCanonicalId: proposedId(fingerprintHex || `raw:${dive.size}`),
      diveDate: null,
      diveNumber,
      durationSeconds: null,
      lengthText: null,
      maxDepthM: null,
      depth: null,
      averageDepth: null,
      minTemp: null,
      maxTemp: null,
      waterTemperatureC: null,
      surfaceTemperatureC: null,
      atmosphericPressureBar: null,
      salinity: null,
      decompressionModel: null,
      serialNumber: serialHex || null,
      computerModel: device.product || null,
      category: "scuba",
      categorySource: "import",
      diveMode: null,
      gasMixes: [],
      tanks: [],
      tankPressuresStartBar: [],
      tankPressuresEndBar: [],
      samples: [],
      sampleCountReported: 0,
      gpsEntryLat: null,
      gpsEntryLng: null,
      gpsExitLat: null,
      gpsExitLng: null,
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
  const sampleTemperatures = parsed.profile
    .map((point) => point.temperatureC)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const minTemp =
    parsed.temperatureMinC != null && !Number.isNaN(parsed.temperatureMinC)
      ? parsed.temperatureMinC
      : sampleTemperatures.length
        ? Math.min(...sampleTemperatures)
        : null;
  const maxTemp =
    parsed.temperatureMaxC != null && !Number.isNaN(parsed.temperatureMaxC)
      ? parsed.temperatureMaxC
      : sampleTemperatures.length
        ? Math.max(...sampleTemperatures)
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
  const sampledTankCount = parsed.profile.reduce(
    (count, point) => Math.max(count, point.pressuresBar?.length ?? 0),
    0,
  );
  const tankCount = Math.max(parsed.tanks.length, sampledTankCount);
  const tanks: DiveTank[] = Array.from({ length: tankCount }, (_, index) => {
    const tank = parsed.tanks[index];
    const begin = positiveFiniteOrNull(
      tank?.beginBar ?? tank?.beginPressureBar,
    );
    const end = positiveFiniteOrNull(tank?.endBar ?? tank?.endPressureBar);
    tankPressuresStartBar.push(begin);
    tankPressuresEndBar.push(end);
    return {
      index,
      gasMixIndex:
        tank != null &&
        Number.isInteger(tank.gasmixIndex) &&
        tank.gasmixIndex >= 0
          ? tank.gasmixIndex
          : null,
      volumeL: positiveFiniteOrNull(tank?.volumeL),
      workPressureBar: positiveFiniteOrNull(tank?.workPressureBar),
      startPressureBar: begin,
      endPressureBar: end,
      usage: tankUsage(tank?.usage),
    };
  });

  const samples: DiveSample[] = parsed.profile.map((point) => ({
    elapsedSeconds: Math.round(point.timeMs / 1000),
    depthM: point.depthM,
    ...(point.temperatureC != null && Number.isFinite(point.temperatureC)
      ? { temperatureC: point.temperatureC }
      : {}),
    pressuresBar: (point.pressuresBar ?? []).map((pressure) =>
      pressure != null && Number.isFinite(pressure)
        ? pressure
        : Number.NaN,
    ),
  }));

  const surfaceTemperatureC = finiteOrNull(parsed.temperatureSurfaceC);
  const atmosphericPressureBar = positiveFiniteOrNull(parsed.atmosphericBar);
  const salinity = normalizeSalinity(parsed.salinity);
  const decompressionModel = normalizeDecompressionModel(
    parsed.decompressionModel,
  );
  const diveMode = normalizeDiveMode(parsed.diveMode);

  if (parsed.sampleCount > samples.length) {
    omissions.push(
      `profile capture limited to ${samples.length} of ${parsed.sampleCount} time samples; full raw bytes retained`,
    );
  }

  const entryFix = coordinatePair(parsed.gpsEntryLat, parsed.gpsEntryLng);
  const exitFix = coordinatePair(parsed.gpsExitLat, parsed.gpsExitLng);
  if (!entryFix) omissions.push("computer GPS (no satellite fix recorded)");

  return {
    contractVersion: BLE_NORMALIZER_CONTRACT_VERSION,
    provisionalSource: "shearwater-ble",
    sourceId: fingerprintHex,
    proposedCanonicalId: proposedId(fingerprintHex),
    diveDate: parsed.datetime || null,
    diveNumber,
    durationSeconds,
    lengthText: durationSeconds != null ? String(durationSeconds) : null,
    maxDepthM,
    depth: maxDepthM != null ? String(maxDepthM) : null,
    averageDepth,
    minTemp,
    maxTemp,
    waterTemperatureC: minTemp ?? maxTemp,
    surfaceTemperatureC,
    atmosphericPressureBar,
    salinity,
    decompressionModel,
    serialNumber: serialHex || null,
    computerModel: device.product || null,
    category: categoryFromDiveMode(parsed.diveMode),
    categorySource: "import",
    diveMode,
    gasMixes,
    tanks,
    tankPressuresStartBar,
    tankPressuresEndBar,
    samples,
    sampleCountReported: parsed.sampleCount,
    gpsEntryLat: entryFix?.latitude ?? null,
    gpsEntryLng: entryFix?.longitude ?? null,
    gpsExitLat: exitFix?.latitude ?? null,
    gpsExitLng: exitFix?.longitude ?? null,
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

function coordinatePair(latitude?: number, longitude?: number) {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

function finiteOrNull(value: number | undefined) {
  return value != null && Number.isFinite(value) ? value : null;
}

function positiveFiniteOrNull(value: number | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeDiveMode(value: string): DiveMode | null {
  const mode = value.toLowerCase();
  if (
    mode === "freedive" ||
    mode === "gauge" ||
    mode === "oc" ||
    mode === "ccr" ||
    mode === "scr" ||
    mode === "unknown"
  ) {
    return mode;
  }
  return null;
}

function tankUsage(value?: string): DiveTankUsage {
  if (
    value === "none" ||
    value === "oxygen" ||
    value === "diluent" ||
    value === "sidemount"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeSalinity(
  value: BleParsedDiveInput["salinity"],
): DiveSalinity | null {
  if (!value) return null;
  const waterType =
    value.waterType === "fresh" || value.waterType === "salt"
      ? value.waterType
      : "unknown";
  return {
    waterType,
    densityKgM3: positiveFiniteOrNull(value.densityKgM3),
  };
}

function normalizeDecompressionModel(
  value: BleParsedDiveInput["decompressionModel"],
): DiveDecompressionModel | null {
  if (!value) return null;
  const knownTypes: DiveDecompressionModel["type"][] = [
    "none",
    "buhlmann",
    "vpm",
    "rgbm",
    "dciem",
    "unknown",
  ];
  const type = knownTypes.includes(value.type as DiveDecompressionModel["type"])
    ? (value.type as DiveDecompressionModel["type"])
    : "unknown";
  return {
    type,
    conservatism: finiteOrNull(value.conservatism),
    gfLow: finiteOrNull(value.gfLow),
    gfHigh: finiteOrNull(value.gfHigh),
  };
}

function categoryFromDiveMode(
  diveMode: string,
): "scuba" | "freediving" | "snorkelling" {
  const mode = diveMode.toLowerCase();
  if (mode === "freedive") return "freediving";
  return "scuba";
}
