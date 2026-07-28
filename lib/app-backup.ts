import {
  exportLocalBackupSnapshot,
  importLocalBackupSnapshot,
  type LocalAttachment,
  type LocalBackground,
  type LocalBackupSnapshot,
  type LocalBrandingAsset,
} from "./indexed-db";

const BACKUP_FORMAT = "diveframe-local-backup";
const BACKUP_VERSION = 1;

type EncodedBlobRecord<T> = Omit<T, "blob"> & { blobBase64: string };

type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  stores: Omit<
    LocalBackupSnapshot,
    "attachments" | "backgrounds" | "brandingAssets"
  > & {
    attachments: Array<EncodedBlobRecord<LocalAttachment>>;
    backgrounds: Array<EncodedBlobRecord<LocalBackground>>;
    brandingAssets: Array<EncodedBlobRecord<LocalBrandingAsset>>;
  };
};

export async function createLocalAppBackup() {
  const snapshot = await exportLocalBackupSnapshot();
  const document: BackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    stores: {
      dives: snapshot.dives,
      sourceRecords: snapshot.sourceRecords,
      siteContributions: snapshot.siteContributions,
      composerSettings: snapshot.composerSettings,
      attachments: await Promise.all(snapshot.attachments.map(encodeBlobRecord)),
      backgrounds: await Promise.all(snapshot.backgrounds.map(encodeBlobRecord)),
      brandingAssets: await Promise.all(
        snapshot.brandingAssets.map(encodeBlobRecord),
      ),
    },
  };
  return {
    blob: new Blob([JSON.stringify(document)], {
      type: "application/json",
    }),
    counts: {
      dives: snapshot.dives.length,
      photos: snapshot.attachments.length,
      backgrounds: snapshot.backgrounds.length,
    },
  };
}

export async function restoreLocalAppBackup(file: File) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("This backup is not valid JSON.");
  }
  const document = validateBackupDocument(parsed);
  const snapshot: LocalBackupSnapshot = {
    dives: document.stores.dives,
    sourceRecords: document.stores.sourceRecords,
    siteContributions: document.stores.siteContributions,
    composerSettings: document.stores.composerSettings,
    attachments: await Promise.all(
      document.stores.attachments.map(decodeBlobRecord),
    ),
    backgrounds: await Promise.all(
      document.stores.backgrounds.map(decodeBlobRecord),
    ),
    brandingAssets: await Promise.all(
      document.stores.brandingAssets.map(decodeBlobRecord),
    ),
  };
  return importLocalBackupSnapshot(snapshot);
}

async function encodeBlobRecord<T extends { blob: Blob }>(
  record: T,
): Promise<EncodedBlobRecord<T>> {
  const { blob, ...metadata } = record;
  return {
    ...metadata,
    blobBase64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
  } as EncodedBlobRecord<T>;
}

async function decodeBlobRecord<
  T extends { contentType: string; blobBase64: string },
>(record: T) {
  const { blobBase64, ...metadata } = record;
  return {
    ...metadata,
    blob: new Blob([base64ToBytes(blobBase64)], {
      type: record.contentType || "application/octet-stream",
    }),
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("The backup contains a damaged image.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function validateBackupDocument(value: unknown): BackupDocument {
  if (!value || typeof value !== "object") {
    throw new Error("This is not a DiveFrame backup.");
  }
  const document = value as Partial<BackupDocument>;
  if (
    document.format !== BACKUP_FORMAT ||
    document.version !== BACKUP_VERSION ||
    !document.stores ||
    !arraysPresent(document.stores)
  ) {
    throw new Error("This is not a supported DiveFrame backup.");
  }
  const records = [
    ...document.stores.dives,
    ...document.stores.sourceRecords,
    ...document.stores.attachments,
    ...document.stores.siteContributions,
    ...document.stores.composerSettings,
    ...document.stores.backgrounds,
    ...document.stores.brandingAssets,
  ];
  if (
    !records.every(
      (record) =>
        Boolean(record) &&
        typeof record === "object" &&
        (typeof (record as { id?: unknown; key?: unknown }).id === "string" ||
          typeof (record as { key?: unknown }).key === "string"),
    )
  ) {
    throw new Error("The backup contains invalid records.");
  }
  const blobRecords = [
    ...document.stores.attachments,
    ...document.stores.backgrounds,
    ...document.stores.brandingAssets,
  ];
  if (
    !blobRecords.every(
      (record) =>
        typeof record.blobBase64 === "string" &&
        typeof record.contentType === "string",
    )
  ) {
    throw new Error("The backup contains invalid image data.");
  }
  return document as BackupDocument;
}

function arraysPresent(stores: Partial<BackupDocument["stores"]>) {
  return (
    Array.isArray(stores.dives) &&
    Array.isArray(stores.sourceRecords) &&
    Array.isArray(stores.attachments) &&
    Array.isArray(stores.siteContributions) &&
    Array.isArray(stores.composerSettings) &&
    Array.isArray(stores.backgrounds) &&
    Array.isArray(stores.brandingAssets)
  );
}
