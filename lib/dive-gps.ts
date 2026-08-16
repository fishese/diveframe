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
  exportGpsPreference?: string | null;
};

export function normalizeExportGpsPreference(
  value: unknown,
): "computer" | "user" | "user-if-missing" {
  return value === "user" || value === "user-if-missing" || value === "computer"
    ? value
    : "computer";
}

export function prefersUserExportGps(value: unknown): boolean {
  return normalizeExportGpsPreference(value) === "user";
}

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

/**
 * Resolves coordinates for site suggestions and export. A stored "user"
 * preference lets a valid user pair win; missing, legacy, and invalid values
 * keep computer/source-first fallback. Never mutates gpsEntry* or gpsExit*.
 */
export function resolvePreferredDiveCoordinates(
  dive: DiveGpsInput,
): DiveMapCoordinates | null {
  const computer = validatedPair(dive.gpsEntryLat, dive.gpsEntryLng);
  const computerExit = validatedPair(dive.gpsExitLat, dive.gpsExitLng);
  const source = computer ?? computerExit;
  const user = validatedPair(dive.userGpsLat, dive.userGpsLng);
  if (prefersUserExportGps(dive.exportGpsPreference) && user) {
    return { ...user, source: "user" };
  }
  if (source) {
    return { ...source, source: "computer" };
  }
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
