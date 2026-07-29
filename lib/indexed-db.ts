import type {
  DiveCategory,
  DiveSample,
  GasMix,
} from "./dive-model";
import type { ComposerSettings } from "./composer-settings";
import { findMatchingDive } from "./dive-matching";
import {
  canonicalDiveId,
  shouldPromoteCanonicalSource,
} from "./dive-identity";
import { normalizeShearwaterPressurePair } from "./gas-calculations";

export type DiveSource = "shearwater" | "subsurface" | "uddf" | "fit";

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
  blob: Blob;
};

export type LocalBackground = {
  id: string;
  fileName: string;
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
  uiLanguage: "en" | "zh-Hant";
  defaultCylinderPresetId?: string;
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
  backgrounds: LocalBackground[];
  brandingAssets: LocalBrandingAsset[];
  appPreferences: LocalAppPreferences[];
};

const DATABASE_NAME = "diveframe-local";
const DATABASE_VERSION = 6;
const DIVES_STORE = "dives";
const SOURCES_STORE = "sourceRecords";
const ATTACHMENTS_STORE = "attachments";
const SITE_CONTRIBUTIONS_STORE = "siteContributions";
const COMPOSER_SETTINGS_STORE = "composerSettings";
const BACKGROUNDS_STORE = "backgrounds";
const BRANDING_ASSETS_STORE = "brandingAssets";
const APP_PREFERENCES_STORE = "appPreferences";

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
    ],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const sourcesStore = transaction.objectStore(SOURCES_STORE);
  const contributionsStore = transaction.objectStore(SITE_CONTRIBUTIONS_STORE);
  const attachmentsStore = transaction.objectStore(ATTACHMENTS_STORE);
  const composerSettingsStore = transaction.objectStore(COMPOSER_SETTINGS_STORE);
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
) {
  if (previousId === nextId) return;
  const dive = divesById.get(previousId);
  if (!dive) return;

  const [attachments, contribution, composerSettings] = await Promise.all([
    request<LocalAttachment[]>(
      attachmentsStore.index("diveId").getAll(previousId),
    ),
    request<LocalSiteContribution | undefined>(
      contributionsStore.get(previousId),
    ),
    request<ComposerSettings | undefined>(
      composerSettingsStore.get(previousId),
    ),
  ]);

  divesStore.delete(previousId);
  divesById.delete(previousId);
  divesById.set(nextId, { ...dive, id: nextId });

  attachments.forEach((attachment) =>
    attachmentsStore.put({ ...attachment, diveId: nextId }),
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
    Pick<LocalAppPreferences, "uiLanguage" | "defaultCylinderPresetId">
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
    updatedAt: new Date().toISOString(),
  };
  const database = await openDatabase();
  const transaction = database.transaction(APP_PREFERENCES_STORE, "readwrite");
  transaction.objectStore(APP_PREFERENCES_STORE).put(saved);
  await transactionComplete(transaction);
  return saved;
}

export async function updateLocalDiveSite(
  id: string,
  selection: {
    name: string;
    source: "catalog" | "suggestion" | "manual";
    catalogId?: string;
    latitude: number | null;
    longitude: number | null;
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

export async function requestPersistentLocalStorage() {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
}

export async function exportLocalBackupSnapshot(): Promise<LocalBackupSnapshot> {
  const database = await openDatabase();
  const transaction = database.transaction([
    DIVES_STORE,
    SOURCES_STORE,
    ATTACHMENTS_STORE,
    SITE_CONTRIBUTIONS_STORE,
    COMPOSER_SETTINGS_STORE,
    BACKGROUNDS_STORE,
    BRANDING_ASSETS_STORE,
    APP_PREFERENCES_STORE,
  ]);
  const [
    dives,
    sourceRecords,
    attachments,
    siteContributions,
    composerSettings,
    backgrounds,
    brandingAssets,
    appPreferences,
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
    request<LocalBackground[]>(transaction.objectStore(BACKGROUNDS_STORE).getAll()),
    request<LocalBrandingAsset[]>(
      transaction.objectStore(BRANDING_ASSETS_STORE).getAll(),
    ),
    request<LocalAppPreferences[]>(
      transaction.objectStore(APP_PREFERENCES_STORE).getAll(),
    ),
  ]);
  return {
    dives: dives.map(hydrateDive),
    sourceRecords,
    attachments,
    siteContributions,
    composerSettings,
    backgrounds,
    brandingAssets,
    appPreferences,
  };
}

export async function importLocalBackupSnapshot(snapshot: LocalBackupSnapshot) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      DIVES_STORE,
      SOURCES_STORE,
      ATTACHMENTS_STORE,
      SITE_CONTRIBUTIONS_STORE,
      COMPOSER_SETTINGS_STORE,
      BACKGROUNDS_STORE,
      BRANDING_ASSETS_STORE,
      APP_PREFERENCES_STORE,
    ],
    "readwrite",
  );
  const recordsByStore: Array<[string, unknown[]]> = [
    [DIVES_STORE, snapshot.dives],
    [SOURCES_STORE, snapshot.sourceRecords],
    [ATTACHMENTS_STORE, snapshot.attachments],
    [SITE_CONTRIBUTIONS_STORE, snapshot.siteContributions],
    [COMPOSER_SETTINGS_STORE, snapshot.composerSettings],
    [BACKGROUNDS_STORE, snapshot.backgrounds],
    [BRANDING_ASSETS_STORE, snapshot.brandingAssets],
    [APP_PREFERENCES_STORE, snapshot.appPreferences],
  ];
  for (const [storeName, records] of recordsByStore) {
    const store = transaction.objectStore(storeName);
    records.forEach((record) => store.put(record));
  }
  await transactionComplete(transaction);
  return {
    dives: snapshot.dives.length,
    photos: snapshot.attachments.length,
    backgrounds: snapshot.backgrounds.length,
    siteContributions: snapshot.siteContributions.length,
  };
}

export async function clearAllLocalData() {
  const database = await openDatabase();
  const storeNames = [
    DIVES_STORE,
    SOURCES_STORE,
    ATTACHMENTS_STORE,
    SITE_CONTRIBUTIONS_STORE,
    COMPOSER_SETTINGS_STORE,
    BACKGROUNDS_STORE,
    BRANDING_ASSETS_STORE,
    APP_PREFERENCES_STORE,
  ];
  const transaction = database.transaction(storeNames, "readwrite");
  for (const storeName of storeNames) {
    transaction.objectStore(storeName).clear();
  }
  await transactionComplete(transaction);
}

export async function clearLocalDiveData() {
  const database = await openDatabase();
  const storeNames = [
    DIVES_STORE,
    SOURCES_STORE,
    SITE_CONTRIBUTIONS_STORE,
  ];
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
  const preferIncoming = incoming.source === "shearwater";
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

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const operation = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    operation.onupgradeneeded = () => {
      const database = operation.result;
      if (!database.objectStoreNames.contains(DIVES_STORE)) {
        database.createObjectStore(DIVES_STORE, { keyPath: "id" });
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
      if (!database.objectStoreNames.contains(BACKGROUNDS_STORE)) {
        database.createObjectStore(BACKGROUNDS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(BRANDING_ASSETS_STORE)) {
        database.createObjectStore(BRANDING_ASSETS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(APP_PREFERENCES_STORE)) {
        database.createObjectStore(APP_PREFERENCES_STORE, { keyPath: "id" });
      }
    };
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () =>
      reject(operation.error ?? new Error("Local storage could not be opened."));
    operation.onblocked = () =>
      reject(new Error("Close other DiveFrame tabs and try again."));
  });
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
