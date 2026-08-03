import { jsonWithCors, optionsWithCors } from "@/lib/api-cors";
import { locationQueries } from "@/lib/geocode-query";
import {
  NOMINATIM_MIN_INTERVAL_MS,
  logOsmUpstreamError,
  osmCacheKey,
  readOsmCacheEntry,
  withUpstreamRateLimit,
  writeOsmCache,
} from "@/lib/osm-upstream";

export { locationQueries };

type NominatimSearchResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

type NominatimReverseResult = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

export async function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = nullableCoordinate(params.get("lat"));
  const longitude = nullableCoordinate(params.get("lng"));

  if (latitude !== null && longitude !== null) {
    return reverseGeocode(request, latitude, longitude);
  }

  const query = params.get("q")?.trim();
  if (!query || query.length < 2 || query.length > 200) {
    return jsonWithCors(
      request,
      { error: "Supply a valid location or GPS coordinate." },
      { status: 400 },
    );
  }

  const queries = locationQueries(query);
  let match: NominatimSearchResult | undefined;
  let matchedQuery = query;
  for (let index = 0; index < queries.length; index += 1) {
    const result = await searchLocation(queries[index]);
    if (result === "unavailable") {
      return jsonWithCors(
        request,
        { error: "Map lookup is temporarily unavailable." },
        { status: 502 },
      );
    }
    if (result) {
      match = result;
      matchedQuery = queries[index];
      break;
    }
  }
  const matchLatitude = Number(match?.lat);
  const matchLongitude = Number(match?.lon);
  if (
    !match ||
    !Number.isFinite(matchLatitude) ||
    !Number.isFinite(matchLongitude)
  ) {
    return jsonWithCors(request, { location: null });
  }

  return jsonWithCors(request, {
    location: {
      latitude: matchLatitude,
      longitude: matchLongitude,
      displayName: match.display_name || matchedQuery,
      matchedQuery,
      broadened: matchedQuery !== query,
    },
  });
}

async function searchLocation(query: string) {
  const cacheKey = osmCacheKey({
    provider: "nominatim",
    op: "search",
    q: query.toLocaleLowerCase("en"),
  });
  const cached = readOsmCacheEntry<NominatimSearchResult | null>(cacheKey);
  if (cached.hit) return cached.value;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  try {
    return await withUpstreamRateLimit(
      "nominatim",
      NOMINATIM_MIN_INTERVAL_MS,
      async () => {
        const response = await fetch(url, {
          headers: nominatimHeaders(),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          logOsmUpstreamError({
            provider: "nominatim",
            operation: "search",
            status: response.status,
            reason: "http",
          });
          return "unavailable" as const;
        }
        let payload: NominatimSearchResult[];
        try {
          payload = (await response.json()) as NominatimSearchResult[];
        } catch {
          logOsmUpstreamError({
            provider: "nominatim",
            operation: "search",
            status: response.status,
            reason: "invalid-json",
          });
          return "unavailable" as const;
        }
        const match = payload[0] ?? null;
        writeOsmCache(cacheKey, match);
        return match;
      },
    );
  } catch {
    logOsmUpstreamError({
      provider: "nominatim",
      operation: "search",
      status: null,
      reason: "network",
    });
    return "unavailable" as const;
  }
}

async function reverseGeocode(
  request: Request,
  latitude: number,
  longitude: number,
) {
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return jsonWithCors(
      request,
      { error: "Supply valid GPS coordinates." },
      { status: 400 },
    );
  }

  // Rounded cache key improves hit rate without logging precise dive pins.
  const cacheKey = osmCacheKey({
    provider: "nominatim",
    op: "reverse",
    lat: latitude.toFixed(3),
    lng: longitude.toFixed(3),
  });
  const cached = readOsmCacheEntry<{
    location: { label: string; city: string | null; country: string | null };
  }>(cacheKey);
  if (cached.hit && cached.value) {
    return jsonWithCors(request, cached.value);
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "10");

  let response: Response;
  try {
    response = await withUpstreamRateLimit(
      "nominatim",
      NOMINATIM_MIN_INTERVAL_MS,
      () =>
        fetch(url, {
          headers: nominatimHeaders(),
          signal: AbortSignal.timeout(10_000),
        }),
    );
  } catch {
    logOsmUpstreamError({
      provider: "nominatim",
      operation: "reverse",
      status: null,
      reason: "network",
    });
    return jsonWithCors(
      request,
      { error: "GPS location lookup is temporarily unavailable." },
      { status: 502 },
    );
  }
  if (!response.ok) {
    logOsmUpstreamError({
      provider: "nominatim",
      operation: "reverse",
      status: response.status,
      reason: "http",
    });
    return jsonWithCors(
      request,
      { error: "GPS location lookup is temporarily unavailable." },
      { status: 502 },
    );
  }

  let match: NominatimReverseResult;
  try {
    match = (await response.json()) as NominatimReverseResult;
  } catch {
    logOsmUpstreamError({
      provider: "nominatim",
      operation: "reverse",
      status: response.status,
      reason: "invalid-json",
    });
    return jsonWithCors(
      request,
      { error: "GPS location lookup returned an invalid response." },
      { status: 502 },
    );
  }
  const address = match.address ?? {};
  const city =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    null;
  const country = address.country ?? null;
  const label =
    [city, country].filter(Boolean).join(", ") ||
    match.display_name ||
    `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  const body = { location: { label, city, country } };
  writeOsmCache(cacheKey, body);
  return jsonWithCors(request, body);
}

function nullableCoordinate(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nominatimHeaders() {
  return {
    Accept: "application/json",
    "Accept-Language": "en",
    "User-Agent": "DiveFrame/1.0 (device-local dive logbook)",
  };
}
