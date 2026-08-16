type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown, limit?: number) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      (limit === undefined || Math.abs(value) <= limit))
  );
}

function isOptionalArray(value: unknown) {
  return value === undefined || Array.isArray(value);
}

function isOptionalMap(
  value: unknown,
  validValue: (entry: unknown) => boolean,
) {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every(validValue))
  );
}

function isValidSample(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof value.elapsedSeconds === "number" &&
    Number.isFinite(value.elapsedSeconds) &&
    typeof value.depthM === "number" &&
    Number.isFinite(value.depthM) &&
    Array.isArray(value.pressuresBar) &&
    value.pressuresBar.every(
      (pressure) =>
        pressure === null ||
        (typeof pressure === "number" && Number.isFinite(pressure)),
    ) &&
    isOptionalFiniteNumber(value.temperatureC) &&
    isOptionalFiniteNumber(value.ndlSeconds)
  );
}

function isValidGasMix(value: unknown) {
  return (
    isRecord(value) &&
    isOptionalFiniteNumber(value.oxygenPercent) &&
    isOptionalFiniteNumber(value.heliumPercent) &&
    (value.label === undefined || typeof value.label === "string")
  );
}

function isValidTank(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    isOptionalFiniteNumber(value.gasMixIndex) &&
    isOptionalFiniteNumber(value.volumeL) &&
    isOptionalFiniteNumber(value.workPressureBar) &&
    isOptionalFiniteNumber(value.startPressureBar) &&
    isOptionalFiniteNumber(value.endPressureBar) &&
    (value.usage === "none" ||
      value.usage === "oxygen" ||
      value.usage === "diluent" ||
      value.usage === "sidemount" ||
      value.usage === "unknown")
  );
}

function isValidNullableNumberArray(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (entry) =>
          entry === null ||
          (typeof entry === "number" && Number.isFinite(entry)),
      ))
  );
}

function isValidDiveDate(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return true;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Boundary validation before untrusted JSON is written into IndexedDB. */
export function isValidBackupDive(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.importedAt !== "string" ||
    !Number.isFinite(Date.parse(value.importedAt)) ||
    typeof value.photoCount !== "number" ||
    !Number.isInteger(value.photoCount) ||
    value.photoCount < 0 ||
    !Array.isArray(value.sources) ||
    !value.sources.every((source) => typeof source === "string")
  ) {
    return false;
  }
  if (
    !isOptionalString(value.diveDate) ||
    !isValidDiveDate(value.diveDate) ||
    !isOptionalString(value.site) ||
    !isOptionalString(value.location) ||
    !isOptionalString(value.userSite) ||
    !isOptionalString(value.buddy) ||
    !isOptionalString(value.notes) ||
    !isOptionalFiniteNumber(value.gpsEntryLat, 90) ||
    !isOptionalFiniteNumber(value.gpsEntryLng, 180) ||
    !isOptionalFiniteNumber(value.gpsExitLat, 90) ||
    !isOptionalFiniteNumber(value.gpsExitLng, 180) ||
    !isOptionalFiniteNumber(value.userGpsLat, 90) ||
    !isOptionalFiniteNumber(value.userGpsLng, 180) ||
    !isValidExportGpsPreference(value.exportGpsPreference) ||
    !isOptionalArray(value.gasMixes) ||
    (Array.isArray(value.gasMixes) && !value.gasMixes.every(isValidGasMix)) ||
    !isOptionalArray(value.tanks) ||
    (Array.isArray(value.tanks) && !value.tanks.every(isValidTank)) ||
    !isValidNullableNumberArray(value.tankPressuresStartBar) ||
    !isValidNullableNumberArray(value.tankPressuresEndBar)
  ) {
    return false;
  }
  if (
    value.samples !== undefined &&
    (!Array.isArray(value.samples) || !value.samples.every(isValidSample))
  ) {
    return false;
  }
  const nullableString = (entry: unknown) =>
    entry === null || typeof entry === "string";
  const nullableNumber = (entry: unknown) =>
    entry === null || (typeof entry === "number" && Number.isFinite(entry));
  return (
    isOptionalMap(value.sourceDiveNumbers, nullableNumber) &&
    isOptionalMap(value.sourceSiteNames, nullableString) &&
    isOptionalMap(value.sourceLocations, nullableString)
  );
}

function isValidDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidExportGpsPreference(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "computer" ||
    value === "user" ||
    value === "user-if-missing"
  );
}

export function isValidBackupDiveMergeGroup(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !Array.isArray(value.memberDiveIds) ||
    value.memberDiveIds.length < 2 ||
    !value.memberDiveIds.every(
      (id) => typeof id === "string" && id.length > 0,
    ) ||
    new Set(value.memberDiveIds).size !== value.memberDiveIds.length ||
    !isValidTimestamp(value.createdAt) ||
    !isValidTimestamp(value.updatedAt) ||
    !Array.isArray(value.memberRevision) ||
    value.memberRevision.length !== value.memberDiveIds.length
  ) {
    return false;
  }
  if (!isValidMergeGroupOverlay(value.overlay)) {
    return false;
  }
  const memberDiveIds = value.memberDiveIds as string[];
  return value.memberRevision.every(
    (revision, index) =>
      isRecord(revision) &&
      typeof revision.diveId === "string" &&
      revision.diveId === memberDiveIds[index] &&
      isValidTimestamp(revision.importedAt) &&
      (revision.appEditedAt === undefined ||
        revision.appEditedAt === null ||
        isValidTimestamp(revision.appEditedAt)) &&
      typeof revision.diveDate === "string" &&
      isValidDiveDate(revision.diveDate) &&
      typeof revision.durationSeconds === "number" &&
      Number.isFinite(revision.durationSeconds) &&
      revision.durationSeconds > 0 &&
      isOptionalFiniteNumber(revision.maxDepthM) &&
      !(
        typeof revision.maxDepthM === "number" && revision.maxDepthM < 0
      ),
  );
}

function isValidMergeGroupOverlay(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;
  const allowedKeys = new Set([
    "buddy",
    "notes",
    "userSite",
    "userSiteSource",
    "userSiteCatalogId",
    "userGpsLat",
    "userGpsLng",
    "userGpsSource",
    "exportGpsPreference",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (
    !isOptionalString(value.buddy) ||
    !isOptionalString(value.notes) ||
    !isOptionalString(value.userSite) ||
    !isOptionalString(value.userSiteCatalogId) ||
    !(
      value.userSiteSource === undefined ||
      value.userSiteSource === null ||
      value.userSiteSource === "catalog" ||
      value.userSiteSource === "suggestion" ||
      value.userSiteSource === "manual" ||
      value.userSiteSource === "memo"
    ) ||
    !(
      value.userGpsSource === undefined ||
      value.userGpsSource === null ||
      value.userGpsSource === "manual" ||
      value.userGpsSource === "photo-exif" ||
      value.userGpsSource === "memo" ||
      value.userGpsSource === "catalog" ||
      value.userGpsSource === "site-selection"
    ) ||
    !isValidExportGpsPreference(value.exportGpsPreference)
  ) {
    return false;
  }
  const hasLatitude = value.userGpsLat !== undefined && value.userGpsLat !== null;
  const hasLongitude = value.userGpsLng !== undefined && value.userGpsLng !== null;
  if (hasLatitude !== hasLongitude) return false;
  return (
    isOptionalFiniteNumber(value.userGpsLat, 90) &&
    isOptionalFiniteNumber(value.userGpsLng, 180)
  );
}

export function isValidBackupDiveMemo(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const hour = value.hour;
  const minute = value.minute;
  const validHour =
    hour === null ||
    (typeof hour === "number" && Number.isInteger(hour) && hour >= 1 && hour <= 12);
  const validMinute =
    minute === null ||
    (typeof minute === "number" &&
      Number.isInteger(minute) &&
      minute >= 0 &&
      minute <= 59);
  const coordinatesArePaired =
    (value.lat === null && value.lng === null) ||
    (typeof value.lat === "number" &&
      Number.isFinite(value.lat) &&
      Math.abs(value.lat) <= 90 &&
      typeof value.lng === "number" &&
      Number.isFinite(value.lng) &&
      Math.abs(value.lng) <= 180);
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.heading === "string" &&
    typeof value.date === "string" &&
    isValidDateOnly(value.date) &&
    validHour &&
    validMinute &&
    (value.meridiem === "AM" || value.meridiem === "PM") &&
    isOptionalString(value.siteName) &&
    (value.siteSource === undefined ||
      value.siteSource === null ||
      value.siteSource === "catalog" ||
      value.siteSource === "suggestion" ||
      value.siteSource === "manual") &&
    isOptionalString(value.siteCatalogId) &&
    isOptionalString(value.location) &&
    coordinatesArePaired &&
    isOptionalString(value.buddies) &&
    isOptionalString(value.notes) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}

function isValidTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isValidWhatsNewDocument(value: unknown) {
  if (value === undefined || value === null) return true;
  if (
    !isRecord(value) ||
    typeof value.version !== "string" ||
    !value.version.trim() ||
    !isValidTimestamp(value.updatedAt) ||
    !Array.isArray(value.entries)
  ) {
    return false;
  }
  return value.entries.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.title === "string" &&
      typeof entry.body === "string" &&
      (entry.date === undefined || typeof entry.date === "string") &&
      (entry.links === undefined ||
        (Array.isArray(entry.links) &&
          entry.links.every(
            (link) =>
              isRecord(link) &&
              typeof link.label === "string" &&
              typeof link.href === "string",
          ))),
  );
}

export function isValidBackupAppPreferences(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    value.id === "app" &&
    (value.uiLanguage === "en" ||
      value.uiLanguage === "zh-Hant" ||
      value.uiLanguage === "ja") &&
    (value.colorTheme === undefined ||
      value.colorTheme === "light" ||
      value.colorTheme === "dark") &&
    (value.defaultCylinderPresetId === undefined ||
      typeof value.defaultCylinderPresetId === "string") &&
    (value.lastComposerOutputSize === undefined ||
      value.lastComposerOutputSize === "social" ||
      value.lastComposerOutputSize === "high" ||
      value.lastComposerOutputSize === "source") &&
    (value.lastComposerFormat === undefined ||
      value.lastComposerFormat === "png" ||
      value.lastComposerFormat === "jpeg") &&
    (value.lastComposerJpegQuality === undefined ||
      (typeof value.lastComposerJpegQuality === "number" &&
        Number.isFinite(value.lastComposerJpegQuality) &&
        value.lastComposerJpegQuality >= 0 &&
        value.lastComposerJpegQuality <= 1)) &&
    (value.dismissedDuplicatePairs === undefined ||
      (Array.isArray(value.dismissedDuplicatePairs) &&
        value.dismissedDuplicatePairs.every((id) => typeof id === "string"))) &&
    (value.bundledBackgroundHidden === undefined ||
      typeof value.bundledBackgroundHidden === "boolean") &&
    isValidWhatsNewDocument(value.whatsNewCache) &&
    isOptionalString(value.whatsNewFetchedAt) &&
    isOptionalString(value.lastSeenWhatsNewVersion) &&
    isValidTimestamp(value.updatedAt)
  );
}

export function isValidBackupTrip(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isValidTimestamp(value.updatedAt)
  );
}

export function isValidBackupComposerSettings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.diveId === "string" &&
    value.diveId.length > 0 &&
    (value.blockPositions === undefined || isRecord(value.blockPositions)) &&
    (value.visibleFields === undefined || isRecord(value.visibleFields)) &&
    (value.panelGradient === undefined || isRecord(value.panelGradient)) &&
    isValidTimestamp(value.updatedAt)
  );
}

export function isValidBackupComposerPreset(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isRecord(value.settings) &&
    isValidTimestamp(value.createdAt) &&
    isValidTimestamp(value.updatedAt)
  );
}

export function isValidBackupSupplementaryCatalog(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.id !== "default" ||
    typeof value.label !== "string" ||
    !isValidTimestamp(value.updatedAt) ||
    !isRecord(value.catalog) ||
    value.catalog.schemaVersion !== 1 ||
    !Array.isArray(value.catalog.sites)
  ) {
    return false;
  }
  return value.catalog.sites.every(
    (site) =>
      isRecord(site) &&
      typeof site.id === "string" &&
      site.id.length > 0 &&
      typeof site.name === "string" &&
      site.name.length > 0 &&
      Array.isArray(site.aliases) &&
      site.aliases.every((alias) => typeof alias === "string") &&
      isRecord(site.coordinates) &&
      typeof site.coordinates.latitude === "number" &&
      Number.isFinite(site.coordinates.latitude) &&
      Math.abs(site.coordinates.latitude) <= 90 &&
      typeof site.coordinates.longitude === "number" &&
      Number.isFinite(site.coordinates.longitude) &&
      Math.abs(site.coordinates.longitude) <= 180 &&
      isRecord(site.place) &&
      isOptionalString(site.place.countryCode) &&
      isOptionalString(site.place.country) &&
      isOptionalString(site.place.region) &&
      isOptionalString(site.place.locality) &&
      isRecord(site.source) &&
      typeof site.source.kind === "string" &&
      isOptionalString(site.source.reference) &&
      (site.status === "active" ||
        site.status === "review" ||
        site.status === "retired") &&
      isValidTimestamp(site.updatedAt),
  );
}

const DIVE_SOURCES = new Set([
  "shearwater",
  "shearwater-ble",
  "subsurface",
  "uddf",
  "fit",
]);

export function isValidBackupSourceRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    typeof value.source === "string" &&
    DIVE_SOURCES.has(value.source) &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    value.key === `${value.source}\u0000${value.sourceId}` &&
    typeof value.diveId === "string" &&
    value.diveId.length > 0 &&
    isValidTimestamp(value.importedAt)
  );
}

export function isValidBackupSiteContribution(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.diveId === "string" &&
    value.diveId.length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180 &&
    isOptionalString(value.diveDate) &&
    isOptionalFiniteNumber(value.shearwaterDiveNumber) &&
    isOptionalFiniteNumber(value.subsurfaceDiveNumber) &&
    isValidTimestamp(value.createdAt) &&
    isValidTimestamp(value.updatedAt)
  );
}

function isValidEncodedBlob(value: UnknownRecord) {
  return (
    typeof value.blobBase64 === "string" &&
    typeof value.fileName === "string" &&
    value.fileName.length > 0 &&
    typeof value.contentType === "string" &&
    typeof value.size === "number" &&
    Number.isInteger(value.size) &&
    value.size >= 0
  );
}

export function isValidBackupAttachment(value: unknown): boolean {
  return (
    isRecord(value) &&
    isValidEncodedBlob(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.diveId === "string" &&
    value.diveId.length > 0 &&
    isOptionalString(value.caption) &&
    typeof value.sortOrder === "number" &&
    Number.isFinite(value.sortOrder) &&
    isValidTimestamp(value.createdAt) &&
    (value.role === undefined ||
      value.role === "dive-photo" ||
      value.role === "geo-reference")
  );
}

export function isValidBackupBackground(value: unknown): boolean {
  return (
    isRecord(value) &&
    isValidEncodedBlob(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.displayName === undefined || typeof value.displayName === "string") &&
    isValidTimestamp(value.createdAt)
  );
}

export function isValidBackupBrandingAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    isValidEncodedBlob(value) &&
    value.id === "overlay-logo" &&
    isValidTimestamp(value.updatedAt)
  );
}

export function isValidBackupRawDiveRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.diveId === "string" &&
    value.diveId.length > 0 &&
    typeof value.rawBytesBase64 === "string" &&
    typeof value.sourceKind === "string" &&
    typeof value.rawFormat === "string" &&
    typeof value.deviceDescriptor === "string" &&
    typeof value.deviceSerial === "string" &&
    typeof value.libdivecomputerVersion === "string" &&
    (value.libdivecomputerCommit === undefined ||
      typeof value.libdivecomputerCommit === "string") &&
    typeof value.parserContractVersion === "string" &&
    isValidTimestamp(value.capturedAt) &&
    typeof value.fingerprintHex === "string" &&
    typeof value.length === "number" &&
    Number.isInteger(value.length) &&
    value.length >= 0 &&
    typeof value.checksum === "string"
  );
}

export function isValidBackupDeviceCheckpoint(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.fingerprintBase64 !== "string" ||
    typeof value.fingerprintHex !== "string" ||
    !isValidTimestamp(value.lastSyncedAt)
  ) {
    return false;
  }
  if (value.lastOutcomeCounts === undefined) return true;
  return (
    isRecord(value.lastOutcomeCounts) &&
    typeof value.lastOutcomeCounts.downloaded === "number" &&
    Number.isInteger(value.lastOutcomeCounts.downloaded) &&
    value.lastOutcomeCounts.downloaded >= 0 &&
    (value.lastOutcomeCounts.matched === undefined ||
      (typeof value.lastOutcomeCounts.matched === "number" &&
        Number.isInteger(value.lastOutcomeCounts.matched) &&
        value.lastOutcomeCounts.matched >= 0))
  );
}
