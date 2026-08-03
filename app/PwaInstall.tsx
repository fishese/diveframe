"use client";

import { Capacitor } from "@capacitor/core";
import { Check, Download, Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getLocalStoragePersistenceStatus,
  type LocalStoragePersistenceStatus,
} from "@/lib/indexed-db";
import { useAppI18n } from "./AppI18nProvider";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __diveFrameInstallPrompt?: BeforeInstallPromptEvent;
  }
}

const INSTALL_AVAILABLE_EVENT = "diveframe-install-available";
const APP_INSTALLED_EVENT = "diveframe-app-installed";
const subscribeToPlatform = () => () => undefined;
const getClientMounted = () => true;
const getServerMounted = () => false;
const getClientNative = () => Capacitor.isNativePlatform();
const getServerNative = () => false;

function isInstalledApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PwaManager() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (Capacitor.isNativePlatform()) {
        // The native shell already ships (or serves) its own assets, and the
        // worker caches by URL, so keeping it only pins stale bundles.
        void navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              void registration.unregister();
            }
          })
          .catch(() => undefined);
        if ("caches" in window) {
          void window.caches
            .keys()
            .then((names) =>
              Promise.all(
                names
                  .filter((name) => name.startsWith("diveframe-"))
                  .map((name) => window.caches.delete(name)),
              ),
            )
            .catch(() => undefined);
        }
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    }

    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      window.__diveFrameInstallPrompt = event as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_AVAILABLE_EVENT));
    }

    function markInstalled() {
      delete window.__diveFrameInstallPrompt;
      window.dispatchEvent(new Event(APP_INSTALLED_EVENT));
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  return null;
}

export function PwaInstallCard() {
  const { t } = useAppI18n();
  const [canInstall, setCanInstall] = useState(
    () => typeof window !== "undefined" && Boolean(window.__diveFrameInstallPrompt),
  );
  const [installed, setInstalled] = useState(isInstalledApp);
  const [isIos] = useState(isIosDevice);
  const mounted = useSyncExternalStore(
    subscribeToPlatform,
    getClientMounted,
    getServerMounted,
  );
  const isNative = useSyncExternalStore(
    subscribeToPlatform,
    getClientNative,
    getServerNative,
  );
  const [storageStatus, setStorageStatus] =
    useState<LocalStoragePersistenceStatus | null>(null);

  useEffect(() => {
    const showInstall = () => setCanInstall(true);
    const showInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
    };
    window.addEventListener(INSTALL_AVAILABLE_EVENT, showInstall);
    window.addEventListener(APP_INSTALLED_EVENT, showInstalled);
    return () => {
      window.removeEventListener(INSTALL_AVAILABLE_EVENT, showInstall);
      window.removeEventListener(APP_INSTALLED_EVENT, showInstalled);
    };
  }, []);

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    // Chromium WebView almost never grants navigator.storage.persist(), and
    // asking only produces a false "best-effort browser" reading that is wrong
    // for an installed APK. Skip the request on native and use app-storage copy.
    getLocalStoragePersistenceStatus(!native)
      .then(setStorageStatus)
      .catch(() =>
        setStorageStatus({
          mode: "unsupported",
          usage: null,
          quota: null,
        }),
      );
  }, []);

  // Native builds intentionally skip this browser install/storage card.
  if (!mounted || isNative) return null;

  async function install() {
    const prompt = window.__diveFrameInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      delete window.__diveFrameInstallPrompt;
      setCanInstall(false);
    }
  }

  return (
    <section className="settings-card pwa-settings">
      <div className="settings-card-heading">
        <span className="settings-icon">
          {installed ? (
            <Check size={21} />
          ) : (
            <Download size={21} />
          )}
        </span>
        <div>
          <p className="eyebrow">{t("installableApp")}</p>
          <h2>{t("installDiveFrame")}</h2>
        </div>
      </div>
      <p className="settings-note">{t("installDiveFrameDescription")}</p>
      {installed ? (
        <p className="pwa-install-status">
          <Check size={17} /> {t("appAlreadyInstalled")}
        </p>
      ) : canInstall ? (
        <button type="button" className="button button-primary" onClick={install}>
          <Download size={16} /> {t("installApp")}
        </button>
      ) : isIos ? (
        <p className="pwa-install-status">
          <Share2 size={17} /> {t("installIosInstructions")}
        </p>
      ) : (
        <p className="settings-note">{t("installBrowserInstructions")}</p>
      )}
      <p className="settings-note pwa-data-note">
        {t("installedDataNote")}
      </p>
      {storageStatus && (
        <div
          className={`storage-persistence ${storageStatus.mode}`}
        >
          <strong>
            {storageStatus.mode === "persistent"
                ? t("storagePersistent")
                : storageStatus.mode === "best-effort"
                  ? t("storageBestEffort")
                  : t("storagePersistenceUnavailable")}
          </strong>
          <span>
            {storageStatus.mode === "persistent"
                ? t("storagePersistentDescription")
                : storageStatus.mode === "best-effort"
                  ? t("storageBestEffortDescription")
                  : t("storagePersistenceUnavailableDescription")}
          </span>
          {storageStatus.usage !== null && storageStatus.quota !== null && (
            <small>
              {t("browserStorageUsage", {
                used: formatStorage(storageStatus.usage),
                quota: formatStorage(storageStatus.quota),
              })}
            </small>
          )}
        </div>
      )}
    </section>
  );
}

function formatStorage(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1024) return `${Math.max(1, Math.round(megabytes))} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}
