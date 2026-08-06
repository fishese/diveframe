/** Canonical hosted origin used for public, cross-origin app feeds. */
export const DIVEFRAME_PRODUCTION_ORIGIN = "https://divelog.fishese.cc";

/** Alternate Cloudflare Worker hostname for the same deployment. */
export const DIVEFRAME_WORKER_ORIGIN =
  "https://diveframe.fishese.workers.dev";

/** Hosted web origins that already serve `/api/*` (use same-origin fetches). */
export const DIVEFRAME_HOSTED_WEB_ORIGINS = new Set([
  DIVEFRAME_PRODUCTION_ORIGIN,
  DIVEFRAME_WORKER_ORIGIN,
]);
