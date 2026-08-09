import {
  buildDeviceCheckpoint,
  deviceCheckpointId,
  prepareBlePersistFromCapturedDive,
  prepareBlePersistFromDownload,
} from "./ble-persist";
import {
  diveComputerCapability,
  type DiveComputerDiveCapturedEvent,
  type DiveComputerDownloadResult,
} from "./dive-computer-capability";
import {
  clearLocalDeviceCheckpoint,
  getLocalDeviceCheckpoint,
  persistBleImport,
} from "./indexed-db";

export type BleSyncIntent = "history" | "incremental";

export type BleHistoryQuantity =
  | { kind: "last-n"; n: number }
  | { kind: "last-200" }
  | { kind: "full" };

export type BleImportSessionOptions = {
  intent: BleSyncIntent;
  quantity?: BleHistoryQuantity;
  /** Product name used as checkpoint descriptor (from download/connect). */
  deviceDescriptorHint?: string;
  serialHexHint?: string;
  libdivecomputerVersion?: string;
  libdivecomputerCommit?: string;
};

export type BleImportSessionResult = {
  cancelled: boolean;
  received: number;
  persisted: number;
  newCount: number;
  alreadyPresentCount: number;
  failedParseCount: number;
  checkpointAdvanced: boolean;
  download: DiveComputerDownloadResult | null;
  /** Human-facing date span of newly saved dives (not an identity key). */
  newDiveDateEarliest: string | null;
  newDiveDateLatest: string | null;
  product: string;
  serialHex: string;
};

export const BLE_LAST_N_DEFAULT = 15;
export const BLE_LAST_N_MIN = 1;
export const BLE_LAST_N_MAX = 200;

/** Map UI quantity to native download limit (`0` = unlimited). */
export function nativeLimitForQuantity(quantity: BleHistoryQuantity): number {
  if (quantity.kind === "full") return 0;
  if (quantity.kind === "last-200") return 200;
  const n = Math.round(quantity.n);
  return Math.max(BLE_LAST_N_MIN, Math.min(BLE_LAST_N_MAX, n));
}

export function checkpointIdForDevice(
  deviceDescriptor: string,
  serialHex: string,
) {
  return deviceCheckpointId(deviceDescriptor, serialHex);
}

/** Human-facing date span for newly saved dives (not an identity key). */
export function summarizeNewDiveDates(dates: Array<string | null | undefined>) {
  const valid = dates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .sort();
  if (valid.length === 0) {
    return { earliest: null, latest: null };
  }
  return {
    earliest: valid[0] ?? null,
    latest: valid[valid.length - 1] ?? null,
  };
}

/** Format dive-computer local timestamps for summary UI (no timezone shift). */
export function formatBleDiveStamp(value: string) {
  const match = value
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return value.trim();
  return `${match[1]} ${match[2]}:${match[3]}`;
}

export async function loadCheckpointForDevice(
  deviceDescriptor: string,
  serialHex: string,
) {
  return getLocalDeviceCheckpoint(
    checkpointIdForDevice(deviceDescriptor, serialHex),
  );
}

export async function resetCheckpointForDevice(
  deviceDescriptor: string,
  serialHex: string,
) {
  await clearLocalDeviceCheckpoint(
    checkpointIdForDevice(deviceDescriptor, serialHex),
  );
}

/**
 * Download from the connected computer and persist into IndexedDB.
 * Each streamed dive is saved as it arrives; the sync checkpoint advances
 * only when the transfer finishes successfully (not cancelled).
 */
export async function runBleImportSession(
  options: BleImportSessionOptions,
): Promise<BleImportSessionResult> {
  if (!diveComputerCapability.isAvailable()) {
    throw new Error(
      "Dive-computer Bluetooth is available only in the Android app.",
    );
  }

  let fingerprintHex: string | undefined;
  let limit = nativeLimitForQuantity(
    options.quantity ?? { kind: "last-n", n: BLE_LAST_N_DEFAULT },
  );

  if (options.intent === "incremental") {
    const descriptor = options.deviceDescriptorHint?.trim();
    const serialHex = options.serialHexHint?.trim().toUpperCase();
    if (!descriptor || !serialHex) {
      throw new Error(
        "New-since-last-sync needs a known device serial and product name.",
      );
    }
    const checkpoint = await loadCheckpointForDevice(descriptor, serialHex);
    if (!checkpoint?.fingerprintHex) {
      throw new Error(
        "No sync checkpoint for this computer yet. Download history first.",
      );
    }
    fingerprintHex = checkpoint.fingerprintHex;
    // Wide enough that fingerprint stopping is what bounds the transfer.
    limit = 0;
  }

  let newCount = 0;
  let alreadyPresentCount = 0;
  let failedParseCount = 0;
  let streamedPersistCount = 0;
  const newDiveDates: string[] = [];
  let product =
    options.deviceDescriptorHint?.trim() ||
    "";
  let serialHex = options.serialHexHint?.trim().toUpperCase() || "";
  let newestFingerprintHex = "";

  let persistChain: Promise<void> = Promise.resolve();

  const captureListener = await diveComputerCapability.addListener(
    "diveCaptured",
    (event: DiveComputerDiveCapturedEvent) => {
      if (!event.dataBase64) return;
      persistChain = persistChain.then(async () => {
        if (event.product?.trim()) product = event.product.trim();
        if (event.serialHex?.trim()) {
          serialHex = event.serialHex.trim().toUpperCase();
        }
        if (!newestFingerprintHex && event.fingerprintHex) {
          newestFingerprintHex = event.fingerprintHex.trim().toUpperCase();
        }
        let payload;
        try {
          payload = await prepareBlePersistFromCapturedDive({
            product: product || "shearwater",
            serialHex:
              serialHex ||
              event.serialHex?.trim().toUpperCase() ||
              "",
            fingerprintHex: event.fingerprintHex,
            dataBase64: event.dataBase64!,
            parsed: event.parsed,
            serial: event.serial,
            libdivecomputerVersion: options.libdivecomputerVersion,
            libdivecomputerCommit: options.libdivecomputerCommit,
          });
        } catch {
          failedParseCount += 1;
          return;
        }
        failedParseCount += payload.failedParseCount;
        if (payload.dives.length === 0) return;
        // Storage errors must reject the session. Swallowing one here could
        // advance the checkpoint past a dive that was never saved.
        const persisted = await persistBleImport({
          dives: payload.dives,
          rawRecords: payload.rawRecords,
          checkpoint: null,
        });
        streamedPersistCount += 1;
        newCount += persisted.newCount;
        alreadyPresentCount += persisted.alreadyPresentCount;
        if (persisted.newCount > 0 && payload.diveDate) {
          newDiveDates.push(payload.diveDate);
        }
      });
    },
  );

  let download: DiveComputerDownloadResult;
  try {
    download = await diveComputerCapability.downloadDives({
      limit,
      fingerprintHex,
    });
    await persistChain;
  } finally {
    await captureListener.remove().catch(() => undefined);
  }

  if (download.product?.trim()) product = download.product.trim();
  if (download.serialHex?.trim()) {
    serialHex = download.serialHex.trim().toUpperCase();
  }
  if (download.newestFingerprintHex?.trim()) {
    newestFingerprintHex = download.newestFingerprintHex.trim().toUpperCase();
  }

  const dateSpan = summarizeNewDiveDates(newDiveDates);

  if (download.cancelled) {
    return {
      cancelled: true,
      received: Math.max(download.diveCount, streamedPersistCount),
      persisted: newCount + alreadyPresentCount,
      newCount,
      alreadyPresentCount,
      failedParseCount,
      checkpointAdvanced: false,
      download,
      newDiveDateEarliest: dateSpan.earliest,
      newDiveDateLatest: dateSpan.latest,
      product,
      serialHex,
    };
  }

  // Fallback for older native builds that only emit metadata on diveCaptured.
  if (streamedPersistCount === 0 && download.dives.length > 0) {
    const payload = await prepareBlePersistFromDownload(download, {
      libdivecomputerVersion: options.libdivecomputerVersion,
      libdivecomputerCommit: options.libdivecomputerCommit,
    });
    failedParseCount += payload.failedParseCount;
    if (payload.dives.length > 0) {
      const persisted = await persistBleImport(payload);
      newCount += persisted.newCount;
      alreadyPresentCount += persisted.alreadyPresentCount;
      for (const dive of payload.dives) {
        if (dive.diveDate) newDiveDates.push(dive.diveDate);
      }
      const span = summarizeNewDiveDates(newDiveDates);
      return {
        cancelled: false,
        received: download.diveCount,
        persisted: persisted.diveCount,
        newCount,
        alreadyPresentCount,
        failedParseCount,
        checkpointAdvanced: persisted.checkpointAdvanced,
        download,
        newDiveDateEarliest: span.earliest,
        newDiveDateLatest: span.latest,
        product: download.product || product,
        serialHex: (download.serialHex || serialHex).toUpperCase(),
      };
    }
  }

  let checkpointAdvanced = false;
  if (newestFingerprintHex && product && serialHex) {
    const checkpoint = buildDeviceCheckpoint({
      descriptor: product,
      serialHex,
      newestFingerprintHex,
      downloaded: Math.max(download.diveCount, streamedPersistCount),
      matched: alreadyPresentCount,
    });
    await persistBleImport({
      dives: [],
      rawRecords: [],
      checkpoint,
    });
    checkpointAdvanced = true;
  }

  const span = summarizeNewDiveDates(newDiveDates);
  return {
    cancelled: false,
    received: Math.max(download.diveCount, streamedPersistCount),
    persisted: newCount + alreadyPresentCount,
    newCount,
    alreadyPresentCount,
    failedParseCount,
    checkpointAdvanced,
    download,
    newDiveDateEarliest: span.earliest,
    newDiveDateLatest: span.latest,
    product,
    serialHex,
  };
}
