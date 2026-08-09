export type DiveLocationOverrideSource =
  | "manual"
  | "site-selection"
  | "memo"
  | null;

type SourceValues = Partial<Record<string, string | null>>;

const SOURCE_PRIORITY = [
  "shearwater",
  "shearwater-ble",
  "subsurface",
  "uddf",
  "fit",
];

export function preferredImportedLocation(values: SourceValues): string | null {
  for (const source of SOURCE_PRIORITY) {
    const value = values[source]?.trim();
    if (value) return value;
  }
  for (const value of Object.values(values)) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return null;
}

/** Select the canonical imported site without displacing a user override. */
export function preferredImportedSite(values: SourceValues): string | null {
  return preferredImportedLocation(values);
}

export function inferLegacyLocationOverride(dive: {
  location: string | null;
  userSite: string | null;
  userSiteUpdatedAt: string | null;
  sourceLocations?: SourceValues;
  sourceSiteNames: SourceValues;
}): DiveLocationOverrideSource {
  if (!dive.userSiteUpdatedAt || !sameText(dive.location, dive.userSite)) {
    return null;
  }
  if (preferredImportedLocation(dive.sourceLocations ?? {})) return null;
  return "site-selection";
}

export function clearedDiveFrameSiteData(dive: {
  location: string | null;
  locationSource: DiveLocationOverrideSource;
  sourceLocations: SourceValues;
}) {
  return {
    location:
      dive.locationSource === null
        ? dive.location
        : preferredImportedLocation(dive.sourceLocations),
    locationSource: null,
    userSite: null,
    userSiteSource: null,
    userSiteCatalogId: null,
    userSiteUpdatedAt: null,
    userGpsLat: null,
    userGpsLng: null,
    userGpsSource: null,
    userGpsUpdatedAt: null,
    resolvedLocation: null,
    resolvedCity: null,
    resolvedCountry: null,
    resolvedLocationSuppressed: true,
  } as const;
}

function sameText(a: string | null, b: string | null) {
  const normalize = (value: string | null) =>
    value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("en") || null;
  return normalize(a) !== null && normalize(a) === normalize(b);
}
