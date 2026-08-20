"use client";

import {
  Archive,
  Camera,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FileJson,
  Gauge,
  GitMerge,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { AppTopbar } from "../components/AppTopbar";
import { useAppRouteHref } from "../AppRouteProvider";
import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import bundledCatalog from "@/data/dive-sites.json";
import {
  BackupPasswordIncorrectError,
  BackupPasswordRequiredError,
  createLocalAppBackup,
  previewLocalAppBackup,
  restorePreparedAppBackup,
  type PreparedAppBackup,
} from "@/lib/app-backup";
import {
  addLocalBackgrounds,
  clearAllLocalData,
  clearLocalDiveData,
  clearLocalDivePhotos,
  deleteLocalBackground,
  deleteLocalOverlayLogo,
  getLocalAppPreferences,
  getLocalBackupSizeEstimate,
  getLocalOverlayLogo,
  getLocalSupplementaryCatalog,
  listLocalBackgrounds,
  listLocalDives,
  listLocalSourceRecords,
  listLocalSiteContributions,
  mergeLocalDuplicateDives,
  optimizeLocalStoredPhotos,
  saveLocalSupplementaryCatalog,
  saveLocalAppPreferences,
  saveLocalOverlayLogo,
  updateLocalBackgroundName,
  clearLocalSupplementaryCatalog,
  type LocalBackground,
  type LocalBrandingAsset,
  type LocalDive,
  type LocalSiteContribution,
} from "@/lib/indexed-db";
import {
  LocalDataConflictError,
  subscribeLocalDataChanges,
} from "@/lib/cross-tab-sync";
import type { AppTranslate } from "@/lib/app-i18n";
import {
  findPotentialDuplicateDives,
  type DuplicateDiveCandidate,
} from "@/lib/duplicate-dives";
import {
  CYLINDER_PRESETS,
  DEFAULT_CYLINDER_PRESET_ID,
} from "@/lib/gas-calculations";
import {
  deviceSiteCatalogFromContributions,
  takeSessionSupplementaryCatalogMigration,
  validateDiveSiteCatalog,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import { validateDiveSitesFile } from "@/lib/dive-site-validation";
import {
  saveExportFile,
  savedFileNotice,
  shareExportFile,
  type SavedExportFile,
} from "@/lib/file-export";
import { addDiveFrameSitesToSubsurface } from "@/lib/subsurface-site-export";
import {
  createSubsurfaceLogbook,
  partitionSubsurfaceLogbookDives,
} from "@/lib/subsurface-logbook-export";
import {
  fetchWhatsNewDocument,
  renderWhatsNewBody,
  sanitizeWhatsNewHref,
  type WhatsNewDocument,
} from "@/lib/whats-new";
import {
  getNativeAppInfo,
  updateDestinationForChannel,
  type NativeAppInfo,
} from "@/lib/update-channel";
import { useAppBackParent } from "../AppBackProvider";
import { useAppI18n } from "../AppI18nProvider";
import { useColorTheme } from "../ThemeProvider";
import { PwaInstallCard } from "../PwaInstall";

const BUILT_IN_CATALOG = bundledCatalog as DiveSiteCatalog;

export function SettingsApp() {
  const appRouteHref = useAppRouteHref();
  const { language, setLanguage, t } = useAppI18n();
  useAppBackParent("/");
  const { colorTheme, setColorTheme } = useColorTheme();
  const [contributions, setContributions] = useState<LocalSiteContribution[]>([]);
  const [supplementaryCatalog, setSupplementaryCatalog] =
    useState<DiveSiteCatalog | null>(null);
  const [catalogLabel, setCatalogLabel] = useState<string | null>(null);
  const [backgrounds, setBackgrounds] = useState<LocalBackground[]>([]);
  const [logo, setLogo] = useState<LocalBrandingAsset | null>(null);
  const [defaultCylinderPresetId, setDefaultCylinderPresetId] = useState(
    DEFAULT_CYLINDER_PRESET_ID,
  );
  const [status, setStatus] = useState(t("loadingLogbook"));
  const [sourceLogStatus, setSourceLogStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [backupPreview, setBackupPreview] =
    useState<PreparedAppBackup | null>(null);
  const backupPreviewRef = useRef<HTMLDivElement>(null);
  // Kept so the app can hand the freshly written backup to a share target;
  // browsers already deliver the file through the download itself.
  const [savedBackup, setSavedBackup] = useState<SavedExportFile | null>(null);
  const [encryptBackup, setEncryptBackup] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportPasswordConfirmation, setExportPasswordConfirmation] =
    useState("");
  const [encryptedBackupFile, setEncryptedBackupFile] = useState<File | null>(
    null,
  );
  const [importPassword, setImportPassword] = useState("");
  const [dives, setDives] = useState<LocalDive[]>([]);
  const [manualMergeFirstId, setManualMergeFirstId] = useState("");
  const [manualMergeSecondId, setManualMergeSecondId] = useState("");
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    DuplicateDiveCandidate[]
  >([]);
  const [dismissedDuplicates, setDismissedDuplicates] = useState<string[]>([]);
  const [bundledBackgroundVisible, setBundledBackgroundVisible] = useState(true);
  const [storageEstimate, setStorageEstimate] = useState<Awaited<
    ReturnType<typeof getLocalBackupSizeEstimate>
  > | null>(null);
  const [whatsNew, setWhatsNew] = useState<WhatsNewDocument | null>(null);
  const [whatsNewRefreshing, setWhatsNewRefreshing] = useState(false);
  const [whatsNewStatus, setWhatsNewStatus] = useState<string | null>(null);
  const [nativeAppInfo, setNativeAppInfo] = useState<NativeAppInfo | null>(null);
  const [automaticUpdateChecks, setAutomaticUpdateChecks] = useState(false);
  const dataRefreshGenerationRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNativeAppInfo(getNativeAppInfo());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!backupPreview) return;
    const frame = window.requestAnimationFrame(() => {
      backupPreviewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [backupPreview]);

  useEffect(() => {
    if (window.location.hash !== "#backup-transfer") return;

    let firstFrame = 0;
    let secondFrame = 0;
    const settleTimer = window.setTimeout(() => {
      document.getElementById("backup-transfer")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 320);

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById("backup-transfer")?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
    };
  }, []);

  async function refreshWhatsNew() {
    setWhatsNewStatus(null);
    if (!navigator.onLine) {
      setWhatsNewStatus(t("updatesOffline"));
      return;
    }

    setWhatsNewRefreshing(true);
    try {
      const document = await fetchWhatsNewDocument();
      setWhatsNew(document);
      await saveLocalAppPreferences({
        whatsNewCache: document,
        whatsNewFetchedAt: new Date().toISOString(),
      });
      const channelRelease = nativeAppInfo
        ? document.channels?.[nativeAppInfo.channel]
        : null;
      if (channelRelease && nativeAppInfo) {
        setWhatsNewStatus(
          channelRelease.versionCode > nativeAppInfo.versionCode
            ? t("updateAvailableVersion", {
                version: channelRelease.versionName,
              })
            : t("appUpToDate"),
        );
      } else {
        setWhatsNewStatus(t("updatesRefreshed"));
      }
    } catch {
      setWhatsNewStatus(t("updatesRefreshFailed"));
    } finally {
      setWhatsNewRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    const generation = ++dataRefreshGenerationRef.current;
    const migrated = takeSessionSupplementaryCatalogMigration();
    Promise.all([
      listLocalSiteContributions(),
      listLocalBackgrounds(),
      getLocalOverlayLogo(),
      getLocalAppPreferences(),
      listLocalDives(),
      getLocalBackupSizeEstimate(),
      getLocalSupplementaryCatalog(),
    ])
      .then(async ([items, savedBackgrounds, savedLogo, preferences, dives, estimate, savedCatalog]) => {
        const supplementary =
          migrated && !savedCatalog
            ? await saveLocalSupplementaryCatalog(migrated.label, migrated.catalog)
            : savedCatalog;
        if (!active || generation !== dataRefreshGenerationRef.current) return;
        setContributions(items);
        setSupplementaryCatalog(supplementary?.catalog ?? null);
        setCatalogLabel(supplementary?.label ?? null);
        setBackgrounds(savedBackgrounds);
        setLogo(savedLogo ?? null);
        setDefaultCylinderPresetId(
          preferences?.defaultCylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID,
        );
        setDismissedDuplicates(preferences?.dismissedDuplicatePairs ?? []);
        setBundledBackgroundVisible(!preferences?.bundledBackgroundHidden);
        setWhatsNew(preferences?.whatsNewCache ?? null);
        setAutomaticUpdateChecks(
          preferences?.automaticUpdateChecks ?? false,
        );
        setDuplicateCandidates(findPotentialDuplicateDives(dives));
        setDives(dives);
        setStorageEstimate(estimate);
        setStatus(
          items.length
            ? t("manualSitesReady", { count: items.length, suffix: items.length === 1 ? "" : "s" })
            : t("noManualSites"),
        );
      })
      .catch((error) => {
        if (active && generation === dataRefreshGenerationRef.current) {
          setStatus(error instanceof Error ? error.message : t("settingsLoadFailed"));
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      dataRefreshGenerationRef.current += 1;
    };
  }, [t]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeLocalDataChanges(() => {
      const generation = ++dataRefreshGenerationRef.current;
      void Promise.all([
        listLocalSiteContributions(),
        listLocalBackgrounds(),
        getLocalOverlayLogo(),
        getLocalAppPreferences(),
        listLocalDives(),
        getLocalBackupSizeEstimate(),
        getLocalSupplementaryCatalog(),
      ])
        .then(
          ([
            items,
            savedBackgrounds,
            savedLogo,
            preferences,
            nextDives,
            estimate,
            savedCatalog,
          ]) => {
            if (!active || generation !== dataRefreshGenerationRef.current) return;
            setContributions(items);
            setSupplementaryCatalog(savedCatalog?.catalog ?? null);
            setCatalogLabel(savedCatalog?.label ?? null);
            setBackgrounds(savedBackgrounds);
            setLogo(savedLogo ?? null);
            setDefaultCylinderPresetId(
              preferences?.defaultCylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID,
            );
            setDismissedDuplicates(preferences?.dismissedDuplicatePairs ?? []);
            setBundledBackgroundVisible(!preferences?.bundledBackgroundHidden);
            setWhatsNew(preferences?.whatsNewCache ?? null);
            setAutomaticUpdateChecks(
              preferences?.automaticUpdateChecks ?? false,
            );
            setDuplicateCandidates(findPotentialDuplicateDives(nextDives));
            setDives(nextDives);
            setStorageEstimate(estimate);
          },
        )
        .catch(() => undefined);
    });
    return () => {
      active = false;
      dataRefreshGenerationRef.current += 1;
      unsubscribe();
    };
  }, []);

  async function chooseAutomaticUpdateChecks(enabled: boolean) {
    setAutomaticUpdateChecks(enabled);
    try {
      await saveLocalAppPreferences({ automaticUpdateChecks: enabled });
      if (enabled) void refreshWhatsNew();
    } catch (error) {
      setAutomaticUpdateChecks(!enabled);
      setWhatsNewStatus(
        error instanceof Error ? error.message : t("settingsSaveFailed"),
      );
    }
  }

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
      setStorageEstimate(await getLocalBackupSizeEstimate());
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
      setStorageEstimate(await getLocalBackupSizeEstimate());
      setStatus(t("removedBackground"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("backgroundRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeBundledBackground() {
    setBusy(true);
    try {
      await saveLocalAppPreferences({ bundledBackgroundHidden: true });
      setBundledBackgroundVisible(false);
      setStatus(t("bundledBackgroundRemoved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("settingsSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function restoreBundledBackground() {
    setBusy(true);
    try {
      await saveLocalAppPreferences({ bundledBackgroundHidden: false });
      setBundledBackgroundVisible(true);
      setStatus(t("bundledBackgroundRestored"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("settingsSaveFailed"));
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
      setStorageEstimate(await getLocalBackupSizeEstimate());
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
      setStorageEstimate(await getLocalBackupSizeEstimate());
      setStatus(t("removedLogo"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("logoRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function exportAppData() {
    if (
      encryptBackup &&
      (!exportPassword || exportPassword !== exportPasswordConfirmation)
    ) {
      setStatus(
        !exportPassword
          ? t("backupPasswordRequired")
          : t("backupPasswordsDoNotMatch"),
      );
      return;
    }
    setBusy(true);
    setSavedBackup(null);
    setStatus(t("preparingBackup"));
    try {
      const backup = await createLocalAppBackup(
        encryptBackup ? exportPassword : undefined,
      );
      const date = new Date().toISOString().slice(0, 10);
      setStatus(t("writingBackupFile"));
      const saved = await saveExportFile(
        backup.blob,
        `diveframe-backup${backup.encrypted ? "-encrypted" : ""}-${date}.json`,
        "application/json",
      );
      setSavedBackup(saved.target === "device" ? saved : null);
      if (backup.encrypted) {
        setEncryptBackup(false);
        setExportPassword("");
        setExportPasswordConfirmation("");
      }
      setStatus(withSavedFileNotice(t("backupComplete", backup.counts), saved));
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
    setEncryptedBackupFile(null);
    setImportPassword("");
    setBusy(true);
    setStatus(t("validatingBackup"));
    try {
      const preview = await previewLocalAppBackup(file);
      setBackupPreview(preview);
      setStatus(t("backupReadyForReview"));
    } catch (error) {
      setBackupPreview(null);
      if (error instanceof BackupPasswordRequiredError) {
        setEncryptedBackupFile(file);
        setStatus(t("encryptedBackupNeedsPassword"));
      } else {
        setStatus(
          error instanceof Error ? error.message : t("importBackupFailed"),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlockEncryptedBackup() {
    if (!encryptedBackupFile) return;
    if (!importPassword) {
      setStatus(t("backupPasswordRequired"));
      return;
    }
    setBusy(true);
    setStatus(t("decryptingBackup"));
    try {
      const preview = await previewLocalAppBackup(
        encryptedBackupFile,
        importPassword,
      );
      setBackupPreview(preview);
      setEncryptedBackupFile(null);
      setImportPassword("");
      setStatus(t("backupReadyForReview"));
    } catch (error) {
      setBackupPreview(null);
      setStatus(
        error instanceof BackupPasswordIncorrectError
          ? t("backupPasswordIncorrect")
          : error instanceof Error
            ? error.message
            : t("importBackupFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreAppData(mode: "merge" | "replace" | "replace-dives") {
    if (!backupPreview) return;
    if (
      (mode === "replace" || mode === "replace-dives") &&
      !window.confirm(
        t(mode === "replace" ? "replaceBackupConfirm" : "replaceDivesBackupConfirm"),
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus(t("restoringBackup"));
    try {
      const result = await restorePreparedAppBackup(backupPreview, mode);
      const [items, savedBackgrounds, savedLogo, restoredPreferences, restoredCatalog] = await Promise.all([
        listLocalSiteContributions(),
        listLocalBackgrounds(),
        getLocalOverlayLogo(),
        getLocalAppPreferences(),
        getLocalSupplementaryCatalog(),
      ]);
      setContributions(items);
      setBackgrounds(savedBackgrounds);
      setLogo(savedLogo ?? null);
      setSupplementaryCatalog(restoredCatalog?.catalog ?? null);
      setCatalogLabel(restoredCatalog?.label ?? null);
      if (restoredPreferences?.uiLanguage) {
        await setLanguage(restoredPreferences.uiLanguage);
      }
      setDefaultCylinderPresetId(
        restoredPreferences?.defaultCylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID,
      );
      setBundledBackgroundVisible(
        !restoredPreferences?.bundledBackgroundHidden,
      );
      const dives = await listLocalDives();
      setDuplicateCandidates(findPotentialDuplicateDives(dives));
      setDives(dives);
      setDismissedDuplicates(
        restoredPreferences?.dismissedDuplicatePairs ?? [],
      );
      setBackupPreview(null);
      setEncryptedBackupFile(null);
      setImportPassword("");
      setStorageEstimate(await getLocalBackupSizeEstimate());
      setStatus(
        mode === "merge"
          ? t("importMergeComplete", result)
          : mode === "replace-dives"
            ? t("importReplaceDivesComplete", result)
            : t("importReplaceComplete", result),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("importBackupFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function eraseDivePhotos() {
    if (!window.confirm(t("eraseDivePhotosConfirm"))) return;
    setBusy(true);
    try {
      const count = await clearLocalDivePhotos();
      setStorageEstimate(await getLocalBackupSizeEstimate());
      setStatus(t("eraseDivePhotosComplete", { count }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("eraseDivePhotosFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function optimizeStoredPhotos() {
    if (!window.confirm(t("optimizeStoredPhotosConfirm"))) return;
    setBusy(true);
    setStatus(t("optimizingStoredPhotos"));
    try {
      const result = await optimizeLocalStoredPhotos();
      const [savedBackgrounds, estimate] = await Promise.all([
        listLocalBackgrounds(),
        getLocalBackupSizeEstimate(),
      ]);
      setBackgrounds(savedBackgrounds);
      setStorageEstimate(estimate);
      setStatus(
        t("optimizeStoredPhotosComplete", {
          optimized: result.optimized,
          saved: formatByteCount(result.beforeBytes - result.afterBytes),
        }),
      );
    } catch (error) {
      setStatus(
        error instanceof LocalDataConflictError
          ? error.message
          : error instanceof Error
            ? error.message
            : t("optimizeStoredPhotosFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resolveDuplicate(keepId: string, removeId: string) {
    setBusy(true);
    try {
      const result = await mergeLocalDuplicateDives(keepId, removeId);
      const dives = await listLocalDives();
      setDuplicateCandidates(findPotentialDuplicateDives(dives));
      setDives(dives);
      setManualMergeFirstId("");
      setManualMergeSecondId("");
      setStatus(t("duplicateMergeComplete", result));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("duplicateMergeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resolveManualDuplicate(keepId: string, removeId: string) {
    if (!keepId || !removeId || keepId === removeId) {
      setStatus(t("chooseTwoDifferentDives"));
      return;
    }
    if (!window.confirm(t("manualMergeConfirm"))) return;
    await resolveDuplicate(keepId, removeId);
  }

  async function keepDuplicateSeparate(candidateId: string) {
    const next = [...new Set([...dismissedDuplicates, candidateId])];
    setDismissedDuplicates(next);
    try {
      await saveLocalAppPreferences({ dismissedDuplicatePairs: next });
      setStatus(t("duplicateKeptSeparate"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("settingsSaveFailed"));
    }
  }

  async function eraseAllData() {
    if (!window.confirm(t("eraseAllDataConfirm"))) return;
    setBusy(true);
    try {
      await clearAllLocalData();
      setContributions([]);
      setDuplicateCandidates([]);
      setDismissedDuplicates([]);
      setBackgrounds([]);
      setBundledBackgroundVisible(true);
      setLogo(null);
      setStorageEstimate(null);
      setDefaultCylinderPresetId(DEFAULT_CYLINDER_PRESET_ID);
      setSupplementaryCatalog(null);
      setCatalogLabel(null);
      setDives([]);
      setManualMergeFirstId("");
      setManualMergeSecondId("");
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
      setDuplicateCandidates([]);
      setStorageEstimate(await getLocalBackupSizeEstimate());
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
    const preparing = t("preparingSubsurfaceExport");
    setStatus(preparing);
    setSourceLogStatus(preparing);
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
        const message = t("noSubsurfaceUpdates");
        setStatus(message);
        setSourceLogStatus(message);
        return;
      }
      const baseName =
        file.name.replace(/\.(?:ssrf|xml)$/i, "") || "subsurface-log";
      const saved = await saveExportFile(
        new Blob([result.xml], { type: "application/xml;charset=utf-8" }),
        `${baseName}-diveframe-updated.ssrf`,
        "application/xml",
      );
      const message = withSavedFileNotice(
        t("subsurfaceExportComplete", {
          dives: result.updatedDives,
          sites: result.addedSites,
          buddies: result.updatedBuddies,
          notes: result.updatedNotes,
        }),
        saved,
      );
      setStatus(message);
      setSourceLogStatus(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("subsurfaceExportFailed");
      setStatus(message);
      setSourceLogStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function exportFullSubsurfaceLogbook() {
    setBusy(true);
    const preparing = t("preparingSubsurfaceLogbook");
    setStatus(preparing);
    setSourceLogStatus(preparing);
    try {
      const localDives = await listLocalDives();
      if (!localDives.length) {
        const message = t("noDivesForSubsurfaceLogbook");
        setStatus(message);
        setSourceLogStatus(message);
        return;
      }
      const { portable, incompleteDiveIds } =
        partitionSubsurfaceLogbookDives(localDives);
      if (!portable.length) {
        const message = t("subsurfaceLogbookIncomplete", {
          count: incompleteDiveIds.length,
        });
        setStatus(message);
        setSourceLogStatus(message);
        return;
      }
      const saved = await saveExportFile(
        new Blob([createSubsurfaceLogbook(portable)], {
          type: "application/xml;charset=utf-8",
        }),
        "diveframe-subsurface-logbook.ssrf",
        "application/xml",
      );
      const message = withSavedFileNotice(
        incompleteDiveIds.length
          ? t("subsurfaceLogbookExportCompleteWithSkipped", {
              count: portable.length,
              skipped: incompleteDiveIds.length,
            })
          : t("subsurfaceLogbookExportComplete", {
              count: portable.length,
            }),
        saved,
      );
      setStatus(message);
      setSourceLogStatus(message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("subsurfaceLogbookExportFailed");
      setStatus(message);
      setSourceLogStatus(message);
    } finally {
      setBusy(false);
    }
  }

  const deviceCatalog = useMemo(
    () =>
      deviceSiteCatalogFromContributions(
        contributions,
        BUILT_IN_CATALOG.schemaVersion,
      ),
    [contributions],
  );

  async function shareSavedBackup() {
    if (!savedBackup) return;
    try {
      await shareExportFile(savedBackup, {
        mimeType: "application/json",
        title: savedBackup.fileName,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("shareExportFailed"));
    }
  }

  function withSavedFileNotice(message: string, saved: SavedExportFile) {
    const notice = savedFileNotice(saved, t);
    return notice ? `${message} ${notice}` : message;
  }

  async function downloadCatalogPrompt() {
    setBusy(true);
    setStatus(t("catalogPromptSaving"));
    try {
      const response = await fetch("/examples/dive-site-catalog-ai-prompt.md");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = new Blob([await response.arrayBuffer()], {
        type: "text/markdown;charset=utf-8",
      });
      const saved = await saveExportFile(
        blob,
        "dive-site-catalog-ai-prompt.md",
        "text/markdown",
      );
      setStatus(withSavedFileNotice(t("catalogPromptSaved"), saved));
    } catch (error) {
      setStatus(
        error instanceof Error && error.message
          ? `${t("catalogPromptDownloadFailed")} ${error.message}`
          : t("catalogPromptDownloadFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function chooseCatalog(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validation = validateDiveSitesFile(parsed);
      if (!validation.ok || !validation.catalog) {
        const details = validation.issues
          .filter(({ level }) => level === "error")
          .slice(0, 3)
          .map(({ message }) => message)
          .join(" ");
        throw new Error(
          t("catalogValidationFailed", {
            count: validation.errorCount,
            details,
          }),
        );
      }
      const validated = validateDiveSiteCatalog(validation.catalog);
      const saved = await saveLocalSupplementaryCatalog(file.name, validated);
      setSupplementaryCatalog(saved.catalog);
      setCatalogLabel(saved.label);
      setStatus(
        validation.warningCount > 0
          ? t("usingCatalogWithWarnings", {
              name: file.name,
              count: validated.sites.length,
              warnings: validation.warningCount,
            })
          : t("usingCatalog", {
              name: file.name,
              count: validated.sites.length,
            }),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("catalogReadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSessionCatalog() {
    setBusy(true);
    try {
      await clearLocalSupplementaryCatalog();
      setSupplementaryCatalog(null);
      setCatalogLabel(null);
      setStatus(t("sessionCatalogRemoved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("catalogReadFailed"));
    } finally {
      setBusy(false);
    }
  }

  const visibleDuplicates = duplicateCandidates.filter(
    (candidate) => !dismissedDuplicates.includes(candidate.id),
  );

  return (
    <main className="settings-page">
      <AppTopbar
        className="settings-topbar"
        subtitle={t("settings")}
        brand={{ mode: "link", href: "/", ariaLabel: t("home") }}
        showHome
        showImportCluster
      />

      <div className="settings-shell">
        <section className="settings-hero">
          <p className="eyebrow">{t("deviceLocalPreferences")}</p>
          <h1>{t("settingsAndData")}</h1>
          <p>{t("settingsDescription")}</p>
        </section>

        {nativeAppInfo ? (
          <section className="settings-card whats-new-settings">
          <div className="whats-new-heading">
            <div>
              <p className="eyebrow">{t("whatsNew")}</p>
              <h2>{t("whatsNewTitle")}</h2>
            </div>
            <button
              className="button button-secondary"
              disabled={whatsNewRefreshing}
              onClick={() => void refreshWhatsNew()}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={whatsNewRefreshing ? "spin" : undefined}
                size={16}
              />
              {whatsNewRefreshing
                ? t("refreshingUpdates")
                : t("refreshUpdates")}
            </button>
          </div>
          <p className="settings-note">{t("updatesCachedDescription")}</p>
          {nativeAppInfo ? (
            <div className="app-version-row">
              <span>{t("installedVersion")}</span>
              <strong>{nativeAppInfo.versionName}</strong>
            </div>
          ) : null}
          {whatsNew ? (
            <details>
              <summary className="whats-new-summary">
                <div>
                  <strong>{whatsNew.entries[0]?.title ?? whatsNew.version}</strong>
                  <small>v{whatsNew.version}</small>
                </div>
                <ChevronDown aria-hidden="true" size={18} />
              </summary>
              <div className="whats-new-list">
                {whatsNew.entries.map((entry) => (
                  <article className="whats-new-entry" key={entry.id}>
                    <h3>{entry.title}</h3>
                    {entry.date && <p className="settings-note">{entry.date}</p>}
                    <p className="settings-note">
                      {renderWhatsNewBody(entry.body).map((part, index) =>
                        part.type === "link" ? (
                          <a href={part.href} key={`${entry.id}-body-${index}`} rel="noopener noreferrer" target="_blank">
                            {part.label}
                          </a>
                        ) : (
                          <span key={`${entry.id}-body-${index}`}>{part.text}</span>
                        ),
                      )}
                    </p>
                    {entry.links.length > 0 && (
                      <div className="settings-actions">
                        {entry.links.map((link) => {
                          const href = sanitizeWhatsNewHref(link.href);
                          return href ? (
                            <a className="button button-secondary" href={href} key={`${entry.id}-${href}`} rel="noopener noreferrer" target="_blank">
                              {link.label}
                            </a>
                          ) : null;
                        })}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </details>
          ) : (
            <p className="empty-compact">{t("noCachedUpdates")}</p>
          )}
          {whatsNewStatus ? (
            <p className="settings-note whats-new-status" role="status">
              {whatsNewStatus}
            </p>
          ) : null}
          {nativeAppInfo ? (
            <>
              <a
                className="button button-secondary update-destination"
                href={updateDestinationForChannel(nativeAppInfo.channel)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Download aria-hidden="true" size={16} />
                {nativeAppInfo.channel === "preview"
                  ? t("downloadLatestPreview")
                  : t("openInFdroid")}
              </a>
              <label className="automatic-update-toggle">
                <input
                  checked={automaticUpdateChecks}
                  onChange={(event) =>
                    void chooseAutomaticUpdateChecks(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <strong>{t("automaticUpdateChecks")}</strong>
                  <small>{t("automaticUpdateChecksDescription")}</small>
                </span>
              </label>
            </>
          ) : null}
          </section>
        ) : null}

        <section className="settings-card prefs-settings">
          <div className="prefs-settings-grid">
            <label className="language-select">
              <span className="eyebrow">{t("language")}</span>
              <select
                value={language}
                onChange={(event) => {
                  void setLanguage(
                    event.target.value as "en" | "zh-Hant" | "ja",
                  ).catch(() => setStatus(t("settingsSaveFailed")));
                }}
                aria-label={t("appLanguage")}
              >
                <option value="en">{t("english")}</option>
                <option value="zh-Hant">{t("traditionalChineseHK")}</option>
                <option value="ja">{t("japanese")}</option>
              </select>
            </label>
            <label className="language-select">
              <span className="eyebrow">{t("theme")}</span>
              <select
                value={colorTheme}
                onChange={(event) => {
                  void setColorTheme(
                    event.target.value as "light" | "dark",
                  ).catch(() => setStatus(t("settingsSaveFailed")));
                }}
                aria-label={t("colorTheme")}
              >
                <option value="dark">{t("colorThemeDark")}</option>
                <option value="light">{t("colorThemeLight")}</option>
              </select>
            </label>
          </div>
        </section>

        <PwaInstallCard />

        <section
          id="backup-transfer"
          className="settings-card backup-settings"
        >
          <div className="settings-card-heading">
            <span className="settings-icon"><Archive size={21} /></span>
            <div>
              <p className="eyebrow">{t("backupAndTransfer")}</p>
              <h2>{t("backupTitle")}</h2>
            </div>
          </div>
          <p className="settings-note">
            {t("backupDescription")}
          </p>
          <label className="backup-encryption-toggle">
            <input
              type="checkbox"
              checked={encryptBackup}
              onChange={(event) => setEncryptBackup(event.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>{t("passwordProtectBackup")}</strong>
              <small>{t("passwordProtectBackupDescription")}</small>
            </span>
          </label>
          {encryptBackup && (
            <div className="backup-password-fields">
              <label>
                <span>{t("backupPassword")}</span>
                <input
                  type="password"
                  value={exportPassword}
                  autoComplete="new-password"
                  onChange={(event) => setExportPassword(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                <span>{t("confirmBackupPassword")}</span>
                <input
                  type="password"
                  value={exportPasswordConfirmation}
                  autoComplete="new-password"
                  onChange={(event) => setExportPasswordConfirmation(event.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
          )}
          <div className="settings-actions">
            <button type="button" className="button button-primary" onClick={exportAppData} disabled={busy}>
              <Download size={16} /> {t("exportAppData")}
            </button>
            {savedBackup?.target === "device" && savedBackup.shareable && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void shareSavedBackup()}
                disabled={busy}
              >
                <Share2 size={16} /> {t("shareExportedFile")}
              </button>
            )}
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
          {encryptedBackupFile && (
            <div className="encrypted-backup-unlock">
              <ShieldCheck size={19} />
              <div>
                <strong>{t("unlockEncryptedBackup")}</strong>
                <small>{encryptedBackupFile.name}</small>
              </div>
              <label>
                <span>{t("backupPassword")}</span>
                <input
                  type="password"
                  value={importPassword}
                  autoComplete="current-password"
                  onChange={(event) => setImportPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void unlockEncryptedBackup();
                  }}
                  disabled={busy}
                />
              </label>
              <div className="settings-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void unlockEncryptedBackup()}
                  disabled={busy || !importPassword}
                >
                  {t("unlockBackup")}
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => {
                    setEncryptedBackupFile(null);
                    setImportPassword("");
                  }}
                  disabled={busy}
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}
          {backupPreview && (
            <div
              ref={backupPreviewRef}
              className="backup-preview"
              role="region"
              aria-label={t("backupPreview")}
            >
              <div className="backup-preview-heading">
                <ShieldCheck size={19} />
                <div>
                  <strong>{t("backupPreview")}</strong>
                  <small>{backupPreview.fileName}</small>
                </div>
                <span
                  className={
                    backupPreview.integrity === "verified"
                      ? "integrity-badge verified"
                      : "integrity-badge legacy"
                  }
                >
                  {backupPreview.encryption === "encrypted"
                    ? t("encryptedAndVerified")
                    : backupPreview.integrity === "verified"
                      ? t("checksumVerified")
                      : t("legacyBackup")}
                </span>
              </div>
              <p>
                {t("backupExportedAt", {
                  date: new Date(backupPreview.exportedAt).toLocaleString(),
                })}
              </p>
              <div className="backup-counts">
                <span><strong>{backupPreview.counts.dives}</strong>{t("backupDives")}</span>
                <span><strong>{backupPreview.counts.photos}</strong>{t("backupPhotos")}</span>
                <span><strong>{backupPreview.counts.backgrounds}</strong>{t("backupBackgrounds")}</span>
                <span><strong>{backupPreview.counts.presets}</strong>{t("backupPresets")}</span>
              </div>
              <p className="settings-note">
                {t("backupImpact", backupImpact(backupPreview))}
              </p>
              <p className="settings-note">
                {t("backupMergeConflictRule")}
              </p>
              <p className="settings-note">
                {t("replaceDivesBackupDescription")}
              </p>
              <div className="settings-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void restoreAppData("merge")}
                  disabled={busy}
                >
                  <GitMerge size={16} /> {t("mergeBackup")}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void restoreAppData("replace-dives")}
                  disabled={busy}
                >
                  <RefreshCw size={16} /> {t("replaceDivesWithBackup")}
                </button>
                <button
                  type="button"
                  className="button button-danger-secondary"
                  onClick={() => void restoreAppData("replace")}
                  disabled={busy}
                >
                  <RefreshCw size={16} /> {t("replaceWithBackup")}
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setBackupPreview(null)}
                  disabled={busy}
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}
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
            <span className="visually-hidden">{t("defaultTankSize")}</span>
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

        <div className="settings-group composer-settings-group">
          <div className="settings-group-heading">
            <span className="settings-icon"><ImageIcon size={21} /></span>
            <div>
              <p className="eyebrow">{t("imageComposer")}</p>
              <h2>{t("imageComposerSettings")}</h2>
            </div>
          </div>

          <section className="settings-card branding-settings">
            <div className="settings-card-heading">
              <span className="settings-icon"><ImageIcon size={21} /></span>
              <div>
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
            {bundledBackgroundVisible || backgrounds.length > 0 ? (
              <div className="background-library">
                {bundledBackgroundVisible && (
                  <BundledBackgroundTile
                    onRemove={() => void removeBundledBackground()}
                  />
                )}
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
            {!bundledBackgroundVisible && (
              <button
                type="button"
                className="button button-quiet restore-bundled-background"
                onClick={() => void restoreBundledBackground()}
                disabled={busy}
              >
                <RefreshCw size={16} /> {t("restoreIncludedBackground")}
              </button>
            )}
          </section>
        </div>

        <section
          className="settings-card catalog-settings"
          id="dive-site-catalog"
        >
          <div className="settings-card-heading">
            <span className="settings-icon"><Database size={21} /></span>
            <div>
              <p className="eyebrow">{t("diveSiteCatalog")}</p>
              <h2>{t("reviewPublishSites")}</h2>
            </div>
          </div>

          <div className="catalog-summary">
            <a
              href={appRouteHref("/catalog")}
              className="catalog-summary-link"
              aria-label={t("openCatalogBrowser", {
                count: BUILT_IN_CATALOG.sites.length,
              })}
            >
              <span>
                <strong>{BUILT_IN_CATALOG.sites.length}</strong>
                <small>{t("catalogSites")}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
            <a
              href={appRouteHref("/catalog/device-additions")}
              className="catalog-summary-link"
              aria-label={t("openDeviceCatalog", {
                count: deviceCatalog.sites.length,
              })}
            >
              <span>
                <strong>{deviceCatalog.sites.length}</strong>
                <small>{t("deviceAdditions")}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
            <a
              href={appRouteHref("/catalog/supplement")}
              className="catalog-summary-link"
              aria-label={t("openSupplementCatalog", {
                count: supplementaryCatalog?.sites.length ?? 0,
              })}
            >
              <span>
                <strong>{supplementaryCatalog?.sites.length ?? 0}</strong>
                <small>{t("fromSupplement")}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          </div>

          <div className="catalog-source">
            <div>
              <FileJson size={18} />
              <span>
                <strong>
                  {t("bundledCatalog")}
                  {catalogLabel ? ` + ${catalogLabel}` : ""}
                </strong>
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
                  onClick={() => void removeSessionCatalog()}
                  disabled={busy}
                >
                  <Trash2 size={16} /> {t("removeSessionCatalog")}
                </button>
              )}
            </div>
          </div>

          <p className="settings-note">
            {t("catalogPromptDescription")}{" "}
            <button
              type="button"
              className="settings-inline-link settings-inline-button"
              disabled={busy}
              onClick={() => void downloadCatalogPrompt()}
            >
              {t("downloadCatalogPrompt")}
            </button>
          </p>
          <p className="settings-note">
            {t("catalogSharingInvitation")}
          </p>

        </section>

        <details className="settings-advanced">
          <summary className="settings-advanced-summary">
            <div className="settings-card-heading">
              <span className="settings-icon"><Database size={21} /></span>
              <div>
                <p className="eyebrow">{t("advancedSettings")}</p>
                <h2>{t("advancedSettingsTitle")}</h2>
              </div>
            </div>
            <span className="settings-advanced-toggle">{t("advancedSettingsDescription")} <ChevronDown size={17} /></span>
          </summary>
          <div className="settings-advanced-body">

        <section className="settings-card duplicate-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><GitMerge size={21} /></span>
            <div>
              <p className="eyebrow">{t("dataQuality")}</p>
              <h2>{t("duplicateReviewTitle")}</h2>
            </div>
          </div>
          <p className="settings-note">{t("duplicateReviewDescription")}</p>
          <details className="duplicate-review">
            <summary>
              {visibleDuplicates.length
                ? t("duplicateCandidates", { count: visibleDuplicates.length })
                : t("noDuplicateCandidates")}
            </summary>
            <div className="duplicate-list">
              {visibleDuplicates.map((candidate) => (
                <article className="duplicate-candidate" key={candidate.id}>
                  <div className="duplicate-comparison">
                    <DuplicateDive dive={candidate.first} label="1" t={t} />
                    <DuplicateDive dive={candidate.second} label="2" t={t} />
                  </div>
                  <p>
                    {t("duplicateDifference", {
                      seconds: Math.round(candidate.timeDifferenceSeconds),
                      depth:
                        candidate.depthDifferenceM === null
                          ? "—"
                          : candidate.depthDifferenceM.toFixed(1),
                    })}
                  </p>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        void resolveDuplicate(
                          candidate.first.id,
                          candidate.second.id,
                        )
                      }
                      disabled={busy}
                    >
                      {t("keepFirstDive")}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        void resolveDuplicate(
                          candidate.second.id,
                          candidate.first.id,
                        )
                      }
                      disabled={busy}
                    >
                      {t("keepSecondDive")}
                    </button>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => void keepDuplicateSeparate(candidate.id)}
                    >
                      {t("keepSeparate")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="manual-merge">
              <strong>{t("manualMergeTitle")}</strong>
              <p>{t("manualMergeDescription")}</p>
              <div className="manual-merge-selects">
                <label>
                  <span>{t("diveToKeep")}</span>
                  <select
                    value={manualMergeFirstId}
                    onChange={(event) =>
                      setManualMergeFirstId(event.target.value)
                    }
                  >
                    <option value="">{t("chooseDive")}</option>
                    {dives.map((dive) => (
                      <option key={dive.id} value={dive.id}>
                        {diveOptionLabel(dive, t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("diveToMerge")}</span>
                  <select
                    value={manualMergeSecondId}
                    onChange={(event) =>
                      setManualMergeSecondId(event.target.value)
                    }
                  >
                    <option value="">{t("chooseDive")}</option>
                    {dives.map((dive) => (
                      <option key={dive.id} value={dive.id}>
                        {diveOptionLabel(dive, t)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  void resolveManualDuplicate(
                    manualMergeFirstId,
                    manualMergeSecondId,
                  )
                }
                disabled={
                  busy ||
                  !manualMergeFirstId ||
                  !manualMergeSecondId ||
                  manualMergeFirstId === manualMergeSecondId
                }
              >
                <GitMerge size={16} /> {t("mergeSelectedDives")}
              </button>
            </div>
          </details>
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
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void exportFullSubsurfaceLogbook()}
            disabled={busy}
          >
            <Download size={16} /> {t("exportSubsurfaceLogbook")}
          </button>
          <p className="settings-note">
            {t("exportSubsurfaceLogbookNote")}
          </p>
          {sourceLogStatus ? (
            <p className="settings-note subsurface-export-status" role="status">
              {busy ? <LoaderCircle size={14} className="spin" /> : null}
              {sourceLogStatus}
            </p>
          ) : null}
        </section>

        <section className="settings-card storage-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Database size={21} /></span>
            <div>
              <p className="eyebrow">{t("storageManagement")}</p>
              <h2>{t("localMediaStorage")}</h2>
            </div>
          </div>
          <p className="settings-note">{t("storageManagementDescription")}</p>
          {storageEstimate && (
            <div className="storage-summary">
              <div>
                <strong>
                  {formatByteCount(storageEstimate.estimatedBackupBytes)}
                </strong>
                <span>{t("estimatedBackupSize")}</span>
              </div>
              <div>
                <strong>{formatByteCount(storageEstimate.mediaBytes)}</strong>
                <span>{t("storedMediaSize")}</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void optimizeStoredPhotos()}
            disabled={busy || storageEstimate?.mediaBytes === 0}
          >
            <RefreshCw size={16} /> {t("optimizeStoredPhotos")}
          </button>
          <p className="settings-note">{t("optimizeStoredPhotosDescription")}</p>
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
              <strong>{t("eraseDivePhotos")}</strong>
              <p>{t("eraseDivePhotosDescription")}</p>
              <button
                type="button"
                className="button button-danger-secondary"
                onClick={() => void eraseDivePhotos()}
                disabled={busy}
              >
                <Trash2 size={16} /> {t("eraseDivePhotosAction")}
              </button>
            </div>
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
                <Trash2 size={16} /> {t("eraseAllDataAction")}
              </button>
            </div>
          </div>
        </section>

          </div>
        </details>

        <div className="settings-status" role="status">
          {busy && <LoaderCircle size={15} className="spin" />}
          {status}
        </div>
      </div>
    </main>
  );
}
function backupImpact(backup: PreparedAppBackup) {
  return Object.values(backup.stores).reduce(
    (totals, store) => ({
      newRecords: totals.newRecords + store.newRecords,
      matchingRecords: totals.matchingRecords + store.matchingRecords,
      localOnlyRecords: totals.localOnlyRecords + store.localOnlyRecords,
    }),
    { newRecords: 0, matchingRecords: 0, localOnlyRecords: 0 },
  );
}

function formatByteCount(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (megabytes < 1024) return `${Math.round(megabytes)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}

function diveOptionLabel(dive: LocalDive, t: AppTranslate) {
  const date = dive.diveDate
    ? new Date(dive.diveDate).toLocaleString()
    : t("dateUnknown");
  const site =
    dive.userSite || dive.site || dive.location || t("unnamedDiveSite");
  const depth =
    dive.maxDepthM === null ? "" : ` · ${dive.maxDepthM.toFixed(1)} m`;
  return `${date} · ${site}${depth}`;
}

function DuplicateDive({
  dive,
  label,
  t,
}: {
  dive: LocalDive;
  label: string;
  t: AppTranslate;
}) {
  const title =
    dive.userSite || dive.site || dive.location || t("unnamedDiveSite");
  const duration =
    dive.durationSeconds === null
      ? "—"
      : `${Math.floor(dive.durationSeconds / 60)}:${String(
          dive.durationSeconds % 60,
        ).padStart(2, "0")}`;
  return (
    <div className="duplicate-dive">
      <small>#{label}</small>
      <strong>{title}</strong>
      <span>{dive.diveDate ? new Date(dive.diveDate).toLocaleString() : "—"}</span>
      <span>
        {dive.maxDepthM === null ? "—" : `${dive.maxDepthM.toFixed(1)} m`}
        {" · "}
        {duration}
      </span>
      <small>
        {t("duplicateSources", {
          sources: dive.sources.join(", ") || "—",
        })}
      </small>
    </div>
  );
}

function BundledBackgroundTile({ onRemove }: { onRemove: () => void }) {
  const { t } = useAppI18n();
  return (
    <article className="background-tile bundled-background-tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/backgrounds/bubbles-bg.jpg" alt={t("bubblesBackground")} />
      <div className="bundled-background-label">
        <span>{t("includedBackground")}</span>
        <strong>{t("bubblesBackground")}</strong>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${t("remove")} ${t("bubblesBackground")}`}
      >
        <Trash2 size={15} />
      </button>
    </article>
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
