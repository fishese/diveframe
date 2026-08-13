"use client";

import Link from "next/link";
import {
  Database,
  Download,
  Filter,
  HardDrive,
  Image as ImageIcon,
  MapPinned,
  Waves,
} from "lucide-react";
import { useState } from "react";
import { useAppI18n } from "../AppI18nProvider";
import { AppTopbar } from "../components/AppTopbar";

/** Assembled in the browser so the raw address is not in the initial HTML. */
function contactEmail() {
  return ["diveframe", String.fromCharCode(64), "fishese.cc"].join("");
}

export function AboutApp() {
  const { t } = useAppI18n();

  return (
    <main className="about-page">
      <AppTopbar
        subtitle={t("about")}
        brand={{ mode: "link", href: "/", ariaLabel: t("home") }}
        showHome
        showImportCluster
      />

      <div className="about-shell">
        <section className="about-license about-dev">
          <p className="eyebrow">{t("aboutDevEyebrow")}</p>
          <h2>{t("aboutDevTitle")}</h2>
          <p>{t("aboutDevBody")}</p>
          <details className="about-dev-more">
            <summary>
              <span className="about-dev-more-closed">{t("aboutDevReadMore")}</span>
              <span className="about-dev-more-open">{t("aboutDevReadLess")}</span>
            </summary>
            <p>{t("aboutDevSolo")}</p>
            <AboutContact />
          </details>
        </section>

        <section className="about-hero">
          <p className="eyebrow">{t("aboutEyebrow")}</p>
          <h1>{t("aboutTitle")}</h1>
          <p>{t("aboutIntro")}</p>
        </section>

        <section className="about-grid" aria-label={t("aboutTitle")}>
          <AboutCard icon={<Database size={23} />} title={t("aboutImportsTitle")}>
            <p>{t("aboutImportsDescription")}</p>
            <ul>
              <li>{t("aboutImportSubsurface")}</li>
              <li>{t("aboutImportUddf")}</li>
              <li>{t("aboutImportBluetooth")}</li>
              <li>{t("aboutImportFit")}</li>
              <li>{t("aboutImportShearwater")}</li>
            </ul>
          </AboutCard>

          <AboutCard icon={<MapPinned size={23} />} title={t("aboutMergeTitle")}>
            <p>{t("aboutMergeDescription")}</p>
          </AboutCard>

          <AboutCard icon={<MapPinned size={23} />} title={t("aboutCatalogTitle")}>
            <p>{t("aboutCatalogDescription")}</p>
            <p className="about-emphasis">{t("aboutCatalogShare")}</p>
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
            <Filter size={22} />
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
          <p className="eyebrow">{t("aboutLicenseEyebrow")}</p>
          <h2>{t("aboutLicenseTitle")}</h2>
          <p>{t("aboutLicenseDescription")}</p>
          <p>{t("aboutAssetLicense")}</p>
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

function AboutContact() {
  const { t } = useAppI18n();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const email = revealed ? contactEmail() : null;

  async function copyEmail() {
    const value = contactEmail();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setRevealed(true);
    }
  }

  return (
    <div className="about-contact">
      <p className="about-contact-label">{t("aboutDevContactLabel")}</p>
      <p className="about-contact-hint">{t("aboutDevContactHint")}</p>
      <div className="about-contact-actions">
        {email ? (
          <a className="about-contact-email" href={`mailto:${email}`}>
            {email}
          </a>
        ) : (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setRevealed(true)}
          >
            {t("aboutDevRevealEmail")}
          </button>
        )}
        <button
          type="button"
          className="button button-quiet"
          onClick={() => void copyEmail()}
        >
          {copied ? t("aboutDevEmailCopied") : t("aboutDevCopyEmail")}
        </button>
      </div>
    </div>
  );
}
