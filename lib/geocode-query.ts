/** Broaden comma-separated place queries for Nominatim fallback searches. */
export function locationQueries(query: string) {
  const parts = query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const normalized = parts.join(", ");
  const broader = parts.length > 1 ? parts.slice(1).join(", ") : null;
  return broader && broader !== normalized
    ? [normalized, broader]
    : [normalized];
}
