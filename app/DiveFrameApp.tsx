"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  Briefcase,
  Camera,
  CheckSquare,
  ChevronDown,
  Clock3,
  Compass,
  Database as DatabaseIcon,
  Droplets,
  Gauge,
  House,
  ImagePlus,
  Info,
  LoaderCircle,
  MapPin,
  Search,
  Settings,
  Share2,
  Sparkles,
  Square,
  Thermometer,
  Upload,
  Users,
  Waves,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addLocalPhotos,
  createLocalTrip,
  deleteLocalTrip,
  getLocalBackupSizeEstimate,
  getLocalAppPreferences,
  listLocalAttachments,
  listLocalDives,
  listLocalTrips,
  renameLocalTrip,
  requestPersistentLocalStorage,
  setLocalDiveTripId,
  setLocalDiveTripIds,
  type LocalAttachment,
  type LocalDive,
  type LocalImportedDive,
  type LocalTrip,
  type DiveSource,
  type UserGpsSource,
  updateLocalDiveLocation,
  updateLocalDiveDetails,
  updateLocalDiveSite,
  updateLocalDiveUserGps,
  upsertLocalDives,
} from "@/lib/indexed-db";
import {
  buildDiveListRows,
  compareDives,
  diveMatchesListFilters,
  type DiveListFilters,
  type DiveSortOption,
} from "@/lib/dive-list-model";
import { resolveDiveMapCoordinates } from "@/lib/dive-gps";
import { saveExportFile, savedFileNotice } from "@/lib/file-export";
import { readJpegExifGps } from "@/lib/photo-exif-gps";
import { chartAvailability, renderDiveChart } from "@/lib/chart-renderer";
import { defaultComposerSettings } from "@/lib/composer-settings";
import {
  averageSampleDepthM,
  averageSampleTemperatureC,
  calculateSacLitresPerMinute,
  cylinderPreset,
  CYLINDER_PRESETS,
  DEFAULT_CYLINDER_PRESET_ID,
  firstCompletePressurePair,
} from "@/lib/gas-calculations";
import { toNormalizedDive } from "@/lib/normalize-dive";
import {
  loadSessionDiveSiteCatalog,
  nearbySessionCatalogSites,
} from "@/lib/dive-site-catalog";
import { readShearwaterDatabase } from "@/lib/parsers/shearwater";
import { readSubsurfaceLog } from "@/lib/parsers/subsurface";
import { readUddfLog } from "@/lib/parsers/uddf";
import { readFitDive } from "@/lib/parsers/fit";
import type { AppLanguage, AppTranslate } from "@/lib/app-i18n";
import { diveComputerCapability } from "@/lib/dive-computer-capability";
import { diveFrameApiUrl } from "@/lib/diveframe-api";
import { useAppI18n } from "./AppI18nProvider";
import { BleImportPanel } from "./components/BleImportPanel";

type Dive = LocalDive;
type Attachment = LocalAttachment;

type MapLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
};

type ImportedDive = LocalImportedDive;

type NearbySite = {
  id: string;
  catalogId?: string;
  name: string;
  aliases?: string[];
  latitude: number;
  longitude: number;
  distanceKm: number;
  source: "catalog" | "openstreetmap";
};

type SiteSelection = {
  name: string;
  source: "catalog" | "suggestion" | "manual";
  catalogId?: string;
  latitude: number | null;
  longitude: number | null;
};

const MINIMUM_AVERAGE_SAC_DURATION_SECONDS = 20 * 60;

export function DiveFrameApp() {
  const { language, t } = useAppI18n();
  const [dives, setDives] = useState<Dive[]>([]);
  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [query, setQuery] = useState("");
  const [namedOnly, setNamedOnly] = useState(false);
  const [gpsOnly, setGpsOnly] = useState(false);
  const [appSiteOnly, setAppSiteOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [computerFilter, setComputerFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [defaultCylinderPresetId, setDefaultCylinderPresetId] = useState(
    DEFAULT_CYLINDER_PRESET_ID,
  );
  const [sortOption, setSortOption] = useState<DiveSortOption>("date-desc");
  const [collapsedTripIds, setCollapsedTripIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDiveIds, setSelectedDiveIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [newTripFormOpen, setNewTripFormOpen] = useState(false);
  const [newTripNameDraft, setNewTripNameDraft] = useState("");
  const [addToTripDraft, setAddToTripDraft] = useState("");
  const [status, setStatus] = useState(t("loadingLogbook"));
  const [busy, setBusy] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [bleImportOpen, setBleImportOpen] = useState(false);
  // Resolved after mount: the server render and the static export both report
  // the web platform, so checking during render would hide the control forever.
  const [bleImportAvailable, setBleImportAvailable] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<Awaited<
    ReturnType<typeof getLocalBackupSizeEstimate>
  > | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const enrichingLocations = useRef(false);

  const refreshDives = useCallback(async (preferredId?: string) => {
    const [next, nextStorageEstimate, nextTrips] = await Promise.all([
      listLocalDives(),
      getLocalBackupSizeEstimate(),
      listLocalTrips(),
    ]);
    setDives(next);
    setStorageEstimate(nextStorageEstimate);
    setTrips(nextTrips);
    setSelectedId((current) => preferredId ?? current ?? next[0]?.id ?? null);
    setStatus(next.length ? t("divesReady", { count: next.length }) : t("importDiveLog"));
  }, [t]);

  useEffect(() => {
    let active = true;
    Promise.all([listLocalDives(), getLocalBackupSizeEstimate(), listLocalTrips()])
      .then(([next, nextStorageEstimate, nextTrips]) => {
        if (!active) return;
        setDives(next);
        setStorageEstimate(nextStorageEstimate);
        setTrips(nextTrips);
        setSelectedId(next[0]?.id ?? null);
        setStatus(next.length ? t("divesReady", { count: next.length }) : t("importDiveLog"));
        void requestPersistentLocalStorage();
      })
      .catch((error) => {
        if (active) {
          setStatus(error instanceof Error ? error.message : t("unableLoadDives"));
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    getLocalAppPreferences()
      .then((preferences) =>
        setDefaultCylinderPresetId(
          preferences?.defaultCylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID,
        ),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setBleImportAvailable(diveComputerCapability.isAvailable());
  }, []);

  const selected = useMemo(
    () => dives.find((dive) => dive.id === selectedId) ?? null,
    [dives, selectedId],
  );

  useEffect(() => {
    const pending = dives.filter(
      (dive) =>
        dive.gpsEntryLat !== null &&
        dive.gpsEntryLng !== null &&
        !dive.location &&
        !dive.resolvedLocation,
    );
    if (!pending.length || enrichingLocations.current) return;
    enrichingLocations.current = true;

    const controller = new AbortController();
    void (async () => {
      try {
        const updates = new Map<string, Dive>();
        for (const [index, dive] of pending.entries()) {
          const response = await fetch(
            diveFrameApiUrl(
              `/api/geocode?lat=${encodeURIComponent(String(dive.gpsEntryLat))}&lng=${encodeURIComponent(String(dive.gpsEntryLng))}`,
            ),
            { signal: controller.signal },
          );
          const payload = (await response.json()) as {
            location?: {
              label: string;
              city: string | null;
              country: string | null;
            } | null;
          };
          if (response.ok && payload.location) {
            const updated = await updateLocalDiveLocation(dive.id, payload.location);
            updates.set(updated.id, updated);
          }
          if (index < pending.length - 1) await delay(1100);
        }
        if (updates.size) {
          setDives((current) => current.map((item) => updates.get(item.id) ?? item));
        }
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          setStatus(t("gpsNamesPending"));
        }
      } finally {
        enrichingLocations.current = false;
      }
    })();

    return () => controller.abort();
  }, [dives, t]);

  useEffect(() => {
    let active = true;
    if (!selectedId) {
      return;
    }
    listLocalAttachments(selectedId)
      .then((next) => {
        if (active) setAttachments(next);
      })
      .catch(() => {
        if (active) setAttachments([]);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const computerModels = useMemo(
    () =>
      Array.from(
        new Set(
          dives
            .map((dive) => dive.computerModel)
            .filter((model): model is string => Boolean(model)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [dives],
  );

  const hasActiveFilters =
    namedOnly ||
    gpsOnly ||
    appSiteOnly ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(computerFilter);

  const resetFilters = useCallback(() => {
    setNamedOnly(false);
    setGpsOnly(false);
    setAppSiteOnly(false);
    setDateFrom(null);
    setDateTo(null);
    setComputerFilter(null);
  }, []);

  const visibleDives = useMemo(() => {
    const search = parseDiveSearch(query);
    const filters: Partial<DiveListFilters> = {
      namedOnly,
      gpsOnly,
      appSiteOnly,
      dateFrom,
      dateTo,
      computerModel: computerFilter,
      searchText: search.text,
      sourceOnly: search.sourceOnly,
    };
    return dives
      .filter((dive) => diveMatchesListFilters(dive, filters))
      .sort((a, b) => compareDives(a, b, sortOption));
  }, [
    appSiteOnly,
    computerFilter,
    dateFrom,
    dateTo,
    dives,
    gpsOnly,
    namedOnly,
    query,
    sortOption,
  ]);

  const diveListRows = useMemo(
    () => buildDiveListRows(visibleDives, trips, sortOption),
    [visibleDives, trips, sortOption],
  );

  const visibleDiveIds = useMemo(
    () => new Set(visibleDives.map((dive) => dive.id)),
    [visibleDives],
  );

  const stats = useMemo(() => {
    const sacRates = dives
      .filter(
        (dive) =>
          dive.durationSeconds !== null &&
          dive.durationSeconds >= MINIMUM_AVERAGE_SAC_DURATION_SECONDS,
      )
      .map((dive) => sacRateForDive(dive, defaultCylinderPresetId))
      .filter((rate): rate is number => rate !== null);
    const durations = dives
      .map((dive) => dive.durationSeconds)
      .filter(
        (duration): duration is number =>
          duration !== null && Number.isFinite(duration) && duration > 0,
      );
    const maxDepths = dives
      .map((dive) => dive.maxDepthM ?? numberFrom(dive.depth))
      .filter(
        (depth): depth is number =>
          depth !== null && Number.isFinite(depth) && depth >= 0,
      );
    return {
      dives: dives.length,
      namedDives: dives.filter((dive) => Boolean(dive.userSite || dive.site))
        .length,
      locations: new Set(
        dives
          .map((dive) => normalizeLocation(dive.location))
          .filter((location): location is string => Boolean(location)),
      ).size,
      underwaterSeconds: dives.reduce(
        (total, dive) =>
          total +
          (dive.durationSeconds !== null &&
          Number.isFinite(dive.durationSeconds) &&
          dive.durationSeconds > 0
            ? dive.durationSeconds
            : 0),
        0,
      ),
      averageSac:
        sacRates.length > 0
          ? sacRates.reduce((total, rate) => total + rate, 0) / sacRates.length
          : null,
      buddies: new Set(
        dives.flatMap((dive) =>
          dive.buddy
            ? dive.buddy
                .split(",")
                .map((buddy) => buddy.trim())
                .filter(Boolean)
            : [],
        ),
      ).size,
      longestDiveSeconds: durations.length ? Math.max(...durations) : null,
      deepestDiveM: maxDepths.length ? Math.max(...maxDepths) : null,
      averageMaxDepthM: maxDepths.length
        ? maxDepths.reduce((total, depth) => total + depth, 0) /
          maxDepths.length
        : null,
    };
  }, [defaultCylinderPresetId, dives]);
  const backupWarningThreshold = backupSizeWarningThreshold();
  const showStorageWarning =
    storageEstimate !== null &&
    storageEstimate.estimatedBackupBytes >= backupWarningThreshold;

  const siteSuggestions = useMemo(
    () =>
      uniqueSuggestions(
        dives.flatMap((dive) => [dive.userSite, dive.site]),
      ),
    [dives],
  );
  const locationSuggestions = useMemo(
    () =>
      uniqueSuggestions(
        dives.flatMap((dive) => [dive.location, dive.resolvedLocation]),
      ),
    [dives],
  );

  async function importDatabase(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setStatus(t("readingExtract"));
    try {
      const imported = (
        await Promise.all(files.map((file) => readDiveImport(file)))
      ).flat();
      setStatus(t("foundDives", { count: imported.length }));
      await upsertLocalDives(imported);
      await refreshDives();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("importFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !selected) return;
    setBusy(true);
    setStatus(t("savingPhotos", { count: files.length, suffix: files.length === 1 ? "" : "s" }));
    try {
      const additions = await addLocalPhotos(selected.id, files);
      setAttachments((current) => [...current, ...additions]);
      await refreshDives(selected.id);
      setStatus(t("photosSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("localSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function sharePhoto(attachment: Attachment) {
    if (!selected) return;
    setBusy(true);
    setStatus(t("creatingShareCard"));
    try {
      const blob = await createShareCard(
        selected,
        attachment,
        language,
        t("dive"),
        t("diveTime"),
      );
      const fileName = `dive-${selected.diveNumber ?? "log"}-share.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: displaySite(selected, t("unnamedDiveSite")),
          text: `${t("dive")} ${selected.diveNumber ?? ""} · ${formatDate(selected.diveDate, language, t("dateUnknown"))}`,
        });
        setStatus(t("shareCardReady"));
      } else {
        const saved = await saveExportFile(blob, fileName, "image/png");
        const notice = savedFileNotice(saved, t);
        setStatus(notice ?? t("shareCardReady"));
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        setStatus(error instanceof Error ? error.message : t("shareCardFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveDiveSite(selection: SiteSelection) {
    if (!selected) return false;
    setBusy(true);
    setStatus(t("savingDiveSite"));
    try {
      const updated = await updateLocalDiveSite(selected.id, selection);
      setDives((current) =>
        current.map((dive) => (dive.id === updated.id ? updated : dive)),
      );
      setStatus(
        selection.source === "manual"
          ? t("manualSiteSaved", { name: selection.name })
          : t("siteSavedAs", { name: selection.name }),
      );
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("siteSaveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDiveDetails(details: {
    location?: string | null;
    buddy: string | null;
    notes: string | null;
    cylinderPresetId?: string | null;
    cylinderVolumeL?: number | null;
    startPressureBar?: number | null;
    endPressureBar?: number | null;
  }) {
    if (!selected) return false;
    setBusy(true);
    setStatus(t("savingDiveDetails"));
    try {
      const updated = await updateLocalDiveDetails(selected.id, details);
      setDives((current) =>
        current.map((dive) => (dive.id === updated.id ? updated : dive)),
      );
      setStatus(t("diveDetailsSaved"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("diveDetailsSaveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDiveUserGps(
    id: string,
    gps: { lat: number; lng: number; source: UserGpsSource } | null,
  ) {
    setBusy(true);
    setStatus(gps ? t("savingLocation") : t("clearingLocation"));
    try {
      const updated = await updateLocalDiveUserGps(id, gps);
      setDives((current) =>
        current.map((dive) => (dive.id === updated.id ? updated : dive)),
      );
      setStatus(gps ? t("locationSaved") : t("locationCleared"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("locationSaveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function chooseDive(id: string) {
    setSelectedId(id);
    setMobileDetail(true);
  }

  function handleDiveRowClick(id: string) {
    if (selectMode) {
      toggleDiveSelected(id);
    } else {
      chooseDive(id);
    }
  }

  function toggleTripCollapse(tripId: string) {
    setCollapsedTripIds((current) => {
      const next = new Set(current);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  }

  function toggleDiveSelected(id: string) {
    setSelectedDiveIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectMode() {
    setSelectMode((value) => {
      const next = !value;
      if (!next) setSelectedDiveIds(new Set());
      setNewTripFormOpen(false);
      setNewTripNameDraft("");
      setAddToTripDraft("");
      return next;
    });
  }

  function visibleSelectedDiveIds() {
    return Array.from(selectedDiveIds).filter((id) => visibleDiveIds.has(id));
  }

  const visibleSelectedCount = visibleSelectedDiveIds().length;

  async function createTripFromSelection(name: string) {
    const ids = visibleSelectedDiveIds();
    if (!ids.length || !name.trim()) return;
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      const trip = await createLocalTrip(name);
      await setLocalDiveTripIds(ids, trip.id);
      await refreshDives(selectedId ?? undefined);
      setSelectedDiveIds(new Set());
      setNewTripFormOpen(false);
      setNewTripNameDraft("");
      setStatus(t("tripAssignmentSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tripAssignmentFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function addSelectionToTrip(tripId: string) {
    const ids = visibleSelectedDiveIds();
    if (!ids.length || !tripId) return;
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      await setLocalDiveTripIds(ids, tripId);
      await refreshDives(selectedId ?? undefined);
      setSelectedDiveIds(new Set());
      setAddToTripDraft("");
      setStatus(t("tripAssignmentSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tripAssignmentFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectionFromTrip() {
    const ids = visibleSelectedDiveIds();
    if (!ids.length) return;
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      await setLocalDiveTripIds(ids, null);
      await refreshDives(selectedId ?? undefined);
      setSelectedDiveIds(new Set());
      setStatus(t("tripAssignmentSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tripAssignmentFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function assignDiveTrip(diveId: string, tripId: string | null) {
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      const updated = await setLocalDiveTripId(diveId, tripId);
      setDives((current) =>
        current.map((dive) => (dive.id === updated.id ? updated : dive)),
      );
      setStatus(t("tripAssignmentSaved"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tripAssignmentFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createTripForDive(diveId: string, name: string) {
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      const trip = await createLocalTrip(name);
      const updated = await setLocalDiveTripId(diveId, trip.id);
      setTrips((current) =>
        [...current, trip].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDives((current) =>
        current.map((dive) => (dive.id === updated.id ? updated : dive)),
      );
      setStatus(t("tripAssignmentSaved"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tripAssignmentFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function renameTrip(tripId: string, name: string) {
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      const updated = await renameLocalTrip(tripId, name);
      setTrips((current) =>
        current
          .map((trip) => (trip.id === updated.id ? updated : trip))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setStatus(t("tripRenamed"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tripAssignmentFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeTrip(tripId: string) {
    const assignedCount = dives.filter((dive) => dive.tripId === tripId).length;
    const tripName = trips.find((trip) => trip.id === tripId)?.name ?? "";
    const confirmed = window.confirm(
      assignedCount > 0
        ? t("deleteTripConfirmWithDives", { name: tripName, count: assignedCount })
        : t("deleteTripConfirm", { name: tripName }),
    );
    if (!confirmed) return false;
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      await deleteLocalTrip(tripId, { clearAssignments: assignedCount > 0 });
      await refreshDives(selectedId ?? undefined);
      setStatus(t("tripDeleted"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tripDeleteFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => setMobileDetail(false)}
          aria-label={t("home")}
        >
          <span className="brand-mark">
            <Waves size={24} strokeWidth={2.4} />
          </span>
          <span>
            <strong>DiveFrame</strong>
            <small>{t("diveLogCompanion")}</small>
          </span>
        </button>
        <div className="topbar-actions">
          {mobileDetail ? (
            <button
              type="button"
              className="mobile-home-button"
              onClick={() => setMobileDetail(false)}
              aria-label={t("allDives")}
              title={t("allDives")}
            >
              <House size={17} />
            </button>
          ) : null}
          {status !== t("importDiveLog") ? (
            <span className="status-pill">
              {busy ? <LoaderCircle size={14} className="spin" /> : <Droplets size={14} />}
              {status}
            </span>
          ) : null}
          <Link href="/about" className="button button-quiet">
            <Info size={16} />
            {t("about")}
          </Link>
          <Link href="/settings" className="button button-quiet">
            <Settings size={16} />
            {t("settings")}
          </Link>
          {bleImportAvailable ? (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setBleImportOpen(true)}
              disabled={busy}
            >
              <ArrowDownToLine size={17} />
              {t("downloadFromComputer")}
            </button>
          ) : null}
          <button
            type="button"
            className="button button-primary"
            onClick={() => importInput.current?.click()}
            disabled={busy}
          >
            <Upload size={17} />
            {t("importLog")}
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".db,.sqlite,.sqlite3,.ssrf,.xml,.uddf,.fit,application/x-sqlite3,application/xml,text/xml,application/octet-stream"
            multiple
            className="visually-hidden"
            onChange={importDatabase}
          />
        </div>
      </header>

      {bleImportOpen ? (
        <BleImportPanel
          t={t}
          onClose={() => setBleImportOpen(false)}
          onImported={async () => {
            await refreshDives();
          }}
        />
      ) : null}

      {dives.length === 0 ? (
        <EmptyState
          busy={busy}
          onImport={() => importInput.current?.click()}
          status={status}
        />
      ) : (
        <>
          <section className="overview">
            <div className="overview-copy">
              <p className="eyebrow">{t("privateDiveArchive")}</p>
              <h1>{t("heroTitle")}</h1>
              <p>{t("heroDescription")}</p>
            </div>
            <div className="stat-grid">
              <Stat icon={<Compass size={19} />} value={stats.dives} label={t("dives")} />
              <Stat icon={<Sparkles size={19} />} value={stats.namedDives} label={t("divesAtNamedSites")} />
              <Stat icon={<MapPin size={19} />} value={stats.locations} label={t("diveLocations")} />
              <Stat icon={<Users size={19} />} value={stats.buddies} label={t("buddies")} />
              <Stat
                icon={<Waves size={19} />}
                value={formatUnderwaterTime(stats.underwaterSeconds, t)}
                label={t("underwater")}
              />
              <Stat
                icon={<Clock3 size={19} />}
                value={
                  stats.longestDiveSeconds === null
                    ? "—"
                    : `${Math.round(stats.longestDiveSeconds / 60)} ${t("minutesShort")}`
                }
                label={t("longestDive")}
              />
              <Stat
                icon={<Waves size={19} />}
                value={
                  stats.deepestDiveM === null
                    ? "—"
                    : `${stats.deepestDiveM.toFixed(1)} m`
                }
                label={t("deepestDive")}
              />
              <Stat
                icon={<Droplets size={19} />}
                value={
                  stats.averageMaxDepthM === null
                    ? "—"
                    : `${stats.averageMaxDepthM.toFixed(1)} m`
                }
                label={t("averageMaxDepth")}
              />
              <Stat
                icon={<Gauge size={19} />}
                value={stats.averageSac === null ? "—" : `${stats.averageSac.toFixed(1)} L/min`}
                label={t("averageSac")}
              />
              {showStorageWarning && storageEstimate && (
                <Stat
                  icon={<AlertTriangle size={19} />}
                  value={formatStorageSize(storageEstimate.estimatedBackupBytes)}
                  label={t("storageWarning")}
                  warning
                />
              )}
            </div>
          </section>

          <section className={`workspace ${mobileDetail ? "show-detail" : ""}`}>
            <aside className="dive-browser">
              <div className="browser-heading">
                <div className="browser-title-row">
                  <div>
                    <p className="eyebrow">{t("logbook")}</p>
                    <h2>{visibleDives.length} {t("dives")}</h2>
                  </div>
                  <label className="sort-control">
                    <span>{t("sortBy")}</span>
                    <select
                      value={sortOption}
                      onChange={(event) =>
                        setSortOption(event.target.value as DiveSortOption)
                      }
                      aria-label={t("sortBy")}
                    >
                      <option value="date-desc">{t("newestFirst")}</option>
                      <option value="date-asc">{t("oldestFirst")}</option>
                      <option value="duration-desc">{t("longestFirst")}</option>
                      <option value="duration-asc">{t("shortestFirst")}</option>
                      <option value="depth-desc">{t("deepestFirst")}</option>
                      <option value="depth-asc">{t("shallowestFirst")}</option>
                    </select>
                  </label>
                </div>
                <div className="search-box">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("searchDives")}
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery("")} aria-label={t("clearSearch")}>
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="dive-list">
                <div className="filter-row" aria-label={t("diveFilters")}>
                  <button
                    type="button"
                    className={namedOnly ? "active" : ""}
                    onClick={() => {
                      setNamedOnly((value) => !value);
                      setGpsOnly(false);
                      setAppSiteOnly(false);
                    }}
                    aria-pressed={namedOnly}
                  >
                    <MapPin size={14} /> {t("siteNamed")}
                  </button>
                  <button
                    type="button"
                    className={gpsOnly ? "active" : ""}
                    onClick={() => {
                      setGpsOnly((value) => !value);
                      setNamedOnly(false);
                      setAppSiteOnly(false);
                    }}
                    aria-pressed={gpsOnly}
                  >
                    <Compass size={14} /> {t("gpsData")}
                  </button>
                  <button
                    type="button"
                    className={appSiteOnly ? "active" : ""}
                    onClick={() => {
                      setAppSiteOnly((value) => !value);
                      setNamedOnly(false);
                      setGpsOnly(false);
                    }}
                    aria-pressed={appSiteOnly}
                  >
                    <Sparkles size={14} /> {t("setInApp")}
                  </button>
                  <button
                    type="button"
                    className={`filter-toggle ${filtersOpen ? "active" : ""}`}
                    onClick={() => setFiltersOpen((value) => !value)}
                    aria-expanded={filtersOpen}
                  >
                    <ChevronDown
                      size={14}
                      className={`filter-toggle-chevron ${filtersOpen ? "" : "collapsed"}`}
                    />
                    {t("moreFilters")}
                  </button>
                  <button
                    type="button"
                    className="filter-clear"
                    onClick={resetFilters}
                    disabled={!hasActiveFilters}
                  >
                    <X size={14} /> {t("clearFilter")}
                  </button>
                  <button
                    type="button"
                    className={`select-mode-toggle ${selectMode ? "active" : ""}`}
                    onClick={toggleSelectMode}
                    aria-pressed={selectMode}
                  >
                    <CheckSquare size={14} />
                    {selectMode ? t("exitSelectMode") : t("selectDives")}
                  </button>
                </div>
                {filtersOpen ? (
                  <div className="filter-panel">
                    <label className="filter-panel-field">
                      <span>{t("dateFrom")}</span>
                      <input
                        type="date"
                        value={dateFrom ?? ""}
                        onChange={(event) =>
                          setDateFrom(event.target.value || null)
                        }
                        max={dateTo ?? undefined}
                      />
                    </label>
                    <label className="filter-panel-field">
                      <span>{t("dateTo")}</span>
                      <input
                        type="date"
                        value={dateTo ?? ""}
                        onChange={(event) =>
                          setDateTo(event.target.value || null)
                        }
                        min={dateFrom ?? undefined}
                      />
                    </label>
                    <label className="filter-panel-field">
                      <span>{t("computerFilterLabel")}</span>
                      <select
                        value={computerFilter ?? ""}
                        onChange={(event) =>
                          setComputerFilter(event.target.value || null)
                        }
                      >
                        <option value="">{t("allComputers")}</option>
                        {computerModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                {selectMode ? (
                  <div className="select-action-bar">
                    <span className="select-action-count">
                      {t("selectedCount", { count: visibleSelectedCount })}
                    </span>
                    <div className="select-action-buttons">
                      {newTripFormOpen ? (
                        <form
                          className="select-new-trip-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void createTripFromSelection(newTripNameDraft);
                          }}
                        >
                          <input
                            value={newTripNameDraft}
                            onChange={(event) => setNewTripNameDraft(event.target.value)}
                            placeholder={t("newTripNamePlaceholder")}
                            maxLength={120}
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="button button-secondary"
                            disabled={busy || !newTripNameDraft.trim() || !visibleSelectedCount}
                          >
                            {t("createTrip")}
                          </button>
                          <button
                            type="button"
                            className="button button-quiet"
                            onClick={() => {
                              setNewTripFormOpen(false);
                              setNewTripNameDraft("");
                            }}
                          >
                            {t("cancel")}
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setNewTripFormOpen(true)}
                          disabled={busy || !visibleSelectedCount}
                        >
                          {t("newTripOption")}
                        </button>
                      )}
                      <select
                        value={addToTripDraft}
                        onChange={(event) => {
                          const value = event.target.value;
                          setAddToTripDraft(value);
                          if (value) void addSelectionToTrip(value);
                        }}
                        disabled={busy || !visibleSelectedCount || !trips.length}
                        aria-label={t("addToExistingTrip")}
                      >
                        <option value="">{t("addToExistingTrip")}</option>
                        {trips.map((trip) => (
                          <option key={trip.id} value={trip.id}>
                            {trip.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => void removeSelectionFromTrip()}
                        disabled={busy || !visibleSelectedCount}
                      >
                        {t("removeFromTrip")}
                      </button>
                    </div>
                  </div>
                ) : null}
                {diveListRows.map((row) =>
                  row.kind === "solo" ? (
                    <DiveRowButton
                      key={row.dive.id}
                      dive={row.dive}
                      language={language}
                      t={t}
                      selected={row.dive.id === selectedId}
                      selectMode={selectMode}
                      isChecked={selectedDiveIds.has(row.dive.id)}
                      onClick={() => handleDiveRowClick(row.dive.id)}
                    />
                  ) : (
                    <div className="trip-block" key={row.trip.id}>
                      <button
                        type="button"
                        className="trip-header"
                        onClick={() => toggleTripCollapse(row.trip.id)}
                        aria-expanded={!collapsedTripIds.has(row.trip.id)}
                      >
                        <ChevronDown
                          size={15}
                          className={`trip-header-chevron ${collapsedTripIds.has(row.trip.id) ? "collapsed" : ""}`}
                        />
                        <Briefcase size={14} />
                        <span className="trip-header-name">{row.trip.name}</span>
                        {collapsedTripIds.has(row.trip.id) ? (
                          <span className="trip-header-count">
                            {t("tripDiveCount", { count: row.dives.length })}
                          </span>
                        ) : null}
                      </button>
                      {collapsedTripIds.has(row.trip.id)
                        ? null
                        : row.dives.map((dive) => (
                            <DiveRowButton
                              key={dive.id}
                              dive={dive}
                              language={language}
                              t={t}
                              selected={dive.id === selectedId}
                              selectMode={selectMode}
                              isChecked={selectedDiveIds.has(dive.id)}
                              onClick={() => handleDiveRowClick(dive.id)}
                              member
                            />
                          ))}
                    </div>
                  ),
                )}
              </div>
            </aside>

            <section className="detail-panel">
              {selected ? (
                <DiveDetail
                  key={selected.id}
                  dive={selected}
                  attachments={attachments}
                  busy={busy}
                  onUpload={uploadPhotos}
                  onShare={sharePhoto}
                  onSaveSite={saveDiveSite}
                  onSaveDetails={saveDiveDetails}
                  onSaveUserGps={saveDiveUserGps}
                  siteSuggestions={siteSuggestions}
                  locationSuggestions={locationSuggestions}
                  trips={trips}
                  onAssignTrip={assignDiveTrip}
                  onCreateTrip={createTripForDive}
                  onRenameTrip={renameTrip}
                  onDeleteTrip={removeTrip}
                />
              ) : (
                <div className="no-selection">{t("chooseDive")}</div>
              )}
            </section>
          </section>
        </>
      )}
    </main>
  );
}

function EmptyState({
  busy,
  onImport,
  status,
}: {
  busy: boolean;
  onImport: () => void;
  status: string;
}) {
  const { t } = useAppI18n();
  return (
    <section className="empty-state">
      <div className="empty-orbit orbit-one" />
      <div className="empty-orbit orbit-two" />
      <div className="empty-content">
        <span className="empty-icon">
          <DatabaseIcon size={34} />
        </span>
        <p className="eyebrow">{t("startWithExport")}</p>
        <h1>{t("emptyTitle")}</h1>
        <p>{t("emptyDescription")}</p>
        <button
          type="button"
          className="button button-primary button-large"
          onClick={onImport}
          disabled={busy}
        >
          {busy ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}
          {t("chooseDiveLog")}
        </button>
        <span className="empty-status">{status}</span>
      </div>
      <div className="empty-proof">
        <span><Sparkles size={16} /> {t("proofMaps")}</span>
        <span><Camera size={16} /> {t("proofPhotos")}</span>
        <span><Share2 size={16} /> {t("proofShare")}</span>
      </div>
    </section>
  );
}

function Stat({
  icon,
  value,
  label,
  warning = false,
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
  warning?: boolean;
}) {
  return (
    <div className={`stat ${warning ? "stat-warning" : ""}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function DiveRowButton({
  dive,
  language,
  t,
  selected,
  selectMode,
  isChecked,
  onClick,
  member = false,
}: {
  dive: Dive;
  language: AppLanguage;
  t: AppTranslate;
  selected: boolean;
  selectMode: boolean;
  isChecked: boolean;
  onClick: () => void;
  member?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        "dive-row",
        member ? "dive-row-trip-member" : "",
        selected ? "active" : "",
        selectMode ? "dive-row-selectable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      aria-pressed={selectMode ? isChecked : undefined}
    >
      {selectMode ? (
        <span className="dive-row-checkbox" aria-hidden="true">
          {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
        </span>
      ) : null}
      <span className="dive-number">
        <small>{t("dive").toUpperCase()}</small>
        {dive.diveNumber ?? "—"}
      </span>
      <span className="dive-summary">
        <strong>{displaySite(dive, t("unnamedDiveSite"))}</strong>
        <span>{formatDate(dive.diveDate, language, t("dateUnknown"))}</span>
      </span>
      <span className="dive-meta">
        <strong>{formatDepth(dive.depth)}</strong>
        <span title={t("diveTime")}>
          <Clock3 size={12} />
          {formatDuration(dive.durationSeconds ?? dive.lengthText)}
        </span>
      </span>
    </button>
  );
}

function DiveDetail({
  dive,
  attachments,
  busy,
  onUpload,
  onShare,
  onSaveSite,
  onSaveDetails,
  onSaveUserGps,
  siteSuggestions,
  locationSuggestions,
  trips,
  onAssignTrip,
  onCreateTrip,
  onRenameTrip,
  onDeleteTrip,
}: {
  dive: Dive;
  attachments: Attachment[];
  busy: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onShare: (attachment: Attachment) => void;
  onSaveSite: (site: SiteSelection) => Promise<boolean>;
  onSaveDetails: (details: {
    location?: string | null;
    buddy: string | null;
    notes: string | null;
    cylinderPresetId?: string | null;
    cylinderVolumeL?: number | null;
    startPressureBar?: number | null;
    endPressureBar?: number | null;
  }) => Promise<boolean>;
  onSaveUserGps: (
    diveId: string,
    gps: { lat: number; lng: number; source: UserGpsSource } | null,
  ) => Promise<boolean>;
  siteSuggestions: string[];
  locationSuggestions: string[];
  trips: LocalTrip[];
  onAssignTrip: (diveId: string, tripId: string | null) => Promise<boolean>;
  onCreateTrip: (diveId: string, name: string) => Promise<boolean>;
  onRenameTrip: (tripId: string, name: string) => Promise<boolean>;
  onDeleteTrip: (tripId: string) => Promise<boolean>;
}) {
  const { language, t } = useAppI18n();
  const calculated = safeJson(dive.calculatedJson);
  const averageDepth = averageDepthForDive(dive);
  const minTemp = numberFrom(calculated?.MinTemp) ?? positiveNumber(dive.minTemp);
  const averageTemperature = averageSampleTemperatureC(dive.samples);
  const pressurePair = firstCompletePressurePair(
    dive.tankPressuresStartBar,
    dive.tankPressuresEndBar,
  );
  const hasGps = dive.gpsEntryLat !== null && dive.gpsEntryLng !== null;
  const [manualSite, setManualSite] = useState(dive.userSite ?? dive.site ?? "");
  const [siteDraft, setSiteDraft] = useState(dive.userSite ?? dive.site ?? "");
  const [locationDraft, setLocationDraft] = useState(dive.location ?? "");
  const [nearbySites, setNearbySites] = useState<NearbySite[] | null>(null);
  const [expandedAliasSiteId, setExpandedAliasSiteId] = useState<string | null>(
    null,
  );
  const [sitePickerOpen, setSitePickerOpen] = useState(!dive.userSite);
  const [editingDetails, setEditingDetails] = useState(false);
  const [buddyDraft, setBuddyDraft] = useState(dive.buddy ?? "");
  const [notesDraft, setNotesDraft] = useState(dive.notes ?? "");
  const [tripDraft, setTripDraft] = useState(dive.tripId ?? "");
  const [newTripNameDraft, setNewTripNameDraft] = useState("");
  const [tripRenameOpen, setTripRenameOpen] = useState(false);
  const [tripRenameDraft, setTripRenameDraft] = useState("");
  const currentTrip = dive.tripId
    ? trips.find((trip) => trip.id === dive.tripId) ?? null
    : null;

  // Re-sync trip drafts from the source of truth whenever the underlying dive's
  // trip assignment changes (e.g. after a successful save, a trip delete elsewhere)
  // or whenever the details editor is opened/closed, so stale sentinel values like
  // "__new__" (or a deleted trip id) never survive into the next edit/save cycle.
  useEffect(() => {
    setTripDraft(dive.tripId ?? "");
    setNewTripNameDraft("");
    setTripRenameOpen(false);
    setTripRenameDraft("");
  }, [dive.id, dive.tripId, editingDetails]);
  const [defaultCylinderPresetId, setDefaultCylinderPresetId] = useState(
    DEFAULT_CYLINDER_PRESET_ID,
  );
  const [cylinderPresetDraft, setCylinderPresetDraft] = useState(
    dive.cylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID,
  );
  const [startPressureDraft, setStartPressureDraft] = useState(
    pressurePair?.start?.toString() ?? "",
  );
  const [endPressureDraft, setEndPressureDraft] = useState(
    pressurePair?.end?.toString() ?? "",
  );
  const locationQuery = [dive.userSite ?? dive.site, dive.location]
    .filter((value, index, values): value is string =>
      Boolean(value && values.indexOf(value) === index),
    )
    .join(", ");
  const mapCoordinates = resolveDiveMapCoordinates(dive);
  const hasResolvedGps = mapCoordinates !== null;
  const [geocodeResult, setGeocodeResult] = useState<{
    query: string;
    location: MapLocation | null;
  } | null>(null);

  useEffect(() => {
    if (mapCoordinates || !locationQuery) return;

    const controller = new AbortController();
    fetch(diveFrameApiUrl(`/api/geocode?q=${encodeURIComponent(locationQuery)}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          location?: MapLocation | null;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Location lookup failed.");
        return payload.location ?? null;
      })
      .then((location) => {
        setGeocodeResult({ query: locationQuery, location });
      })
      .catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") {
          setGeocodeResult({ query: locationQuery, location: null });
        }
      });

    return () => controller.abort();
  }, [dive.id, mapCoordinates, locationQuery]);

  const resolvedLocation =
    geocodeResult?.query === locationQuery ? geocodeResult.location : null;
  const mapLookup =
    mapCoordinates || !locationQuery
      ? "idle"
      : geocodeResult?.query !== locationQuery
        ? "loading"
        : resolvedLocation
          ? "found"
          : "missing";
  const mapLatitude = mapCoordinates ? mapCoordinates.latitude : resolvedLocation?.latitude ?? null;
  const mapLongitude = mapCoordinates ? mapCoordinates.longitude : resolvedLocation?.longitude ?? null;
  const hasMap = mapLatitude !== null && mapLongitude !== null;

  const [gpsEditorOpen, setGpsEditorOpen] = useState(false);
  const [userLatDraft, setUserLatDraft] = useState(
    dive.userGpsLat !== null ? String(dive.userGpsLat) : "",
  );
  const [userLngDraft, setUserLngDraft] = useState(
    dive.userGpsLng !== null ? String(dive.userGpsLng) : "",
  );
  const [photoGpsStatus, setPhotoGpsStatus] = useState<string | null>(null);

  useEffect(() => {
    setUserLatDraft(dive.userGpsLat !== null ? String(dive.userGpsLat) : "");
    setUserLngDraft(dive.userGpsLng !== null ? String(dive.userGpsLng) : "");
    setPhotoGpsStatus(null);
    setGpsEditorOpen(false);
  }, [dive.id, dive.userGpsLat, dive.userGpsLng]);

  const userLatValue = Number(userLatDraft);
  const userLngValue = Number(userLngDraft);
  const userGpsDraftValid =
    userLatDraft.trim() !== "" &&
    userLngDraft.trim() !== "" &&
    Number.isFinite(userLatValue) &&
    Number.isFinite(userLngValue) &&
    userLatValue >= -90 &&
    userLatValue <= 90 &&
    userLngValue >= -180 &&
    userLngValue <= 180;

  async function saveManualUserGps() {
    if (!userGpsDraftValid) {
      setPhotoGpsStatus(t("invalidLocationValues"));
      return;
    }
    if (await onSaveUserGps(dive.id, { lat: userLatValue, lng: userLngValue, source: "manual" })) {
      setGpsEditorOpen(false);
    }
  }

  async function clearUserGps() {
    if (await onSaveUserGps(dive.id, null)) {
      setUserLatDraft("");
      setUserLngDraft("");
    }
  }

  async function useLocationFromPhoto() {
    setPhotoGpsStatus(t("searchingPhotosForLocation"));
    for (const attachment of attachments) {
      if (!/jpe?g/i.test(attachment.contentType)) continue;
      try {
        const buffer = await attachment.blob.arrayBuffer();
        const gps = await readJpegExifGps(buffer);
        if (!gps) continue;
        const saved = await onSaveUserGps(dive.id, {
          lat: gps.latitude,
          lng: gps.longitude,
          source: "photo-exif",
        });
        setPhotoGpsStatus(saved ? null : t("photoLocationSaveFailed"));
        if (saved) setGpsEditorOpen(false);
        return;
      } catch {
        // Try the next photo.
      }
    }
    setPhotoGpsStatus(t("noPhotoLocationFound"));
  }

  const selectedCylinder = cylinderPreset(
    dive.cylinderPresetId ?? defaultCylinderPresetId,
  );
  const cylinderVolumeL = dive.cylinderVolumeL ?? selectedCylinder.volumeL;
  const sacRate = calculateSacLitresPerMinute({
    startPressureBar: pressurePair?.start ?? null,
    endPressureBar: pressurePair?.end ?? null,
    cylinderVolumeL,
    durationSeconds: dive.durationSeconds,
    averageDepthM: averageDepth ?? null,
  });

  useEffect(() => {
    getLocalAppPreferences()
      .then((preferences) => {
        const presetId =
          preferences?.defaultCylinderPresetId ?? DEFAULT_CYLINDER_PRESET_ID;
        setDefaultCylinderPresetId(presetId);
        if (!dive.cylinderPresetId) setCylinderPresetDraft(presetId);
      })
      .catch(() => undefined);
  }, [dive.cylinderPresetId]);

  async function saveSiteAndCollapse(selection: SiteSelection) {
    if (await onSaveSite(selection)) {
      setManualSite(selection.name);
      setSiteDraft(selection.name);
      setExpandedAliasSiteId(null);
      setSitePickerOpen(false);
    }
  }

  function nearbySiteCatalogId(site: NearbySite) {
    return site.catalogId ?? site.id.replace(/^(?:session-)?catalog-/, "");
  }

  function nearbySiteSelection(
    site: NearbySite,
    name: string,
  ): SiteSelection {
    return {
      name,
      source: site.source === "catalog" ? "catalog" : "suggestion",
      catalogId:
        site.source === "catalog" ? nearbySiteCatalogId(site) : undefined,
      latitude: site.latitude,
      longitude: site.longitude,
    };
  }

  function toggleSiteAliasExpand(siteId: string) {
    setExpandedAliasSiteId((current) => (current === siteId ? null : siteId));
  }

  useEffect(() => {
    if (!mapCoordinates) return;
    const { latitude, longitude } = mapCoordinates;
    const sessionSites = nearbySessionCatalogSites(
      loadSessionDiveSiteCatalog()?.catalog ?? null,
      latitude,
      longitude,
    );
    const controller = new AbortController();
    fetch(
      diveFrameApiUrl(
        `/api/nearby-sites?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`,
      ),
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          sites?: NearbySite[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Nearby sites unavailable.");
        return payload.sites ?? [];
      })
      .then((sites) => setNearbySites(mergeNearbySites(sessionSites, sites)))
      .catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") {
          setNearbySites(sessionSites);
        }
      });
    return () => controller.abort();
  }, [mapCoordinates?.latitude, mapCoordinates?.longitude]);

  return (
    <div className="detail-content">
      <div className="detail-hero">
        <div className="hero-topline">
          <span>{t("dive")} {dive.diveNumber ?? "—"}</span>
          <span>{formatDate(dive.diveDate, language, t("dateUnknown"))}</span>
        </div>
        <h2>{displaySite(dive, t("unnamedDiveSite"))}</h2>
        <div className="detail-hero-actions">
          <p>
            <MapPin size={16} />
            {displayLocation(dive) || (hasGps ? t("resolvingGps") : t("locationNotEntered"))}
          </p>
          <Link
            href={`/compose?dive=${encodeURIComponent(dive.id)}`}
            className="button button-primary compose-hero-button"
          >
            <Sparkles size={17} />
            {t("createShareImage")}
          </Link>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label={t("maximumDepth")} value={formatDepth(dive.depth)} icon={<Waves />} />
        <Metric
          label={t("diveTime")}
          value={formatDuration(dive.lengthText)}
          icon={<Compass />}
        />
        <Metric
          label={t("averageDepth")}
          value={averageDepth ? `${averageDepth.toFixed(1)} m` : "—"}
          icon={<Droplets />}
        />
        <Metric
          label={t("minimumTemperature")}
          value={minTemp ? `${minTemp.toFixed(1)} °C` : "—"}
          icon={<Thermometer />}
        />
        <Metric
          label={t("averageTemperature")}
          value={
            averageTemperature === null
              ? "—"
              : `${averageTemperature.toFixed(1)} °C`
          }
          icon={<Thermometer />}
        />
        <Metric
          label={t("sacRate")}
          value={sacRate === null ? "—" : `${sacRate.toFixed(1)} L/min`}
          icon={<Gauge />}
        />
      </div>

      <DiveProfilePanel dive={dive} />

      <div className="detail-grid">
        <section className="card map-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{t("divePosition")}</p>
              <h3>
                {mapCoordinates?.source === "computer"
                  ? t("entryLocation")
                  : mapCoordinates?.source === "user"
                    ? t("yourLocation")
                    : hasMap
                      ? t("approximateLocation")
                      : mapLookup === "loading"
                        ? t("findingLocation")
                        : t("noMapLocation")}
              </h3>
            </div>
            {hasMap && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${mapLatitude}&mlon=${mapLongitude}#map=14/${mapLatitude}/${mapLongitude}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("openMap")}
              </a>
            )}
          </div>
          {hasMap ? (
            <iframe
              title={t("mapFor", { site: displaySite(dive, t("unnamedDiveSite")) })}
              src={mapEmbedUrl(mapLatitude, mapLongitude)}
              loading="lazy"
            />
          ) : (
            <div className="map-placeholder">
              {mapLookup === "loading" ? (
                <LoaderCircle size={28} className="spin" />
              ) : (
                <MapPin size={28} />
              )}
              <p>
                {mapLookup === "loading"
                  ? t("lookingUp", { location: locationQuery })
                  : locationQuery
                    ? t("noMapMatch", { location: locationQuery })
                    : t("noCoordinateOrLocation")}
              </p>
            </div>
          )}
          {mapCoordinates?.source === "user" && (
            <p className="map-source">
              {dive.userGpsSource === "photo-exif"
                ? t("locationSourcePhotoExif")
                : t("locationSourceManual")}
            </p>
          )}
          {!mapCoordinates && resolvedLocation && (
            <p className="map-source">
              {t("approximateMatch", { location: resolvedLocation.displayName })}
            </p>
          )}
          <div className="user-gps-editor">
            <button
              type="button"
              className="button button-quiet detail-edit-button"
              onClick={() => setGpsEditorOpen((value) => !value)}
              disabled={busy}
            >
              {gpsEditorOpen ? t("cancel") : t("editLocation")}
            </button>
            {gpsEditorOpen ? (
              <div className="user-gps-editor-body">
                <div className="details-editor-row">
                  <label>
                    <span>{t("latitude")}</span>
                    <input
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={userLatDraft}
                      onChange={(event) => setUserLatDraft(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t("longitude")}</span>
                    <input
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={userLngDraft}
                      onChange={(event) => setUserLngDraft(event.target.value)}
                    />
                  </label>
                </div>
                <div className="user-gps-editor-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy || !userGpsDraftValid}
                    onClick={() => void saveManualUserGps()}
                  >
                    {t("saveManualLocation")}
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={busy || (dive.userGpsLat === null && dive.userGpsLng === null)}
                    onClick={() => void clearUserGps()}
                  >
                    {t("clearLocation")}
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={busy || attachments.length === 0}
                    onClick={() => void useLocationFromPhoto()}
                  >
                    {t("useLocationFromPhoto")}
                  </button>
                </div>
                {photoGpsStatus ? <p className="photo-gps-status">{photoGpsStatus}</p> : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="card log-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{t("logNotes")}</p>
            </div>
            <button
              type="button"
              className="button button-quiet detail-edit-button"
              onClick={() => setEditingDetails((value) => !value)}
              disabled={busy}
            >
              {editingDetails ? t("cancel") : t("editDiveDetails")}
            </button>
          </div>
          {editingDetails ? (
            <form
              className="details-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  const siteName = siteDraft.trim();
                  const currentSite = (dive.userSite ?? dive.site ?? "").trim();
                  if (siteName && siteName !== currentSite) {
                    const siteSaved = await onSaveSite({
                      name: siteName,
                      source: "manual",
                      latitude: hasGps ? dive.gpsEntryLat : null,
                      longitude: hasGps ? dive.gpsEntryLng : null,
                    });
                    if (!siteSaved) return;
                  }
                  if (tripDraft === "__new__") {
                    if (newTripNameDraft.trim()) {
                      const tripSaved = await onCreateTrip(
                        dive.id,
                        newTripNameDraft.trim(),
                      );
                      if (!tripSaved) return;
                    }
                  } else if (tripDraft !== (dive.tripId ?? "")) {
                    const tripSaved = await onAssignTrip(dive.id, tripDraft || null);
                    if (!tripSaved) return;
                  }
                  const saved = await onSaveDetails({
                    location: locationDraft.trim() || null,
                    buddy: buddyDraft.trim() || null,
                    notes: notesDraft.trim() || null,
                    cylinderPresetId: cylinderPresetDraft,
                    cylinderVolumeL: cylinderPreset(cylinderPresetDraft).volumeL,
                    startPressureBar: optionalPositiveNumber(startPressureDraft),
                    endPressureBar: optionalPositiveNumber(endPressureDraft),
                  });
                  if (saved) setEditingDetails(false);
                })();
              }}
            >
              <div className="details-editor-row location-editor-row">
                <label>
                  <span>{t("diveSiteName")}</span>
                  <input
                    value={siteDraft}
                    onChange={(event) => setSiteDraft(event.target.value)}
                    list={`site-suggestions-${dive.id}`}
                    maxLength={120}
                  />
                  <datalist id={`site-suggestions-${dive.id}`}>
                    {siteSuggestions.map((site) => (
                      <option key={site} value={site} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>{t("location")}</span>
                  <input
                    value={locationDraft}
                    onChange={(event) => setLocationDraft(event.target.value)}
                    list={`location-suggestions-${dive.id}`}
                    maxLength={160}
                  />
                  <datalist id={`location-suggestions-${dive.id}`}>
                    {locationSuggestions.map((location) => (
                      <option key={location} value={location} />
                    ))}
                  </datalist>
                </label>
              </div>
              <p>{t("siteLocationEditorHint")}</p>
              <div className="trip-editor">
                <label>
                  <span>{t("trip")}</span>
                  <select
                    value={tripDraft}
                    onChange={(event) => {
                      const value = event.target.value;
                      setTripDraft(value);
                      setTripRenameOpen(false);
                      if (value !== "__new__") setNewTripNameDraft("");
                    }}
                  >
                    <option value="">{t("noTrip")}</option>
                    {trips.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {trip.name}
                      </option>
                    ))}
                    <option value="__new__">{t("newTripOption")}</option>
                  </select>
                </label>
                {tripDraft === "__new__" ? (
                  <input
                    value={newTripNameDraft}
                    onChange={(event) => setNewTripNameDraft(event.target.value)}
                    placeholder={t("newTripNamePlaceholder")}
                    maxLength={120}
                  />
                ) : null}
                {tripDraft && tripDraft !== "__new__" ? (
                  tripRenameOpen ? (
                    <div className="trip-rename-row">
                      <input
                        value={tripRenameDraft}
                        onChange={(event) => setTripRenameDraft(event.target.value)}
                        maxLength={120}
                      />
                      <button
                        type="button"
                        className="button button-quiet"
                        disabled={busy || !tripRenameDraft.trim()}
                        onClick={() =>
                          void (async () => {
                            if (await onRenameTrip(tripDraft, tripRenameDraft)) {
                              setTripRenameOpen(false);
                            }
                          })()
                        }
                      >
                        {t("saveChanges")}
                      </button>
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => setTripRenameOpen(false)}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="trip-manage-row">
                      <button
                        type="button"
                        className="button button-quiet"
                        disabled={busy}
                        onClick={() => {
                          const current = trips.find((trip) => trip.id === tripDraft);
                          setTripRenameDraft(current?.name ?? "");
                          setTripRenameOpen(true);
                        }}
                      >
                        {t("renameTrip")}
                      </button>
                      {tripDraft === (dive.tripId ?? "") ? (
                        <button
                          type="button"
                          className="button button-quiet"
                          disabled={busy}
                          onClick={() => void onDeleteTrip(dive.tripId as string)}
                        >
                          {t("deleteTrip")}
                        </button>
                      ) : null}
                    </div>
                  )
                ) : null}
              </div>
              <label>
                <span>{t("buddy")}</span>
                <input
                  value={buddyDraft}
                  onChange={(event) => setBuddyDraft(event.target.value)}
                  maxLength={300}
                />
              </label>
              <label>
                <span>{t("notes")}</span>
                <textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  rows={5}
                  maxLength={5000}
                />
              </label>
              <div className="details-editor-row">
                <label>
                  <span>{t("tankSize")}</span>
                  <select
                    value={cylinderPresetDraft}
                    onChange={(event) =>
                      setCylinderPresetDraft(event.target.value)
                    }
                  >
                    {CYLINDER_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("startingTankPressure")} (bar)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={startPressureDraft}
                    onChange={(event) => setStartPressureDraft(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t("endingTankPressure")} (bar)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={endPressureDraft}
                    onChange={(event) => setEndPressureDraft(event.target.value)}
                  />
                </label>
              </div>
              <p>{t("localDetailsHint")}</p>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy}
              >
                {t("saveChanges")}
              </button>
            </form>
          ) : null}
          <dl className="details-list">
            <div>
              <dt><Briefcase size={16} /> {t("trip")}</dt>
              <dd>{currentTrip?.name ?? t("noTrip")}</dd>
            </div>
            <div>
              <dt><Users size={16} /> {t("buddy")}</dt>
              <dd>{dive.buddy || t("notEntered")}</dd>
            </div>
            <div>
              <dt><DatabaseIcon size={16} /> {t("computer")}</dt>
              <dd>{dive.computerModel || t("unknown")}</dd>
            </div>
            <div>
              <dt><Gauge size={16} /> {t("tankSize")}</dt>
              <dd>{selectedCylinder.label}</dd>
            </div>
            <div>
              <dt><Gauge size={16} /> {t("tankPressure")}</dt>
              <dd>
                {pressurePair
                  ? `${pressurePair.start.toFixed(1)} → ${pressurePair.end.toFixed(1)} bar`
                  : t("notEntered")}
              </dd>
            </div>
            <div>
              <dt><ArrowDownToLine size={16} /> {t("importedFrom")}</dt>
              <dd>
                {dive.sources.length ? (
                  <span className="source-references">
                    {dive.sources.map((source) => (
                      <span key={source}>
                        {formatSourceName(source)}
                        {sourceDiveNumber(dive, source) !== null
                          ? ` #${sourceDiveNumber(dive, source)}`
                          : ` · ${t("numberAfterReimport")}`}
                      </span>
                    ))}
                  </span>
                ) : (
                  t("legacyImport")
                )}
              </dd>
            </div>
            <div className="notes-row">
              <dt><Sparkles size={16} /> {t("notes")}</dt>
              <dd>{dive.notes || t("noDiveNotes")}</dd>
            </div>
          </dl>
        </section>
      </div>

      {hasResolvedGps && !dive.site && (
        <details
          className="card site-picker-card"
          open={sitePickerOpen}
          onToggle={(event) => setSitePickerOpen(event.currentTarget.open)}
        >
          <summary className="card-heading site-picker-summary">
            <div>
              <p className="eyebrow">{t("nameThisDive")}</p>
              <h3>{dive.userSite || t("nearbyDiveSites")}</h3>
              {dive.userSite && <small>{t("selectedExpand")}</small>}
            </div>
            <span className="site-picker-toggle">
              {t("within30Km")} <ChevronDown size={17} />
            </span>
          </summary>
          <div className="site-picker-body">
            {nearbySites === null ? (
              <div className="site-loading">
                <LoaderCircle size={18} className="spin" /> {t("lookingForSites")}
              </div>
            ) : nearbySites.length ? (
              <div className="site-suggestions">
                {nearbySites.map((site) => {
                  const catalogId = nearbySiteCatalogId(site);
                  const aliasesExpanded = expandedAliasSiteId === site.id;
                  return (
                    <div className="site-suggestion-item" key={site.id}>
                      <div className="site-suggestion-main">
                        <button
                          type="button"
                          className="site-suggestion-name"
                          onClick={() =>
                            void saveSiteAndCollapse(
                              nearbySiteSelection(site, site.name),
                            )
                          }
                          disabled={busy}
                          aria-pressed={dive.userSiteCatalogId === catalogId}
                        >
                          <span>{site.name}</span>
                          {site.aliases?.length ? (
                            <em>{site.aliases.join(" / ")}</em>
                          ) : null}
                          <small>
                            {formatDistance(site.distanceKm)}
                            {" · "}
                            {site.source === "catalog"
                              ? t("catalogSource")
                              : t("mapFallback")}
                          </small>
                        </button>
                        {site.aliases?.length ? (
                          <button
                            type="button"
                            className="site-alias-expand"
                            onClick={() => toggleSiteAliasExpand(site.id)}
                            disabled={busy}
                            aria-expanded={aliasesExpanded}
                            aria-label={
                              aliasesExpanded
                                ? t("hideSiteAliases")
                                : t("showSiteAliases")
                            }
                          >
                            <ChevronDown size={16} />
                          </button>
                        ) : null}
                      </div>
                      {aliasesExpanded && site.aliases?.length ? (
                        <div className="site-alias-chips">
                          {site.aliases.map((alias) => (
                            <button
                              type="button"
                              key={alias}
                              className="site-alias-chip"
                              onClick={() =>
                                void saveSiteAndCollapse(
                                  nearbySiteSelection(site, alias),
                                )
                              }
                              disabled={busy}
                              aria-pressed={
                                dive.userSiteCatalogId === catalogId &&
                                dive.userSite === alias
                              }
                              title={t("chooseSiteAlias", { name: alias })}
                            >
                              {alias}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="site-empty">
                {t("noNearbySites")}
              </p>
            )}
            <form
              className="manual-site"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  manualSite.trim() &&
                  dive.gpsEntryLat !== null &&
                  dive.gpsEntryLng !== null
                ) {
                  void saveSiteAndCollapse({
                    name: manualSite.trim(),
                    source: "manual",
                    latitude: dive.gpsEntryLat,
                    longitude: dive.gpsEntryLng,
                  });
                }
              }}
            >
              <label htmlFor={`site-${dive.id}`}>{t("diveSiteName")}</label>
              <div>
                <input
                  id={`site-${dive.id}`}
                  value={manualSite}
                  onChange={(event) => setManualSite(event.target.value)}
                  placeholder={t("typeSiteName")}
                  maxLength={120}
                />
                <button
                  type="submit"
                  className="button button-secondary"
                  disabled={busy || !manualSite.trim()}
                >
                  {t("saveSite")}
                </button>
              </div>
            </form>
          </div>
        </details>
      )}

      <section className="card photos-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">{t("diveGallery")}</p>
            <h3>{attachments.length ? t("memories", { count: attachments.length }) : t("addFirstPhotos")}</h3>
          </div>
          <label className="button button-secondary">
            <ImagePlus size={17} />
            {t("addPhotos")}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onUpload}
              disabled={busy}
              className="visually-hidden"
            />
          </label>
        </div>

        {attachments.length ? (
          <div className="photo-grid">
            {attachments.map((attachment) => (
              <article className="photo-tile" key={attachment.id}>
                <LocalPhotoImage
                  attachment={attachment}
                  alt={attachment.caption || `Dive ${dive.diveNumber ?? ""} photo`}
                />
                <div className="photo-overlay">
                  <span>{attachment.fileName}</span>
                  <Link
                    href={`/compose?dive=${encodeURIComponent(dive.id)}&photo=${encodeURIComponent(attachment.id)}`}
                    className="photo-compose-link"
                  >
                    <Sparkles size={16} /> {t("compose")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onShare(attachment)}
                    disabled={busy}
                  >
                    <Share2 size={16} /> {t("shareCard")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <label className="photo-drop">
            <Camera size={28} />
            <strong>{t("bringDiveBack")}</strong>
            <span>{t("choosePhotos")}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onUpload}
              disabled={busy}
              className="visually-hidden"
            />
          </label>
        )}
        <div className="photo-gallery-actions">
          <Link
            href={`/compose?dive=${encodeURIComponent(dive.id)}`}
            className="button button-primary"
          >
            <Sparkles size={17} /> {t("createShareImage")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function LocalPhotoImage({
  attachment,
  alt,
}: {
  attachment: Attachment;
  alt: string;
}) {
  const objectUrl = useMemo(
    () => URL.createObjectURL(attachment.blob),
    [attachment.blob],
  );
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={objectUrl} alt={alt} loading="lazy" />;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function DiveProfilePanel({ dive }: { dive: Dive }) {
  const { language, t } = useAppI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showPressure, setShowPressure] = useState(false);
  const normalized = useMemo(() => toNormalizedDive(dive), [dive]);
  const availability = chartAvailability(normalized);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !availability.depth) return;
    const draw = () => {
      const width = Math.max(320, canvas.clientWidth);
      const height = Math.max(190, Math.min(280, width * 0.34));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const settings = defaultComposerSettings(dive.id);
      settings.language = language;
      settings.chartMode =
        showPressure && availability.pressure ? "depth-pressure" : "depth";
      settings.lineThickness = 2;
      settings.fillOpacity = 0.18;
      settings.showAxisLabels = true;
      renderDiveChart(
        context,
        { x: 14, y: 12, width: width - 28, height: height - 18 },
        normalized,
        settings,
      );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [availability.depth, availability.pressure, dive.id, language, normalized, showPressure]);

  return (
    <section className="card profile-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{t("diveProfile")}</p>
          <h3>{t("depthChart")}</h3>
        </div>
        {availability.pressure ? (
          <label className="pressure-toggle">
            <input
              type="checkbox"
              checked={showPressure}
              onChange={(event) => setShowPressure(event.target.checked)}
            />
            <span>{t("showTankPressure")}</span>
          </label>
        ) : null}
      </div>
      {availability.depth ? (
        <>
          <canvas ref={canvasRef} aria-label={t("depthChart")} />
          <div className="profile-legend">
            <span className="profile-legend-depth">{t("depthLegend")}</span>
            {showPressure && availability.pressure ? (
              <span className="profile-legend-pressure">{t("tankPressure")}</span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="profile-empty">{t("profileUnavailable")}</p>
      )}
    </section>
  );
}

async function readDiveImport(file: File): Promise<ImportedDive[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "fit") return readFitDive(file);
  if (extension === "uddf") return readUddfLog(await file.text());
  if (extension === "ssrf") return readSubsurfaceLog(await file.text());
  if (extension === "xml") {
    const xml = await file.text();
    return /<\s*(?:\w+:)?uddf(?:\s|>)/i.test(xml)
      ? readUddfLog(xml)
      : readSubsurfaceLog(xml);
  }
  if (["db", "sqlite", "sqlite3"].includes(extension ?? "")) {
    return readShearwaterDatabase(file);
  }
  throw new Error(`Unsupported dive-log format: ${file.name}`);
}

async function createShareCard(
  dive: Dive,
  attachment: Attachment,
  language: AppLanguage,
  diveLabel: string,
  diveTimeLabel: string,
) {
  const image = await loadImage(attachment.blob);
  const canvas = document.createElement("canvas");
  const width = 1440;
  const height = 1800;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );

  const gradient = context.createLinearGradient(0, height * 0.46, 0, height);
  gradient.addColorStop(0, "rgba(2, 18, 26, 0)");
  gradient.addColorStop(0.52, "rgba(2, 18, 26, 0.62)");
  gradient.addColorStop(1, "rgba(2, 18, 26, 0.96)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#8debd7";
  context.font = "600 30px Arial";
  context.fillText(`${diveLabel.toUpperCase()} ${dive.diveNumber ?? "—"}  ·  ${formatDate(dive.diveDate, language, "").toUpperCase()}`, 96, 1385);
  context.fillStyle = "#ffffff";
  context.font = "700 78px Arial";
  drawWrappedText(context, displaySite(dive, ""), 96, 1485, width - 192, 86, 2);

  const details = [
    `${formatDepth(dive.depth)} MAX`,
    `${formatDuration(dive.lengthText)} ${diveTimeLabel.toUpperCase()}`,
    dive.buddy ? `WITH ${dive.buddy.toUpperCase()}` : null,
  ].filter(Boolean);
  context.fillStyle = "rgba(255,255,255,.86)";
  context.font = "500 28px Arial";
  context.fillText(details.join("   ·   "), 96, 1700);
  context.fillStyle = "#8debd7";
  context.font = "700 26px Arial";
  context.fillText("DIVEFRAME", 96, 1760);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image export failed."))),
      "image/png",
      0.94,
    ),
  );
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let lineNumber = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line, x, y + lineNumber * lineHeight);
      line = word;
      lineNumber += 1;
      if (lineNumber >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (lineNumber < maxLines) context.fillText(line, x, y + lineNumber * lineHeight);
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format cannot be rendered by the browser."));
    };
    image.src = url;
  });
}

function displaySite(
  dive: Pick<Dive, "userSite" | "site" | "location" | "resolvedLocation">,
  fallback: string,
) {
  return dive.userSite || dive.site || dive.location || dive.resolvedLocation || fallback;
}

function displayLocation(
  dive: Pick<Dive, "location" | "resolvedLocation">,
) {
  return dive.location || dive.resolvedLocation || null;
}

function mergeNearbySites(sessionSites: NearbySite[], fetchedSites: NearbySite[]) {
  const seen = new Set<string>();
  return [...sessionSites, ...fetchedSites]
    .filter((site) => {
      const key = `${site.name.trim().toLocaleLowerCase("en")}\u0000${site.latitude.toFixed(4)}\u0000${site.longitude.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);
}

function formatSourceName(source: string) {
  if (source === "shearwater") return "Shearwater";
  if (source === "subsurface") return "Subsurface";
  if (source === "uddf") return "UDDF";
  if (source === "fit") return "FIT";
  return source;
}

function sourceDiveNumber(dive: Dive, source: string) {
  const number = dive.sourceDiveNumbers?.[source as DiveSource];
  if (number !== undefined && number !== null) return number;
  if (source === "shearwater" && dive.sources.includes("shearwater")) {
    return dive.diveNumber;
  }
  return null;
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatDate(value: string | null, language: AppLanguage, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    language === "zh-Hant" ? "zh-HK" : language === "ja" ? "ja-JP" : "en",
    {
    day: "numeric",
    month: "short",
    year: "numeric",
    },
  ).format(date);
}

function averageDepthForDive(dive: Dive) {
  const calculated = safeJson(dive.calculatedJson);
  return (
    numberFrom(calculated?.AverageDepth) ??
    positiveNumber(dive.averageDepth) ??
    averageSampleDepthM(dive.samples)
  );
}

function sacRateForDive(dive: Dive, defaultCylinderPresetId: string) {
  const pressurePair = firstCompletePressurePair(
    dive.tankPressuresStartBar,
    dive.tankPressuresEndBar,
  );
  const preset = cylinderPreset(
    dive.cylinderPresetId ?? defaultCylinderPresetId,
  );
  return calculateSacLitresPerMinute({
    startPressureBar: pressurePair?.start ?? null,
    endPressureBar: pressurePair?.end ?? null,
    cylinderVolumeL: dive.cylinderVolumeL ?? preset.volumeL,
    durationSeconds: dive.durationSeconds,
    averageDepthM: averageDepthForDive(dive),
  });
}

function normalizeLocation(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized.toLocaleLowerCase("en") : null;
}

function parseDiveSearch(query: string) {
  let sourceOnly: "shearwater" | "subsurface" | null = null;
  const text = query
    .trim()
    .split(/\s+/)
    .filter((token) => {
      const normalized = token.toLowerCase();
      if (normalized === "source:shearwater-only") {
        sourceOnly = "shearwater";
        return false;
      }
      if (normalized === "source:subsurface-only") {
        sourceOnly = "subsurface";
        return false;
      }
      return true;
    })
    .join(" ");
  return { sourceOnly, text };
}

function uniqueSuggestions(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
}

function formatUnderwaterTime(seconds: number, t: AppTranslate) {
  const minutes = seconds / 60;
  if (minutes <= 300) return `${compactNumber(minutes)} ${t("minutesShort")}`;
  const hours = seconds / 3_600;
  if (hours <= 72) return `${compactNumber(hours)} ${t("hoursShort")}`;
  return `${compactNumber(hours / 24)} ${t("daysShort")}`;
}

function backupSizeWarningThreshold() {
  if (typeof navigator === "undefined") return 500 * 1024 * 1024;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return (mobile ? 150 : 500) * 1024 * 1024;
}

function formatStorageSize(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} GB`
    : `${Math.round(megabytes)} MB`;
}

function compactNumber(value: number) {
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

function formatDepth(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)} m` : "—";
}

function formatDuration(value: string | number | null) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function mapEmbedUrl(latitude: number, longitude: number) {
  const delta = 0.025;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox,
  )}&layer=mapnik&marker=${latitude},${longitude}`;
}

function safeJson(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown) {
  const number = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(number)
    ? null
    : number;
}


function numberFrom(value: unknown) {
  return asNumber(value);
}

function positiveNumber(value: number | null) {
  return value && value > 0 ? value : null;
}

function optionalPositiveNumber(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number > 0 ? number : null;
}
