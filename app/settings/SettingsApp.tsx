"use client";

import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Camera,
  Database,
  Download,
  FileJson,
  Gauge,
  Image as ImageIcon,
  Languages,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Upload,
  Waves,
} from "lucide-react";
import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import bundledCatalog from "@/data/dive-sites.json";
import {
  createLocalAppBackup,
  restoreLocalAppBackup,
} from "@/lib/app-backup";
import {
  addLocalBackgrounds,
  clearAllLocalData,
  clearLocalDiveData,
  deleteLocalBackground,
  deleteLocalOverlayLogo,
  getLocalAppPreferences,
  getLocalOverlayLogo,
  listLocalBackgrounds,
  listLocalDives,
  listLocalSourceRecords,
  listLocalSiteContributions,
  saveLocalAppPreferences,
  saveLocalOverlayLogo,
  updateLocalBackgroundName,
  type LocalBackground,
  type LocalBrandingAsset,
  type LocalSiteContribution,
} from "@/lib/indexed-db";
import {
  CYLINDER_PRESETS,
  DEFAULT_CYLINDER_PRESET_ID,
} from "@/lib/gas-calculations";
import {
  clearSessionDiveSiteCatalog,
  loadSessionDiveSiteCatalog,
  saveSessionDiveSiteCatalog,
  validateDiveSiteCatalog,
  type CatalogSite,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import { addDiveFrameSitesToSubsurface } from "@/lib/subsurface-site-export";
import { useAppI18n } from "../AppI18nProvider";
import { PwaInstallCard } from "../PwaInstall";

type SiteContributionDraft = LocalSiteContribution & {
  aliasesText: string;
};

const BUILT_IN_CATALOG = bundledCatalog as DiveSiteCatalog;

export function SettingsApp() {
  const { language, setLanguage, t } = useAppI18n();
  const [contributions, setContributions] = useState<LocalSiteContribution[]>([]);
  const [reviewedSites, setReviewedSites] = useState<SiteContributionDraft[]>([]);
  const [catalog, setCatalog] = useState<DiveSiteCatalog>(BUILT_IN_CATALOG);
  const [catalogLabel, setCatalogLabel] = useState<string | null>(null);
  const [backgrounds, setBackgrounds] = useState<LocalBackground[]>([]);
  const [logo, setLogo] = useState<LocalBrandingAsset | null>(null);
  const [defaultCylinderPresetId, setDefaultCylinderPresetId] = useState(
    DEFAULT_CYLINDER_PRESET_ID,
  );
  const [status, setStatus] = useState(t("loadingLogbook"));
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    Promise.all([
      listLocalSiteContributions(),
      listLocalBackgrounds(),
      getLocalOverlayLogo(),
      getLocalAppPreferences(),
    ])
      .then(([items, savedBackgrounds, savedLogo, preferences]) => {
        const sessionCatalog = loadSessionDiveSiteCatalog();
        setContributions(items);
        setReviewedSites(items.map(toSiteDraft));
        if (sessionCatalog) {
          setCatalog(sessionCatalog.catalog);
          setCatalogLabel(sessionCatalog.label);
        }
        setBackgrounds(savedBackgrounds);
        setLogo(savedLogo ?? null);
        setDefaultCylinderPresetId(
          preferences?.defaultCylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID,
        );
        setStatus(
          items.length
            ? t("manualSitesReady", { count: items.length, suffix: items.length === 1 ? "" : "s" })
            : t("noManualSites"),
        );
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : t("settingsLoadFailed"));
      })
      .finally(() => setBusy(false));
  }, [t]);

  async function chooseDefaultCylinder(presetId: string) {
    setDefaultCylinderPresetId(presetId);
    try {
      await saveLocalAppPreferences({ defaultCylinderPresetId: presetId });
      setStatus(t("defaultTankSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("settingsSaveFailed"));
    }
  }

  async function chooseBackgrounds(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      await addLocalBackgrounds(files);
      setBackgrounds(await listLocalBackgrounds());
      setStatus(t("savedBackgrounds", { count: files.length, suffix: files.length === 1 ? "" : "s" }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("backgroundsSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeBackground(id: string) {
    setBusy(true);
    try {
      await deleteLocalBackground(id);
      setBackgrounds((items) => items.filter((item) => item.id !== id));
      setStatus(t("removedBackground"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("backgroundRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function renameBackground(id: string, displayName: string) {
    setBusy(true);
    try {
      const updated = await updateLocalBackgroundName(id, displayName);
      setBackgrounds((items) =>
        items.map((item) => (item.id === id ? updated : item)),
      );
      setStatus(t("renamedBackground"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("backgroundRenameFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const saved = await saveLocalOverlayLogo(file);
      setLogo(saved);
      setStatus(t("savedLogo", { name: saved.fileName }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("logoSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    setBusy(true);
    try {
      await deleteLocalOverlayLogo();
      setLogo(null);
      setStatus(t("removedLogo"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("logoRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function exportAppData() {
    setBusy(true);
    setStatus(t("preparingBackup"));
    try {
      const backup = await createLocalAppBackup();
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(backup.blob, `diveframe-backup-${date}.json`);
      setStatus(t("backupComplete", backup.counts));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("backupFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function importAppData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus(t("restoringBackup"));
    try {
      const counts = await restoreLocalAppBackup(file);
      const [items, savedBackgrounds, savedLogo, restoredPreferences] = await Promise.all([
        listLocalSiteContributions(),
        listLocalBackgrounds(),
        getLocalOverlayLogo(),
        getLocalAppPreferences(),
      ]);
      setContributions(items);
      setReviewedSites(items.map(toSiteDraft));
      setBackgrounds(savedBackgrounds);
      setLogo(savedLogo ?? null);
      if (restoredPreferences?.uiLanguage) {
        await setLanguage(restoredPreferences.uiLanguage);
      }
      setDefaultCylinderPresetId(
        restoredPreferences?.defaultCylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID,
      );
      setStatus(t("importComplete", counts));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("importBackupFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function eraseAllData() {
    if (!window.confirm(t("eraseAllDataConfirm"))) return;
    setBusy(true);
    try {
      await clearAllLocalData();
      setContributions([]);
      setReviewedSites([]);
      setBackgrounds([]);
      setLogo(null);
      setDefaultCylinderPresetId(DEFAULT_CYLINDER_PRESET_ID);
      await setLanguage("en");
      setStatus(t("eraseAllDataComplete"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("eraseAllDataFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function eraseDiveData() {
    if (!window.confirm(t("eraseDiveDataConfirm"))) return;
    setBusy(true);
    try {
      await clearLocalDiveData();
      setContributions([]);
      setReviewedSites([]);
      setStatus(t("eraseDiveDataComplete"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("eraseDiveDataFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function exportUpdatedSubsurface(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus(t("preparingSubsurfaceExport"));
    try {
      const [dives, sourceRecords] = await Promise.all([
        listLocalDives(),
        listLocalSourceRecords(),
      ]);
      const result = await addDiveFrameSitesToSubsurface(
        file,
        dives,
        sourceRecords,
      );
      if (!result.updatedDives) {
        setStatus(t("noSubsurfaceUpdates"));
        return;
      }
      const baseName =
        file.name.replace(/\.(?:ssrf|xml)$/i, "") || "subsurface-log";
      downloadBlob(
        new Blob([result.xml], { type: "application/xml;charset=utf-8" }),
        `${baseName}-diveframe-updated.ssrf`,
      );
      setStatus(
        t("subsurfaceExportComplete", {
          dives: result.updatedDives,
          sites: result.addedSites,
          buddies: result.updatedBuddies,
          notes: result.updatedNotes,
        }),
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : t("subsurfaceExportFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  const mergePreview = useMemo(
    () => mergeContributions(catalog, reviewedSites),
    [catalog, reviewedSites],
  );

  function exportAddedSiteLog() {
    const includedSites = reviewedSites.filter((site) => site.name.trim());
    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      description:
        "Dive sites typed into DiveFrame. Review before adding them to data/dive-sites.json.",
      sites: includedSites.map(contributionForExport),
    };
    downloadJson(payload, "diveframe-added-sites.json");
    setStatus(t("reviewedSitesExported", { count: includedSites.length, suffix: includedSites.length === 1 ? "" : "s" }));
  }

  function downloadMergedCatalog() {
    downloadJson(mergePreview.catalog, "dive-sites.json");
    setStatus(t("mergedCatalogDownloaded", {
      added: mergePreview.added,
      addedSuffix: mergePreview.added === 1 ? "" : "s",
      skipped: mergePreview.skipped,
      skippedSuffix: mergePreview.skipped === 1 ? "" : "s",
    }));
  }

  async function chooseCatalog(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validated = validateDiveSiteCatalog(parsed);
      saveSessionDiveSiteCatalog(validated, file.name);
      setCatalog(validated);
      setCatalogLabel(file.name);
      setStatus(t("usingCatalog", { name: file.name, count: validated.sites.length }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("catalogReadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function removeSessionCatalog() {
    clearSessionDiveSiteCatalog();
    setCatalog(BUILT_IN_CATALOG);
    setCatalogLabel(null);
    setStatus(t("sessionCatalogRemoved"));
  }

  return (
    <main className="settings-page">
      <header className="topbar settings-topbar">
        <Link href="/" className="brand settings-brand" aria-label={t("backToDives")}>
          <span className="brand-mark">
            <Waves size={19} strokeWidth={2.4} />
          </span>
          <span>
            <strong>DiveFrame</strong>
            <small>{t("settings")}</small>
          </span>
        </Link>
        <Link href="/" className="button button-quiet">
          <ArrowLeft size={16} /> {t("backToDives")}
        </Link>
      </header>

      <div className="settings-shell">
        <section className="settings-hero">
          <p className="eyebrow">{t("deviceLocalPreferences")}</p>
          <h1>{t("settingsAndData")}</h1>
          <p>{t("settingsDescription")}</p>
        </section>

        <PwaInstallCard />

        <section className="settings-card language-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Languages size={21} /></span>
            <div>
              <p className="eyebrow">{t("settings")}</p>
              <h2>{t("appLanguage")}</h2>
            </div>
          </div>
          <p className="settings-note">{t("appLanguageDescription")}</p>
          <label className="language-select">
            <span>{t("appLanguage")}</span>
            <select
              value={language}
              onChange={(event) =>
                void setLanguage(event.target.value as "en" | "zh-Hant" | "ja")
              }
            >
              <option value="en">{t("english")}</option>
              <option value="zh-Hant">{t("traditionalChineseHK")}</option>
              <option value="ja">{t("japanese")}</option>
            </select>
          </label>
        </section>

        <section className="settings-card catalog-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Database size={21} /></span>
            <div>
              <p className="eyebrow">{t("diveSiteCatalog")}</p>
              <h2>{t("reviewPublishSites")}</h2>
            </div>
          </div>

          <div className="catalog-summary">
            <div>
              <strong>{catalog.sites.length}</strong>
              <span>{t("catalogSites")}</span>
            </div>
            <div>
              <strong>{contributions.length}</strong>
              <span>{t("deviceAdditions")}</span>
            </div>
            <div>
              <strong>{mergePreview.added}</strong>
              <span>{t("newAfterMerge")}</span>
            </div>
          </div>

          <details className="site-review">
            <summary>
              <span>
                {t("reviewSitesToAdd")}
                <small>{t("reviewSitesDescription")}</small>
              </span>
              <strong>{reviewedSites.length}</strong>
            </summary>
            <div className="site-review-list">
              {reviewedSites.length ? (
                reviewedSites.map((site) => (
                  <article className="site-review-item" key={site.id}>
                    <div className="site-review-fields">
                      <label>
                        <span>{t("siteName")}</span>
                        <input
                          value={site.name}
                          onChange={(event) =>
                            setReviewedSites((items) =>
                              items.map((item) =>
                                item.id === site.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>{t("aliases")}</span>
                        <input
                          value={site.aliasesText}
                          placeholder={t("aliasesPlaceholder")}
                          onChange={(event) =>
                            setReviewedSites((items) =>
                              items.map((item) =>
                                item.id === site.id
                                  ? { ...item, aliasesText: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <small>
                      {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}
                      {site.diveDate ? ` Â· ${site.diveDate}` : ""}
                    </small>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() =>
                        setReviewedSites((items) =>
                          items.filter((item) => item.id !== site.id),
                        )
                      }
                    >
                      <Trash2 size={15} /> {t("excludeFromMerge")}
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty-compact">{t("noSitesInMerge")}</p>
              )}
            </div>
          </details>

          <div className="catalog-source">
            <div>
              <FileJson size={18} />
              <span>
                <strong>{catalogLabel ?? t("bundledCatalog")}</strong>
                <small>
                  {t("sessionCatalogDescription")}
                </small>
              </span>
            </div>
            <div className="catalog-source-actions">
              <label className="button button-secondary">
                <Upload size={16} /> {t("chooseCatalog")}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={chooseCatalog}
                  className="visually-hidden"
                  disabled={busy}
                />
              </label>
              {catalogLabel && (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={removeSessionCatalog}
                  disabled={busy}
                >
                  <Trash2 size={16} /> {t("removeSessionCatalog")}
                </button>
              )}
            </div>
          </div>

          <p className="settings-note">
            {t("catalogPromptDescription")}{" "}
            <a
              href="/examples/dive-site-catalog-ai-prompt.md"
              download
              className="settings-inline-link"
            >
              {t("downloadCatalogPrompt")}
            </a>
          </p>

          <div className="settings-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={exportAddedSiteLog}
              disabled={busy || reviewedSites.length === 0}
            >
              <Download size={16} /> {t("exportAdditionLog")}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={downloadMergedCatalog}
              disabled={busy || reviewedSites.length === 0}
            >
              <Download size={16} /> {t("downloadMergedCatalog")}
            </button>
          </div>

          <p className="settings-note">
            {t("mergeCatalogNote")}
          </p>
        </section>

        <section className="settings-card backup-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Archive size={21} /></span>
            <div>
              <p className="eyebrow">{t("portableBackup")}</p>
              <h2>{t("backupTitle")}</h2>
            </div>
          </div>
          <p className="settings-note">
            {t("backupDescription")}
          </p>
          <div className="settings-actions">
            <button type="button" className="button button-primary" onClick={exportAppData} disabled={busy}>
              <Download size={16} /> {t("exportAppData")}
            </button>
            <label className="button button-secondary">
              <RefreshCw size={16} /> {t("importAppData")}
              <input
                type="file"
                accept=".json,application/json"
                onChange={importAppData}
                className="visually-hidden"
                disabled={busy}
              />
            </label>
          </div>
          <p className="settings-note">
            {t("importMergeNote")}
          </p>
        </section>

        <section className="settings-card subsurface-export-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Database size={21} /></span>
            <div>
              <p className="eyebrow">{t("sourceLogTools")}</p>
              <h2>{t("updateSubsurfaceExport")}</h2>
            </div>
          </div>
          <p className="settings-note">
            {t("updateSubsurfaceDescription")}
          </p>
          <label className="button button-primary">
            <Upload size={16} /> {t("chooseSubsurfaceFile")}
            <input
              type="file"
              accept=".ssrf,.xml,application/xml,text/xml"
              onChange={exportUpdatedSubsurface}
              className="visually-hidden"
              disabled={busy}
            />
          </label>
          <p className="settings-note">
            {t("subsurfacePassThroughNote")}
          </p>
        </section>

        <section className="settings-card dive-defaults-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Gauge size={21} /></span>
            <div>
              <p className="eyebrow">{t("diveDefaults")}</p>
              <h2>{t("defaultTankSize")}</h2>
            </div>
          </div>
          <p className="settings-note">{t("defaultTankDescription")}</p>
          <label className="language-select">
            <span>{t("tankSize")}</span>
            <select
              value={defaultCylinderPresetId}
              onChange={(event) =>
                void chooseDefaultCylinder(event.target.value)
              }
            >
              {CYLINDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="settings-card branding-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><ImageIcon size={21} /></span>
            <div>
              <p className="eyebrow">{t("imageComposer")}</p>
              <h2>{t("overlayLogo")}</h2>
            </div>
          </div>
          <p className="settings-note">
            {t("overlayLogoDescription")}
          </p>
          {logo ? (
            <div className="logo-settings-row">
              <LogoPreview logo={logo} />
              <div className="logo-settings-details">
                <strong>{logo.fileName}</strong>
                <small>{Math.max(1, Math.round(logo.size / 1024))} KB</small>
                <div className="settings-actions">
                  <label className="button button-secondary">
                    <Upload size={16} /> {t("replaceLogo")}
                    <input
                      type="file"
                      accept=".png,.svg,image/png,image/svg+xml"
                      onChange={chooseLogo}
                      className="visually-hidden"
                      disabled={busy}
                    />
                  </label>
                  <button type="button" className="button button-quiet" onClick={removeLogo} disabled={busy}>
                    <Trash2 size={16} /> {t("remove")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label className="button button-primary branding-upload">
              <Upload size={16} /> {t("addLogo")}
              <input
                type="file"
                accept=".png,.svg,image/png,image/svg+xml"
                onChange={chooseLogo}
                className="visually-hidden"
                disabled={busy}
              />
            </label>
          )}
        </section>

        <section className="settings-card background-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Camera size={21} /></span>
            <div>
              <p className="eyebrow">{t("imageComposer")}</p>
              <h2>{t("reusableBackgrounds")}</h2>
            </div>
          </div>
          <p className="settings-note">
            {t("reusableBackgroundsDescription")}
          </p>
          <label className="button button-primary">
            <Upload size={16} /> {t("addBackgrounds")}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={chooseBackgrounds}
              className="visually-hidden"
              disabled={busy}
            />
          </label>
          {backgrounds.length > 0 ? (
            <div className="background-library">
              {backgrounds.map((background) => (
                <BackgroundTile
                  key={background.id}
                  background={background}
                  onRemove={() => removeBackground(background.id)}
                  onRename={(name) => renameBackground(background.id, name)}
                />
              ))}
            </div>
          ) : (
            <p className="empty-compact">{t("noBackgrounds")}</p>
          )}
        </section>

        <section className="settings-card danger-settings">
          <div className="settings-card-heading">
            <span className="settings-icon settings-icon-danger"><Trash2 size={21} /></span>
            <div>
              <p className="eyebrow">{t("dangerZone")}</p>
              <h2>{t("eraseLocalDataTitle")}</h2>
            </div>
          </div>
          <p className="settings-note">
            {t("eraseLocalDataDescription")}
          </p>
          <div className="danger-actions">
            <div className="danger-option">
              <strong>{t("eraseDiveData")}</strong>
              <p>{t("eraseDiveDataDescription")}</p>
              <button
                type="button"
                className="button button-danger-secondary"
                onClick={() => void eraseDiveData()}
                disabled={busy}
              >
                <Trash2 size={16} /> {t("eraseDiveData")}
              </button>
            </div>
            <div className="danger-option">
              <strong>{t("eraseAllData")}</strong>
              <p>{t("eraseAllDataWarning")}</p>
              <button
                type="button"
                className="button button-danger"
                onClick={() => void eraseAllData()}
                disabled={busy}
              >
                <Trash2 size={16} /> {t("eraseAllData")}
              </button>
            </div>
          </div>
        </section>

        <div className="settings-status" role="status">
          {busy && <LoaderCircle size={15} className="spin" />}
          {status}
        </div>
      </div>
    </main>
  );
}

function BackgroundTile({
  background,
  onRemove,
  onRename,
}: {
  background: LocalBackground;
  onRemove: () => void;
  onRename: (name: string) => void;
}) {
  const { t } = useAppI18n();
  const [name, setName] = useState(background.displayName || background.fileName);
  const source = useMemo(() => URL.createObjectURL(background.blob), [background.blob]);
  useEffect(() => () => URL.revokeObjectURL(source), [source]);
  const saveName = () => {
    const normalized = name.trim() || background.fileName;
    setName(normalized);
    if (normalized !== (background.displayName || background.fileName)) {
      onRename(normalized);
    }
  };
  return (
    <article className="background-tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} alt={background.displayName || background.fileName} />
      <label>
        <span>{t("backgroundName")}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      <button type="button" onClick={onRemove} aria-label={`${t("remove")} ${background.displayName || background.fileName}`}>
        <Trash2 size={15} />
      </button>
    </article>
  );
}

function LogoPreview({ logo }: { logo: LocalBrandingAsset }) {
  const source = useMemo(() => URL.createObjectURL(logo.blob), [logo.blob]);
  useEffect(() => () => URL.revokeObjectURL(source), [source]);
  return (
    <div className="logo-settings-preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} alt={`${logo.fileName} preview`} />
    </div>
  );
}

function contributionForExport(site: SiteContributionDraft) {
  return {
    name: site.name,
    aliases: aliasesForDraft(site),
    coordinates: {
      latitude: site.latitude,
      longitude: site.longitude,
    },
    linkedDive: {
      diveId: site.diveId,
      diveDate: site.diveDate,
      shearwaterDiveNumber: site.shearwaterDiveNumber,
      subsurfaceDiveNumber: site.subsurfaceDiveNumber,
    },
    source: {
      kind: "diveframe_manual",
      reference: `diveframe-dive:${site.diveId}`,
    },
    status: "candidate",
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };
}

function mergeContributions(
  base: DiveSiteCatalog,
  contributions: SiteContributionDraft[],
) {
  const sites = base.sites.map((site) => {
    const clean = structuredClone(site) as CatalogSite & { notes?: unknown };
    delete clean.notes;
    return clean;
  });
  const usedIds = new Set(sites.map((site) => site.id));
  let added = 0;
  let skipped = 0;

  for (const contribution of contributions) {
    if (!contribution.name.trim()) {
      skipped += 1;
      continue;
    }
    const normalized = normalizeName(contribution.name);
    const duplicate = sites.some((site) => {
      const names = [site.name, ...(site.aliases ?? [])].map(normalizeName);
      return (
        names.includes(normalized) &&
        distanceKm(
          site.coordinates.latitude,
          site.coordinates.longitude,
          contribution.latitude,
          contribution.longitude,
        ) <= 0.25
      );
    });
    if (duplicate) {
      skipped += 1;
      continue;
    }

    const id = uniqueCatalogId(contribution, usedIds);
    usedIds.add(id);
    sites.push({
      id,
      name: contribution.name,
      aliases: aliasesForDraft(contribution),
      coordinates: {
        latitude: contribution.latitude,
        longitude: contribution.longitude,
      },
      place: {
        countryCode: null,
        country: null,
        region: null,
        locality: null,
      },
      source: {
        kind: "diveframe_manual",
        reference: `diveframe-dive:${contribution.diveId}`,
      },
      status: "active",
      updatedAt: contribution.updatedAt,
    });
    added += 1;
  }

  return {
    catalog: {
      schemaVersion: base.schemaVersion,
      sites: sites.sort((a, b) => a.id.localeCompare(b.id)),
    },
    added,
    skipped,
  };
}

function uniqueCatalogId(
  contribution: SiteContributionDraft,
  usedIds: Set<string>,
) {
  const slug =
    contribution.name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "unnamed-site";
  const coordinateKey = `${Math.abs(contribution.latitude).toFixed(3).replace(".", "")}-${Math.abs(contribution.longitude).toFixed(3).replace(".", "")}`;
  const base = `user-${slug}-${coordinateKey}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function toSiteDraft(site: LocalSiteContribution): SiteContributionDraft {
  return { ...site, aliasesText: "" };
}

function aliasesForDraft(site: SiteContributionDraft) {
  const primaryName = normalizeName(site.name);
  return [
    ...new Set(
      site.aliasesText
        .split(",")
        .map((alias) => alias.trim())
        .filter((alias) => alias && normalizeName(alias) !== primaryName),
    ),
  ];
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, fileName);
}

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
