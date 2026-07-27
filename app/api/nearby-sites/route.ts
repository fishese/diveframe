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
    return Response.json({ error: "Supply valid GPS coordinates." }, { status: 400 });
  }

  const radius = 30_000;
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
      const candidate = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "DiveFrame/1.0 (private dive logbook)",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (candidate.ok) {
        response = candidate;
        break;
      }
    } catch {
      // Try the next public Overpass mirror.
    }
  }
  if (!response) {
    return Response.json({
      sites: await searchDivePlaces(latitude, longitude),
    });
  }

  const data = (await response.json()) as { elements?: OverpassElement[] };
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
        },
      ];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 12);

  return Response.json({ sites });
}

async function searchDivePlaces(latitude: number, longitude: number) {
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
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "DiveFrame/1.0 (private dive logbook)",
      },
    });
    if (!response.ok) return [];
    const places = (await response.json()) as NominatimPlace[];
    return places.flatMap((place) => {
      const lat = Number(place.lat);
      const lng = Number(place.lon);
      const name = place.name?.trim() || place.display_name?.split(",")[0]?.trim();
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{
        id: `osm-place-${place.place_id}`,
        name,
        latitude: lat,
        longitude: lng,
        distanceKm: distanceKm(latitude, longitude, lat, lng),
      }];
    }).sort((a, b) => a.distanceKm - b.distanceKm);
  } catch {
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
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
