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
  userSite: string | null;
  resolvedLocation: string | null;
  resolvedCity: string | null;
  resolvedCountry: string | null;
  importedAt: string;
  photoCount: number;
  sources: string[];
};

export type LocalImportedDive = Omit<
  LocalDive,
  | "importedAt"
  | "photoCount"
  | "userSite"
  | "resolvedLocation"
  | "resolvedCity"
  | "resolvedCountry"
  | "sources"
> & {
  source: "shearwater" | "subsurface";
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

type SourceRecord = {
  key: string;
  source: LocalImportedDive["source"];
  sourceId: string;
  diveId: string;
  importedAt: string;
};

const DATABASE_NAME = "diveframe-local";
const DATABASE_VERSION = 1;
const DIVES_STORE = "dives";
const SOURCES_STORE = "sourceRecords";
const ATTACHMENTS_STORE = "attachments";

export async function listLocalDives() {
  const database = await openDatabase();
  const dives = await request<LocalDive[]>(
    database.transaction(DIVES_STORE).objectStore(DIVES_STORE).getAll(),
  );
  return dives.sort((a, b) => {
    const dateOrder = String(b.diveDate ?? "").localeCompare(String(a.diveDate ?? ""));
    return dateOrder || (b.diveNumber ?? 0) - (a.diveNumber ?? 0);
  });
}

export async function upsertLocalDives(importedDives: LocalImportedDive[]) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [DIVES_STORE, SOURCES_STORE],
    "readwrite",
  );
  const divesStore = transaction.objectStore(DIVES_STORE);
  const sourcesStore = transaction.objectStore(SOURCES_STORE);
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
    const canonicalId =
      mappedId ??
      (incoming.source === "shearwater" && divesById.has(incoming.id)
        ? incoming.id
        : findMatchingDive(incoming, [...divesById.values()])) ??
      (incoming.source === "shearwater"
        ? incoming.id
        : `subsurface:${incoming.sourceId}`);
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
  }

  await transactionComplete(transaction);
  return listLocalDives();
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

export async function updateLocalDiveSite(id: string, site: string) {
  return updateDive(id, (dive) => ({ ...dive, userSite: site }));
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

export async function requestPersistentLocalStorage() {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
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
  const updated = change(dive);
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
  const preferIncoming = incoming.source === "shearwater";
  const core = <T>(next: T | null, current: T | null | undefined) =>
    preferIncoming && next !== null ? next : (current ?? next);
  const sources = new Set(existing?.sources ?? []);
  sources.add(incoming.source);

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
    userSite: existing?.userSite ?? null,
    resolvedLocation: existing?.resolvedLocation ?? null,
    resolvedCity: existing?.resolvedCity ?? null,
    resolvedCountry: existing?.resolvedCountry ?? null,
    importedAt,
    photoCount: existing?.photoCount ?? 0,
    sources: [...sources],
  };
}

function findMatchingDive(incoming: LocalImportedDive, candidates: LocalDive[]) {
  if (!incoming.diveDate) return null;
  const incomingTime = parseDiveDate(incoming.diveDate);
  const incomingSerial = normalizeSerial(incoming.serialNumber);
  const incomingDepth = nullableNumber(incoming.depth);
  let best: { id: string; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateTime = parseDiveDate(candidate.diveDate);
    if (incomingTime === null || candidateTime === null) continue;
    const secondsApart = Math.abs(incomingTime - candidateTime) / 1000;
    if (secondsApart > 300) continue;
    const candidateSerial = normalizeSerial(candidate.serialNumber);
    const sameSerial =
      Boolean(incomingSerial) &&
      Boolean(candidateSerial) &&
      incomingSerial === candidateSerial;
    const candidateDepth = nullableNumber(candidate.depth);
    const depthApart =
      incomingDepth === null || candidateDepth === null
        ? 0
        : Math.abs(incomingDepth - candidateDepth);

    if (!sameSerial && (secondsApart > 90 || depthApart > 1)) continue;
    if (sameSerial && depthApart > 3) continue;
    const score = (sameSerial ? 10_000 : 0) - secondsApart - depthApart * 20;
    if (!best || score > best.score) best = { id: candidate.id, score };
  }

  return best?.id ?? null;
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

function normalizeSerial(value: string | null) {
  return value?.replace(/[^a-z0-9]/gi, "").toUpperCase() || null;
}

function parseDiveDate(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
