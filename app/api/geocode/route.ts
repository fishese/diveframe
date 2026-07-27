import { getGeocode, saveGeocode } from "@/lib/storage";

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 2 || query.length > 200) {
    return Response.json({ error: "Supply a valid location name." }, { status: 400 });
  }

  const cacheKey = query.toLocaleLowerCase("en");
  const cached = await getGeocode(cacheKey);
  if (cached) {
    return Response.json({
      location: {
        latitude: cached.latitude,
        longitude: cached.longitude,
        displayName: cached.displayName,
      },
    });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "DiveFrame/1.0 (private dive logbook)",
    },
  });
  if (!response.ok) {
    return Response.json(
      { error: "Map lookup is temporarily unavailable." },
      { status: 502 },
    );
  }

  const matches = (await response.json()) as NominatimResult[];
  const match = matches[0];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!match || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json({ location: null });
  }

  const location = {
    query: cacheKey,
    displayName: match.display_name || query,
    latitude,
    longitude,
    fetchedAt: new Date().toISOString(),
  };
  await saveGeocode(location);

  return Response.json({
    location: {
      latitude,
      longitude,
      displayName: location.displayName,
    },
  });
}
