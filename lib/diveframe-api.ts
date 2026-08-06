import { Capacitor } from "@capacitor/core";
import {
  DIVEFRAME_HOSTED_WEB_ORIGINS,
  DIVEFRAME_PRODUCTION_ORIGIN,
} from "./diveframe-origins";

export {
  DIVEFRAME_HOSTED_WEB_ORIGINS,
  DIVEFRAME_PRODUCTION_ORIGIN,
  DIVEFRAME_WORKER_ORIGIN,
} from "./diveframe-origins";

/**
 * Absolute origin for same-site API helpers when the app is not served from
 * the Cloudflare Worker (Capacitor static shell, etc.). Empty means use
 * relative `/api/...` paths on the deployed site and in `vinext dev`.
 *
 * Native builds call the public DiveFrame worker by default. Override at build
 * time with NEXT_PUBLIC_DIVEFRAME_API_ORIGIN (for example a LAN `vinext dev`
 * URL) when testing against a local API that already sends Capacitor CORS.
 */
export function diveFrameApiOrigin(): string {
  if (typeof window === "undefined") return "";
  if (Capacitor.isNativePlatform()) {
    const override = process.env.NEXT_PUBLIC_DIVEFRAME_API_ORIGIN?.trim();
    if (override) return override.replace(/\/$/, "");
    return DIVEFRAME_PRODUCTION_ORIGIN;
  }
  return "";
}

export function diveFrameApiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${diveFrameApiOrigin()}${normalized}`;
}

export function diveFrameProductionApiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${DIVEFRAME_PRODUCTION_ORIGIN}${normalized}`;
}

/**
 * What's New should prefer the page's own `/api/whats-new` when already on a
 * hosted DiveFrame origin (avoids workers.dev → custom-domain CORS). Local
 * vinext and the APK still read the published production feed.
 */
export function diveFrameWhatsNewUrl(): string {
  if (
    typeof window !== "undefined" &&
    DIVEFRAME_HOSTED_WEB_ORIGINS.has(window.location.origin)
  ) {
    return "/api/whats-new";
  }
  return diveFrameProductionApiUrl("/api/whats-new");
}
