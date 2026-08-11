export type DiveMapCoordinateSource = "computer" | "user";

export type DiveMapCoordinates = {
  latitude: number;
  longitude: number;
  source: DiveMapCoordinateSource;
};

export type DiveGpsInput = {
  gpsEntryLat: number | null;
  gpsEntryLng: number | null;
  gpsExitLat?: number | null;
  gpsExitLng?: number | null;
  userGpsLat: number | null;
  userGpsLng: number | null;
};

/**
 * Resolves the coordinates to show on the map: dive-computer GPS always wins
 * over a user-entered/photo-derived GPS. Callers fall back to name geocoding
 * when this returns null. Never mutates or reads back into gpsEntry* fields.
 */
export function resolveDiveMapCoordinates(
  dive: DiveGpsInput,
): DiveMapCoordinates | null {
  const computer = validatedPair(dive.gpsEntryLat, dive.gpsEntryLng);
  if (computer) {
    return { ...computer, source: "computer" };
  }
  const computerExit = validatedPair(dive.gpsExitLat, dive.gpsExitLng);
  if (computerExit) {
    return { ...computerExit, source: "computer" };
  }
  const user = validatedPair(dive.userGpsLat, dive.userGpsLng);
  if (user) {
    return { ...user, source: "user" };
  }
  return null;
}

function validatedPair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): { latitude: number; longitude: number } | null {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
      ? { latitude, longitude }
      : null
  );
}
