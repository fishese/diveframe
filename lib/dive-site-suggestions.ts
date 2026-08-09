import type { DiveSiteCatalog, NearbyCatalogSite } from "./dive-site-catalog";

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

export function uniqueSiteSuggestions(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
}
