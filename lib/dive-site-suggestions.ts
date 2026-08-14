import type { CatalogSite, DiveSiteCatalog, NearbyCatalogSite } from "./dive-site-catalog";

export type NearbySite =
  | NearbyCatalogSite
  | {
      id: string;
      catalogId?: string;
      name: string;
      aliases?: string[];
      latitude: number;
      longitude: number;
      location?: string | null;
      distanceKm: number;
      source: "openstreetmap";
    };

export type SiteSelection = {
  name: string;
  source: "catalog" | "suggestion" | "manual";
  catalogId?: string;
  latitude: number | null;
  longitude: number | null;
  location?: string | null;
};

export type SiteLocationSuggestion = { site: string; location: string };

export type CatalogSiteNameMatch = {
  site: CatalogSite;
  matchedName: string;
  kind: "exact" | "close";
  score: number;
};

export function nearbySiteCatalogId(site: NearbySite) {
  return site.catalogId ?? site.id.replace(/^(?:session-)?catalog-/, "");
}

export function nearbySiteSelection(
  site: NearbySite,
  name: string,
): SiteSelection {
  return {
    name,
    source: site.source === "catalog" ? "catalog" : "suggestion",
    catalogId:
      site.source === "catalog" ? nearbySiteCatalogId(site) : undefined,
    latitude: site.latitude,
    longitude: site.longitude,
    location: site.location,
  };
}

export function catalogSiteSelection(site: CatalogSite): SiteSelection {
  return {
    name: site.name,
    source: "catalog",
    catalogId: site.id,
    latitude: site.coordinates.latitude,
    longitude: site.coordinates.longitude,
    location: site.place.country ?? site.place.region ?? site.place.locality,
  };
}

/**
 * Find deliberately conservative local catalog matches for a typed site name.
 * This stays synchronous and bounded so typing never starts a network lookup.
 */
export function catalogSiteNameMatches(
  catalog: DiveSiteCatalog,
  query: string | null | undefined,
  limit = 5,
): CatalogSiteNameMatch[] {
  const normalizedQuery = normalizeSiteText(query ?? null);
  if (!normalizedQuery || normalizedQuery.length < 2 || limit <= 0) return [];

  const matches: CatalogSiteNameMatch[] = [];
  for (const site of catalog.sites) {
    if (site.status !== "active") continue;
    let best: CatalogSiteNameMatch | null = null;
    for (const matchedName of [site.name, ...site.aliases]) {
      const normalizedName = normalizeSiteText(matchedName);
      if (!normalizedName) continue;
      const score = siteNameMatchScore(normalizedQuery, normalizedName);
      if (score === null) continue;
      const candidate: CatalogSiteNameMatch = {
        site,
        matchedName,
        kind: normalizedName === normalizedQuery ? "exact" : "close",
        score,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) matches.push(best);
  }

  return matches
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.site.name.localeCompare(right.site.name) ||
        left.site.id.localeCompare(right.site.id),
    )
    .slice(0, limit);
}

export function buildSiteNameSuggestions(
  catalog: DiveSiteCatalog,
  storedNames: Array<string | null>,
) {
  return uniqueSiteSuggestions([
    ...storedNames,
    ...catalog.sites.flatMap((site) => [site.name, ...site.aliases]),
  ]);
}

export function buildSiteLocationSuggestions(options: {
  catalog: DiveSiteCatalog;
  selectedSite: string;
  storedLocations: Array<string | null>;
  siteLocationPairs: SiteLocationSuggestion[];
}) {
  const query = normalizeSiteText(options.selectedSite);
  const matchingStored = query
    ? options.siteLocationPairs
        .filter((pair) => normalizeSiteText(pair.site) === query)
        .map((pair) => pair.location)
    : [];
  const matchingCatalog = query
    ? options.catalog.sites
        .filter(
          (site) =>
            normalizeSiteText(site.name) === query ||
            site.aliases.some((alias) => normalizeSiteText(alias) === query),
        )
        .flatMap((site) => [
          site.place.locality,
          site.place.region,
          site.place.country,
        ])
    : [];
  const matches = [...matchingStored, ...matchingCatalog];
  return uniqueSiteSuggestions(
    matches.length
      ? matches
      : [
          ...options.storedLocations,
          ...options.catalog.sites.flatMap((site) => [
            site.place.locality,
            site.place.region,
            site.place.country,
          ]),
        ],
  );
}

export function normalizeSiteText(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized.toLocaleLowerCase("en") : null;
}

function siteNameMatchScore(query: string, candidate: string) {
  if (query === candidate) return 1;

  const shorterLength = Math.min(query.length, candidate.length);
  if (shorterLength >= 5 && (candidate.includes(query) || query.includes(candidate))) {
    return 0.82 + (shorterLength / Math.max(query.length, candidate.length)) * 0.12;
  }

  const distance = editDistance(query, candidate);
  const allowedDistance = query.length >= 10 ? 2 : query.length >= 6 ? 1 : 0;
  if (distance > allowedDistance) return null;
  return 0.7 - (distance / Math.max(query.length, candidate.length)) * 0.2;
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function uniqueSiteSuggestions(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
}
