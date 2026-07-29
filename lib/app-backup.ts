import {
  exportLocalBackupSnapshot,
  importLocalBackupSnapshot,
  type BackupImportMode,
  type LocalAttachment,
  type LocalBackground,
  type LocalBackupSnapshot,
  type LocalBrandingAsset,
} from "./indexed-db";

const BACKUP_FORMAT = "diveframe-local-backup";
const BACKUP_VERSION = 2;
const LEGACY_BACKUP_VERSION = 1;

type EncodedBlobRecord<T> = Omit<T, "blob"> & { blobBase64: string };
type EncodedStores = Omit<
  LocalBackupSnapshot,
  "attachments" | "backgrounds" | "brandingAssets"
> & {
  attachments: Array<EncodedBlobRecord<LocalAttachment>>;
  backgrounds: Array<EncodedBlobRecord<LocalBackground>>;
  brandingAssets: Array<EncodedBlobRecord<LocalBrandingAsset>>;
};

type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION | typeof LEGACY_BACKUP_VERSION;
  exportedAt: string;
  stores: EncodedStores;
  integrity?: {
    algorithm: "SHA-256";
    digest: string;
  };
};

export type BackupStorePreview = {
  incoming: number;
  newRecords: number;
  matchingRecords: number;
  localOnlyRecords: number;
};

export type PreparedAppBackup = {
  fileName: string;
  exportedAt: string;
  integrity: "verified" | "legacy";
  snapshot: LocalBackupSnapshot;
  stores: Record<keyof LocalBackupSnapshot, BackupStorePreview>;
  counts: {
    dives: number;
    photos: number;
    backgrounds: number;
    presets: number;
  };
};

export async function createLocalAppBackup() {
  const snapshot = await exportLocalBackupSnapshot();
  const unsigned = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    stores: {
      dives: snapshot.dives,
      sourceRecords: snapshot.sourceRecords,
      siteContributions: snapshot.siteContributions,
      composerSettings: snapshot.composerSettings,
      composerPresets: snapshot.composerPresets,
      attachments: await Promise.all(snapshot.attachments.map(encodeBlobRecord)),
      backgrounds: await Promise.all(snapshot.backgrounds.map(encodeBlobRecord)),
      brandingAssets: await Promise.all(
        snapshot.brandingAssets.map(encodeBlobRecord),
      ),
      appPreferences: snapshot.appPreferences,
    },
  } satisfies Omit<BackupDocument, "integrity">;
  const document: BackupDocument = {
    ...unsigned,
    integrity: {
      algorithm: "SHA-256",
      digest: await sha256(JSON.stringify(unsigned)),
    },
  };
  return {
    blob: new Blob([JSON.stringify(document)], { type: "application/json" }),
    counts: {
      dives: snapshot.dives.length,
      photos: snapshot.attachments.length,
      backgrounds: snapshot.backgrounds.length,
    },
  };
}

export async function previewLocalAppBackup(
  file: File,
): Promise<PreparedAppBackup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("This backup is not valid JSON.");
  }
  const document = validateBackupDocument(parsed);
  const integrity = await verifyIntegrity(document);
  const snapshot = await decodeSnapshot(document);
  validateSnapshotReferences(snapshot);
  const local = await exportLocalBackupSnapshot();
  const stores = compareSnapshots(local, snapshot);
  return {
    fileName: file.name,
    exportedAt: document.exportedAt,
    integrity,
    snapshot,
    stores,
    counts: {
      dives: snapshot.dives.length,
      photos: snapshot.attachments.length,
      backgrounds: snapshot.backgrounds.length,
      presets: snapshot.composerPresets.length,
    },
  };
}

export async function restorePreparedAppBackup(
  backup: PreparedAppBackup,
  mode: BackupImportMode,
) {
  const imported = await importLocalBackupSnapshot(backup.snapshot, mode);
  const added = Object.values(backup.stores).reduce(
    (total, store) => total + store.newRecords,
    0,
  );
  const matching = Object.values(backup.stores).reduce(
    (total, store) => total + store.matchingRecords,
    0,
  );
  const localOnly = Object.values(backup.stores).reduce(
    (total, store) => total + store.localOnlyRecords,
    0,
  );
  return {
    ...imported,
    added,
    matching,
    localOnlyRetained: mode === "merge" ? localOnly : 0,
    localOnlyRemoved: mode === "replace" ? localOnly : 0,
  };
}

async function decodeSnapshot(document: BackupDocument): Promise<LocalBackupSnapshot> {
  return {
    dives: document.stores.dives,
    sourceRecords: document.stores.sourceRecords,
    siteContributions: document.stores.siteContributions,
    composerSettings: document.stores.composerSettings,
    composerPresets: document.stores.composerPresets ?? [],
    attachments: await Promise.all(
      document.stores.attachments.map(decodeBlobRecord),
    ),
    backgrounds: await Promise.all(
      document.stores.backgrounds.map(decodeBlobRecord),
    ),
    brandingAssets: await Promise.all(
      document.stores.brandingAssets.map(decodeBlobRecord),
    ),
    appPreferences: document.stores.appPreferences ?? [],
  };
}

async function verifyIntegrity(
  document: BackupDocument,
): Promise<PreparedAppBackup["integrity"]> {
  if (document.version === LEGACY_BACKUP_VERSION) return "legacy";
  if (
    document.integrity?.algorithm !== "SHA-256" ||
    !/^[a-f0-9]{64}$/i.test(document.integrity.digest)
  ) {
    throw new Error("This backup is missing its integrity checksum.");
  }
  const { integrity, ...unsigned } = document;
  const actual = await sha256(JSON.stringify(unsigned));
  if (actual !== integrity.digest.toLowerCase()) {
    throw new Error(
      "This backup failed its checksum. It may be incomplete or modified.",
    );
  }
  return "verified";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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
    ![LEGACY_BACKUP_VERSION, BACKUP_VERSION].includes(document.version ?? -1) ||
    !document.stores ||
    !arraysPresent(document.stores) ||
    typeof document.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(document.exportedAt))
  ) {
    throw new Error("This is not a supported DiveFrame backup.");
  }
  const stores = document.stores;
  const keyedStores: Array<[string, unknown[], "id" | "key"]> = [
    ["dives", stores.dives, "id"],
    ["source records", stores.sourceRecords, "key"],
    ["dive photos", stores.attachments, "id"],
    ["site contributions", stores.siteContributions, "id"],
    ["composer settings", stores.composerSettings, "id"],
    ["composer presets", stores.composerPresets ?? [], "id"],
    ["backgrounds", stores.backgrounds, "id"],
    ["branding assets", stores.brandingAssets, "id"],
    ["app preferences", stores.appPreferences ?? [], "id"],
  ];
  for (const [label, records, key] of keyedStores) {
    const keys = records.map((record) =>
      record && typeof record === "object"
        ? (record as Record<string, unknown>)[key]
        : null,
    );
    if (!keys.every((item) => typeof item === "string" && item.length > 0)) {
      throw new Error(`The backup contains invalid ${label}.`);
    }
    if (new Set(keys).size !== keys.length) {
      throw new Error(`The backup contains duplicate ${label}.`);
    }
  }
  const blobRecords = [
    ...stores.attachments,
    ...stores.backgrounds,
    ...stores.brandingAssets,
  ];
  if (
    !blobRecords.every(
      (record) =>
        typeof record.blobBase64 === "string" &&
        typeof record.contentType === "string" &&
        typeof record.size === "number" &&
        record.size >= 0,
    )
  ) {
    throw new Error("The backup contains invalid image data.");
  }
  return document as BackupDocument;
}

function validateSnapshotReferences(snapshot: LocalBackupSnapshot) {
  const diveIds = new Set(snapshot.dives.map((dive) => dive.id));
  const invalidReference =
    snapshot.sourceRecords.some((record) => !diveIds.has(record.diveId)) ||
    snapshot.siteContributions.some((record) => !diveIds.has(record.diveId));
  if (invalidReference) {
    throw new Error("The backup contains records linked to missing dives.");
  }
  const damagedImage = [
    ...snapshot.attachments,
    ...snapshot.backgrounds,
    ...snapshot.brandingAssets,
  ].some((record) => record.blob.size !== record.size);
  if (damagedImage) {
    throw new Error("The backup contains incomplete image data.");
  }
}

function compareSnapshots(
  local: LocalBackupSnapshot,
  incoming: LocalBackupSnapshot,
) {
  const result = {} as Record<keyof LocalBackupSnapshot, BackupStorePreview>;
  (Object.keys(incoming) as Array<keyof LocalBackupSnapshot>).forEach((name) => {
    const key = name === "sourceRecords" ? "key" : "id";
    const localKeys = new Set(
      local[name].map((record) => (record as unknown as Record<string, string>)[key]),
    );
    const incomingKeys = new Set(
      incoming[name].map(
        (record) => (record as unknown as Record<string, string>)[key],
      ),
    );
    result[name] = {
      incoming: incomingKeys.size,
      newRecords: [...incomingKeys].filter((item) => !localKeys.has(item)).length,
      matchingRecords: [...incomingKeys].filter((item) => localKeys.has(item))
        .length,
      localOnlyRecords: [...localKeys].filter((item) => !incomingKeys.has(item))
        .length,
    };
  });
  return result;
}

function arraysPresent(stores: Partial<EncodedStores>) {
  return (
    Array.isArray(stores.dives) &&
    Array.isArray(stores.sourceRecords) &&
    Array.isArray(stores.attachments) &&
    Array.isArray(stores.siteContributions) &&
    Array.isArray(stores.composerSettings) &&
    (stores.composerPresets === undefined ||
      Array.isArray(stores.composerPresets)) &&
    Array.isArray(stores.backgrounds) &&
    Array.isArray(stores.brandingAssets) &&
    (stores.appPreferences === undefined || Array.isArray(stores.appPreferences))
  );
}
