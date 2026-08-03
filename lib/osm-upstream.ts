/**
 * Shared Nominatim / Overpass upstream helpers.
 *
 * Nominatim usage policy expects a clear User-Agent, about one request per
 * second, and caching of identical lookups. Operational telemetry must never
 * include private dive coordinates or free-text location queries.
 */

export const NOMINATIM_MIN_INTERVAL_MS = 1_100;
export const DEFAULT_OSM_CACHE_TTL_MS = 60 * 60 * 1000;

export type OsmProvider = "nominatim" | "overpass";
export type OsmOperation =
  | "search"
  | "reverse"
  | "nearby-overpass"
  | "nearby-nominatim";

export type OsmUpstreamErrorEvent = {
  event: "osm_upstream_error";
  provider: OsmProvider;
  operation: OsmOperation;
  status: number | null;
  reason: "http" | "network" | "invalid-json" | "rate-limited";
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const EMPTY = Symbol("osm-cache-empty");

const responseCache = new Map<string, CacheEntry>();
const rateGates = new Map<
  string,
  { nextAllowedAt: number; chain: Promise<void> }
>();

export function osmCacheKey(parts: Record<string, string>) {
  return Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key]}`)
    .join("&");
}

export function readOsmCache<T>(key: string, now = Date.now()): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    responseCache.delete(key);
    return null;
  }
  if (entry.value === EMPTY) return null;
  return entry.value as T;
}

/** Returns whether a cache entry exists, including an explicit cached miss. */
export function readOsmCacheEntry<T>(
  key: string,
  now = Date.now(),
): { hit: false } | { hit: true; value: T | null } {
  const entry = responseCache.get(key);
  if (!entry) return { hit: false };
  if (entry.expiresAt <= now) {
    responseCache.delete(key);
    return { hit: false };
  }
  return {
    hit: true,
    value: entry.value === EMPTY ? null : (entry.value as T),
  };
}

export function writeOsmCache(
  key: string,
  value: unknown,
  ttlMs = DEFAULT_OSM_CACHE_TTL_MS,
  now = Date.now(),
) {
  responseCache.set(key, {
    value: value === null ? EMPTY : value,
    expiresAt: now + ttlMs,
  });
}

export function clearOsmUpstreamForTests() {
  responseCache.clear();
  rateGates.clear();
}

export async function withUpstreamRateLimit<T>(
  gateId: string,
  minIntervalMs: number,
  run: () => Promise<T>,
  now = () => Date.now(),
): Promise<T> {
  const existing = rateGates.get(gateId) ?? {
    nextAllowedAt: 0,
    chain: Promise.resolve(),
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const scheduled = existing.chain.then(async () => {
    const waitMs = Math.max(0, existing.nextAllowedAt - now());
    if (waitMs > 0) await delay(waitMs);
    existing.nextAllowedAt = now() + minIntervalMs;
  });
  existing.chain = scheduled.then(() => gate).catch(() => undefined);
  rateGates.set(gateId, existing);
  await scheduled;
  try {
    return await run();
  } finally {
    release();
  }
}

export function logOsmUpstreamError(
  event: Omit<OsmUpstreamErrorEvent, "event">,
  sink: (line: string) => void = defaultErrorSink,
) {
  const payload: OsmUpstreamErrorEvent = {
    event: "osm_upstream_error",
    provider: event.provider,
    operation: event.operation,
    status: event.status,
    reason: event.reason,
  };
  sink(JSON.stringify(payload));
}

function defaultErrorSink(line: string) {
  console.warn(line);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
