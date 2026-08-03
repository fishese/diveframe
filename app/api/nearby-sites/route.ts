import diveSiteCatalog from "@/data/dive-sites.json";
import { jsonWithCors, optionsWithCors } from "@/lib/api-cors";
import { NEARBY_SITE_RADIUS_KM } from "@/lib/dive-site-catalog";
import {
  NOMINATIM_MIN_INTERVAL_MS,
  logOsmUpstreamError,
  osmCacheKey,
  readOsmCacheEntry,
  withUpstreamRateLimit,
  writeOsmCache,
} from "@/lib/osm-upstream";

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

type NominatimPlace = {
  place_id: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
};

type NearbySitePayload = {
  id: string;
  name: string;
  aliases?: string[];
  latitude: number;
  longitude: number;
  distanceKm: number;
  source: string;
  location?: string | null;
};

const LOCAL_DIVE_SITES = diveSiteCatalog.sites
  .filter((site) => site.status === "active")
  .map((site) => ({
    id: site.id,
    name: site.name,
    aliases: site.aliases,
    latitude: site.coordinates.latitude,
    longitude: site.coordinates.longitude,
  }));

export async function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lng"));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return jsonWithCors(
      request,
      { error: "Supply valid GPS coordinates." },
      { status: 400 },
    );
  }

  const radiusKm = NEARBY_SITE_RADIUS_KM;
  const catalogSites = LOCAL_DIVE_SITES.map((site) => ({
    ...site,
    distanceKm: distanceKm(
      latitude,
      longitude,
      site.latitude,
      site.longitude,
    ),
  }))
    .filter((site) => site.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (catalogSites.length) {
    return jsonWithCors(request, {
      source: "catalog",
      sites: catalogSites.slice(0, 12).map((site) => ({
        id: `catalog-${site.id}`,
        name: site.name,
        aliases: site.aliases,
        latitude: site.latitude,
        longitude: site.longitude,
        distanceKm: site.distanceKm,
        source: "catalog",
      })),
    });
  }

  const cacheKey = osmCacheKey({
    provider: "nearby",
    lat: latitude.toFixed(3),
    lng: longitude.toFixed(3),
    radius: String(radiusKm),
  });
  const cached = readOsmCacheEntry<{
    source: string;
    sites: NearbySitePayload[];
  }>(cacheKey);
  if (cached.hit && cached.value) {
    return jsonWithCors(request, cached.value);
  }

  const radius = radiusKm * 1000;
  const query = `
    [out:json][timeout:6];
    (
      nwr(around:${radius},${latitude},${longitude})["sport"="scuba_diving"]["name"];
      nwr(around:${radius},${latitude},${longitude})["scuba_diving:divespot"="yes"]["name"];
    );
    out center tags;
  `;
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  let response: Response | null = null;
  for (const endpoint of endpoints) {
    try {
      const candidate = await withUpstreamRateLimit(
        "overpass",
        1_000,
        () =>
          fetch(endpoint, {
            method: "POST",
            signal: AbortSignal.timeout(8_000),
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded;charset=UTF-8",
              "User-Agent": "DiveFrame/1.0 (private dive logbook)",
            },
            body: new URLSearchParams({ data: query }),
          }),
      );
      if (candidate.ok) {
        response = candidate;
        break;
      }
      logOsmUpstreamError({
        provider: "overpass",
        operation: "nearby-overpass",
        status: candidate.status,
        reason: "http",
      });
    } catch {
      logOsmUpstreamError({
        provider: "overpass",
        operation: "nearby-overpass",
        status: null,
        reason: "network",
      });
    }
  }
  if (!response) {
    const sites = await searchDivePlaces(latitude, longitude, radiusKm);
    const body = { source: "openstreetmap", sites };
    writeOsmCache(cacheKey, body);
    return jsonWithCors(request, body);
  }

  let data: { elements?: OverpassElement[] };
  try {
    data = (await response.json()) as { elements?: OverpassElement[] };
  } catch {
    logOsmUpstreamError({
      provider: "overpass",
      operation: "nearby-overpass",
      status: response.status,
      reason: "invalid-json",
    });
    const sites = await searchDivePlaces(latitude, longitude, radiusKm);
    const body = { source: "openstreetmap", sites };
    writeOsmCache(cacheKey, body);
    return jsonWithCors(request, body);
  }
  const seen = new Set<string>();
  const sites = (data.elements ?? [])
    .flatMap((element) => {
      const name = element.tags?.name?.trim();
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (!name || lat === undefined || lng === undefined) return [];
      const key = name.toLocaleLowerCase("en");
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          id: `osm-${element.id}`,
          name,
          latitude: lat,
          longitude: lng,
          distanceKm: distanceKm(latitude, longitude, lat, lng),
          source: "openstreetmap",
        },
      ];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 12);

  const body = { source: "openstreetmap", sites };
  writeOsmCache(cacheKey, body);
  return jsonWithCors(request, body);
}

async function searchDivePlaces(
  latitude: number,
  longitude: number,
  radiusKm: number,
) {
  const delta = 0.35;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", "scuba diving");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "12");
  url.searchParams.set(
    "viewbox",
    `${longitude - delta},${latitude + delta},${longitude + delta},${latitude - delta}`,
  );
  try {
    const response = await withUpstreamRateLimit(
      "nominatim",
      NOMINATIM_MIN_INTERVAL_MS,
      () =>
        fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: {
            Accept: "application/json",
            "Accept-Language": "en",
            "User-Agent": "DiveFrame/1.0 (private dive logbook)",
          },
        }),
    );
    if (!response.ok) {
      logOsmUpstreamError({
        provider: "nominatim",
        operation: "nearby-nominatim",
        status: response.status,
        reason: "http",
      });
      return [];
    }
    const places = (await response.json()) as NominatimPlace[];
    return places
      .flatMap((place) => {
        const lat = Number(place.lat);
        const lng = Number(place.lon);
        const name =
          place.name?.trim() || place.display_name?.split(",")[0]?.trim();
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        const siteDistanceKm = distanceKm(latitude, longitude, lat, lng);
        if (siteDistanceKm > radiusKm) return [];
        return [
          {
            id: `osm-place-${place.place_id}`,
            name,
            latitude: lat,
            longitude: lng,
            distanceKm: siteDistanceKm,
            source: "openstreetmap",
          },
        ];
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  } catch {
    logOsmUpstreamError({
      provider: "nominatim",
      operation: "nearby-nominatim",
      status: null,
      reason: "network",
    });
    return [];
  }
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
  // Floating-point rounding can put the haversine fraction just outside
  // [0, 1] for antipodal points, which would otherwise produce NaN.
  const clamped = Math.min(1, Math.max(0, a));
  return 6371 * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}
