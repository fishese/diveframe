"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Download,
  Filter,
  HardDrive,
  Image as ImageIcon,
  MapPinned,
  Settings,
  Waves,
} from "lucide-react";
import { useAppI18n } from "../AppI18nProvider";

export function AboutApp() {
  const { t } = useAppI18n();

  return (
    <main className="about-page">
      <header className="topbar">
        <Link href="/" className="brand" aria-label={t("backToDives")}>
          <span className="brand-mark">
            <Waves size={19} strokeWidth={2.4} />
          </span>
          <span>
            <strong>DiveFrame</strong>
            <small>{t("about")}</small>
          </span>
        </Link>
        <div className="topbar-actions">
          <Link href="/settings" className="button button-quiet">
            <Settings size={16} /> {t("settings")}
          </Link>
          <Link href="/" className="button button-quiet">
            <ArrowLeft size={16} /> {t("backToDives")}
          </Link>
        </div>
      </header>

      <div className="about-shell">
        <section className="about-hero">
          <p className="eyebrow">{t("aboutEyebrow")}</p>
          <h1>{t("aboutTitle")}</h1>
          <p>{t("aboutIntro")}</p>
        </section>

        <section className="about-grid" aria-label={t("aboutTitle")}>
          <AboutCard icon={<Database size={23} />} title={t("aboutImportsTitle")}>
            <p>{t("aboutImportsDescription")}</p>
            <ul>
              <li>{t("aboutImportShearwater")}</li>
              <li>{t("aboutImportSubsurface")}</li>
              <li>{t("aboutImportUddf")}</li>
              <li>{t("aboutImportFit")}</li>
            </ul>
          </AboutCard>

          <AboutCard icon={<MapPinned size={23} />} title={t("aboutMergeTitle")}>
            <p>{t("aboutMergeDescription")}</p>
          </AboutCard>

          <AboutCard icon={<ImageIcon size={23} />} title={t("aboutExportsTitle")}>
            <p>{t("aboutExportsDescription")}</p>
            <ul>
              <li>{t("aboutExportImages")}</li>
              <li>{t("aboutExportBackup")}</li>
              <li>{t("aboutExportSites")}</li>
              <li>{t("aboutExportSubsurface")}</li>
            </ul>
          </AboutCard>

          <AboutCard icon={<HardDrive size={23} />} title={t("aboutLocalTitle")}>
            <p>{t("aboutLocalDescription")}</p>
            <p className="about-emphasis">{t("aboutBackupReminder")}</p>
          </AboutCard>
        </section>

        <section className="about-reconcile">
          <div className="about-reconcile-icon">
            <Filter size={25} />
          </div>
          <div>
            <p className="eyebrow">{t("aboutSourceEyebrow")}</p>
            <h2>{t("aboutSourceTitle")}</h2>
            <p>{t("aboutSourceDescription")}</p>
            <ol>
              <li>{t("aboutSourceStepFilter")}</li>
              <li>{t("aboutSourceStepNumber")}</li>
              <li>{t("aboutSourceStepUpdate")}</li>
              <li>{t("aboutSourceStepReimport")}</li>
            </ol>
          </div>
        </section>

        <section className="about-license">
          <p className="eyebrow">{t("aboutSearchEyebrow")}</p>
          <h2>{t("aboutSearchTitle")}</h2>
          <p>{t("aboutSearchDescription")}</p>
          <ul>
            <li><code>source:shearwater-only</code> — {t("aboutSearchShearwater")}</li>
            <li><code>source:subsurface-only</code> — {t("aboutSearchSubsurface")}</li>
          </ul>
          <p>{t("aboutSacRule")}</p>
        </section>

        <section className="about-license">
          <p className="eyebrow">{t("aboutLicenseEyebrow")}</p>
          <h2>{t("aboutLicenseTitle")}</h2>
          <p>{t("aboutLicenseDescription")}</p>
        </section>

        <div className="about-actions">
          <Link href="/" className="button button-primary">
            <Waves size={17} /> {t("openLogbook")}
          </Link>
          <Link href="/settings" className="button button-secondary">
            <Download size={17} /> {t("openBackupTools")}
          </Link>
        </div>
      </div>
    </main>
  );
}

function AboutCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="about-card">
      <span className="settings-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </article>
  );
}
