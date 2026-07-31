import type { DiveComputerDownloadResult } from "./dive-computer-capability";
import type { BleNormalizedDivePreview } from "./ble-dive-normalizer";
import { normalizeBleDownloadPreview } from "./ble-dive-normalizer";

export const BLE_CAPTURE_FORMAT = "diveframe-ble-capture";
export const BLE_CAPTURE_FORMAT_VERSION = 1;

export type BleCaptureFixture = {
  format: typeof BLE_CAPTURE_FORMAT;
  formatVersion: number;
  capturedAt: string;
  apiVersion?: string;
  libdivecomputerCommit?: string;
  note: string;
  download: DiveComputerDownloadResult;
  normalizedPreview: BleNormalizedDivePreview[];
};

export function buildBleCaptureFixture(options: {
  download: DiveComputerDownloadResult;
  apiVersion?: string;
  libdivecomputerCommit?: string;
  capturedAt?: string;
}): BleCaptureFixture {
  const download = options.download;
  const normalizedPreview = normalizeBleDownloadPreview(
    {
      vendor: download.vendor,
      product: download.product,
      serial: download.serial,
      serialHex: download.serialHex,
      firmware: download.firmware,
      model: download.model,
    },
    download.dives.map((dive) => ({
      size: dive.size,
      fingerprintHex: dive.fingerprintHex,
      parsed: dive.parsed
        ? {
            ...dive.parsed,
            gasmixes: dive.parsed.gasmixes.map((gas) => ({
              o2Percent: gas.o2Percent,
              hePercent: gas.hePercent,
            })),
            tanks: dive.parsed.tanks.map((tank) => ({
              beginPressureBar: tank.beginPressureBar,
              endPressureBar: tank.endPressureBar,
              gasmixIndex: tank.gasmixIndex,
            })),
            profile: dive.parsed.profile,
          }
        : undefined,
    })),
  );

  return {
    format: BLE_CAPTURE_FORMAT,
    formatVersion: BLE_CAPTURE_FORMAT_VERSION,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    apiVersion: options.apiVersion,
    libdivecomputerCommit: options.libdivecomputerCommit,
    note: "Private local BLE capture fixture. Do not commit; contains raw dive bytes and device serial.",
    download,
    normalizedPreview,
  };
}

export function parseBleCaptureFixture(value: unknown): BleCaptureFixture {
  if (!isRecord(value)) {
    throw new Error("BLE capture fixture must be a JSON object.");
  }
  if (value.format !== BLE_CAPTURE_FORMAT) {
    throw new Error(
      `Expected format ${BLE_CAPTURE_FORMAT}, got ${String(value.format)}.`,
    );
  }
  if (value.formatVersion !== BLE_CAPTURE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported BLE capture formatVersion ${String(value.formatVersion)}.`,
    );
  }
  if (!isRecord(value.download)) {
    throw new Error("BLE capture fixture is missing download.");
  }
  const download = value.download as DiveComputerDownloadResult;
  if (!Array.isArray(download.dives)) {
    throw new Error("BLE capture download.dives must be an array.");
  }
  for (const dive of download.dives) {
    if (!dive || typeof dive !== "object") {
      throw new Error("Each dive must be an object.");
    }
    const row = dive as Record<string, unknown>;
    if (typeof row.fingerprintHex !== "string" || typeof row.size !== "number") {
      throw new Error("Each dive needs fingerprintHex and size.");
    }
    if (typeof row.dataBase64 !== "string") {
      throw new Error(
        "Each dive needs dataBase64 — re-save from the spike with Save full capture.",
      );
    }
  }

  const normalizedPreview = Array.isArray(value.normalizedPreview)
    ? (value.normalizedPreview as BleNormalizedDivePreview[])
    : normalizeBleDownloadPreview(
        {
          vendor: download.vendor,
          product: download.product,
          serial: download.serial,
          serialHex: download.serialHex,
          firmware: download.firmware,
          model: download.model,
        },
        download.dives,
      );

  return {
    format: BLE_CAPTURE_FORMAT,
    formatVersion: BLE_CAPTURE_FORMAT_VERSION,
    capturedAt:
      typeof value.capturedAt === "string"
        ? value.capturedAt
        : new Date().toISOString(),
    apiVersion:
      typeof value.apiVersion === "string" ? value.apiVersion : undefined,
    libdivecomputerCommit:
      typeof value.libdivecomputerCommit === "string"
        ? value.libdivecomputerCommit
        : undefined,
    note:
      typeof value.note === "string"
        ? value.note
        : "Private local BLE capture fixture.",
    download,
    normalizedPreview,
  };
}

export function bleCaptureFixtureFilename(download: DiveComputerDownloadResult) {
  const product = slug(download.product || "shearwater");
  const serial = (download.serialHex || "unknown").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  return `${product}-${serial}-${stamp}.json`;
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
