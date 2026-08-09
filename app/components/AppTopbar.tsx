"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Bluetooth,
  House,
  Info,
  MapPinned,
  NotebookPen,
  Settings,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { diveComputerCapability } from "../../lib/dive-computer-capability";
import { useAppI18n } from "../AppI18nProvider";
import { AndroidAppLink } from "./AndroidAppLink";

export type AppTopbarBrand =
  | {
      mode: "link";
      href: string;
      ariaLabel?: string;
    }
  | {
      mode: "button";
      onClick: () => void;
      ariaLabel?: string;
    };

type AppTopbarProps = {
  subtitle: string;
  brand: AppTopbarBrand;
  /** House control → front of the app. Hide on the home list itself. */
  showHome?: boolean;
  /** Client-side home when already on `/` (e.g. leave dive detail). */
  onHomeFront?: () => void;
  /**
   * About, Dive Map, Bluetooth / Android app, memo, and import log.
   * Hidden on the image composer.
   */
  showImportCluster?: boolean;
  /** Link to the device-local Dive Map. Hide on the map page itself. */
  showDiveMap?: boolean;
  onImportLog?: () => void;
  onBleImport?: () => void;
  importBusy?: boolean;
  leadingActions?: ReactNode;
  /** Rendered immediately after the home control (e.g. composer back). */
  afterHomeActions?: ReactNode;
  trailingActions?: ReactNode;
  className?: string;
};

/**
 * Shared app chrome.
 * - Brand: dive-related surfaces return to the dive list; others go home.
 * - Home: every page except the home list → front of the app.
 * - About: every page except image compose.
 * - Settings: every page.
 * - Dive Map + BLE/Android + memo + import: every page except image compose.
 */
export function AppTopbar({
  subtitle,
  brand,
  showHome = true,
  onHomeFront,
  showImportCluster = true,
  showDiveMap = showImportCluster,
  onImportLog,
  onBleImport,
  importBusy = false,
  leadingActions,
  afterHomeActions,
  trailingActions,
  className,
}: AppTopbarProps) {
  const { t } = useAppI18n();
  const bleAvailable = diveComputerCapability.isAvailable();

  const brandNode =
    brand.mode === "link" ? (
      <Link
        href={brand.href}
        className="brand"
        aria-label={brand.ariaLabel ?? t("home")}
      >
        <BrandMark subtitle={subtitle} />
      </Link>
    ) : (
      <button
        type="button"
        className="brand"
        onClick={brand.onClick}
        aria-label={brand.ariaLabel ?? t("home")}
      >
        <BrandMark subtitle={subtitle} />
      </button>
    );

  return (
    <header className={["topbar", className].filter(Boolean).join(" ")}>
      {brandNode}
      <div className="topbar-actions">
        {leadingActions}
        {showHome ? (
          onHomeFront ? (
            <button
              type="button"
              className="button button-quiet mobile-home-button"
              onClick={onHomeFront}
              aria-label={t("home")}
              title={t("home")}
            >
              <House size={17} />
            </button>
          ) : (
            <Link
              href="/"
              className="button button-quiet mobile-home-button"
              aria-label={t("home")}
              title={t("home")}
            >
              <House size={17} />
            </Link>
          )
        ) : null}
        {afterHomeActions}
        {showImportCluster ? (
          <Link
            href="/about"
            className="button button-quiet topbar-about-link"
            aria-label={t("about")}
            title={t("about")}
          >
            <Info size={16} />
            {t("about")}
          </Link>
        ) : null}
        <Link href="/settings" className="button button-quiet">
          <Settings size={16} />
          {t("settings")}
        </Link>
        {showDiveMap ? (
          <Link
            href="/map"
            className="button button-quiet topbar-dive-map-link"
            aria-label={t("diveMap")}
            title={t("diveMap")}
          >
            <MapPinned size={17} />
            <span>{t("diveMap")}</span>
          </Link>
        ) : null}
        {showImportCluster ? (
          <>
            {bleAvailable ? (
              onBleImport ? (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={onBleImport}
                  disabled={importBusy}
                  aria-label={t("downloadFromComputer")}
                  title={t("downloadFromComputer")}
                >
                  <Bluetooth size={17} />
                  {t("downloadFromComputer")}
                </button>
              ) : (
                <Link
                  href="/?ble=1"
                  className="button button-quiet"
                  aria-label={t("downloadFromComputer")}
                  title={t("downloadFromComputer")}
                >
                  <Bluetooth size={17} />
                  {t("downloadFromComputer")}
                </Link>
              )
            ) : (
              <AndroidAppLink />
            )}
            <Link
              href="/memos"
              className="button button-quiet topbar-memos-link"
              aria-label={t("openDiveMemos")}
              title={t("openDiveMemos")}
            >
              <NotebookPen size={17} />
            </Link>
            {onImportLog ? (
              <button
                type="button"
                className="button button-primary"
                onClick={onImportLog}
                disabled={importBusy}
              >
                <Upload size={17} />
                {t("importLog")}
              </button>
            ) : (
              <Link href="/?import=1" className="button button-primary">
                <Upload size={17} />
                {t("importLog")}
              </Link>
            )}
          </>
        ) : null}
        {trailingActions}
      </div>
    </header>
  );
}

function BrandMark({ subtitle }: { subtitle: string }) {
  return (
    <>
      <span className="brand-mark">
        <Image
          src="/icons/diveframe-icon.svg"
          alt=""
          aria-hidden="true"
          width={52}
          height={52}
        />
      </span>
      <span>
        <strong>DiveFrame</strong>
        <small>{subtitle}</small>
      </span>
    </>
  );
}
