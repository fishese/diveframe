import type { DiveSiteCatalog, CatalogSite } from "./dive-site-catalog";
import type { LocalDive } from "./indexed-db";

export const DIVE_MAP_WIDTH = 1200;
export const DIVE_MAP_HEIGHT = 600;
export const UNKNOWN_DIVE_CLUSTER_RADIUS_KM = 0.25;

export type DiveMapDive = Pick<
  LocalDive,
  | "id"
  | "diveDate"
  | "location"
  | "resolvedLocation"
  | "site"
  | "userSite"
  | "userSiteCatalogId"
  | "gpsEntryLat"
  | "gpsEntryLng"
  | "userGpsLat"
  | "userGpsLng"
  | "sourceSiteNames"
>;

export type DiveMapCoordinateSource = "computer" | "user" | "catalog";

export type DiveMapResolvedCoordinates = {
  latitude: number;
  longitude: number;
  source: DiveMapCoordinateSource;
  catalogSite: CatalogSite | null;
};

export type DiveMapPosition = {
  x: number;
  y: number;
};

export type DiveMapDiveSummary = {
  id: string;
  date: string | null;
  siteName: string | null;
  locationName: string | null;
  knownSiteId: string | null;
};

export type DiveMapSiteBreakdown = {
  id: string;
  name: string;
  diveCount: number;
};

export type DiveMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  position: DiveMapPosition;
  title: string | null;
  regionName: string | null;
  diveCount: number;
  knownSiteCount: number;
  coordinateSources: DiveMapCoordinateSource[];
  dateFrom: string | null;
  dateTo: string | null;
  dives: DiveMapDiveSummary[];
  sites: DiveMapSiteBreakdown[];
};

export type DiveMapData = {
  markers: DiveMapMarker[];
  mappedDiveCount: number;
  unmappableDiveCount: number;
  distinctKnownSiteCount: number;
  unmappableDives: DiveMapDiveSummary[];
};

type ResolvedDive = {
  dive: DiveMapDive;
  coordinates: DiveMapResolvedCoordinates;
  summary: DiveMapDiveSummary;
};

/**
 * Converts WGS84 decimal degrees to the same 1200 × 600 equirectangular
 * coordinate system used by public/maps/world-dive-map.svg.
 */
export function latLonToMapPosition(
  latitude: number,
  longitude: number,
): DiveMapPosition | null {
  if (!isValidCoordinatePair(latitude, longitude)) return null;
  return {
    x: ((longitude + 180) / 360) * DIVE_MAP_WIDTH,
    y: ((90 - latitude) / 180) * DIVE_MAP_HEIGHT,
  };
}

export function isValidCoordinatePair(
  latitude: unknown,
  longitude: unknown,
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Resolve only stored structured coordinates. Free-text names are never used. */
export function resolveDiveCoordinates(
  dive: DiveMapDive,
  catalog: Pick<DiveSiteCatalog, "sites">,
): DiveMapResolvedCoordinates | null {
  const computer = validatedCoordinatePair(dive.gpsEntryLat, dive.gpsEntryLng);
  if (computer) {
    return {
      ...computer,
      source: "computer",
      catalogSite: catalogSiteForDive(dive, catalog),
    };
  }
  const user = validatedCoordinatePair(dive.userGpsLat, dive.userGpsLng);
  if (user) {
    return {
      ...user,
      source: "user",
      catalogSite: catalogSiteForDive(dive, catalog),
    };
  }
  const catalogSite = catalogSiteForDive(dive, catalog);
  if (
    catalogSite &&
    isValidCoordinatePair(
      catalogSite.coordinates.latitude,
      catalogSite.coordinates.longitude,
    )
  ) {
    return {
      latitude: catalogSite.coordinates.latitude,
      longitude: catalogSite.coordinates.longitude,
      source: "catalog",
      catalogSite,
    };
  }
  return null;
}

function validatedCoordinatePair(
  latitude: unknown,
  longitude: unknown,
): { latitude: number; longitude: number } | null {
  return isValidCoordinatePair(latitude, longitude)
    ? { latitude: latitude as number, longitude: longitude as number }
    : null;
}

export function buildDiveMapData(
  dives: DiveMapDive[],
  catalog: Pick<DiveSiteCatalog, "sites">,
  unknownClusterRadiusKm = UNKNOWN_DIVE_CLUSTER_RADIUS_KM,
): DiveMapData {
  const resolved: ResolvedDive[] = [];
  const unmappableDives: DiveMapDiveSummary[] = [];

  for (const dive of dives) {
    const coordinates = resolveDiveCoordinates(dive, catalog);
    const summary = diveSummary(dive, coordinates?.catalogSite ?? null);
    if (!coordinates) {
      unmappableDives.push(summary);
      continue;
    }
    resolved.push({ dive, coordinates, summary });
  }

  const knownGroups = new Map<string, ResolvedDive[]>();
  const withoutKnownSite: ResolvedDive[] = [];
  for (const item of resolved) {
    const knownSiteId = item.dive.userSiteCatalogId?.trim() || null;
    if (!knownSiteId) {
      withoutKnownSite.push(item);
      continue;
    }
    const group = knownGroups.get(knownSiteId) ?? [];
    group.push(item);
    knownGroups.set(knownSiteId, group);
  }

  const groups = [
    ...Array.from(knownGroups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([siteId, group]) => ({ id: `site:${siteId}`, dives: group })),
    ...clusterUnknownDives(withoutKnownSite, unknownClusterRadiusKm).map(
      (group) => ({
        id: `geo:${stableId(group.map((item) => item.dive.id))}`,
        dives: group,
      }),
    ),
  ];

  const markers = groups
    .map(({ id, dives: group }) => markerForGroup(id, group))
    .sort((left, right) =>
      (left.title ?? "").localeCompare(right.title ?? "") ||
      left.id.localeCompare(right.id),
    );
  const distinctKnownSiteIds = new Set(
    resolved
      .map((item) => item.summary.knownSiteId)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    markers,
    mappedDiveCount: resolved.length,
    unmappableDiveCount: unmappableDives.length,
    distinctKnownSiteCount: distinctKnownSiteIds.size,
    unmappableDives: unmappableDives.sort(compareDiveSummariesNewestFirst),
  };
}

export function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function catalogSiteForDive(
  dive: DiveMapDive,
  catalog: Pick<DiveSiteCatalog, "sites">,
) {
  const id = dive.userSiteCatalogId?.trim();
  return id ? catalog.sites.find((site) => site.id === id) ?? null : null;
}

function clusterUnknownDives(
  dives: ResolvedDive[],
  radiusKm: number,
): ResolvedDive[][] {
  if (dives.length === 0) return [];
  const sorted = [...dives].sort(
    (left, right) =>
      left.coordinates.latitude - right.coordinates.latitude ||
      left.coordinates.longitude - right.coordinates.longitude ||
      left.dive.id.localeCompare(right.dive.id),
  );
  const parent = sorted.map((_, index) => index);

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const latitudeGapKm =
        (sorted[right].coordinates.latitude -
          sorted[left].coordinates.latitude) *
        111.2;
      if (latitudeGapKm > radiusKm) break;
      if (
        haversineDistanceKm(
          sorted[left].coordinates.latitude,
          sorted[left].coordinates.longitude,
          sorted[right].coordinates.latitude,
          sorted[right].coordinates.longitude,
        ) <= radiusKm
      ) {
        union(parent, left, right);
      }
    }
  }

  const groups = new Map<number, ResolvedDive[]>();
  sorted.forEach((dive, index) => {
    const root = find(parent, index);
    const group = groups.get(root) ?? [];
    group.push(dive);
    groups.set(root, group);
  });
  return Array.from(groups.values()).sort((left, right) =>
    left[0].dive.id.localeCompare(right[0].dive.id),
  );
}

function markerForGroup(id: string, group: ResolvedDive[]): DiveMapMarker {
  const coordinates = averageCoordinates(
    group.map((item) => ({
      latitude: item.coordinates.latitude,
      longitude: item.coordinates.longitude,
    })),
  );
  const position = latLonToMapPosition(
    coordinates.latitude,
    coordinates.longitude,
  );
  if (!position) throw new Error("A validated dive produced invalid map coordinates.");

  const dives = group
    .map((item) => item.summary)
    .sort(compareDiveSummariesNewestFirst);
  const knownSites = new Map<string, DiveMapSiteBreakdown>();
  group.forEach((item) => {
    const knownSiteId = item.summary.knownSiteId;
    if (!knownSiteId) return;
    const existing = knownSites.get(knownSiteId);
    knownSites.set(knownSiteId, {
      id: knownSiteId,
      name: item.summary.siteName ?? existing?.name ?? "Dive site",
      diveCount: (existing?.diveCount ?? 0) + 1,
    });
  });
  const dateValues = dives
    .map((dive) => dive.date)
    .filter((date): date is string => validDateTimestamp(date) !== null)
    .sort((left, right) => validDateTimestamp(left)! - validDateTimestamp(right)!);
  const sources = Array.from(new Set(group.map((item) => item.coordinates.source)));

  return {
    id,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    position,
    title: markerTitle(dives),
    regionName: commonValue(dives.map((dive) => dive.locationName)),
    diveCount: dives.length,
    knownSiteCount: knownSites.size,
    coordinateSources: sources,
    dateFrom: dateValues[0] ?? null,
    dateTo: dateValues.at(-1) ?? null,
    dives,
    sites: Array.from(knownSites.values()).sort(
      (left, right) =>
        right.diveCount - left.diveCount || left.name.localeCompare(right.name),
    ),
  };
}

function diveSummary(
  dive: DiveMapDive,
  catalogSite: CatalogSite | null,
): DiveMapDiveSummary {
  return {
    id: dive.id,
    date: dive.diveDate,
    siteName:
      clean(dive.userSite) ??
      clean(catalogSite?.name) ??
      clean(dive.site) ??
      clean(preferredSourceSiteName(dive)),
    locationName:
      clean(dive.location) ??
      clean(dive.resolvedLocation) ??
      clean(catalogSite?.place.locality) ??
      clean(catalogSite?.place.region) ??
      clean(catalogSite?.place.country),
    knownSiteId: clean(dive.userSiteCatalogId),
  };
}

function markerTitle(dives: DiveMapDiveSummary[]) {
  const knownSiteIds = new Set(
    dives.map((dive) => dive.knownSiteId).filter(Boolean),
  );
  if (knownSiteIds.size === 1) {
    return commonValue(dives.map((dive) => dive.siteName)) ?? dives[0].siteName;
  }
  return (
    commonValue(dives.map((dive) => dive.locationName)) ??
    commonValue(dives.map((dive) => dive.siteName))
  );
}

function preferredSourceSiteName(dive: DiveMapDive) {
  return (
    dive.sourceSiteNames.shearwater ??
    dive.sourceSiteNames.subsurface ??
    dive.sourceSiteNames.uddf ??
    dive.sourceSiteNames.fit ??
    null
  );
}

function compareDiveSummariesNewestFirst(
  left: DiveMapDiveSummary,
  right: DiveMapDiveSummary,
) {
  return (
    (validDateTimestamp(right.date) ?? Number.NEGATIVE_INFINITY) -
      (validDateTimestamp(left.date) ?? Number.NEGATIVE_INFINITY) ||
    left.id.localeCompare(right.id)
  );
}

function validDateTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function commonValue(values: Array<string | null>) {
  const cleaned = values.map(clean).filter((value): value is string => Boolean(value));
  if (!cleaned.length) return null;
  const counts = new Map<string, { value: string; count: number }>();
  cleaned.forEach((value) => {
    const key = value.toLocaleLowerCase("en");
    const existing = counts.get(key);
    counts.set(key, { value: existing?.value ?? value, count: (existing?.count ?? 0) + 1 });
  });
  return Array.from(counts.values()).sort(
    (left, right) => right.count - left.count || left.value.localeCompare(right.value),
  )[0]?.value ?? null;
}

function clean(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function averageCoordinates(
  coordinates: Array<{ latitude: number; longitude: number }>,
) {
  let x = 0;
  let y = 0;
  let z = 0;
  coordinates.forEach(({ latitude, longitude }) => {
    const latitudeRadians = (latitude * Math.PI) / 180;
    const longitudeRadians = (longitude * Math.PI) / 180;
    x += Math.cos(latitudeRadians) * Math.cos(longitudeRadians);
    y += Math.cos(latitudeRadians) * Math.sin(longitudeRadians);
    z += Math.sin(latitudeRadians);
  });
  x /= coordinates.length;
  y /= coordinates.length;
  z /= coordinates.length;
  const longitude = (Math.atan2(y, x) * 180) / Math.PI;
  const hypotenuse = Math.sqrt(x * x + y * y);
  const latitude = (Math.atan2(z, hypotenuse) * 180) / Math.PI;
  return { latitude, longitude };
}

function find(parent: number[], index: number): number {
  if (parent[index] !== index) parent[index] = find(parent, parent[index]);
  return parent[index];
}

function union(parent: number[], left: number, right: number) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function stableId(ids: string[]) {
  const value = [...ids].sort().join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
