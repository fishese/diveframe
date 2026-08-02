import { Capacitor, registerPlugin } from "@capacitor/core";

export type DiveComputerCapabilities = {
  apiVersion: string;
  bridgeAvailable: boolean;
  platform: "android";
  libdivecomputerVersion: string;
  libdivecomputerCommit: string;
  transportReady: boolean;
  phase: string;
  supportedOperations: string[];
  classicServiceUuid: string;
};

export type DiveComputerCancelResult = {
  cancelled: boolean;
  captureActive: boolean;
};

export type DiveComputerPermissionResult = {
  bluetooth: string;
};

export type DiveComputerScanStartResult = {
  scanning: boolean;
  timeoutMs: number;
};

export type DiveComputerConnectResult = {
  connecting: boolean;
  address: string;
  name: string;
};

export type DiveComputerGasMix = {
  oxygen: number;
  helium: number;
  nitrogen: number;
  o2Percent: number;
  hePercent: number;
};

export type DiveComputerTank = {
  beginPressureBar: number;
  endPressureBar: number;
  gasmixIndex: number;
  volumeL: number;
  workPressureBar: number;
  volumeType: number;
  usage: "none" | "oxygen" | "diluent" | "sidemount" | "unknown";
};

export type DiveComputerProfilePoint = {
  timeMs: number;
  depthM: number;
  temperatureC?: number;
  /** Tank-indexed pressure series; null means no reading for that tank/time. */
  pressuresBar: Array<number | null>;
};

export type DiveComputerParsedDive = {
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
    waterType: "fresh" | "salt" | "unknown";
    densityKgM3?: number;
  };
  decompressionModel?: {
    type: "none" | "buhlmann" | "vpm" | "rgbm" | "dciem" | "unknown";
    conservatism: number;
    gfLow?: number;
    gfHigh?: number;
  };
  sampleCount: number;
  /** Shearwater GNSS fix, present only with a satellite lock (log version 17+). */
  gpsEntryLat?: number;
  gpsEntryLng?: number;
  gpsExitLat?: number;
  gpsExitLng?: number;
  gasmixes: DiveComputerGasMix[];
  tanks: DiveComputerTank[];
  profile: DiveComputerProfilePoint[];
};

export type DiveComputerRawDive = {
  size: number;
  fingerprintHex: string;
  dataBase64: string;
  parsed?: DiveComputerParsedDive;
};

export type DiveComputerDownloadResult = {
  status: number;
  message: string;
  vendor: string;
  product: string;
  family: number;
  model: number;
  firmware: number;
  serial: number;
  serialHex?: string;
  cancelled: boolean;
  persisted: boolean;
  diveCount: number;
  dives: DiveComputerRawDive[];
  logTail: string;
  limit?: number;
  fingerprintHexUsed?: string;
  newestFingerprintHex?: string;
};

export type DiveComputerDownloadOptions = {
  /**
   * Max dives to capture. Positive values honor that count. `0` (or negative)
   * means unlimited / full computer history. Default 5.
   */
  limit?: number;
  /**
   * libdivecomputer checkpoint: stop when this dive is reached and do not
   * include it. Hex string of the fingerprint bytes (e.g. from a prior
   * newestFingerprintHex).
   */
  fingerprintHex?: string;
};

export type DiveComputerDeviceFoundEvent = {
  address: string;
  name: string;
  rssi: number;
};

export type DiveComputerPhaseChangedEvent = {
  phase: string;
  captureActive: boolean;
  transportReady: boolean;
};

export type DiveComputerTransportReadyEvent = {
  address: string;
  name: string;
  serviceUuid: string;
};

export type DiveComputerDownloadProgressEvent = {
  current: number;
  maximum: number;
  diveCount: number;
};

export type DiveComputerDiveCapturedEvent = {
  index: number;
  size: number;
  fingerprintHex: string;
  /** Present when native streams full payloads for incremental persist. */
  dataBase64?: string;
  parsed?: DiveComputerParsedDive;
  serial?: number;
  serialHex?: string;
  product?: string;
};

export interface DiveComputerPlugin {
  getCapabilities(): Promise<DiveComputerCapabilities>;
  requestPermissions(): Promise<DiveComputerPermissionResult>;
  startScan(options?: { timeoutMs?: number }): Promise<DiveComputerScanStartResult>;
  stopScan(): Promise<{ scanning: boolean }>;
  connect(options: {
    address: string;
    name?: string;
  }): Promise<DiveComputerConnectResult>;
  disconnect(): Promise<{ disconnected: boolean }>;
  downloadDives(
    options?: DiveComputerDownloadOptions,
  ): Promise<DiveComputerDownloadResult>;
  saveCaptureFixture(options: {
    filename: string;
    contents: string;
  }): Promise<{
    saved: boolean;
    filename: string;
    uri: string;
    location: string;
    hint: string;
  }>;
  cancel(): Promise<DiveComputerCancelResult>;
  addListener(
    eventName: "deviceFound",
    listenerFunc: (event: DiveComputerDeviceFoundEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "phaseChanged",
    listenerFunc: (event: DiveComputerPhaseChangedEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "scanStopped",
    listenerFunc: (event: { reason: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "transportReady",
    listenerFunc: (event: DiveComputerTransportReadyEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "transportClosed",
    listenerFunc: (event: { reason: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "transportError",
    listenerFunc: (event: { code: string; message: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (event: DiveComputerDownloadProgressEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "diveCaptured",
    listenerFunc: (event: DiveComputerDiveCapturedEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const nativePlugin = registerPlugin<DiveComputerPlugin>("DiveComputer");

export const diveComputerCapability = {
  isAvailable() {
    return (
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("DiveComputer")
    );
  },

  async getCapabilities() {
    requireNativePlugin();
    return nativePlugin.getCapabilities();
  },

  async requestPermissions() {
    requireNativePlugin();
    return nativePlugin.requestPermissions();
  },

  async startScan(options?: { timeoutMs?: number }) {
    requireNativePlugin();
    return nativePlugin.startScan(options);
  },

  async stopScan() {
    requireNativePlugin();
    return nativePlugin.stopScan();
  },

  async connect(options: { address: string; name?: string }) {
    requireNativePlugin();
    return nativePlugin.connect(options);
  },

  async disconnect() {
    requireNativePlugin();
    return nativePlugin.disconnect();
  },

  async downloadDives(options?: DiveComputerDownloadOptions) {
    requireNativePlugin();
    return nativePlugin.downloadDives(options);
  },

  async saveCaptureFixture(options: { filename: string; contents: string }) {
    requireNativePlugin();
    return nativePlugin.saveCaptureFixture(options);
  },

  async cancel() {
    requireNativePlugin();
    return nativePlugin.cancel();
  },

  addListener: nativePlugin.addListener.bind(nativePlugin) as DiveComputerPlugin["addListener"],
};

function requireNativePlugin() {
  if (!diveComputerCapability.isAvailable()) {
    throw new Error(
      "Dive-computer Bluetooth is available only in the Android app.",
    );
  }
}
