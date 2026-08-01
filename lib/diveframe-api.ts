import { Capacitor } from "@capacitor/core";

/**
 * Absolute origin for same-site API helpers when the app is not served from
 * the Cloudflare Worker (Capacitor static shell, etc.). Empty means use
 * relative `/api/...` paths on the deployed site and in `vinext dev`.
 */
export function diveFrameApiOrigin(): string {
  if (typeof window === "undefined") return "";
  if (Capacitor.isNativePlatform()) {
    return "https://divelog.fishese.cc";
  }
  return "";
}

export function diveFrameApiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${diveFrameApiOrigin()}${normalized}`;
}
