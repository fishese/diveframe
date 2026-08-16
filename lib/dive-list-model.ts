export type DiveSortOption =
  | "date-desc"
  | "date-asc"
  | "duration-desc"
  | "duration-asc"
  | "depth-desc"
  | "depth-asc";

export type DiveListTrip = { id: string; name: string };

export type DiveListItem = {
  id: string;
  diveDate: string | null;
  diveNumber: number | null;
  durationSeconds: number | null;
  maxDepthM: number | null;
  depth?: string | null;
  tripId: string | null;
  computerModel: string | null;
  userSite?: string | null;
  site?: string | null;
  location?: string | null;
  resolvedLocation?: string | null;
  gpsEntryLat?: number | null;
  gpsEntryLng?: number | null;
  userGpsLat?: number | null;
  userGpsLng?: number | null;
  cylinderPresetId?: string | null;
  cylinderVolumeL?: number | null;
  tankPressuresStartBar?: Array<number | null>;
  tankPressuresEndBar?: Array<number | null>;
  tanks?: Array<{
    startPressureBar?: number | null;
    endPressureBar?: number | null;
  }>;
  appEditedAt?: string | null;
  buddy?: string | null;
  notes?: string | null;
  sources?: string[];
  sourceDiveNumbers?: Partial<
    Record<"shearwater" | "subsurface" | "uddf" | "fit" | "shearwater-ble", number | null>
  >;
};

export const DEFAULT_SHORT_DIVE_MAX_MINUTES = 3;

export function parsePositiveWholeMinutes(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      return null;
    }
    return value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function isShortDiveCandidate(
  dive: Pick<DiveListItem, "durationSeconds">,
  maxDurationMinutes: number,
): boolean {
  const thresholdMinutes = parsePositiveWholeMinutes(maxDurationMinutes);
  if (thresholdMinutes === null) return false;
  const duration = dive.durationSeconds;
  if (
    duration === null ||
    duration === undefined ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return false;
  }
  return duration <= thresholdMinutes * 60;
}

export function shortDiveCandidateIds(
  dives: readonly Pick<DiveListItem, "id" | "durationSeconds">[],
  maxDurationMinutes: number,
): string[] {
  return dives
    .filter((dive) => isShortDiveCandidate(dive, maxDurationMinutes))
    .map((dive) => dive.id);
}

export type DiveListFilters = {
  namedOnly: boolean;
  unnamedOnly: boolean;
  gpsOnly: boolean;
  appSiteOnly: boolean;
  gasDataOnly: boolean;
  shortDiveMaxMinutes: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  computerModel: string | null;
  searchText: string;
  sourceOnly?: "shearwater" | "subsurface" | null;
};

export type DiveListRow<T extends DiveListItem> =
  | { kind: "solo"; dive: T }
  | { kind: "trip"; trip: DiveListTrip; dives: T[]; collapsed?: boolean };

export function compareDives(
  a: DiveListItem,
  b: DiveListItem,
  option: DiveSortOption,
): number {
  if (option.startsWith("duration")) {
    return (
      compareNullableNumbers(
        a.durationSeconds,
        b.durationSeconds,
        option.endsWith("desc") ? "desc" : "asc",
      ) || compareDivesByDate(a, b, "desc")
    );
  }
  if (option.startsWith("depth")) {
    return (
      compareNullableNumbers(
        a.maxDepthM ?? numberFrom(a.depth),
        b.maxDepthM ?? numberFrom(b.depth),
        option.endsWith("desc") ? "desc" : "asc",
      ) || compareDivesByDate(a, b, "desc")
    );
  }
  return compareDivesByDate(a, b, option === "date-desc" ? "desc" : "asc");
}

export function diveWasEditedHere(dive: DiveListItem): boolean {
  if (dive.appEditedAt) return true;
  if (dive.userSite) return true;
  if (dive.userGpsLat != null && dive.userGpsLng != null) return true;
  if (dive.tripId) return true;
  if (dive.cylinderPresetId || dive.cylinderVolumeL != null) return true;
  return false;
}

export function diveMatchesListFilters(
  dive: DiveListItem,
  filters: Partial<DiveListFilters>,
): boolean {
  const namedOnly = filters.namedOnly ?? false;
  const unnamedOnly = filters.unnamedOnly ?? false;
  const gpsOnly = filters.gpsOnly ?? false;
  const appSiteOnly = filters.appSiteOnly ?? false;
  const gasDataOnly = filters.gasDataOnly ?? false;
  const shortDiveMaxMinutes = filters.shortDiveMaxMinutes ?? null;
  const dateFrom = filters.dateFrom ?? null;
  const dateTo = filters.dateTo ?? null;
  const computerModel = filters.computerModel ?? null;
  const searchText = filters.searchText ?? "";
  const sourceOnly = filters.sourceOnly ?? null;

  if (sourceOnly) {
    const sources = dive.sources ?? [];
    const excluded =
      sourceOnly === "shearwater" ? "subsurface" : "shearwater";
    if (
      !sources.includes(sourceOnly) ||
      sources.includes(excluded)
    ) {
      return false;
    }
  }

  if (namedOnly && !diveHasNamedSite(dive)) {
    return false;
  }

  if (unnamedOnly && diveHasNamedSite(dive)) {
    return false;
  }

  if (gpsOnly && !diveHasGps(dive)) {
    return false;
  }

  if (appSiteOnly && !diveWasEditedHere(dive)) {
    return false;
  }

  if (gasDataOnly && !diveHasGasPressureData(dive)) {
    return false;
  }

  if (
    shortDiveMaxMinutes !== null &&
    !isShortDiveCandidate(dive, shortDiveMaxMinutes)
  ) {
    return false;
  }

  const diveDay = diveDateDay(dive.diveDate);
  if (dateFrom && diveDay !== null && diveDay < dateFrom) {
    return false;
  }
  if (dateTo && diveDay !== null && diveDay > dateTo) {
    return false;
  }
  if (dateFrom && diveDay === null) {
    return false;
  }
  if (dateTo && diveDay === null) {
    return false;
  }

  if (computerModel && dive.computerModel !== computerModel) {
    return false;
  }

  const needle = searchText.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const displayLocation =
    dive.location || dive.resolvedLocation || null;

  return [
    dive.diveNumber,
    ...Object.values(dive.sourceDiveNumbers ?? {}),
    dive.userSite,
    dive.site,
    displayLocation,
    dive.buddy,
    dive.notes,
    dive.diveDate,
    dive.computerModel,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function diveHasNamedSite(
  dive: Pick<DiveListItem, "userSite" | "site">,
): boolean {
  return Boolean(dive.userSite?.trim() || dive.site?.trim());
}

export function diveHasGasPressureData(
  dive: Pick<
    DiveListItem,
    "tankPressuresStartBar" | "tankPressuresEndBar" | "tanks"
  >,
): boolean {
  const pressures = [
    ...(dive.tankPressuresStartBar ?? []),
    ...(dive.tankPressuresEndBar ?? []),
    ...(dive.tanks ?? []).flatMap((tank) => [
      tank.startPressureBar,
      tank.endPressureBar,
    ]),
  ];
  return pressures.some(
    (pressure) =>
      typeof pressure === "number" &&
      Number.isFinite(pressure) &&
      pressure > 0,
  );
}

export function buildDiveListRows<T extends DiveListItem>(
  dives: T[],
  trips: DiveListTrip[],
  option: DiveSortOption,
): DiveListRow<T>[] {
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  const tripGroups = new Map<string, T[]>();
  const solos: T[] = [];

  for (const dive of dives) {
    const trip =
      dive.tripId !== null && dive.tripId !== undefined
        ? tripById.get(dive.tripId)
        : undefined;
    if (trip) {
      const members = tripGroups.get(trip.id) ?? [];
      members.push(dive);
      tripGroups.set(trip.id, members);
    } else {
      solos.push(dive);
    }
  }

  const blocks: DiveListRow<T>[] = [];

  for (const [tripId, members] of tripGroups) {
    const trip = tripById.get(tripId);
    if (!trip) continue;
    const sorted = [...members].sort((a, b) => compareDives(a, b, option));
    blocks.push({ kind: "trip", trip, dives: sorted });
  }

  for (const dive of solos) {
    blocks.push({ kind: "solo", dive });
  }

  blocks.sort((a, b) =>
    compareDives(anchorDive(a), anchorDive(b), option),
  );

  return blocks;
}

function anchorDive<T extends DiveListItem>(row: DiveListRow<T>): T {
  return row.kind === "solo" ? row.dive : row.dives[0];
}

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: "desc" | "asc",
) {
  if (a === null && b !== null) return 1;
  if (a !== null && b === null) return -1;
  if (a === null || b === null || a === b) return 0;
  return (a - b) * (direction === "desc" ? -1 : 1);
}

function compareDivesByDate(
  a: Pick<DiveListItem, "diveDate" | "diveNumber">,
  b: Pick<DiveListItem, "diveDate" | "diveNumber">,
  direction: "desc" | "asc",
) {
  const aTime = diveTimestamp(a.diveDate);
  const bTime = diveTimestamp(b.diveDate);
  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime === null) return -1;
  const multiplier = direction === "desc" ? -1 : 1;
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return (aTime - bTime) * multiplier;
  }
  if (a.diveNumber === null && b.diveNumber !== null) return 1;
  if (a.diveNumber !== null && b.diveNumber === null) return -1;
  return ((a.diveNumber ?? 0) - (b.diveNumber ?? 0)) * multiplier;
}

function diveTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function diveDateDay(value: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

function diveHasGps(dive: DiveListItem): boolean {
  return (
    (dive.gpsEntryLat !== null &&
      dive.gpsEntryLat !== undefined &&
      dive.gpsEntryLng !== null &&
      dive.gpsEntryLng !== undefined) ||
    (dive.userGpsLat !== null &&
      dive.userGpsLat !== undefined &&
      dive.userGpsLng !== null &&
      dive.userGpsLng !== undefined)
  );
}

function numberFrom(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
