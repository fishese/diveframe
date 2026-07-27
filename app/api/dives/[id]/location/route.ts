import { getDive, saveResolvedLocation } from "@/lib/storage";

type NominatimReverse = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await getDive(id);
  if (!result) {
    return Response.json({ error: "Dive not found." }, { status: 404 });
  }
  if (result.dive.resolvedLocation) return Response.json(result);

  const { gpsEntryLat: latitude, gpsEntryLng: longitude } = result.dive;
  if (latitude === null || longitude === null) {
    return Response.json({ error: "This dive has no GPS entry point." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "10");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "DiveFrame/1.0 (private dive logbook)",
    },
  });
  if (!response.ok) {
    return Response.json(
      { error: "GPS location lookup is temporarily unavailable." },
      { status: 502 },
    );
  }

  const match = (await response.json()) as NominatimReverse;
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

  return Response.json(
    await saveResolvedLocation(id, {
      label,
      city,
      country,
    }),
  );
}
