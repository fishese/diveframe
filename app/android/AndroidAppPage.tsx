"use client";

import {
  Bluetooth,
  Camera,
  Download,
  Globe2,
  Monitor,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useAppI18n } from "../AppI18nProvider";
import { AppTopbar } from "../components/AppTopbar";

const ANDROID_RELEASE_URL =
  "https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk";
const SOURCE_URL = "https://github.com/fishese/diveframe";

export function AndroidAppPage() {
  const { t } = useAppI18n();

  return (
    <main className="android-page">
      <AppTopbar
        subtitle={t("androidAppLink")}
        brand={{ mode: "link", href: "/", ariaLabel: t("home") }}
        showHome
        showImportCluster
      />

      <div className="android-shell">
        <section className="android-hero">
          <p className="eyebrow">{t("androidAppEyebrow")}</p>
          <h1>{t("androidAppTitle")}</h1>
          <p>{t("androidAppIntro")}</p>
          <div className="about-actions">
            <a
              className="button button-primary"
              href={ANDROID_RELEASE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Download size={17} /> {t("androidAppDownload")}
            </a>
            <a
              className="button button-secondary"
              href={SOURCE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Globe2 size={17} /> {t("androidAppSource")}
            </a>
          </div>
          <p className="android-download-note">{t("androidAppDownloadNote")}</p>
        </section>

        <section className="android-grid" aria-label={t("androidAppTitle")}>
          <AndroidCard icon={<Bluetooth size={23} />} title={t("androidAppFeaturesTitle")}>
            <p>{t("androidAppFeaturesBody")}</p>
            <ul>
              <li>{t("androidAppFeatureBluetooth")}</li>
              <li>{t("androidAppFeatureExports")}</li>
              <li>{t("androidAppFeaturePrivateStorage")}</li>
            </ul>
          </AndroidCard>

          <AndroidCard icon={<ShieldCheck size={23} />} title={t("androidAppPermissionsTitle")}>
            <p>{t("androidAppPermissionsIntro")}</p>
            <ul>
              <li>{t("androidAppPermissionBluetooth")}</li>
              <li>{t("androidAppPermissionPhoto")}</li>
              <li>{t("androidAppPermissionInternet")}</li>
              <li>{t("androidAppPermissionStorage")}</li>
            </ul>
          </AndroidCard>

          <AndroidCard icon={<Camera size={23} />} title={t("androidAppPhotoTitle")}>
            <p>{t("androidAppPhotoBody")}</p>
          </AndroidCard>

          <AndroidCard icon={<Smartphone size={23} />} title={t("androidAppIosTitle")}>
            <p>{t("androidAppIosBody")}</p>
          </AndroidCard>

          <AndroidCard icon={<Monitor size={23} />} title={t("androidAppPcTitle")}>
            <p>{t("androidAppPcBody")}</p>
          </AndroidCard>
        </section>

        <section className="android-note-card">
          <p className="eyebrow">{t("androidAppSupportEyebrow")}</p>
          <h2>{t("androidAppSupportTitle")}</h2>
          <p>{t("androidAppSupportBody")}</p>
        </section>
      </div>
    </main>
  );
}

function AndroidCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="android-card">
      <span className="settings-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </article>
  );
}
