export type CoordinatePair = {
  latitude: number;
  longitude: number;
};

const DECIMAL_NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const COORDINATE_PAIR = new RegExp(
  `^\\s*(${DECIMAL_NUMBER})\\s*[,，]\\s*(${DECIMAL_NUMBER})\\s*$`,
);

/**
 * Parse a decimal latitude/longitude pair. Latitude is always first so the
 * value can be pasted directly from common map and GPS tools.
 */
export function parseCoordinatePair(value: string): CoordinatePair | null {
  const match = COORDINATE_PAIR.exec(value);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function formatCoordinatePair(
  latitude: number | null,
  longitude: number | null,
): string {
  return latitude === null || longitude === null
    ? ""
    : `${String(latitude)}, ${String(longitude)}`;
}
