export type CatalogSite = {
  id: string;
  name: string;
  aliases: string[];
  coordinates: { latitude: number; longitude: number };
  place: {
    countryCode: string | null;
    country: string | null;
    region: string | null;
    locality: string | null;
  };
  source: { kind: string; reference: string | null };
  status: string;
  updatedAt: string;
};

export type DiveSiteCatalog = {
  schemaVersion: number;
  sites: CatalogSite[];
};

export type DeviceSiteContribution = {
  id: string;
  diveId: string;
  name: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
  aliases?: string[];
};

export type NearbyCatalogSite = {
  id: string;
  catalogId: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  location: string | null;
  distanceKm: number;
  source: "catalog";
};

export const NEARBY_SITE_RADIUS_KM = 6;

const SESSION_CATALOG_KEY = "diveframe-session-dive-site-catalog";
const SESSION_CATALOG_LABEL_KEY = "diveframe-session-dive-site-catalog-label";

export function validateDiveSiteCatalog(value: unknown): DiveSiteCatalog {
  if (!value || typeof value !== "object") {
    throw new Error("This is not a dive-site catalog.");
  }
  const candidate = value as { schemaVersion?: unknown; sites?: unknown };
  if (
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.sites) ||
    !candidate.sites.every(isCatalogSite)
  ) {
    throw new Error("The catalog must contain schemaVersion and a valid sites array.");
  }
  return candidate as DiveSiteCatalog;
}

export function saveSessionDiveSiteCatalog(
  catalog: DiveSiteCatalog,
  label: string,
) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_CATALOG_KEY, JSON.stringify(catalog));
    sessionStorage.setItem(SESSION_CATALOG_LABEL_KEY, label);
  } catch {
    // Optional migration storage can be unavailable in strict privacy modes.
  }
}

export function loadSessionDiveSiteCatalog() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const serialized = sessionStorage.getItem(SESSION_CATALOG_KEY);
    if (!serialized) return null;
    return {
      catalog: validateDiveSiteCatalog(JSON.parse(serialized)),
      label:
        sessionStorage.getItem(SESSION_CATALOG_LABEL_KEY) ??
        "Session dive-site catalog",
    };
  } catch {
    clearSessionDiveSiteCatalog();
    return null;
  }
}

export function clearSessionDiveSiteCatalog() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_CATALOG_KEY);
    sessionStorage.removeItem(SESSION_CATALOG_LABEL_KEY);
  } catch {
    // Nothing actionable when optional session storage is blocked.
  }
}

export function takeSessionSupplementaryCatalogMigration() {
  const existing = loadSessionDiveSiteCatalog();
  if (!existing) return null;
  clearSessionDiveSiteCatalog();
  return existing;
}

export function combineDiveSiteCatalogs(
  bundled: DiveSiteCatalog,
  additional: DiveSiteCatalog | null,
): DiveSiteCatalog {
  if (!additional) return bundled;
  const sites = [...bundled.sites];
  const ids = new Set(sites.map((site) => site.id));
  const positions = new Set(sites.map(sitePositionKey));
  additional.sites.forEach((site) => {
    const position = sitePositionKey(site);
    if (ids.has(site.id) || positions.has(position)) return;
    sites.push(site);
    ids.add(site.id);
    positions.add(position);
  });
  return {
    schemaVersion: Math.max(bundled.schemaVersion, additional.schemaVersion),
    sites,
  };
}

export function resolveActiveDiveSiteCatalog(
  bundled: DiveSiteCatalog,
  supplementary: DiveSiteCatalog | null,
  deviceAdditions: DiveSiteCatalog | null = null,
) {
  return combineDiveSiteCatalogs(
    combineDiveSiteCatalogs(bundled, supplementary),
    deviceAdditions,
  );
}

export function deviceSiteCatalogFromContributions(
  contributions: DeviceSiteContribution[],
  schemaVersion = 1,
): DiveSiteCatalog {
  const sites: CatalogSite[] = [];
  const usedIds = new Set<string>();
  const ordered = [...contributions].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id),
  );

  for (const contribution of ordered) {
    const name = contribution.name.trim();
    if (
      !name ||
      !Number.isFinite(contribution.latitude) ||
      !Number.isFinite(contribution.longitude) ||
      Math.abs(contribution.latitude) > 90 ||
      Math.abs(contribution.longitude) > 180
    ) {
      continue;
    }

    const normalizedName = normalizeCatalogName(name);
    const duplicate = sites.some(
      (site) =>
        normalizeCatalogName(site.name) === normalizedName &&
        distanceKm(
          site.coordinates.latitude,
          site.coordinates.longitude,
          contribution.latitude,
          contribution.longitude,
        ) <= 0.25,
    );
    if (duplicate) continue;

    const aliases = [
      ...new Set(
        (contribution.aliases ?? [])
          .map((alias) => alias.trim())
          .filter(
            (alias) =>
              alias.length > 0 &&
              normalizeCatalogName(alias) !== normalizedName,
          ),
      ),
    ];
    const id = uniqueDeviceCatalogId(contribution, usedIds);
    usedIds.add(id);
    sites.push({
      id,
      name,
      aliases,
      coordinates: {
        latitude: contribution.latitude,
        longitude: contribution.longitude,
      },
      place: {
        countryCode: null,
        country: null,
        region: null,
        locality: null,
      },
      source: {
        kind: "diveframe_manual",
        reference: `diveframe-dive:${contribution.diveId}`,
      },
      status: "active",
      updatedAt: contribution.updatedAt,
    });
  }

  return {
    schemaVersion,
    sites: sites.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function nearbySessionCatalogSites(
  catalog: DiveSiteCatalog | null,
  latitude: number,
  longitude: number,
  radiusKm = NEARBY_SITE_RADIUS_KM,
) {
  if (!catalog) return [];
  return catalog.sites
    .filter((site) => site.status === "active")
    .map((site): NearbyCatalogSite => ({
      id: `session-catalog-${site.id}`,
      catalogId: site.id,
      name: site.name,
      aliases: site.aliases,
      latitude: site.coordinates.latitude,
      longitude: site.coordinates.longitude,
      location: site.place.country ?? site.place.region ?? site.place.locality,
      distanceKm: distanceKm(
        latitude,
        longitude,
        site.coordinates.latitude,
        site.coordinates.longitude,
      ),
      source: "catalog",
    }))
    .filter((site) => site.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function isCatalogSite(value: unknown): value is CatalogSite {
  if (!value || typeof value !== "object") return false;
  const site = value as Partial<CatalogSite>;
  return (
    typeof site.id === "string" &&
    site.id.trim().length > 0 &&
    typeof site.name === "string" &&
    site.name.trim().length > 0 &&
    Array.isArray(site.aliases) &&
    site.aliases.every((alias) => typeof alias === "string") &&
    Boolean(site.coordinates) &&
    Number.isFinite(site.coordinates?.latitude) &&
    Number.isFinite(site.coordinates?.longitude) &&
    site.coordinates!.latitude >= -90 &&
    site.coordinates!.latitude <= 90 &&
    site.coordinates!.longitude >= -180 &&
    site.coordinates!.longitude <= 180 &&
    Boolean(site.place) &&
    isNullableString(site.place?.countryCode) &&
    isNullableString(site.place?.country) &&
    isNullableString(site.place?.region) &&
    isNullableString(site.place?.locality) &&
    Boolean(site.source) &&
    typeof site.source?.kind === "string" &&
    site.source.kind.trim().length > 0 &&
    isNullableString(site.source?.reference) &&
    typeof site.status === "string" &&
    ["active", "review", "retired"].includes(site.status) &&
    typeof site.updatedAt === "string" &&
    !Number.isNaN(Date.parse(site.updatedAt))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function sitePositionKey(site: CatalogSite) {
  return `${site.name.trim().toLocaleLowerCase("en")}\u0000${site.coordinates.latitude.toFixed(4)}\u0000${site.coordinates.longitude.toFixed(4)}`;
}

function uniqueDeviceCatalogId(
  contribution: DeviceSiteContribution,
  usedIds: Set<string>,
) {
  const slug =
    contribution.name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "unnamed-site";
  const latitude = `${contribution.latitude < 0 ? "s" : "n"}${Math.abs(contribution.latitude).toFixed(3).replace(".", "")}`;
  const longitude = `${contribution.longitude < 0 ? "w" : "e"}${Math.abs(contribution.longitude).toFixed(3).replace(".", "")}`;
  const base = `user-${slug}-${latitude}-${longitude}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeCatalogName(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
