"use client";

import Link from "next/link";
import { Smartphone } from "lucide-react";
import { useAppI18n } from "../AppI18nProvider";
import { diveComputerCapability } from "../../lib/dive-computer-capability";
import { useAppRouteHref } from "../AppRouteProvider";

/**
 * The Android app is the home for native Shearwater Bluetooth access. Keep a
 * compact link in the web header where that action appears in the APK.
 */
export function AndroidAppLink() {
  const { t } = useAppI18n();
  const appRouteHref = useAppRouteHref();

  if (diveComputerCapability.isAvailable()) return null;

  return (
    <Link
      href={appRouteHref("/android")}
      className="button button-quiet topbar-android-link"
      aria-label={t("androidAppLink")}
      title={t("androidAppLink")}
    >
      <Smartphone size={17} />
      {t("androidAppLink")}
    </Link>
  );
}
