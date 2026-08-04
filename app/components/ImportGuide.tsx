"use client";

import {
  Archive,
  Bluetooth,
  Database,
  FileText,
  GitMerge,
  Upload,
} from "lucide-react";
import Link from "next/link";
import type { AppTranslate } from "@/lib/app-i18n";

const SUBSURFACE_COMPUTER_FAMILIES = [
  "Aeris",
  "Apeks",
  "Aqualung",
  "Atomic Aquatics",
  "Beuchat",
  "Citizen",
  "Cochran",
  "Cressi",
  "Crest",
  "Deep Six",
  "Deepblu",
  "Dive Rite",
  "DiveSystem",
  "Divesoft",
  "Garmin",
  "Genesis",
  "Halcyon",
  "Heinrichs Weikamp",
  "Hollis",
  "Liquivision",
  "Mares",
  "McLean",
  "Oceanic",
  "Oceans",
  "Ratio",
  "Reefnet",
  "Scorpena",
  "Scubapro",
  "Seac",
  "Seemann",
  "Shearwater",
  "Sherwood",
  "Sporasub",
  "Subgear",
  "Suunto",
  "Tecdiving / DiveComputer.eu",
  "Tusa",
  "Uemis",
  "Uwatec",
  "Zeagle",
] as const;

export function ImportGuide({
  busy,
  onChooseFiles,
  t,
}: {
  busy: boolean;
  onChooseFiles: () => void;
  t: AppTranslate;
}) {
  return (
    <section className="import-guide-page">
      <div className="import-guide-shell">
        <div className="import-guide-hero">
          <div className="import-guide-primary">
            <p className="eyebrow">{t("importDiveLog")}</p>
            <h1>{t("importGuideTitle")}</h1>
            <p className="import-guide-intro">{t("importGuideIntro")}</p>
            <ul className="import-guide-summary">
              <li>
                <strong>{t("importGuidePreferredLabel")}</strong>{" "}
                <a
                  href="https://subsurface-divelog.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("importGuideSubsurfaceName")}
                </a>
                {t("importGuidePreferredOtherSources")}
              </li>
              <li>
                <strong>{t("importGuideAcceptedLabel")}</strong>{" "}
                {t("importGuideAcceptedBody")}
              </li>
              <li>{t("importGuideCombineBullet")}</li>
            </ul>

            <button
              type="button"
              className="button button-primary button-large import-guide-action"
              onClick={onChooseFiles}
              disabled={busy}
            >
              <Upload size={18} />
              {t("importGuideChooseFiles")}
            </button>
          </div>

          <aside className="import-guide-side-cards">
            <div className="import-guide-backup-card">
              <Archive size={20} aria-hidden="true" />
              <p>{t("importGuideBackupPrompt")}</p>
              <Link
                className="button button-secondary"
                href="/settings#backup-transfer"
              >
                {t("openBackupTools")}
              </Link>
            </div>
            <div className="import-guide-backup-card">
              <FileText size={20} aria-hidden="true" />
              <p>{t("importGuideMemosPrompt")}</p>
              <Link className="button button-secondary" href="/memos">
                {t("openDiveMemos")}
              </Link>
            </div>
          </aside>
        </div>

        <div className="import-guide-steps">
          <article className="import-guide-step">
            <FileText size={22} aria-hidden="true" />
            <h2>{t("importGuideSubsurfaceLabel")}</h2>
            <p>{t("importGuideSubsurfaceBody")}</p>
          </article>
          <article className="import-guide-step">
            <Bluetooth size={22} aria-hidden="true" />
            <h2>{t("importGuideBluetoothLabel")}</h2>
            <p>{t("importGuideBluetoothBody")}</p>
          </article>
          <article className="import-guide-step">
            <Database size={22} aria-hidden="true" />
            <h2>{t("importGuideUddfLabel")}</h2>
            <p>{t("importGuideUddfBody")}</p>
          </article>
        </div>

        <article className="import-guide-step import-guide-database-step">
          <Database size={22} aria-hidden="true" />
          <div>
            <h2>{t("importGuideDatabaseLabel")}</h2>
            <p>{t("importGuideDatabaseBody")}</p>
          </div>
        </article>

        <article className="import-guide-note">
          <GitMerge size={22} aria-hidden="true" />
          <div>
            <h2>{t("importGuideMatchingLabel")}</h2>
            <p>{t("importGuideMatchingBody")}</p>
          </div>
        </article>

        <details className="import-guide-support">
          <summary>{t("importGuideSupportTitle")}</summary>
          <p>{t("importGuideSupportBody")}</p>
          <ul>
            {SUBSURFACE_COMPUTER_FAMILIES.map((family) => (
              <li key={family}>{family}</li>
            ))}
          </ul>
          <a
            href="https://subsurface-divelog.org/supported-dive-computers/"
            target="_blank"
            rel="noreferrer"
          >
            {t("importGuideSupportLink")}
          </a>
        </details>
      </div>
    </section>
  );
}
