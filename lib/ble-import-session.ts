import {
  deviceCheckpointId,
  prepareBlePersistFromDownload,
} from "./ble-persist";
import {
  diveComputerCapability,
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
 * Call only after GATT is ready. Does not advance checkpoint if cancelled.
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
  let limit = nativeLimitForQuantity(options.quantity ?? { kind: "last-n", n: BLE_LAST_N_DEFAULT });

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

  const download = await diveComputerCapability.downloadDives({
    limit,
    fingerprintHex,
  });

  if (download.cancelled) {
    return {
      cancelled: true,
      received: download.diveCount,
      persisted: 0,
      newCount: 0,
      alreadyPresentCount: 0,
      failedParseCount: 0,
      checkpointAdvanced: false,
      download,
    };
  }

  const payload = await prepareBlePersistFromDownload(download, {
    libdivecomputerVersion: options.libdivecomputerVersion,
    libdivecomputerCommit: options.libdivecomputerCommit,
  });

  if (payload.dives.length === 0) {
    return {
      cancelled: false,
      received: download.diveCount,
      persisted: 0,
      newCount: 0,
      alreadyPresentCount: 0,
      failedParseCount: payload.failedParseCount,
      checkpointAdvanced: false,
      download,
    };
  }

  const persisted = await persistBleImport(payload);
  return {
    cancelled: false,
    received: download.diveCount,
    persisted: persisted.diveCount,
    newCount: persisted.newCount,
    alreadyPresentCount: persisted.alreadyPresentCount,
    failedParseCount: payload.failedParseCount,
    checkpointAdvanced: persisted.checkpointAdvanced,
    download,
  };
}
