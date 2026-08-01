import type { BleCaptureFixture } from "./ble-capture-fixture";
import type { BleNormalizedDivePreview } from "./ble-dive-normalizer";
import {
  BLE_NORMALIZER_CONTRACT_VERSION,
  normalizeBleDownloadPreview,
} from "./ble-dive-normalizer";
import type { DiveComputerDownloadResult } from "./dive-computer-capability";
import type {
  LocalDeviceCheckpoint,
  LocalImportedDive,
  LocalRawDiveRecord,
} from "./indexed-db";

const RAW_SOURCE_KIND = "shearwater-ble";
const RAW_FORMAT = "libdivecomputer-shearwater";

export function deviceCheckpointId(descriptor: string, serialHex: string) {
  return `${descriptor}\u0000${serialHex.toUpperCase()}`;
}

export function rawDiveRecordId(fingerprintHex: string) {
  return `raw:shearwater-ble:${fingerprintHex.trim().toUpperCase()}`;
}

/**
 * Maps a BLE normalizer preview into {@link LocalImportedDive}. Profile samples
 * are the downsampled preview set only; full-resolution samples remain in
 * {@link LocalRawDiveRecord.rawBytes} until a later reparse path exists.
 */
export function previewToImportedDive(
  preview: BleNormalizedDivePreview,
): LocalImportedDive {
  return {
    id: preview.proposedCanonicalId,
    source: "shearwater-ble",
    sourceId: preview.sourceId,
    diveNumber: null,
    diveDate: preview.diveDate,
    lastModified: null,
    depth: preview.depth,
    averageDepth: preview.averageDepth,
    minTemp: preview.minTemp,
    maxTemp: preview.maxTemp,
    lengthText: preview.lengthText,
    durationSeconds: preview.durationSeconds,
    location: null,
    site: null,
    buddy: null,
    notes: null,
    serialNumber: preview.serialNumber,
    gpsEntryLat: preview.gpsEntryLat,
    gpsEntryLng: preview.gpsEntryLng,
    gpsExitLat: preview.gpsExitLat,
    gpsExitLng: preview.gpsExitLng,
    calculatedJson: null,
    category: preview.category,
    categorySource: preview.categorySource,
    maxDepthM: preview.maxDepthM,
    waterTemperatureC: preview.waterTemperatureC,
    gasMixes: preview.gasMixes,
    computerModel: preview.computerModel,
    samples: preview.samples,
    tankPressuresStartBar: preview.tankPressuresStartBar,
    tankPressuresEndBar: preview.tankPressuresEndBar,
    cylinderPresetId: null,
    cylinderVolumeL: null,
  };
}

export function buildRawDiveRecord(options: {
  fingerprintHex: string;
  diveId: string;
  deviceDescriptor: string;
  deviceSerial: string;
  libdivecomputerVersion: string;
  libdivecomputerCommit?: string;
  capturedAt: string;
  rawBytes: Blob;
  checksum: string;
}): LocalRawDiveRecord {
  const fingerprintHex = options.fingerprintHex.trim().toUpperCase();
  return {
    id: rawDiveRecordId(fingerprintHex),
    diveId: options.diveId,
    sourceKind: RAW_SOURCE_KIND,
    rawFormat: RAW_FORMAT,
    deviceDescriptor: options.deviceDescriptor,
    deviceSerial: options.deviceSerial.toUpperCase(),
    libdivecomputerVersion: options.libdivecomputerVersion,
    libdivecomputerCommit: options.libdivecomputerCommit,
    parserContractVersion: BLE_NORMALIZER_CONTRACT_VERSION,
    capturedAt: options.capturedAt,
    fingerprintHex,
    length: options.rawBytes.size,
    checksum: options.checksum,
    rawBytes: options.rawBytes,
  };
}

export function buildDeviceCheckpoint(options: {
  descriptor: string;
  serialHex: string;
  newestFingerprintHex: string;
  downloaded: number;
  matched?: number;
}): LocalDeviceCheckpoint {
  const serialHex = options.serialHex.toUpperCase();
  const fingerprintHex = options.newestFingerprintHex.trim().toUpperCase();
  return {
    id: deviceCheckpointId(options.descriptor, serialHex),
    fingerprint: hexToBlob(fingerprintHex),
    fingerprintHex,
    lastSyncedAt: new Date().toISOString(),
    lastOutcomeCounts: {
      downloaded: options.downloaded,
      matched: options.matched,
    },
  };
}

export function bleCaptureImportPairs(fixture: BleCaptureFixture) {
  const { download, normalizedPreview } = fixture;
  const deviceDescriptor = download.product || "shearwater";
  const deviceSerial = (download.serialHex ?? "").toUpperCase();
  const libdivecomputerVersion = fixture.apiVersion ?? "unknown";
  const pairs: Array<{
    preview: BleNormalizedDivePreview;
    rawBytes: Blob;
    fingerprintHex: string;
  }> = [];

  download.dives.forEach((dive, index) => {
    const preview = normalizedPreview[index];
    if (!preview?.parseOk || typeof dive.dataBase64 !== "string") return;
    pairs.push({
      preview,
      rawBytes: base64ToBlob(dive.dataBase64),
      fingerprintHex: dive.fingerprintHex,
    });
  });

  return {
    pairs,
    deviceDescriptor,
    deviceSerial,
    libdivecomputerVersion,
    libdivecomputerCommit: fixture.libdivecomputerCommit,
    capturedAt: fixture.capturedAt,
    newestFingerprintHex: download.newestFingerprintHex,
  };
}

async function persistPayloadFromPairs(options: {
  pairs: Array<{
    preview: BleNormalizedDivePreview;
    rawBytes: Blob;
    fingerprintHex: string;
  }>;
  deviceDescriptor: string;
  deviceSerial: string;
  libdivecomputerVersion: string;
  libdivecomputerCommit?: string;
  capturedAt: string;
  newestFingerprintHex?: string;
  matched?: number;
}) {
  const dives: LocalImportedDive[] = [];
  const rawRecords: LocalRawDiveRecord[] = [];

  for (const pair of options.pairs) {
    const dive = previewToImportedDive(pair.preview);
    const checksum = await sha256Blob(pair.rawBytes);
    dives.push(dive);
    rawRecords.push(
      buildRawDiveRecord({
        fingerprintHex: pair.fingerprintHex,
        diveId: dive.id,
        deviceDescriptor: options.deviceDescriptor,
        deviceSerial: options.deviceSerial,
        libdivecomputerVersion: options.libdivecomputerVersion,
        libdivecomputerCommit: options.libdivecomputerCommit,
        capturedAt: options.capturedAt,
        rawBytes: pair.rawBytes,
        checksum,
      }),
    );
  }

  const newestFingerprintHex =
    options.newestFingerprintHex ||
    options.pairs[0]?.fingerprintHex ||
    "";
  const checkpoint =
    newestFingerprintHex && options.deviceSerial
      ? buildDeviceCheckpoint({
          descriptor: options.deviceDescriptor,
          serialHex: options.deviceSerial,
          newestFingerprintHex,
          downloaded: dives.length,
          matched: options.matched,
        })
      : null;

  return { dives, rawRecords, checkpoint, failedParseCount: 0 };
}

/** Build import payload from a capture fixture (tests / offline tooling). */
export async function prepareBlePersistFromFixture(fixture: BleCaptureFixture) {
  const prepared = bleCaptureImportPairs(fixture);
  return persistPayloadFromPairs(prepared);
}

/** Build import payload from a live native download result. */
export async function prepareBlePersistFromDownload(
  download: DiveComputerDownloadResult,
  options?: {
    libdivecomputerVersion?: string;
    libdivecomputerCommit?: string;
    capturedAt?: string;
  },
) {
  const device = {
    vendor: download.vendor,
    product: download.product,
    serial: download.serial,
    serialHex: download.serialHex,
    firmware: download.firmware,
    model: download.model,
  };
  const previews = normalizeBleDownloadPreview(
    device,
    download.dives.map((dive) => ({
      size: dive.size,
      fingerprintHex: dive.fingerprintHex,
      parsed: dive.parsed,
    })),
  );
  const pairs: Array<{
    preview: BleNormalizedDivePreview;
    rawBytes: Blob;
    fingerprintHex: string;
  }> = [];
  let failedParseCount = 0;

  download.dives.forEach((dive, index) => {
    const preview = previews[index];
    if (!preview?.parseOk || typeof dive.dataBase64 !== "string") {
      failedParseCount += 1;
      return;
    }
    pairs.push({
      preview,
      rawBytes: base64ToBlob(dive.dataBase64),
      fingerprintHex: dive.fingerprintHex,
    });
  });

  const payload = await persistPayloadFromPairs({
    pairs,
    deviceDescriptor: download.product || "shearwater",
    deviceSerial: (download.serialHex ?? "").toUpperCase(),
    libdivecomputerVersion: options?.libdivecomputerVersion ?? "unknown",
    libdivecomputerCommit: options?.libdivecomputerCommit,
    capturedAt: options?.capturedAt ?? new Date().toISOString(),
    newestFingerprintHex: download.newestFingerprintHex,
  });

  return { ...payload, failedParseCount };
}

/** One streamed dive from a rich `diveCaptured` event (no checkpoint). */
export async function prepareBlePersistFromCapturedDive(options: {
  product: string;
  serialHex: string;
  fingerprintHex: string;
  dataBase64: string;
  parsed?: DiveComputerDownloadResult["dives"][number]["parsed"];
  serial?: number;
  libdivecomputerVersion?: string;
  libdivecomputerCommit?: string;
  capturedAt?: string;
}) {
  const serialHex = options.serialHex.trim().toUpperCase();
  const device = {
    vendor: "Shearwater",
    product: options.product || "shearwater",
    serial: options.serial ?? (Number.parseInt(serialHex, 16) || 0),
    serialHex,
    firmware: 0,
    model: 0,
  };
  const preview = normalizeBleDownloadPreview(device, [
    {
      size: Math.floor((options.dataBase64.length * 3) / 4),
      fingerprintHex: options.fingerprintHex,
      parsed: options.parsed,
    },
  ])[0];

  if (!preview?.parseOk) {
    return {
      dives: [] as LocalImportedDive[],
      rawRecords: [] as LocalRawDiveRecord[],
      checkpoint: null,
      failedParseCount: 1,
      diveDate: null as string | null,
    };
  }

  const payload = await persistPayloadFromPairs({
    pairs: [
      {
        preview,
        rawBytes: base64ToBlob(options.dataBase64),
        fingerprintHex: options.fingerprintHex,
      },
    ],
    deviceDescriptor: device.product,
    deviceSerial: serialHex,
    libdivecomputerVersion: options.libdivecomputerVersion ?? "unknown",
    libdivecomputerCommit: options.libdivecomputerCommit,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
  });

  return {
    dives: payload.dives,
    rawRecords: payload.rawRecords,
    checkpoint: null,
    failedParseCount: 0,
    diveDate: preview.diveDate,
  };
}

export async function persistBleCaptureFromFixture(fixture: BleCaptureFixture) {
  const { persistBleImport } = await import("./indexed-db");
  const payload = await prepareBlePersistFromFixture(fixture);
  return persistBleImport(payload);
}

export async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function base64ToBlob(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "application/octet-stream" });
}

function hexToBlob(hex: string) {
  const normalized = hex.replace(/[^0-9a-f]/gi, "");
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return new Blob([bytes], { type: "application/octet-stream" });
}
