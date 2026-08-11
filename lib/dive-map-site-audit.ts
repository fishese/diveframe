import type { CatalogSite, DiveSiteCatalog } from "./dive-site-catalog";
import {
  resolveDiveCoordinates,
  type DiveMapDive,
} from "./dive-map";

export type DiveSiteAuditDive = DiveMapDive;

export type DiveSiteAuditDiveSummary = {
  id: string;
  date: string | null;
  auditFingerprint: string;
};

export type DiveSiteAuditCandidate = {
  site: CatalogSite;
  matchedName: string;
};

export type DiveSiteAuditGroup = {
  key: string;
  diveSiteName: string;
  diveLocationName: string | null;
  dives: DiveSiteAuditDiveSummary[];
  candidates: DiveSiteAuditCandidate[];
};

export type DiveSiteCoordinateAudit = {
  matched: DiveSiteAuditGroup[];
  notFound: DiveSiteAuditGroup[];
  namedDiveCount: number;
};

/**
 * Compare only named dives that still cannot be mapped. Call this from an
 * explicit user action: the full name/alias scan is intentionally not part of
 * normal map rendering.
 */
export function buildDiveSiteCoordinateAudit(
  dives: DiveSiteAuditDive[],
  catalog: DiveSiteCatalog,
): DiveSiteCoordinateAudit {
  const names = buildCatalogNameIndex(catalog);
  const groups = new Map<string, DiveSiteAuditGroup>();

  for (const dive of dives) {
    if (resolveDiveCoordinates(dive, catalog)) continue;
    const diveSiteName = preferredDiveSiteName(dive)?.trim();
    if (!diveSiteName) continue;
    const diveLocationName = preferredDiveLocationName(dive)?.trim() || null;
    const key = `${normalizeName(diveSiteName)}\u0000${normalizeName(diveLocationName ?? "")}`;
    const summary = {
      id: dive.id,
      date: dive.diveDate,
      auditFingerprint: diveSiteAuditFingerprint(dive),
    };
    const existing = groups.get(key);
    if (existing) {
      existing.dives.push(summary);
      continue;
    }

    groups.set(key, {
      key,
      diveSiteName,
      diveLocationName,
      dives: [summary],
      candidates: names.get(normalizeName(diveSiteName)) ?? [],
    });
  }

  const all = [...groups.values()].sort(compareAuditGroups);
  return {
    matched: all.filter((group) => group.candidates.length > 0),
    notFound: all.filter((group) => group.candidates.length === 0),
    namedDiveCount: all.reduce((count, group) => count + group.dives.length, 0),
  };
}

/** Snapshot the fields that decide whether an audit match is still safe. */
export function diveSiteAuditFingerprint(dive: DiveSiteAuditDive) {
  return JSON.stringify([
    dive.appEditedAt ?? null,
    dive.userSite?.trim() || null,
    dive.site?.trim() || null,
    dive.sourceSiteNames.shearwater?.trim() || null,
    dive.sourceSiteNames["shearwater-ble"]?.trim() || null,
    dive.sourceSiteNames.subsurface?.trim() || null,
    dive.sourceSiteNames.uddf?.trim() || null,
    dive.sourceSiteNames.fit?.trim() || null,
    dive.location?.trim() || null,
    dive.resolvedLocation?.trim() || null,
    dive.resolvedCity?.trim() || null,
    dive.resolvedCountry?.trim() || null,
    dive.userSiteCatalogId?.trim() || null,
    dive.gpsEntryLat,
    dive.gpsEntryLng,
    dive.gpsExitLat,
    dive.gpsExitLng,
    dive.userGpsLat,
    dive.userGpsLng,
  ]);
}

export function catalogSiteLocation(site: CatalogSite) {
  const values = [site.place.locality, site.place.region, site.place.country]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(values)].join(" · ");
}

function buildCatalogNameIndex(catalog: DiveSiteCatalog) {
  const index = new Map<string, DiveSiteAuditCandidate[]>();
  for (const site of catalog.sites) {
    if (site.status !== "active") continue;
    for (const matchedName of [site.name, ...site.aliases]) {
      const normalized = normalizeName(matchedName);
      if (!normalized) continue;
      const candidates = index.get(normalized) ?? [];
      if (!candidates.some((candidate) => candidate.site.id === site.id)) {
        candidates.push({ site, matchedName });
        candidates.sort((a, b) => a.site.name.localeCompare(b.site.name));
        index.set(normalized, candidates);
      }
    }
  }
  return index;
}

function preferredDiveSiteName(dive: DiveSiteAuditDive) {
  return (
    dive.userSite ??
    dive.site ??
    dive.sourceSiteNames.shearwater ??
    dive.sourceSiteNames["shearwater-ble"] ??
    dive.sourceSiteNames.subsurface ??
    dive.sourceSiteNames.uddf ??
    dive.sourceSiteNames.fit ??
    null
  );
}

function preferredDiveLocationName(dive: DiveSiteAuditDive) {
  return (
    dive.location ??
    dive.resolvedLocation ??
    dive.resolvedCity ??
    dive.resolvedCountry ??
    null
  );
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function compareAuditGroups(a: DiveSiteAuditGroup, b: DiveSiteAuditGroup) {
  return (
    a.diveSiteName.localeCompare(b.diveSiteName) ||
    (a.diveLocationName ?? "").localeCompare(b.diveLocationName ?? "")
  );
}
