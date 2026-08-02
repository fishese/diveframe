import type {
  DiveCategory,
  DiveSample,
  GasMix,
} from "./dive-model";
import type { ComposerSettings } from "./composer-settings";
import type { ComposerPresetSettings } from "./composer-presets";
import { findMatchingDive } from "./dive-matching";
import {
  canonicalDiveId,
  shouldPromoteCanonicalSource,
} from "./dive-identity";
import { normalizeShearwaterPressurePair } from "./gas-calculations";
import { withOptimizedJpeg } from "./media-optimization";
import type { DiveSiteCatalog } from "./dive-site-catalog";
import type { WhatsNewDocument } from "./whats-new";
import {
  ALL_STORE_NAMES,
  STORE_NAMES,
  storeNamesForErase,
} from "./store-manifest";

export type DiveSource =
  | "shearwater"
  | "shearwater-ble"
  | "subsurface"
  | "uddf"
  | "fit";

export type ExportGpsPreference = "computer" | "user" | "user-if-missing";
export type UserGpsSource = "manual" | "photo-exif";
export type AttachmentRole = "dive-photo" | "geo-reference";

export type LocalDive = {
  id: string;
  diveNumber: number | null;
  diveDate: string | null;
  lastModified: string | null;
  depth: string | null;
  averageDepth: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  lengthText: string | null;
  durationSeconds: number | null;
  location: string | null;
  site: string | null;
  buddy: string | null;
  notes: string | null;
  serialNumber: string | null;
  gpsEntryLat: number | null;
  gpsEntryLng: number | null;
  gpsExitLat: number | null;
  gpsExitLng: number | null;
  calculatedJson: string | null;
  category: DiveCategory;
  categorySource: "default" | "import" | "user";
  maxDepthM: number | null;
  waterTemperatureC: number | null;
  gasMixes: GasMix[];
  computerModel: string | null;
  samples: DiveSample[];
  tankPressuresStartBar: Array<number | null>;
  tankPressuresEndBar: Array<number | null>;
  cylinderPresetId?: string | null;
  cylinderVolumeL?: number | null;
  userSite: string | null;
  userSiteSource: "catalog" | "suggestion" | "manual" | null;
  userSiteCatalogId: string | null;
  userSiteUpdatedAt: string | null;
  /** User-supplied pin; never overwrites computer gpsEntry/gpsExit fields. */
  userGpsLat: number | null;
  userGpsLng: number | null;
  userGpsSource: UserGpsSource | null;
  userGpsUpdatedAt: string | null;
  exportGpsPreference: ExportGpsPreference;
  tripId: string | null;
  resolvedLocation: string | null;
  resolvedCity: string | null;
  resolvedCountry: string | null;
  importedAt: string;
  photoCount: number;
  sources: string[];
  sourceDiveNumbers: Partial<Record<DiveSource, number | null>>;
  sourceSiteNames: Partial<Record<DiveSource, string | null>>;
};

export type LocalImportedDive = Omit<
  LocalDive,
  | "importedAt"
  | "photoCount"
  | "userSite"
  | "userSiteSource"
  | "userSiteCatalogId"
  | "userSiteUpdatedAt"
  | "userGpsLat"
  | "userGpsLng"
  | "userGpsSource"
  | "userGpsUpdatedAt"
  | "exportGpsPreference"
  | "tripId"
  | "resolvedLocation"
  | "resolvedCity"
  | "resolvedCountry"
  | "sources"
  | "sourceDiveNumbers"
  | "sourceSiteNames"
> & {
  source: DiveSource;
  sourceId: string;
};

export type LocalAttachment = {
  id: string;
  diveId: string;
  fileName: string;
  contentType: string;
  size: number;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
  /** Absent or dive-photo for normal gallery photos. */
  role?: AttachmentRole;
  blob: Blob;
};

export type LocalRawDiveRecord = {
  id: string;
  diveId: string;
  sourceKind: string;
  rawFormat: string;
  deviceDescriptor: string;
  deviceSerial: string;
  libdivecomputerVersion: string;
  libdivecomputerCommit?: string;
  parserContractVersion: string;
  capturedAt: string;
  fingerprintHex: string;
  length: number;
  checksum: string;
  rawBytes: Blob;
};

export type LocalDeviceCheckpoint = {
  id: string;
  fingerprint: Blob;
  fingerprintHex: string;
  lastSyncedAt: string;
  lastOutcomeCounts?: {
    downloaded: number;
    matched?: number;
  };
};

export type LocalTrip = {
  id: string;
  name: string;
  updatedAt: string;
};

export type LocalBackground = {
  id: string;
  fileName: string;
  displayName?: string;
  contentType: string;
  size: number;
  createdAt: string;
  blob: Blob;
};

export type LocalBrandingAsset = {
  id: "overlay-logo";
  fileName: string;
  contentType: string;
  size: number;
  updatedAt: string;
  blob: Blob;
};

export type LocalAppPreferences = {
  id: "app";
  uiLanguage: "en" | "zh-Hant" | "ja";
  defaultCylinderPresetId?: string;
  lastComposerOutputSize?: ComposerSettings["outputSize"];
  lastComposerFormat?: ComposerSettings["format"];
  lastComposerJpegQuality?: number;
  dismissedDuplicatePairs?: string[];
  bundledBackgroundHidden?: boolean;
  whatsNewCache?: WhatsNewDocument | null;
  whatsNewFetchedAt?: string | null;
  lastSeenWhatsNewVersion?: string | null;
  updatedAt: string;
};

export type LocalComposerPreset = {
  id: string;
  name: string;
  settings: ComposerPresetSettings;
  createdAt: string;
  updatedAt: string;
};

export type LocalSupplementaryCatalog = {
  id: "default";
  label: string;
  catalog: DiveSiteCatalog;
  updatedAt: string;
};

export type LocalSiteContribution = {
  id: string;
  diveId: string;
  name: string;
  latitude: number;
  longitude: number;
  diveDate: string | null;
  shearwaterDiveNumber: number | null;
  subsurfaceDiveNumber: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceRecord = {
  key: string;
  source: LocalImportedDive["source"];
  sourceId: string;
  diveId: string;
  importedAt: string;
};

export type LocalBackupSnapshot = {
  dives: LocalDive[];
  sourceRecords: SourceRecord[];
  attachments: LocalAttachment[];
  siteContributions: LocalSiteContribution[];
  composerSettings: ComposerSettings[];
  composerPresets: LocalComposerPreset[];
  backgrounds: LocalBackground[];
  brandingAssets: LocalBrandingAsset[];
  appPreferences: LocalAppPreferences[];
  rawDiveRecords: LocalRawDiveRecord[];
  deviceCheckpoints: LocalDeviceCheckpoint[];
  trips: LocalTrip[];
  supplementaryCatalog: LocalSupplementaryCatalog[];
};

export type BackupImportMode = "merge" | "replace" | "replace-dives";

const DATABASE_NAME = "diveframe-local";
export const DATABASE_VERSION = 10;
const DIVES_STORE = STORE_NAMES.dives;
const SOURCES_STORE = STORE_NAMES.sourceRecords;
const ATTACHMENTS_STORE = STORE_NAMES.attachments;
const SITE_CONTRIBUTIONS_STORE = STORE_NAMES.siteContributions;
const COMPOSER_SETTINGS_STORE = STORE_NAMES.composerSettings;
const COMPOSER_PRESETS_STORE = STORE_NAMES.composerPresets;
const BACKGROUNDS_STORE = STORE_NAMES.backgrounds;
const BRANDING_ASSETS_STORE = STORE_NAMES.brandingAssets;
const APP_PREFERENCES_STORE = STORE_NAMES.appPreferences;
const RAW_DIVE_RECORDS_STORE = STORE_NAMES.rawDiveRecords;
const DEVICE_CHECKPOINTS_STORE = STORE_NAMES.deviceCheckpoints;
const TRIPS_STORE = STORE_NAMES.trips;
const SUPPLEMENTARY_CATALOG_STORE = STORE_NAMES.supplementaryCatalog;

export async function listLocalDives() {
  const database = await openDatabase();
  const dives = await request<LocalDive[]>(
    database.transaction(DIVES_STORE).objectStore(DIVES_STORE).getAll(),
  );
  return dives.map(hydrateDive).sort((a, b) => {
    const dateOrder = String(b.diveDate ?? "").localeCompare(String(a.diveDate ?? ""));
    return dateOrder || (b.diveNumber ?? 0) - (a.diveNumber ?? 0);
  });
}

export async function listLocalSourceRecords() {
  const database = await openDatabase();
  return request<SourceRecord[]>(
    database.transaction(SOURCES_STORE).objectStore(SOURCES_STORE).getAll(),
  );
}

export async function upsertLocalDives(importedDives: LocalImportedDive[]) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      DIVES_STORE,
      SOURCES_STORE,
      ATTACHMENTS_STORE,
      SITE_CONTRIBUTIONS_STORE,
      COMPOSER_SETTINGS_STORE,
      RAW_DIVE_RECORDS_STORE,
    ],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const sourcesStore = transaction.objectStore(SOURCES_STORE);
  const contributionsStore = transaction.objectStore(SITE_CONTRIBUTIONS_STORE);
  const attachmentsStore = transaction.objectStore(ATTACHMENTS_STORE);
  const composerSettingsStore = transaction.objectStore(COMPOSER_SETTINGS_STORE);
  const rawStore = transaction.objectStore(RAW_DIVE_RECORDS_STORE);
  const [storedDives, storedSources] = await Promise.all([
    request<LocalDive[]>(divesStore.getAll()),
    request<SourceRecord[]>(sourcesStore.getAll()),
  ]);
  const divesById = new Map(storedDives.map((dive) => [dive.id, dive]));
  const sourceMappings = new Map(
    storedSources.map((record) => [record.key, record.diveId]),
  );
  const now = new Date().toISOString();

  for (const incoming of importedDives) {
    const mappingKey = sourceKey(incoming.source, incoming.sourceId);
    const mappedId = sourceMappings.get(mappingKey);
    const matchedId =
      mappedId ?? findMatchingDive(incoming, [...divesById.values()]);
    let canonicalId = matchedId ?? canonicalDiveId(incoming);
    if (
      !mappedId &&
      matchedId &&
      shouldPromoteCanonicalSource(
        incoming.source,
        divesById.get(matchedId)?.sources ?? [],
      )
    ) {
      const promotedId = canonicalDiveId(incoming);
      await rekeyDive(
        matchedId,
        promotedId,
        divesById,
        storedSources,
        sourceMappings,
        divesStore,
        sourcesStore,
        attachmentsStore,
        contributionsStore,
        composerSettingsStore,
        rawStore,
      );
      canonicalId = promotedId;
    }
    const merged = mergeDive(canonicalId, divesById.get(canonicalId), incoming, now);

    divesById.set(canonicalId, merged);
    sourceMappings.set(mappingKey, canonicalId);
    divesStore.put(merged);
    sourcesStore.put({
      key: mappingKey,
      source: incoming.source,
      sourceId: incoming.sourceId,
      diveId: canonicalId,
      importedAt: now,
    } satisfies SourceRecord);
    if (incoming.site) contributionsStore.delete(canonicalId);
  }

  await transactionComplete(transaction);
  return listLocalDives();
}

/**
 * Atomically merge BLE-normalized dives, raw capture blobs, and the device
 * checkpoint. Advances the checkpoint only in the same transaction as the
 * retained dive/raw writes.
 */
export async function persistBleImport(options: {
  dives: LocalImportedDive[];
  rawRecords: LocalRawDiveRecord[];
  checkpoint: LocalDeviceCheckpoint | null;
}) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      DIVES_STORE,
      SOURCES_STORE,
      ATTACHMENTS_STORE,
      SITE_CONTRIBUTIONS_STORE,
      COMPOSER_SETTINGS_STORE,
      RAW_DIVE_RECORDS_STORE,
      DEVICE_CHECKPOINTS_STORE,
    ],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const sourcesStore = transaction.objectStore(SOURCES_STORE);
  const contributionsStore = transaction.objectStore(SITE_CONTRIBUTIONS_STORE);
  const attachmentsStore = transaction.objectStore(ATTACHMENTS_STORE);
  const composerSettingsStore = transaction.objectStore(COMPOSER_SETTINGS_STORE);
  const rawStore = transaction.objectStore(RAW_DIVE_RECORDS_STORE);
  const checkpointStore = transaction.objectStore(DEVICE_CHECKPOINTS_STORE);
  const [storedDives, storedSources] = await Promise.all([
    request<LocalDive[]>(divesStore.getAll()),
    request<SourceRecord[]>(sourcesStore.getAll()),
  ]);
  const divesById = new Map(storedDives.map((dive) => [dive.id, dive]));
  const sourceMappings = new Map(
    storedSources.map((record) => [record.key, record.diveId]),
  );
  const now = new Date().toISOString();
  const idBySourceId = new Map<string, string>();
  let newCount = 0;
  let alreadyPresentCount = 0;

  for (const incoming of options.dives) {
    const mappingKey = sourceKey(incoming.source, incoming.sourceId);
    const mappedId = sourceMappings.get(mappingKey);
    const matchedId =
      mappedId ?? findMatchingDive(incoming, [...divesById.values()]);
    const existedBefore = Boolean(mappedId || matchedId);
    let canonicalId = matchedId ?? canonicalDiveId(incoming);
    if (
      !mappedId &&
      matchedId &&
      shouldPromoteCanonicalSource(
        incoming.source,
        divesById.get(matchedId)?.sources ?? [],
      )
    ) {
      const promotedId = canonicalDiveId(incoming);
      await rekeyDive(
        matchedId,
        promotedId,
        divesById,
        storedSources,
        sourceMappings,
        divesStore,
        sourcesStore,
        attachmentsStore,
        contributionsStore,
        composerSettingsStore,
        rawStore,
      );
      canonicalId = promotedId;
    }
    const merged = mergeDive(canonicalId, divesById.get(canonicalId), incoming, now);
    divesById.set(canonicalId, merged);
    sourceMappings.set(mappingKey, canonicalId);
    idBySourceId.set(incoming.sourceId, canonicalId);
    divesStore.put(merged);
    sourcesStore.put({
      key: mappingKey,
      source: incoming.source,
      sourceId: incoming.sourceId,
      diveId: canonicalId,
      importedAt: now,
    } satisfies SourceRecord);
    if (existedBefore) alreadyPresentCount += 1;
    else newCount += 1;
  }

  for (const raw of options.rawRecords) {
    const diveId = idBySourceId.get(raw.fingerprintHex) ?? raw.diveId;
    rawStore.put({ ...raw, diveId });
  }
  if (options.checkpoint) {
    checkpointStore.put(options.checkpoint);
  }

  await transactionComplete(transaction);
  return {
    diveCount: options.dives.length,
    rawCount: options.rawRecords.length,
    newCount,
    alreadyPresentCount,
    checkpointAdvanced: Boolean(options.checkpoint),
  };
}

export async function listLocalDeviceCheckpoints() {
  const database = await openDatabase();
  return request<LocalDeviceCheckpoint[]>(
    database
      .transaction(DEVICE_CHECKPOINTS_STORE)
      .objectStore(DEVICE_CHECKPOINTS_STORE)
      .getAll(),
  );
}

export async function getLocalDeviceCheckpoint(id: string) {
  const database = await openDatabase();
  return request<LocalDeviceCheckpoint | undefined>(
    database
      .transaction(DEVICE_CHECKPOINTS_STORE)
      .objectStore(DEVICE_CHECKPOINTS_STORE)
      .get(id),
  );
}

export async function clearLocalDeviceCheckpoint(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(
    DEVICE_CHECKPOINTS_STORE,
    "readwrite",
  );
  transaction.objectStore(DEVICE_CHECKPOINTS_STORE).delete(id);
  await transactionComplete(transaction);
}

async function rekeyDive(
  previousId: string,
  nextId: string,
  divesById: Map<string, LocalDive>,
  storedSources: SourceRecord[],
  sourceMappings: Map<string, string>,
  divesStore: IDBObjectStore,
  sourcesStore: IDBObjectStore,
  attachmentsStore: IDBObjectStore,
  contributionsStore: IDBObjectStore,
  composerSettingsStore: IDBObjectStore,
  rawStore: IDBObjectStore,
) {
  if (previousId === nextId) return;
  const dive = divesById.get(previousId);
  if (!dive) return;

  const [attachments, contribution, composerSettings, rawRecords] =
    await Promise.all([
      request<LocalAttachment[]>(
        attachmentsStore.index("diveId").getAll(previousId),
      ),
      request<LocalSiteContribution | undefined>(
        contributionsStore.get(previousId),
      ),
      request<ComposerSettings | undefined>(
        composerSettingsStore.get(previousId),
      ),
      request<LocalRawDiveRecord[]>(rawStore.index("diveId").getAll(previousId)),
    ]);

  divesStore.delete(previousId);
  divesById.delete(previousId);
  divesById.set(nextId, { ...dive, id: nextId });

  attachments.forEach((attachment) =>
    attachmentsStore.put({ ...attachment, diveId: nextId }),
  );
  rawRecords.forEach((record) =>
    rawStore.put({ ...record, diveId: nextId }),
  );
  if (contribution) {
    contributionsStore.delete(previousId);
    contributionsStore.put({
      ...contribution,
      id: nextId,
      diveId: nextId,
    });
  }
  if (composerSettings) {
    composerSettingsStore.delete(previousId);
    composerSettingsStore.put({
      ...composerSettings,
      id: nextId,
      diveId: nextId,
    });
  }

  storedSources.forEach((record) => {
    if (record.diveId !== previousId) return;
    record.diveId = nextId;
    sourceMappings.set(record.key, nextId);
    sourcesStore.put(record);
  });
}

export async function listLocalAttachments(diveId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(ATTACHMENTS_STORE);
  const index = transaction.objectStore(ATTACHMENTS_STORE).index("diveId");
  const attachments = await request<LocalAttachment[]>(index.getAll(diveId));
  return attachments.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addLocalPhotos(diveId: string, files: File[]) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [ATTACHMENTS_STORE, DIVES_STORE],
    "readwrite",
  );
  const attachmentsStore = transaction.objectStore(ATTACHMENTS_STORE);
  const divesStore = transaction.objectStore(DIVES_STORE);
  const [existing, dive] = await Promise.all([
    request<LocalAttachment[]>(
      attachmentsStore.index("diveId").getAll(diveId),
    ),
    request<LocalDive | undefined>(divesStore.get(diveId)),
  ]);
  if (!dive) {
    transaction.abort();
    throw new Error("Dive not found in this browser.");
  }

  const createdAt = new Date().toISOString();
  const startOrder =
    existing.reduce((maximum, item) => Math.max(maximum, item.sortOrder), -1) + 1;
  const additions = files.map((file, index) => ({
    id: crypto.randomUUID(),
    diveId,
    fileName: file.name || `dive-photo-${index + 1}.jpg`,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    caption: null,
    sortOrder: startOrder + index,
    createdAt,
    blob: file.slice(0, file.size, file.type),
  } satisfies LocalAttachment));

  additions.forEach((attachment) => attachmentsStore.put(attachment));
  divesStore.put({ ...dive, photoCount: existing.length + additions.length });
  await transactionComplete(transaction);
  return additions;
}

export async function deleteLocalAttachment(diveId: string, attachmentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [ATTACHMENTS_STORE, DIVES_STORE],
    "readwrite",
  );
  const attachmentsStore = transaction.objectStore(ATTACHMENTS_STORE);
  const divesStore = transaction.objectStore(DIVES_STORE);
  const [attachment, dive] = await Promise.all([
    request<LocalAttachment | undefined>(attachmentsStore.get(attachmentId)),
    request<LocalDive | undefined>(divesStore.get(diveId)),
  ]);
  if (!attachment || attachment.diveId !== diveId || !dive) {
    transaction.abort();
    throw new Error("Photo not found in this dive.");
  }
  attachmentsStore.delete(attachmentId);
  divesStore.put({
    ...dive,
    photoCount: Math.max(0, (dive.photoCount ?? 0) - 1),
  });
  await transactionComplete(transaction);
}

export async function listLocalBackgrounds() {
  const database = await openDatabase();
  const backgrounds = await request<LocalBackground[]>(
    database.transaction(BACKGROUNDS_STORE).objectStore(BACKGROUNDS_STORE).getAll(),
  );
  return backgrounds.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addLocalBackgrounds(files: File[]) {
  const database = await openDatabase();
  const transaction = database.transaction(BACKGROUNDS_STORE, "readwrite");
  const store = transaction.objectStore(BACKGROUNDS_STORE);
  const createdAt = new Date().toISOString();
  const additions = files.map((file, index) => ({
    id: crypto.randomUUID(),
    fileName: file.name || `diving-background-${index + 1}.jpg`,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    createdAt,
    blob: file.slice(0, file.size, file.type),
  } satisfies LocalBackground));
  additions.forEach((background) => store.put(background));
  await transactionComplete(transaction);
  return additions;
}

export async function deleteLocalBackground(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(BACKGROUNDS_STORE, "readwrite");
  transaction.objectStore(BACKGROUNDS_STORE).delete(id);
  await transactionComplete(transaction);
}

export async function updateLocalBackgroundName(id: string, displayName: string) {
  const database = await openDatabase();
  const transaction = database.transaction(BACKGROUNDS_STORE, "readwrite");
  const store = transaction.objectStore(BACKGROUNDS_STORE);
  const background = await request<LocalBackground | undefined>(store.get(id));
  if (!background) {
    await transactionComplete(transaction);
    throw new Error("Reusable background not found.");
  }
  const updated = {
    ...background,
    displayName: displayName.trim() || background.fileName,
  };
  store.put(updated);
  await transactionComplete(transaction);
  return updated;
}

export async function getLocalOverlayLogo() {
  const database = await openDatabase();
  return request<LocalBrandingAsset | undefined>(
    database
      .transaction(BRANDING_ASSETS_STORE)
      .objectStore(BRANDING_ASSETS_STORE)
      .get("overlay-logo"),
  );
}

export async function saveLocalOverlayLogo(file: File) {
  const extension = file.name.toLowerCase();
  const supported =
    file.type === "image/png" ||
    file.type === "image/svg+xml" ||
    extension.endsWith(".png") ||
    extension.endsWith(".svg");
  if (!supported) throw new Error("Choose a transparent PNG or SVG logo.");
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("The logo must be smaller than 10 MB.");
  }
  const contentType =
    file.type ||
    (extension.endsWith(".svg") ? "image/svg+xml" : "image/png");
  const asset: LocalBrandingAsset = {
    id: "overlay-logo",
    fileName: file.name || "overlay-logo",
    contentType,
    size: file.size,
    updatedAt: new Date().toISOString(),
    blob: file.slice(0, file.size, contentType),
  };
  const database = await openDatabase();
  const transaction = database.transaction(BRANDING_ASSETS_STORE, "readwrite");
  transaction.objectStore(BRANDING_ASSETS_STORE).put(asset);
  await transactionComplete(transaction);
  return asset;
}

export async function deleteLocalOverlayLogo() {
  const database = await openDatabase();
  const transaction = database.transaction(BRANDING_ASSETS_STORE, "readwrite");
  transaction.objectStore(BRANDING_ASSETS_STORE).delete("overlay-logo");
  await transactionComplete(transaction);
}

export async function getLocalAppPreferences() {
  const database = await openDatabase();
  return request<LocalAppPreferences | undefined>(
    database
      .transaction(APP_PREFERENCES_STORE)
      .objectStore(APP_PREFERENCES_STORE)
      .get("app"),
  );
}

export async function saveLocalAppPreferences(
  preferences: Partial<
    Pick<
      LocalAppPreferences,
      | "uiLanguage"
      | "defaultCylinderPresetId"
      | "lastComposerOutputSize"
      | "lastComposerFormat"
      | "lastComposerJpegQuality"
      | "dismissedDuplicatePairs"
      | "bundledBackgroundHidden"
      | "whatsNewCache"
      | "whatsNewFetchedAt"
      | "lastSeenWhatsNewVersion"
    >
  >,
) {
  const existing = await getLocalAppPreferences();
  const saved: LocalAppPreferences = {
    ...existing,
    id: "app",
    uiLanguage: preferences.uiLanguage ?? existing?.uiLanguage ?? "en",
    defaultCylinderPresetId:
      preferences.defaultCylinderPresetId ??
      existing?.defaultCylinderPresetId ??
      "al80",
    lastComposerOutputSize:
      preferences.lastComposerOutputSize ?? existing?.lastComposerOutputSize,
    lastComposerFormat:
      preferences.lastComposerFormat ?? existing?.lastComposerFormat,
    lastComposerJpegQuality:
      preferences.lastComposerJpegQuality ??
      existing?.lastComposerJpegQuality,
    dismissedDuplicatePairs:
      preferences.dismissedDuplicatePairs ??
      existing?.dismissedDuplicatePairs ??
      [],
    bundledBackgroundHidden:
      preferences.bundledBackgroundHidden ??
      existing?.bundledBackgroundHidden ??
      false,
    whatsNewCache:
      preferences.whatsNewCache !== undefined
        ? preferences.whatsNewCache
        : existing?.whatsNewCache ?? null,
    whatsNewFetchedAt:
      preferences.whatsNewFetchedAt !== undefined
        ? preferences.whatsNewFetchedAt
        : existing?.whatsNewFetchedAt ?? null,
    lastSeenWhatsNewVersion:
      preferences.lastSeenWhatsNewVersion !== undefined
        ? preferences.lastSeenWhatsNewVersion
        : existing?.lastSeenWhatsNewVersion ?? null,
    updatedAt: new Date().toISOString(),
  };
  const database = await openDatabase();
  const transaction = database.transaction(APP_PREFERENCES_STORE, "readwrite");
  transaction.objectStore(APP_PREFERENCES_STORE).put(saved);
  await transactionComplete(transaction);
  return saved;
}

export async function getLocalSupplementaryCatalog() {
  const database = await openDatabase();
  return request<LocalSupplementaryCatalog | undefined>(
    database
      .transaction(SUPPLEMENTARY_CATALOG_STORE)
      .objectStore(SUPPLEMENTARY_CATALOG_STORE)
      .get("default"),
  ).then((record) => record ?? null);
}

export async function saveLocalSupplementaryCatalog(
  label: string,
  catalog: DiveSiteCatalog,
) {
  const saved: LocalSupplementaryCatalog = {
    id: "default",
    label: label.trim(),
    catalog,
    updatedAt: new Date().toISOString(),
  };
  const database = await openDatabase();
  const transaction = database.transaction(
    SUPPLEMENTARY_CATALOG_STORE,
    "readwrite",
  );
  transaction.objectStore(SUPPLEMENTARY_CATALOG_STORE).put(saved);
  await transactionComplete(transaction);
  return saved;
}

export async function clearLocalSupplementaryCatalog() {
  const database = await openDatabase();
  const transaction = database.transaction(
    SUPPLEMENTARY_CATALOG_STORE,
    "readwrite",
  );
  transaction.objectStore(SUPPLEMENTARY_CATALOG_STORE).delete("default");
  await transactionComplete(transaction);
}

export async function updateLocalDiveSite(
  id: string,
  selection: {
    name: string;
    source: "catalog" | "suggestion" | "manual";
    catalogId?: string;
    latitude: number | null;
    longitude: number | null;
    location?: string | null;
  },
) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [DIVES_STORE, SITE_CONTRIBUTIONS_STORE],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const contributionsStore = transaction.objectStore(SITE_CONTRIBUTIONS_STORE);
  const dive = await request<LocalDive | undefined>(divesStore.get(id));
  if (!dive) {
    transaction.abort();
    throw new Error("Dive not found in this browser.");
  }

  const now = new Date().toISOString();
  const updated: LocalDive = {
    ...dive,
    location:
      selection.location === undefined
        ? dive.location
        : selection.location?.trim() || null,
    userSite: selection.name,
    userSiteSource: selection.source,
    userSiteCatalogId: selection.catalogId ?? null,
    userSiteUpdatedAt: now,
  };
  divesStore.put(updated);

  if (
    selection.source === "manual" &&
    selection.latitude !== null &&
    selection.longitude !== null
  ) {
    const existing = await request<LocalSiteContribution | undefined>(
      contributionsStore.get(id),
    );
    contributionsStore.put({
      id,
      diveId: id,
      name: selection.name,
      latitude: selection.latitude,
      longitude: selection.longitude,
      diveDate: dive.diveDate,
      shearwaterDiveNumber: dive.sourceDiveNumbers?.shearwater ?? null,
      subsurfaceDiveNumber: dive.sourceDiveNumbers?.subsurface ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies LocalSiteContribution);
  } else {
    contributionsStore.delete(id);
  }

  await transactionComplete(transaction);
  return updated;
}

export async function clearLocalDiveSiteOverride(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [DIVES_STORE, SITE_CONTRIBUTIONS_STORE],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const contributionsStore = transaction.objectStore(SITE_CONTRIBUTIONS_STORE);
  const dive = await request<LocalDive | undefined>(divesStore.get(id));
  if (!dive) {
    transaction.abort();
    throw new Error("Dive not found in this browser.");
  }

  const updated: LocalDive = {
    ...dive,
    userSite: null,
    userSiteSource: null,
    userSiteCatalogId: null,
    userSiteUpdatedAt: null,
  };
  divesStore.put(updated);
  contributionsStore.delete(id);
  await transactionComplete(transaction);
  return updated;
}

export async function updateLocalDiveDetails(
  id: string,
  details: {
    location?: string | null;
    buddy: string | null;
    notes: string | null;
    cylinderPresetId?: string | null;
    cylinderVolumeL?: number | null;
    startPressureBar?: number | null;
    endPressureBar?: number | null;
  },
) {
  return updateDive(id, (dive) => ({
    ...dive,
    location:
      details.location === undefined
        ? dive.location
        : details.location?.trim() || null,
    buddy: details.buddy?.trim() || null,
    notes: details.notes?.trim() || null,
    cylinderPresetId: details.cylinderPresetId ?? dive.cylinderPresetId ?? null,
    cylinderVolumeL: details.cylinderVolumeL ?? dive.cylinderVolumeL ?? null,
    tankPressuresStartBar:
      details.startPressureBar === undefined
        ? dive.tankPressuresStartBar
        : replaceFirstPressure(dive.tankPressuresStartBar, details.startPressureBar),
    tankPressuresEndBar:
      details.endPressureBar === undefined
        ? dive.tankPressuresEndBar
        : replaceFirstPressure(dive.tankPressuresEndBar, details.endPressureBar),
  }));
}

function replaceFirstPressure(
  pressures: Array<number | null>,
  value: number | null,
) {
  const next = pressures.length ? [...pressures] : [null];
  next[0] = value;
  return next;
}

export async function listLocalSiteContributions() {
  const database = await openDatabase();
  const contributions = await request<LocalSiteContribution[]>(
    database
      .transaction(SITE_CONTRIBUTIONS_STORE)
      .objectStore(SITE_CONTRIBUTIONS_STORE)
      .getAll(),
  );
  return contributions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateLocalDiveLocation(
  id: string,
  location: { label: string; city: string | null; country: string | null },
) {
  return updateDive(id, (dive) => ({
    ...dive,
    resolvedLocation: location.label,
    resolvedCity: location.city,
    resolvedCountry: location.country,
  }));
}

export async function updateLocalDiveCategory(
  id: string,
  category: DiveCategory,
) {
  return updateDive(id, (dive) => ({
    ...dive,
    category,
    categorySource: "user",
  }));
}

export async function listLocalTrips() {
  const database = await openDatabase();
  const trips = await request<LocalTrip[]>(
    database.transaction(TRIPS_STORE).objectStore(TRIPS_STORE).getAll(),
  );
  return trips.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createLocalTrip(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Enter a trip name.");
  const trip: LocalTrip = {
    id: crypto.randomUUID(),
    name: normalizedName,
    updatedAt: new Date().toISOString(),
  };
  const database = await openDatabase();
  const transaction = database.transaction(TRIPS_STORE, "readwrite");
  transaction.objectStore(TRIPS_STORE).put(trip);
  await transactionComplete(transaction);
  return trip;
}

export async function renameLocalTrip(id: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Enter a trip name.");
  const database = await openDatabase();
  const transaction = database.transaction(TRIPS_STORE, "readwrite");
  const store = transaction.objectStore(TRIPS_STORE);
  const trip = await request<LocalTrip | undefined>(store.get(id));
  if (!trip) {
    transaction.abort();
    throw new Error("Trip not found.");
  }
  const updated: LocalTrip = {
    ...trip,
    name: normalizedName,
    updatedAt: new Date().toISOString(),
  };
  store.put(updated);
  await transactionComplete(transaction);
  return updated;
}

export async function deleteLocalTrip(
  id: string,
  options?: { clearAssignments?: boolean },
) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [TRIPS_STORE, DIVES_STORE],
    "readwrite",
  );
  const tripsStore = transaction.objectStore(TRIPS_STORE);
  const divesStore = transaction.objectStore(DIVES_STORE);
  const trip = await request<LocalTrip | undefined>(tripsStore.get(id));
  if (!trip) {
    transaction.abort();
    throw new Error("Trip not found.");
  }
  const assignedDives = await request<LocalDive[]>(
    divesStore.index("tripId").getAll(id),
  );
  if (assignedDives.length > 0 && !options?.clearAssignments) {
    transaction.abort();
    throw new Error("Remove dives from this trip before deleting it.");
  }
  if (options?.clearAssignments) {
    assignedDives.forEach((dive) =>
      divesStore.put({ ...hydrateDive(dive), tripId: null }),
    );
  }
  tripsStore.delete(id);
  await transactionComplete(transaction);
}

export async function setLocalDiveTripId(
  diveId: string,
  tripId: string | null,
) {
  if (tripId !== null) {
    const database = await openDatabase();
    const trip = await request<LocalTrip | undefined>(
      database.transaction(TRIPS_STORE).objectStore(TRIPS_STORE).get(tripId),
    );
    if (!trip) throw new Error("Trip not found.");
  }
  return updateDive(diveId, (dive) => ({ ...dive, tripId }));
}

export async function setLocalDiveTripIds(
  diveIds: string[],
  tripId: string | null,
) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [DIVES_STORE, TRIPS_STORE],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const tripsStore = transaction.objectStore(TRIPS_STORE);
  if (tripId !== null) {
    const trip = await request<LocalTrip | undefined>(tripsStore.get(tripId));
    if (!trip) {
      transaction.abort();
      throw new Error("Trip not found.");
    }
  }
  for (const diveId of diveIds) {
    const dive = await request<LocalDive | undefined>(divesStore.get(diveId));
    if (!dive) {
      transaction.abort();
      throw new Error("Dive not found in this browser.");
    }
    divesStore.put({ ...hydrateDive(dive), tripId });
  }
  await transactionComplete(transaction);
}

export async function updateLocalDiveUserGps(
  id: string,
  gps: { lat: number; lng: number; source: UserGpsSource } | null,
) {
  const now = new Date().toISOString();
  return updateDive(id, (dive) => {
    if (gps === null) {
      return {
        ...dive,
        userGpsLat: null,
        userGpsLng: null,
        userGpsSource: null,
        userGpsUpdatedAt: null,
      };
    }
    return {
      ...dive,
      userGpsLat: gps.lat,
      userGpsLng: gps.lng,
      userGpsSource: gps.source,
      userGpsUpdatedAt: now,
    };
  });
}

export async function getLocalComposerSettings(diveId: string) {
  const database = await openDatabase();
  return request<ComposerSettings | undefined>(
    database
      .transaction(COMPOSER_SETTINGS_STORE)
      .objectStore(COMPOSER_SETTINGS_STORE)
      .get(diveId),
  );
}

export async function saveLocalComposerSettings(settings: ComposerSettings) {
  const database = await openDatabase();
  const transaction = database.transaction(COMPOSER_SETTINGS_STORE, "readwrite");
  transaction
    .objectStore(COMPOSER_SETTINGS_STORE)
    .put({ ...settings, updatedAt: new Date().toISOString() });
  await transactionComplete(transaction);
}

export async function listLocalComposerPresets() {
  const database = await openDatabase();
  const presets = await request<LocalComposerPreset[]>(
    database
      .transaction(COMPOSER_PRESETS_STORE)
      .objectStore(COMPOSER_PRESETS_STORE)
      .getAll(),
  );
  return presets.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveLocalComposerPreset(
  name: string,
  settings: ComposerPresetSettings,
) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Enter a name for this preset.");
  const id = `composer-preset:${encodeURIComponent(
    normalizedName.normalize("NFKC").toLowerCase(),
  )}`;
  const database = await openDatabase();
  const transaction = database.transaction(COMPOSER_PRESETS_STORE, "readwrite");
  const store = transaction.objectStore(COMPOSER_PRESETS_STORE);
  const existing = await request<LocalComposerPreset | undefined>(store.get(id));
  const timestamp = new Date().toISOString();
  const preset: LocalComposerPreset = {
    id,
    name: normalizedName,
    settings,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  store.put(preset);
  await transactionComplete(transaction);
  return preset;
}

export async function deleteLocalComposerPreset(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(COMPOSER_PRESETS_STORE, "readwrite");
  transaction.objectStore(COMPOSER_PRESETS_STORE).delete(id);
  await transactionComplete(transaction);
}

export async function requestPersistentLocalStorage() {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
}

export type LocalStoragePersistenceStatus = {
  mode: "persistent" | "best-effort" | "unsupported";
  usage: number | null;
  quota: number | null;
};

export async function getLocalStoragePersistenceStatus(
  requestPersistence = false,
): Promise<LocalStoragePersistenceStatus> {
  if (!navigator.storage) {
    return { mode: "unsupported", usage: null, quota: null };
  }
  let persistent = await navigator.storage.persisted?.();
  if (!persistent && requestPersistence && navigator.storage.persist) {
    persistent = await navigator.storage.persist();
  }
  const estimate = await navigator.storage.estimate?.();
  return {
    mode:
      persistent === true
        ? "persistent"
        : "best-effort",
    usage: Number.isFinite(estimate?.usage) ? estimate!.usage! : null,
    quota: Number.isFinite(estimate?.quota) ? estimate!.quota! : null,
  };
}

export async function exportLocalBackupSnapshot(): Promise<LocalBackupSnapshot> {
  const database = await openDatabase();
  const transaction = database.transaction([...ALL_STORE_NAMES]);
  const [
    dives,
    sourceRecords,
    attachments,
    siteContributions,
    composerSettings,
    composerPresets,
    backgrounds,
    brandingAssets,
    appPreferences,
    rawDiveRecords,
    deviceCheckpoints,
    trips,
    supplementaryCatalog,
  ] = await Promise.all([
    request<LocalDive[]>(transaction.objectStore(DIVES_STORE).getAll()),
    request<SourceRecord[]>(transaction.objectStore(SOURCES_STORE).getAll()),
    request<LocalAttachment[]>(transaction.objectStore(ATTACHMENTS_STORE).getAll()),
    request<LocalSiteContribution[]>(
      transaction.objectStore(SITE_CONTRIBUTIONS_STORE).getAll(),
    ),
    request<ComposerSettings[]>(
      transaction.objectStore(COMPOSER_SETTINGS_STORE).getAll(),
    ),
    request<LocalComposerPreset[]>(
      transaction.objectStore(COMPOSER_PRESETS_STORE).getAll(),
    ),
    request<LocalBackground[]>(transaction.objectStore(BACKGROUNDS_STORE).getAll()),
    request<LocalBrandingAsset[]>(
      transaction.objectStore(BRANDING_ASSETS_STORE).getAll(),
    ),
    request<LocalAppPreferences[]>(
      transaction.objectStore(APP_PREFERENCES_STORE).getAll(),
    ),
    request<LocalRawDiveRecord[]>(
      transaction.objectStore(RAW_DIVE_RECORDS_STORE).getAll(),
    ),
    request<LocalDeviceCheckpoint[]>(
      transaction.objectStore(DEVICE_CHECKPOINTS_STORE).getAll(),
    ),
    request<LocalTrip[]>(transaction.objectStore(TRIPS_STORE).getAll()),
    request<LocalSupplementaryCatalog[]>(
      transaction.objectStore(SUPPLEMENTARY_CATALOG_STORE).getAll(),
    ),
  ]);
  return {
    dives: dives.map(hydrateDive),
    sourceRecords,
    attachments,
    siteContributions,
    composerSettings,
    composerPresets,
    backgrounds,
    brandingAssets,
    appPreferences,
    rawDiveRecords,
    deviceCheckpoints,
    trips,
    supplementaryCatalog,
  };
}

export async function importLocalBackupSnapshot(
  snapshot: LocalBackupSnapshot,
  mode: BackupImportMode = "merge",
) {
  const database = await openDatabase();
  const transaction = database.transaction([...ALL_STORE_NAMES], "readwrite");
  const recordsByStore: Array<[string, unknown[]]> = [
    [DIVES_STORE, snapshot.dives],
    [SOURCES_STORE, snapshot.sourceRecords],
    [ATTACHMENTS_STORE, snapshot.attachments],
    [SITE_CONTRIBUTIONS_STORE, snapshot.siteContributions],
    [COMPOSER_SETTINGS_STORE, snapshot.composerSettings],
    [COMPOSER_PRESETS_STORE, snapshot.composerPresets],
    [BACKGROUNDS_STORE, snapshot.backgrounds],
    [BRANDING_ASSETS_STORE, snapshot.brandingAssets],
    [APP_PREFERENCES_STORE, snapshot.appPreferences],
    [RAW_DIVE_RECORDS_STORE, snapshot.rawDiveRecords],
    [DEVICE_CHECKPOINTS_STORE, snapshot.deviceCheckpoints],
    [TRIPS_STORE, snapshot.trips],
    [SUPPLEMENTARY_CATALOG_STORE, snapshot.supplementaryCatalog],
  ];
  const replacedStoreNames = new Set(
    mode === "replace"
      ? ALL_STORE_NAMES
      : mode === "replace-dives"
        ? storeNamesForErase("dive-data-only")
        : [],
  );
  const storesToImport =
    mode === "replace-dives"
      ? recordsByStore.filter(([storeName]) => replacedStoreNames.has(storeName as (typeof ALL_STORE_NAMES)[number]))
      : recordsByStore;
  if (replacedStoreNames.size > 0) {
    for (const storeName of replacedStoreNames) {
      transaction.objectStore(storeName).clear();
    }
  }
  for (const [storeName, records] of storesToImport) {
    const store = transaction.objectStore(storeName);
    records.forEach((record) => store.put(record));
  }
  await transactionComplete(transaction);
  const importedStore = (storeName: string) =>
    storesToImport.some(([name]) => name === storeName);
  return {
    mode,
    dives: snapshot.dives.length,
    photos: importedStore(ATTACHMENTS_STORE) ? snapshot.attachments.length : 0,
    backgrounds: importedStore(BACKGROUNDS_STORE) ? snapshot.backgrounds.length : 0,
    siteContributions: importedStore(SITE_CONTRIBUTIONS_STORE)
      ? snapshot.siteContributions.length
      : 0,
    rawDiveRecords: importedStore(RAW_DIVE_RECORDS_STORE)
      ? snapshot.rawDiveRecords.length
      : 0,
    trips: importedStore(TRIPS_STORE) ? snapshot.trips.length : 0,
  };
}

export async function clearLocalDivePhotos() {
  const database = await openDatabase();
  const transaction = database.transaction(
    [ATTACHMENTS_STORE, DIVES_STORE],
    "readwrite",
  );
  const attachmentsStore = transaction.objectStore(ATTACHMENTS_STORE);
  const divesStore = transaction.objectStore(DIVES_STORE);
  const [attachments, dives] = await Promise.all([
    request<LocalAttachment[]>(attachmentsStore.getAll()),
    request<LocalDive[]>(divesStore.getAll()),
  ]);
  attachmentsStore.clear();
  dives.forEach((dive) => {
    if (dive.photoCount) divesStore.put({ ...dive, photoCount: 0 });
  });
  await transactionComplete(transaction);
  return attachments.length;
}

export async function getLocalBackupSizeEstimate() {
  const snapshot = await exportLocalBackupSnapshot();
  const attachments = snapshot.attachments.map(withoutBlob);
  const backgrounds = snapshot.backgrounds.map(withoutBlob);
  const brandingAssets = snapshot.brandingAssets.map(withoutBlob);
  const rawDiveRecords = snapshot.rawDiveRecords.map((record) => {
    const { rawBytes: _rawBytes, ...metadata } = record;
    return metadata;
  });
  const deviceCheckpoints = snapshot.deviceCheckpoints.map((record) => {
    const { fingerprint: _fingerprint, ...metadata } = record;
    return metadata;
  });
  const metadataBytes = new Blob([
    JSON.stringify({
      ...snapshot,
      attachments,
      backgrounds,
      brandingAssets,
      rawDiveRecords,
      deviceCheckpoints,
    }),
  ]).size;
  const mediaBytes = [
    ...snapshot.attachments,
    ...snapshot.backgrounds,
    ...snapshot.brandingAssets,
  ].reduce((total, record) => total + record.size, 0);
  const rawBytes = snapshot.rawDiveRecords.reduce(
    (total, record) => total + record.rawBytes.size,
    0,
  );
  const fingerprintBytes = snapshot.deviceCheckpoints.reduce(
    (total, record) => total + record.fingerprint.size,
    0,
  );
  const binaryBytes = mediaBytes + rawBytes + fingerprintBytes;
  return {
    mediaBytes,
    rawBytes,
    estimatedBackupBytes: metadataBytes + Math.ceil((binaryBytes * 4) / 3),
    divePhotos: snapshot.attachments.length,
    backgrounds: snapshot.backgrounds.length,
    rawDiveRecords: snapshot.rawDiveRecords.length,
  };
}

export async function optimizeLocalStoredPhotos(
  quality = 0.88,
  maxDimension = 2560,
) {
  const database = await openDatabase();
  const readTransaction = database.transaction([
    ATTACHMENTS_STORE,
    BACKGROUNDS_STORE,
  ]);
  const [attachments, backgrounds] = await Promise.all([
    request<LocalAttachment[]>(
      readTransaction.objectStore(ATTACHMENTS_STORE).getAll(),
    ),
    request<LocalBackground[]>(
      readTransaction.objectStore(BACKGROUNDS_STORE).getAll(),
    ),
  ]);
  const updatedAttachments: LocalAttachment[] = [];
  const updatedBackgrounds: LocalBackground[] = [];
  let beforeBytes = 0;
  let afterBytes = 0;
  for (const attachment of attachments) {
    beforeBytes += attachment.size;
    const blob = await optimizedJpeg(
      attachment.blob,
      attachment.contentType,
      quality,
      maxDimension,
    );
    const updated =
      blob && blob.size < attachment.size
        ? withOptimizedJpeg(attachment, blob)
        : attachment;
    afterBytes += updated.size;
    if (updated !== attachment) updatedAttachments.push(updated);
  }
  for (const background of backgrounds) {
    beforeBytes += background.size;
    const blob = await optimizedJpeg(
      background.blob,
      background.contentType,
      quality,
      maxDimension,
    );
    const updated =
      blob && blob.size < background.size
        ? withOptimizedJpeg(background, blob)
        : background;
    afterBytes += updated.size;
    if (updated !== background) updatedBackgrounds.push(updated);
  }
  if (updatedAttachments.length || updatedBackgrounds.length) {
    const transaction = database.transaction(
      [ATTACHMENTS_STORE, BACKGROUNDS_STORE],
      "readwrite",
    );
    updatedAttachments.forEach((record) =>
      transaction.objectStore(ATTACHMENTS_STORE).put(record),
    );
    updatedBackgrounds.forEach((record) =>
      transaction.objectStore(BACKGROUNDS_STORE).put(record),
    );
    await transactionComplete(transaction);
  }
  return {
    examined: attachments.length + backgrounds.length,
    optimized: updatedAttachments.length + updatedBackgrounds.length,
    beforeBytes,
    afterBytes,
  };
}

export async function mergeLocalDuplicateDives(
  keepId: string,
  removeId: string,
) {
  if (keepId === removeId) throw new Error("Choose two different dives.");
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      DIVES_STORE,
      SOURCES_STORE,
      ATTACHMENTS_STORE,
      SITE_CONTRIBUTIONS_STORE,
      COMPOSER_SETTINGS_STORE,
      RAW_DIVE_RECORDS_STORE,
    ],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const sourcesStore = transaction.objectStore(SOURCES_STORE);
  const attachmentsStore = transaction.objectStore(ATTACHMENTS_STORE);
  const contributionsStore = transaction.objectStore(SITE_CONTRIBUTIONS_STORE);
  const composerSettingsStore = transaction.objectStore(COMPOSER_SETTINGS_STORE);
  const rawStore = transaction.objectStore(RAW_DIVE_RECORDS_STORE);
  const [keepRaw, removeRaw, attachments, sources, keepContribution, removeContribution, keepSettings, removeSettings, rawRecords] =
    await Promise.all([
      request<LocalDive | undefined>(divesStore.get(keepId)),
      request<LocalDive | undefined>(divesStore.get(removeId)),
      request<LocalAttachment[]>(
        attachmentsStore.index("diveId").getAll(removeId),
      ),
      request<SourceRecord[]>(sourcesStore.getAll()),
      request<LocalSiteContribution | undefined>(contributionsStore.get(keepId)),
      request<LocalSiteContribution | undefined>(contributionsStore.get(removeId)),
      request<ComposerSettings | undefined>(composerSettingsStore.get(keepId)),
      request<ComposerSettings | undefined>(composerSettingsStore.get(removeId)),
      request<LocalRawDiveRecord[]>(rawStore.index("diveId").getAll(removeId)),
    ]);
  if (!keepRaw || !removeRaw) {
    transaction.abort();
    throw new Error("One of these dives no longer exists.");
  }
  const keep = hydrateDive(keepRaw);
  const remove = hydrateDive(removeRaw);
  const merged = mergeStoredDives(keep, remove, attachments.length);
  divesStore.put(merged);
  divesStore.delete(removeId);
  attachments.forEach((attachment) =>
    attachmentsStore.put({ ...attachment, diveId: keepId }),
  );
  rawRecords.forEach((record) =>
    rawStore.put({ ...record, diveId: keepId }),
  );
  sources.forEach((record) => {
    if (record.diveId === removeId) {
      sourcesStore.put({ ...record, diveId: keepId });
    }
  });
  if (!keepContribution && removeContribution) {
    contributionsStore.put({
      ...removeContribution,
      id: keepId,
      diveId: keepId,
    });
  }
  contributionsStore.delete(removeId);
  if (!keepSettings && removeSettings) {
    composerSettingsStore.put({
      ...removeSettings,
      id: keepId,
      diveId: keepId,
    });
  }
  composerSettingsStore.delete(removeId);
  await transactionComplete(transaction);
  return {
    keptDiveId: keepId,
    removedDiveId: removeId,
    movedPhotos: attachments.length,
    mergedSources: merged.sources.length,
  };
}

export async function clearAllLocalData() {
  const database = await openDatabase();
  const storeNames = storeNamesForErase("all-data");
  const transaction = database.transaction(storeNames, "readwrite");
  for (const storeName of storeNames) {
    transaction.objectStore(storeName).clear();
  }
  await transactionComplete(transaction);
}

export async function clearLocalDiveData() {
  const database = await openDatabase();
  const storeNames = storeNamesForErase("dive-data-only");
  const transaction = database.transaction(storeNames, "readwrite");
  for (const storeName of storeNames) {
    transaction.objectStore(storeName).clear();
  }
  await transactionComplete(transaction);
}

async function updateDive(id: string, change: (dive: LocalDive) => LocalDive) {
  const database = await openDatabase();
  const transaction = database.transaction(DIVES_STORE, "readwrite");
  const store = transaction.objectStore(DIVES_STORE);
  const dive = await request<LocalDive | undefined>(store.get(id));
  if (!dive) {
    transaction.abort();
    throw new Error("Dive not found in this browser.");
  }
  const updated = change(hydrateDive(dive));
  store.put(updated);
  await transactionComplete(transaction);
  return updated;
}

function mergeDive(
  id: string,
  existing: LocalDive | undefined,
  incoming: LocalImportedDive,
  importedAt: string,
): LocalDive {
  existing = existing ? hydrateDive(existing) : undefined;
  const preferIncoming =
    incoming.source === "shearwater" || incoming.source === "shearwater-ble";
  const core = <T>(next: T | null, current: T | null | undefined) =>
    preferIncoming && next !== null ? next : (current ?? next);
  const sources = new Set(existing?.sources ?? []);
  sources.add(incoming.source);
  const sourceDiveNumbers = {
    ...(existing?.sourceDiveNumbers ?? {}),
    [incoming.source]: incoming.diveNumber,
  };
  const sourceSiteNames = {
    ...(existing?.sourceSiteNames ?? {}),
    [incoming.source]:
      incoming.site ?? existing?.sourceSiteNames?.[incoming.source] ?? null,
  };
  if (
    sourceDiveNumbers.shearwater === undefined &&
    existing?.sources.includes("shearwater")
  ) {
    sourceDiveNumbers.shearwater = existing.diveNumber;
  }
  const sourceSuppliesSite = Boolean(incoming.site);

  return {
    id,
    diveNumber: core(incoming.diveNumber, existing?.diveNumber),
    diveDate: core(incoming.diveDate, existing?.diveDate),
    lastModified: core(incoming.lastModified, existing?.lastModified),
    depth: core(incoming.depth, existing?.depth),
    averageDepth: core(incoming.averageDepth, existing?.averageDepth),
    minTemp: core(incoming.minTemp, existing?.minTemp),
    maxTemp: core(incoming.maxTemp, existing?.maxTemp),
    lengthText: core(incoming.lengthText, existing?.lengthText),
    durationSeconds: core(incoming.durationSeconds, existing?.durationSeconds),
    location: existing?.location ?? incoming.location,
    site: existing?.site ?? incoming.site,
    buddy: existing?.buddy ?? incoming.buddy,
    notes: existing?.notes ?? incoming.notes,
    serialNumber: core(incoming.serialNumber, existing?.serialNumber),
    gpsEntryLat: existing?.gpsEntryLat ?? incoming.gpsEntryLat,
    gpsEntryLng: existing?.gpsEntryLng ?? incoming.gpsEntryLng,
    gpsExitLat: existing?.gpsExitLat ?? incoming.gpsExitLat,
    gpsExitLng: existing?.gpsExitLng ?? incoming.gpsExitLng,
    calculatedJson: core(incoming.calculatedJson, existing?.calculatedJson),
    category:
      existing?.categorySource === "user"
        ? existing.category
        : preferIncoming
          ? incoming.category
          : (existing?.category ?? incoming.category),
    categorySource:
      existing?.categorySource === "user"
        ? "user"
        : preferIncoming
          ? incoming.categorySource
          : (existing?.categorySource ?? incoming.categorySource),
    maxDepthM: core(incoming.maxDepthM, existing?.maxDepthM),
    waterTemperatureC: core(
      incoming.waterTemperatureC,
      existing?.waterTemperatureC,
    ),
    gasMixes:
      incoming.gasMixes.length > 0
        ? incoming.gasMixes
        : (existing?.gasMixes ?? []),
    computerModel: core(incoming.computerModel, existing?.computerModel),
    samples: preferRicherSamples(existing?.samples, incoming.samples),
    tankPressuresStartBar: preferPopulatedArray(
      existing?.tankPressuresStartBar,
      incoming.tankPressuresStartBar,
    ),
    tankPressuresEndBar: preferPopulatedArray(
      existing?.tankPressuresEndBar,
      incoming.tankPressuresEndBar,
    ),
    cylinderPresetId:
      existing?.cylinderPresetId ?? incoming.cylinderPresetId ?? null,
    cylinderVolumeL:
      existing?.cylinderVolumeL ?? incoming.cylinderVolumeL ?? null,
    userSite: sourceSuppliesSite ? null : (existing?.userSite ?? null),
    userSiteSource: sourceSuppliesSite ? null : (existing?.userSiteSource ?? null),
    userSiteCatalogId: sourceSuppliesSite
      ? null
      : (existing?.userSiteCatalogId ?? null),
    userSiteUpdatedAt: sourceSuppliesSite
      ? null
      : (existing?.userSiteUpdatedAt ?? null),
    userGpsLat: existing?.userGpsLat ?? null,
    userGpsLng: existing?.userGpsLng ?? null,
    userGpsSource: existing?.userGpsSource ?? null,
    userGpsUpdatedAt: existing?.userGpsUpdatedAt ?? null,
    exportGpsPreference: existing?.exportGpsPreference ?? "computer",
    tripId: existing?.tripId ?? null,
    resolvedLocation: existing?.resolvedLocation ?? null,
    resolvedCity: existing?.resolvedCity ?? null,
    resolvedCountry: existing?.resolvedCountry ?? null,
    importedAt,
    photoCount: existing?.photoCount ?? 0,
    sources: [...sources],
    sourceDiveNumbers,
    sourceSiteNames,
  };
}

function mergeStoredDives(
  keep: LocalDive,
  remove: LocalDive,
  movedPhotoCount: number,
): LocalDive {
  const value = <T>(preferred: T | null | undefined, fallback: T | null | undefined) =>
    preferred ?? fallback ?? null;
  const sources = [...new Set([...keep.sources, ...remove.sources])];
  return {
    ...remove,
    ...keep,
    diveNumber: value(keep.diveNumber, remove.diveNumber),
    diveDate: value(keep.diveDate, remove.diveDate),
    lastModified: value(keep.lastModified, remove.lastModified),
    depth: value(keep.depth, remove.depth),
    averageDepth: value(keep.averageDepth, remove.averageDepth),
    minTemp: value(keep.minTemp, remove.minTemp),
    maxTemp: value(keep.maxTemp, remove.maxTemp),
    lengthText: value(keep.lengthText, remove.lengthText),
    durationSeconds: value(keep.durationSeconds, remove.durationSeconds),
    location: value(keep.location, remove.location),
    site: value(keep.site, remove.site),
    buddy: value(keep.buddy, remove.buddy),
    notes: value(keep.notes, remove.notes),
    serialNumber: value(keep.serialNumber, remove.serialNumber),
    gpsEntryLat: value(keep.gpsEntryLat, remove.gpsEntryLat),
    gpsEntryLng: value(keep.gpsEntryLng, remove.gpsEntryLng),
    gpsExitLat: value(keep.gpsExitLat, remove.gpsExitLat),
    gpsExitLng: value(keep.gpsExitLng, remove.gpsExitLng),
    calculatedJson: value(keep.calculatedJson, remove.calculatedJson),
    maxDepthM: value(keep.maxDepthM, remove.maxDepthM),
    waterTemperatureC: value(
      keep.waterTemperatureC,
      remove.waterTemperatureC,
    ),
    gasMixes: keep.gasMixes.length ? keep.gasMixes : remove.gasMixes,
    computerModel: value(keep.computerModel, remove.computerModel),
    samples: preferRicherSamples(keep.samples, remove.samples),
    tankPressuresStartBar: preferPopulatedArray(
      keep.tankPressuresStartBar,
      remove.tankPressuresStartBar,
    ),
    tankPressuresEndBar: preferPopulatedArray(
      keep.tankPressuresEndBar,
      remove.tankPressuresEndBar,
    ),
    cylinderPresetId: value(keep.cylinderPresetId, remove.cylinderPresetId),
    cylinderVolumeL: value(keep.cylinderVolumeL, remove.cylinderVolumeL),
    userSite: value(keep.userSite, remove.userSite),
    userSiteSource: value(keep.userSiteSource, remove.userSiteSource),
    userSiteCatalogId: value(
      keep.userSiteCatalogId,
      remove.userSiteCatalogId,
    ),
    userSiteUpdatedAt: value(
      keep.userSiteUpdatedAt,
      remove.userSiteUpdatedAt,
    ),
    userGpsLat: value(keep.userGpsLat, remove.userGpsLat),
    userGpsLng: value(keep.userGpsLng, remove.userGpsLng),
    userGpsSource: value(keep.userGpsSource, remove.userGpsSource),
    userGpsUpdatedAt: value(keep.userGpsUpdatedAt, remove.userGpsUpdatedAt),
    exportGpsPreference:
      keep.exportGpsPreference ?? remove.exportGpsPreference ?? "computer",
    tripId: value(keep.tripId, remove.tripId),
    resolvedLocation: value(keep.resolvedLocation, remove.resolvedLocation),
    resolvedCity: value(keep.resolvedCity, remove.resolvedCity),
    resolvedCountry: value(keep.resolvedCountry, remove.resolvedCountry),
    importedAt:
      keep.importedAt > remove.importedAt ? keep.importedAt : remove.importedAt,
    photoCount: keep.photoCount + movedPhotoCount,
    sources,
    sourceDiveNumbers: {
      ...remove.sourceDiveNumbers,
      ...keep.sourceDiveNumbers,
    },
    sourceSiteNames: {
      ...remove.sourceSiteNames,
      ...keep.sourceSiteNames,
    },
  };
}

async function optimizedJpeg(
  source: Blob,
  contentType: string,
  quality: number,
  maxDimension: number,
) {
  if (
    !contentType.startsWith("image/") ||
    contentType === "image/svg+xml" ||
    typeof document === "undefined"
  ) {
    return null;
  }
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("A stored image could not be decoded."));
      element.src = url;
    });
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#081a22";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function withoutBlob<T extends { blob: Blob }>(record: T): Omit<T, "blob"> {
  const copy: Record<string, unknown> = { ...record };
  delete copy.blob;
  return copy as Omit<T, "blob">;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const operation = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    operation.onupgradeneeded = (event) => {
      const database = operation.result;
      const previousVersion = event.oldVersion;
      if (previousVersion > 0 && previousVersion < 8) {
        for (const storeName of Array.from(database.objectStoreNames)) {
          database.deleteObjectStore(storeName);
        }
        createV8ObjectStores(database);
      } else if (previousVersion === 0) {
        createV8ObjectStores(database);
      }
      if (previousVersion < 9) {
        createV9ObjectStores(database);
      }
      // v9 was additive, but some origins may have been opened by a build
      // that recorded version 9 before every store was present. Repair only
      // missing stores on v10; never delete or rewrite existing data.
      if (previousVersion < 10) {
        createV10ObjectStores(database);
      }
    };
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () =>
      reject(operation.error ?? new Error("Local storage could not be opened."));
    operation.onblocked = () =>
      reject(new Error("Close other DiveFrame tabs and try again."));
  });
}

function createV8ObjectStores(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(DIVES_STORE)) {
    const diveStore = database.createObjectStore(DIVES_STORE, { keyPath: "id" });
    diveStore.createIndex("tripId", "tripId", { unique: false });
  }
  if (!database.objectStoreNames.contains(SOURCES_STORE)) {
    const sourceStore = database.createObjectStore(SOURCES_STORE, {
      keyPath: "key",
    });
    sourceStore.createIndex("diveId", "diveId");
  }
  if (!database.objectStoreNames.contains(ATTACHMENTS_STORE)) {
    const attachmentStore = database.createObjectStore(ATTACHMENTS_STORE, {
      keyPath: "id",
    });
    attachmentStore.createIndex("diveId", "diveId");
  }
  if (!database.objectStoreNames.contains(SITE_CONTRIBUTIONS_STORE)) {
    database.createObjectStore(SITE_CONTRIBUTIONS_STORE, {
      keyPath: "id",
    });
  }
  if (!database.objectStoreNames.contains(COMPOSER_SETTINGS_STORE)) {
    database.createObjectStore(COMPOSER_SETTINGS_STORE, {
      keyPath: "id",
    });
  }
  if (!database.objectStoreNames.contains(COMPOSER_PRESETS_STORE)) {
    database.createObjectStore(COMPOSER_PRESETS_STORE, {
      keyPath: "id",
    });
  }
  if (!database.objectStoreNames.contains(BACKGROUNDS_STORE)) {
    database.createObjectStore(BACKGROUNDS_STORE, { keyPath: "id" });
  }
  if (!database.objectStoreNames.contains(BRANDING_ASSETS_STORE)) {
    database.createObjectStore(BRANDING_ASSETS_STORE, { keyPath: "id" });
  }
  if (!database.objectStoreNames.contains(APP_PREFERENCES_STORE)) {
    database.createObjectStore(APP_PREFERENCES_STORE, { keyPath: "id" });
  }
  if (!database.objectStoreNames.contains(RAW_DIVE_RECORDS_STORE)) {
    const rawStore = database.createObjectStore(RAW_DIVE_RECORDS_STORE, {
      keyPath: "id",
    });
    rawStore.createIndex("diveId", "diveId");
  }
  if (!database.objectStoreNames.contains(DEVICE_CHECKPOINTS_STORE)) {
    database.createObjectStore(DEVICE_CHECKPOINTS_STORE, { keyPath: "id" });
  }
  if (!database.objectStoreNames.contains(TRIPS_STORE)) {
    database.createObjectStore(TRIPS_STORE, { keyPath: "id" });
  }
}

function createV9ObjectStores(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(SUPPLEMENTARY_CATALOG_STORE)) {
    database.createObjectStore(SUPPLEMENTARY_CATALOG_STORE, { keyPath: "id" });
  }
}

function createV10ObjectStores(database: IDBDatabase) {
  createV8ObjectStores(database);
  createV9ObjectStores(database);
}

function request<T>(operation: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () =>
      reject(operation.error ?? new Error("Local storage operation failed."));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Local storage operation failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Local storage operation was cancelled."));
  });
}

function sourceKey(source: string, sourceId: string) {
  return `${source}\u0000${sourceId}`;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hydrateDive(dive: LocalDive): LocalDive {
  const durationSeconds =
    dive.durationSeconds ??
    (dive.lengthText !== null && Number.isFinite(Number(dive.lengthText))
      ? Number(dive.lengthText)
      : null);
  const maxDepthM = dive.maxDepthM ?? nullableNumber(dive.depth);
  const pressures = normalizeStoredPressurePairs(
    dive.tankPressuresStartBar ?? [],
    dive.tankPressuresEndBar ?? [],
  );
  return {
    ...dive,
    durationSeconds,
    category: dive.category ?? "scuba",
    categorySource: dive.categorySource ?? "default",
    maxDepthM,
    waterTemperatureC:
      dive.waterTemperatureC ?? dive.minTemp ?? dive.maxTemp ?? null,
    gasMixes: dive.gasMixes ?? [],
    computerModel: dive.computerModel ?? null,
    samples: dive.samples ?? [],
    tankPressuresStartBar: pressures.start,
    tankPressuresEndBar: pressures.end,
    userGpsLat: dive.userGpsLat ?? null,
    userGpsLng: dive.userGpsLng ?? null,
    userGpsSource: dive.userGpsSource ?? null,
    userGpsUpdatedAt: dive.userGpsUpdatedAt ?? null,
    exportGpsPreference: dive.exportGpsPreference ?? "computer",
    tripId: dive.tripId ?? null,
    sourceDiveNumbers: dive.sourceDiveNumbers ?? {},
    sourceSiteNames: dive.sourceSiteNames ?? {},
  };
}

function normalizeStoredPressurePairs(
  start: Array<number | null>,
  end: Array<number | null>,
) {
  const normalizedStart = [...start];
  const normalizedEnd = [...end];
  const count = Math.max(start.length, end.length);
  for (let index = 0; index < count; index += 1) {
    const normalized = normalizeShearwaterPressurePair(
      start[index] ?? null,
      end[index] ?? null,
    );
    normalizedStart[index] = normalized.start;
    normalizedEnd[index] = normalized.end;
  }
  return { start: normalizedStart, end: normalizedEnd };
}

function preferPopulatedArray(
  current: Array<number | null> | undefined,
  incoming: Array<number | null>,
) {
  const currentCount = current?.filter((value) => value !== null).length ?? 0;
  const incomingCount = incoming.filter((value) => value !== null).length;
  return incomingCount > currentCount ? incoming : (current ?? incoming);
}

function preferRicherSamples(
  current: DiveSample[] | undefined,
  incoming: DiveSample[],
) {
  if (!current?.length) return incoming;
  if (!incoming.length) return current;
  const score = (samples: DiveSample[]) =>
    samples.length +
    samples.filter((sample) => sample.temperatureC !== undefined).length +
    samples.reduce(
      (total, sample) =>
        total + sample.pressuresBar.filter(Number.isFinite).length * 2,
      0,
    );
  return score(incoming) > score(current) ? incoming : current;
}
