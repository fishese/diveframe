export type DiveMapCoordinateSource = "computer" | "user";

export type DiveMapCoordinates = {
  latitude: number;
  longitude: number;
  source: DiveMapCoordinateSource;
};

export type DiveGpsInput = {
  gpsEntryLat: number | null;
  gpsEntryLng: number | null;
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
  if (dive.gpsEntryLat !== null && dive.gpsEntryLng !== null) {
    return { latitude: dive.gpsEntryLat, longitude: dive.gpsEntryLng, source: "computer" };
  }
  if (dive.userGpsLat !== null && dive.userGpsLng !== null) {
    return { latitude: dive.userGpsLat, longitude: dive.userGpsLng, source: "user" };
  }
  return null;
}
