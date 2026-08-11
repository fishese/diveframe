import type { CatalogSite, DiveSiteCatalog } from "./dive-site-catalog";

export type DiveSiteCatalogGroup = {
  country: string;
  sites: CatalogSite[];
};

export function catalogSitePlace(site: CatalogSite) {
  const parts = [
    site.place.locality,
    site.place.region,
    site.place.country,
  ];
  const seen = new Set<string>();
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => {
      if (!part) return false;
      const key = part.toLocaleLowerCase("en");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

export function groupDiveSiteCatalog(
  catalog: Pick<DiveSiteCatalog, "sites">,
  query: string,
  unknownCountry: string,
): DiveSiteCatalogGroup[] {
  const needle = normalize(query);
  const groups = new Map<string, CatalogSite[]>();

  catalog.sites.forEach((site) => {
    if (needle && !catalogSiteSearchText(site).includes(needle)) return;
    const country =
      site.place.country?.trim() ||
      site.place.countryCode?.trim() ||
      unknownCountry;
    const sites = groups.get(country) ?? [];
    sites.push(site);
    groups.set(country, sites);
  });

  return Array.from(groups, ([country, sites]) => ({
    country,
    sites: sites.sort(
      (left, right) =>
        catalogSitePlace(left).localeCompare(catalogSitePlace(right)) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    ),
  })).sort((left, right) => left.country.localeCompare(right.country));
}

function catalogSiteSearchText(site: CatalogSite) {
  return normalize(
    [
      site.id,
      site.name,
      ...site.aliases,
      site.place.countryCode,
      site.place.country,
      site.place.region,
      site.place.locality,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .trim();
}
