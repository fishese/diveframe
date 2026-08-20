import { Capacitor } from "@capacitor/core";

export const PREVIEW_APK_URL =
  "https://github.com/fishese/diveframe/releases/download/preview/diveframe-preview.apk";
export const FDROID_PACKAGE_URL =
  "https://f-droid.org/packages/cc.fishese.divelog/";

export type NativeUpdateChannel = "preview" | "fdroid";

export type NativeAppInfo = {
  packageName: string;
  versionName: string;
  versionCode: number;
  channel: NativeUpdateChannel;
};

type DiveFrameNativeBridge = {
  getAppInfo?: () => string;
};

export function nativeUpdateChannelForPackage(
  packageName: string,
): NativeUpdateChannel {
  return packageName.endsWith(".preview") ? "preview" : "fdroid";
}

export function getNativeAppInfo(): NativeAppInfo | null {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return null;
  }

  const bridge = (
    window as typeof window & { DiveFrameNative?: DiveFrameNativeBridge }
  ).DiveFrameNative;
  if (!bridge?.getAppInfo) return null;

  try {
    const value = JSON.parse(bridge.getAppInfo()) as Record<string, unknown>;
    if (
      typeof value.packageName !== "string" ||
      !value.packageName.trim() ||
      typeof value.versionName !== "string" ||
      !value.versionName.trim() ||
      typeof value.versionCode !== "number" ||
      !Number.isSafeInteger(value.versionCode) ||
      value.versionCode < 1
    ) {
      return null;
    }

    return {
      packageName: value.packageName,
      versionName: value.versionName,
      versionCode: value.versionCode,
      channel: nativeUpdateChannelForPackage(value.packageName),
    };
  } catch {
    return null;
  }
}

export function updateDestinationForChannel(channel: NativeUpdateChannel) {
  return channel === "preview" ? PREVIEW_APK_URL : FDROID_PACKAGE_URL;
}
