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
  GitMerge,
  ImagePlus,
  LoaderCircle,
  MapPin,
  MapPinOff,
  Pencil,
  Search,
  Share2,
  Sparkles,
  Square,
  Thermometer,
  Users,
  Waves,
  X,
} from "lucide-react";
import { AppTopbar } from "./components/AppTopbar";
import { useAppBackHandler } from "./AppBackProvider";
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
  clearLocalDiveSiteOverride,
  createLocalTripWithAssignments,
  createLocalDiveMergeGroup,
  deleteLocalAttachment,
  deleteLocalDive,
  deleteLocalDives,
  deleteLocalDiveBySource,
  deleteLocalTrip,
  getLocalBackupSizeEstimate,
  getLocalAppPreferences,
  getLocalSupplementaryCatalog,
  listLocalAttachments,
  listLocalBackgrounds,
  listLocalDiveMemos,
  listLocalDiveMergeGroups,
  listLocalDives,
  listLocalSiteContributions,
  listLocalTrips,
  renameLocalTrip,
  requestPersistentLocalStorage,
  setLocalDiveTripIds,
  type LocalAttachment,
  type LocalDive,
  type LocalImportedDive,
  type LocalSiteContribution,
  type LocalTrip,
  type DiveSource,
  type UserGpsSource,
  unmergeLocalDiveGroup,
  unmergeLocalDiveGroups,
  updateLocalDiveLocation,
  updateLocalDiveDetails,
  updateLocalDiveSite,
  updateLocalDiveExportGpsPreference,
  updateLocalDiveUserGps,
  upsertLocalDives,
} from "@/lib/indexed-db";
import {
  evaluateSegmentMerge,
  expandSelectionToOriginalIds,
  isMergePresentationId,
  parseMergePresentationId,
  projectLogbookDives,
  type LocalDiveMergeGroup,
  type ProjectedMergeFields,
  type SegmentMergeErrorCode,
  type SegmentMergeWarningCode,
} from "@/lib/dive-segment-merge";
import { subscribeLocalDataChanges } from "@/lib/cross-tab-sync";
import {
  buildDiveListRows,
  compareDives,
  DEFAULT_SHORT_DIVE_MAX_MINUTES,
  diveMatchesListFilters,
  parsePositiveWholeMinutes,
  type DiveListFilters,
  type DiveSortOption,
} from "@/lib/dive-list-model";
import {
  resolveDiveMapCoordinates,
  resolvePreferredDiveCoordinates,
} from "@/lib/dive-gps";
import {
  collectBuddyNames,
  completeBuddyToken,
  matchBuddySuggestions,
  splitBuddyNames,
} from "@/lib/buddy-names";
import {
  formatCoordinatePair,
  parseCoordinatePair,
} from "@/lib/coordinate-input";
import { readPhotoExifGps } from "@/lib/photo-exif-gps";
import { photoLocationCapability } from "@/lib/photo-location-capability";
import {
  prepareSampleAwareImport,
  SAMPLE_DIVE_SOURCE_ID,
} from "@/lib/sample-dive";
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
  deviceSiteCatalogFromContributions,
  resolveActiveDiveSiteCatalog,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import {
  buildSiteLocationSuggestions,
  buildSiteNameSuggestions,
  type SiteLocationSuggestion,
  type SiteSelection,
} from "@/lib/dive-site-suggestions";
import bundledDiveSiteCatalog from "@/data/dive-sites.json";
import { readShearwaterDatabase } from "@/lib/parsers/shearwater";
import { readSubsurfaceLog } from "@/lib/parsers/subsurface";
import { readUddfLog } from "@/lib/parsers/uddf";
import { readFitDive } from "@/lib/parsers/fit";
import type { AppLanguage, AppTranslate } from "@/lib/app-i18n";
import { diveComputerCapability } from "@/lib/dive-computer-capability";
import { diveFrameApiUrl } from "@/lib/diveframe-api";
import { useAppI18n } from "./AppI18nProvider";
import { useColorTheme } from "./ThemeProvider";
import { BleImportPanel } from "./components/BleImportPanel";
import { ImportGuide } from "./components/ImportGuide";
import { MemoDiveMatchHints } from "./components/MemoDiveMatchHints";
import { DiveSiteSuggestions } from "./components/DiveSiteSuggestions";
import type { DiveMemo } from "@/lib/dive-memos";
import {
  diveNeedsPlaceNameHint,
  listMemosNearDive,
  MEMO_MATCH_WINDOWS_MS,
} from "@/lib/memo-dive-match";

type Dive = LocalDive & Partial<ProjectedMergeFields>;
type Attachment = LocalAttachment;

type MapLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
};

type ImportedDive = LocalImportedDive;

type SharedBackgroundChoice = {
  id: string;
  label: string;
  source: "library" | "bundled";
  blob: Blob;
};

const MINIMUM_AVERAGE_SAC_DURATION_SECONDS = 20 * 60;
export function DiveFrameApp() {
  const { language, t } = useAppI18n();
  const [dives, setDives] = useState<Dive[]>([]);
  const [mergeGroups, setMergeGroups] = useState<LocalDiveMergeGroup[]>([]);
  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [query, setQuery] = useState("");
  const [namedOnly, setNamedOnly] = useState(false);
  const [unnamedOnly, setUnnamedOnly] = useState(false);
  const [gpsOnly, setGpsOnly] = useState(false);
  const [appSiteOnly, setAppSiteOnly] = useState(false);
  const [gasDataOnly, setGasDataOnly] = useState(false);
  const [shortDiveOnly, setShortDiveOnly] = useState(false);
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
  const [tripHeaderRenameId, setTripHeaderRenameId] = useState<string | null>(
    null,
  );
  const [tripHeaderRenameDraft, setTripHeaderRenameDraft] = useState("");
  const [deleteSelectedConfirmOpen, setDeleteSelectedConfirmOpen] =
    useState(false);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [showOriginalSegments, setShowOriginalSegments] = useState(false);
  const [shortDiveMaxMinutesInput, setShortDiveMaxMinutesInput] = useState(
    String(DEFAULT_SHORT_DIVE_MAX_MINUTES),
  );
  const [status, setStatus] = useState(t("loadingLogbook"));
  const [busy, setBusy] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [bleImportOpen, setBleImportOpen] = useState(false);
  const [importGuideOpen, setImportGuideOpen] = useState(false);
  // Resolved after mount: the server render and the static export both report
  // the web platform, so checking during render would hide the control forever.
  const [bleImportAvailable, setBleImportAvailable] = useState(false);
  const refreshGenerationRef = useRef(0);
  const scrolledDiveDetailRef = useRef<string | null>(null);
  const workspaceAnchorRef = useRef<HTMLDivElement>(null);
  const [storageEstimate, setStorageEstimate] = useState<Awaited<
    ReturnType<typeof getLocalBackupSizeEstimate>
  > | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const gpsNameAttemptedRef = useRef(new Set<string>());
  const [gpsNameAttempted, setGpsNameAttempted] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [supplementaryCatalog, setSupplementaryCatalog] = useState<{
    catalog: DiveSiteCatalog;
  } | null>(null);
  const [siteContributions, setSiteContributions] = useState<
    LocalSiteContribution[]
  >([]);

  const refreshDives = useCallback(async (preferredId?: string) => {
    const generation = ++refreshGenerationRef.current;
    const [next, nextStorageEstimate, nextTrips, nextSupplementaryCatalog, nextContributions, nextGroups] = await Promise.all([
      listLocalDives(),
      getLocalBackupSizeEstimate(),
      listLocalTrips(),
      getLocalSupplementaryCatalog(),
      listLocalSiteContributions(),
      listLocalDiveMergeGroups(),
    ]);
    if (generation !== refreshGenerationRef.current) return;
    setDives(next);
    setMergeGroups(nextGroups);
    setStorageEstimate(nextStorageEstimate);
    setTrips(nextTrips);
    setSupplementaryCatalog(nextSupplementaryCatalog);
    setSiteContributions(nextContributions);
    const presentation = projectLogbookDives(next, nextGroups);
    setSelectedId((current) =>
      preferredId ??
      (current && presentation.some((dive) => dive.id === current)
        ? current
        : presentation[0]?.id ?? null),
    );
    setStatus(next.length ? t("divesReady", { count: next.length }) : t("importDiveLog"));
  }, [t]);

  useEffect(() => {
    let active = true;
    const generation = ++refreshGenerationRef.current;
    Promise.all([
      listLocalDives(),
      getLocalBackupSizeEstimate(),
      listLocalTrips(),
      getLocalSupplementaryCatalog(),
      listLocalSiteContributions(),
      listLocalDiveMergeGroups(),
    ])
      .then(([next, nextStorageEstimate, nextTrips, nextSupplementaryCatalog, nextContributions, nextGroups]) => {
        if (!active || generation !== refreshGenerationRef.current) return;
        setDives(next);
        setMergeGroups(nextGroups);
        setStorageEstimate(nextStorageEstimate);
        setTrips(nextTrips);
        setSupplementaryCatalog(nextSupplementaryCatalog);
        setSiteContributions(nextContributions);
        const requestedDiveId = new URLSearchParams(window.location.search).get("dive");
        const presentation = projectLogbookDives(next, nextGroups);
        const requestedDive = presentation.find((dive) => dive.id === requestedDiveId);
        setSelectedId(requestedDive?.id ?? presentation[0]?.id ?? null);
        setMobileDetail(Boolean(requestedDive));
        setStatus(next.length ? t("divesReady", { count: next.length }) : t("importDiveLog"));
        void requestPersistentLocalStorage();
      })
      .catch((error) => {
        if (active && generation === refreshGenerationRef.current) {
          setStatus(error instanceof Error ? error.message : t("unableLoadDives"));
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    return subscribeLocalDataChanges(() => {
      void refreshDives();
    });
  }, [refreshDives]);

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
    if (dives.length === 0 || importGuideOpen || bleImportOpen) {
      return;
    }

    const desktopQuery = window.matchMedia("(min-width: 861px)");
    const anchor = workspaceAnchorRef.current;
    if (!anchor) return;

    const TOPBAR_HEIGHT = 58;
    let syncFrame = 0;

    const stickyTop = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--safe-area-inset-top")
        .trim();
      const safe = Number.parseFloat(raw) || 0;
      return safe + TOPBAR_HEIGHT;
    };

    const lockY = () =>
      Math.max(
        0,
        Math.round(anchor.getBoundingClientRect().top + window.scrollY - stickyTop()),
      );

    const sync = () => {
      if (!desktopQuery.matches) return;
      const lock = lockY();
      // Clamp only — do not toggle overflow:hidden on html/body; that breaks
      // position:sticky and makes the top bar disappear at max scroll.
      if (window.scrollY > lock) {
        window.scrollTo(0, lock);
      }
    };

    const scheduleSync = () => {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        sync();
      });
    };

    // Benign browser signal when a ResizeObserver callback causes more layout
    // work in the same frame; vinext's overlay otherwise treats it as fatal.
    const onResizeObserverNoise = (event: ErrorEvent) => {
      if (
        typeof event.message === "string" &&
        event.message.includes("ResizeObserver loop")
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    sync();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("error", onResizeObserverNoise);
    desktopQuery.addEventListener("change", scheduleSync);

    return () => {
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("error", onResizeObserverNoise);
      desktopQuery.removeEventListener("change", scheduleSync);
    };
  }, [bleImportOpen, dives.length, importGuideOpen]);

  useEffect(() => {
    const requestedDiveId = new URLSearchParams(window.location.search).get("dive");
    if (!requestedDiveId || requestedDiveId !== selectedId || !mobileDetail) {
      if (!mobileDetail) scrolledDiveDetailRef.current = null;
      return;
    }
    // Only auto-scroll once per dive open from ?dive=. Re-running was
    // yanking the page back to the detail hero after Share image → gallery.
    if (scrolledDiveDetailRef.current === requestedDiveId) return;
    scrolledDiveDetailRef.current = requestedDiveId;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("dive-detail")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileDetail, selectedId]);

  useEffect(() => {
    // Capability is client-only. Defer the state update so the static/server
    // render stays identical during hydration.
    const frame = window.requestAnimationFrame(() => {
      setBleImportAvailable(diveComputerCapability.isAvailable());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openImport = params.get("import") === "1";
    const openBle = params.get("ble") === "1";
    if (!openImport && !openBle) return;
    const frame = window.requestAnimationFrame(() => {
      if (openImport) {
        setImportGuideOpen(true);
        setBleImportOpen(false);
        setMobileDetail(false);
      } else if (openBle) {
        setBleImportOpen(true);
        setImportGuideOpen(false);
        setMobileDetail(false);
      }
      params.delete("import");
      params.delete("ble");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next || "/");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function goFrontOfApp() {
    setImportGuideOpen(false);
    setBleImportOpen(false);
    setMobileDetail(false);
    setSelectMode(false);
    setSelectedDiveIds(new Set());
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("dive")) {
        url.searchParams.delete("dive");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}` || "/");
      }
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  function returnToDiveListAtCurrentDive() {
    const returnToDiveId = selectedId;
    setImportGuideOpen(false);
    setBleImportOpen(false);
    setMobileDetail(false);
    setSelectMode(false);
    setSelectedDiveIds(new Set());
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("dive")) {
        url.searchParams.delete("dive");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}` || "/");
      }
    }
    if (!returnToDiveId) return;
    // Wait until the list is shown again (mobile detail unmounts it) before
    // pinning the current dive to the top of the viewport.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`dive-row-${returnToDiveId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  useAppBackHandler(() => {
    if (!busy) setDeleteSelectedConfirmOpen(false);
    return true;
  }, deleteSelectedConfirmOpen);
  useAppBackHandler(() => {
    if (!busy) setMergeConfirmOpen(false);
    return true;
  }, mergeConfirmOpen);
  useAppBackHandler(() => {
    setImportGuideOpen(false);
    return true;
  }, importGuideOpen);
  useAppBackHandler(() => {
    returnToDiveListAtCurrentDive();
    return true;
  }, mobileDetail);

  const presentationDives = useMemo(
    () => projectLogbookDives(dives, mergeGroups) as Dive[],
    [dives, mergeGroups],
  );

  const selected = useMemo(
    () => presentationDives.find((dive) => dive.id === selectedId) ?? null,
    [presentationDives, selectedId],
  );
  const deviceSiteCatalog = useMemo(
    () =>
      deviceSiteCatalogFromContributions(
        siteContributions,
        (bundledDiveSiteCatalog as DiveSiteCatalog).schemaVersion,
      ),
    [siteContributions],
  );
  const activeDiveSiteCatalog = useMemo(
    () =>
      resolveActiveDiveSiteCatalog(
        bundledDiveSiteCatalog as DiveSiteCatalog,
        supplementaryCatalog?.catalog ?? null,
        deviceSiteCatalog,
      ),
    [deviceSiteCatalog, supplementaryCatalog],
  );

  useEffect(() => {
    const pending = dives.filter(
      (dive) =>
        dive.gpsEntryLat !== null &&
        dive.gpsEntryLng !== null &&
        !dive.location &&
        !dive.resolvedLocation &&
        !dive.resolvedLocationSuppressed &&
        !gpsNameAttemptedRef.current.has(dive.id),
    );
    if (!pending.length) return;

    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      const attemptedIds: string[] = [];
      try {
        const updates = new Map<string, Dive>();
        for (const [index, dive] of pending.entries()) {
          if (cancelled) return;
          let attempted = false;
          try {
            const response = await fetch(
              diveFrameApiUrl(
                `/api/geocode?lat=${encodeURIComponent(String(dive.gpsEntryLat))}&lng=${encodeURIComponent(String(dive.gpsEntryLng))}`,
              ),
              { signal: controller.signal },
            );
            attempted = true;
            const payload = (await response.json()) as {
              location?: {
                label: string;
                city: string | null;
                country: string | null;
              } | null;
            };
            if (response.ok && payload.location) {
              const updated = await updateLocalDiveLocation(
                dive.id,
                payload.location,
              );
              updates.set(updated.id, updated);
            }
          } catch (error) {
            if ((error as DOMException)?.name === "AbortError") throw error;
            attempted = true;
            // Network/CORS failures still count as attempted so the UI does not
            // stay on “Resolving…” forever.
          } finally {
            if (attempted) attemptedIds.push(dive.id);
          }
          if (index < pending.length - 1) await delay(1100);
        }
        if (!cancelled) {
          attemptedIds.forEach((id) => gpsNameAttemptedRef.current.add(id));
          setGpsNameAttempted(new Set(gpsNameAttemptedRef.current));
          if (updates.size) {
            setDives((current) =>
              current.map((item) => updates.get(item.id) ?? item),
            );
          }
        }
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          setStatus(t("gpsNamesPending"));
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dives, t]);

  useEffect(() => {
    let active = true;
    if (!selectedId) {
      return;
    }
    const memberIds = selected?.memberDiveIds?.length
      ? selected.memberDiveIds
      : [selectedId];
    Promise.all(memberIds.map((id) => listLocalAttachments(id)))
      .then((lists) => {
        if (active) setAttachments(lists.flat());
      })
      .catch(() => {
        if (active) setAttachments([]);
      });
    return () => {
      active = false;
    };
  }, [selected, selectedId]);

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

  const shortDiveMaxMinutes = parsePositiveWholeMinutes(
    shortDiveMaxMinutesInput,
  );
  const hasCollapsedActiveFilters =
    namedOnly ||
    unnamedOnly ||
    appSiteOnly ||
    gasDataOnly ||
    shortDiveOnly ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(computerFilter);
  const hasActiveFilters = gpsOnly || hasCollapsedActiveFilters;

  const resetFilters = useCallback(() => {
    setNamedOnly(false);
    setUnnamedOnly(false);
    setGpsOnly(false);
    setAppSiteOnly(false);
    setGasDataOnly(false);
    setShortDiveOnly(false);
    setShortDiveMaxMinutesInput(String(DEFAULT_SHORT_DIVE_MAX_MINUTES));
    setDateFrom(null);
    setDateTo(null);
    setComputerFilter(null);
  }, []);

  const visibleDives = useMemo(() => {
    const search = parseDiveSearch(query);
    const filters: Partial<DiveListFilters> = {
      namedOnly,
      unnamedOnly,
      gpsOnly,
      appSiteOnly,
      gasDataOnly,
      shortDiveMaxMinutes: shortDiveOnly
        ? (shortDiveMaxMinutes ?? 0)
        : null,
      dateFrom,
      dateTo,
      computerModel: computerFilter,
      searchText: search.text,
      sourceOnly: search.sourceOnly,
    };
    return presentationDives
      .filter((dive) => diveMatchesListFilters(dive, filters))
      .sort((a, b) => compareDives(a, b, sortOption));
  }, [
    appSiteOnly,
    computerFilter,
    dateFrom,
    dateTo,
    gasDataOnly,
    presentationDives,
    gpsOnly,
    namedOnly,
    query,
    shortDiveMaxMinutes,
    shortDiveOnly,
    sortOption,
    unnamedOnly,
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
      dives: presentationDives.length,
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
      buddies: new Set(dives.flatMap((dive) => splitBuddyNames(dive.buddy)))
        .size,
      longestDiveSeconds: durations.length ? Math.max(...durations) : null,
      deepestDiveM: maxDepths.length ? Math.max(...maxDepths) : null,
      averageMaxDepthM: maxDepths.length
        ? maxDepths.reduce((total, depth) => total + depth, 0) /
          maxDepths.length
        : null,
    };
  }, [defaultCylinderPresetId, dives, presentationDives.length]);
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
  const knownBuddyNames = useMemo(() => collectBuddyNames(dives), [dives]);
  const siteLocationSuggestions = useMemo(
    () =>
      dives.flatMap((dive): SiteLocationSuggestion[] => {
        const site = dive.userSite ?? dive.site;
        const locations = [dive.location, dive.resolvedLocation].filter(
          (location): location is string => Boolean(location?.trim()),
        );
        return site?.trim()
          ? locations.map((location) => ({ site: site.trim(), location: location.trim() }))
          : [];
      }),
    [dives],
  );

  async function importDatabase(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setImportGuideOpen(false);
    setBusy(true);
    setStatus(t("readingExtract"));
    try {
      const imported = (
        await Promise.all(files.map((file) => readDiveImport(file)))
      ).flat();
      setStatus(t("foundDives", { count: imported.length }));
      const preparedImport = prepareSampleAwareImport(imported);
      const { includesRealDive } = preparedImport;
      if (includesRealDive) {
        await deleteLocalDiveBySource("uddf", SAMPLE_DIVE_SOURCE_ID);
      }
      // If the sample file and a real log are selected together, do not
      // reinsert the sample immediately after removing its existing copy.
      await upsertLocalDives(preparedImport.dives);
      await refreshDives();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("importFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function savePhotoFiles(files: File[]) {
    if (!files.length || !selected) return false;
    if (selected.mergeGroupId) {
      setStatus(t("cannotEditMergedPhotos"));
      return false;
    }
    setBusy(true);
    setStatus(t("savingPhotos", { count: files.length, suffix: files.length === 1 ? "" : "s" }));
    try {
      const additions = await addLocalPhotos(selected.id, files);
      setAttachments((current) => [...current, ...additions]);
      await refreshDives(selected.id);
      setStatus(t("photosSaved"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("localSaveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await savePhotoFiles(files);
  }

  async function deletePhoto(attachment: Attachment) {
    if (!selected || !window.confirm(t("deletePhotoConfirm"))) return;
    if (selected.mergeGroupId) {
      setStatus(t("cannotEditMergedPhotos"));
      return;
    }
    setBusy(true);
    setStatus(t("deletingPhoto"));
    try {
      await deleteLocalAttachment(selected.id, attachment.id);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      await refreshDives(selected.id);
      setStatus(t("photoDeleted"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("photoDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function loadSampleLog() {
    setBusy(true);
    setStatus(t("loadingSampleLog"));
    try {
      const response = await fetch("/examples/sample-dive.uddf");
      if (!response.ok) throw new Error(t("sampleLogLoadFailed"));
      await upsertLocalDives(readUddfLog(await response.text()));
      await refreshDives();
      setStatus(t("sampleLogLoaded"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("sampleLogLoadFailed"));
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

  async function clearDiveSiteOverride() {
    if (!selected) return null;
    setBusy(true);
    setStatus(t("savingDiveSite"));
    try {
      const updated = await clearLocalDiveSiteOverride(selected.id);
      setDives((current) =>
        current.map((dive) => (dive.id === updated.id ? updated : dive)),
      );
      setStatus(t("siteOverrideCleared"));
      return updated;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("siteSaveFailed"));
      return null;
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
    if (selected.mergeGroupId) return true;
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

  async function deleteDiveLog(id: string) {
    setBusy(true);
    const groupId = parseMergePresentationId(id);
    if (groupId) {
      setStatus(t("unmergingSegments"));
      try {
        await unmergeLocalDiveGroup(groupId);
        setAttachments([]);
        setSelectedId(null);
        setMobileDetail(false);
        await refreshDives();
        setStatus(t("segmentsUnmerged"));
        return true;
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : t("segmentsUnmergeFailed"),
        );
        return false;
      } finally {
        setBusy(false);
      }
    }
    setStatus(t("deletingDiveLog"));
    try {
      await deleteLocalDive(id);
      setAttachments([]);
      setSelectedId(null);
      setMobileDetail(false);
      await refreshDives();
      setStatus(t("diveDeleted"));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("diveDeleteFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDiveExportGpsPreference(id: string, preferUser: boolean) {
    setBusy(true);
    try {
      const updated = await updateLocalDiveExportGpsPreference(
        id,
        preferUser ? "user" : "computer",
      );
      setDives((current) =>
        current.map((dive) => (dive.id === updated.id ? updated : dive)),
      );
      return true;
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : t("settingsSaveFailed"),
      );
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
    // Mobile detail replaces the list in the same window scroller; land on the
    // dive hero (not the overview "Your logs, enhanced." block above it).
    scrolledDiveDetailRef.current = id;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("dive") !== id) {
        url.searchParams.set("dive", id);
        window.history.pushState(
          { __diveframeBack: 1 },
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("dive-detail")?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      });
    });
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
      setDeleteSelectedConfirmOpen(false);
      setMergeConfirmOpen(false);
      return next;
    });
  }

  function visibleSelectedDiveIds() {
    return Array.from(selectedDiveIds).filter((id) => visibleDiveIds.has(id));
  }

  const visibleSelectedCount = visibleSelectedDiveIds().length;
  const selectedMergedOnly =
    visibleSelectedCount > 0 &&
    visibleSelectedDiveIds().every((id) => isMergePresentationId(id));
  const mergeSelectionIds = expandSelectionToOriginalIds(
    visibleSelectedDiveIds(),
    mergeGroups,
  );
  const mergePreviewMembers = mergeSelectionIds
    .map((id) => dives.find((dive) => dive.id === id))
    .filter((dive): dive is Dive => Boolean(dive));
  const mergePreview = evaluateSegmentMerge(mergePreviewMembers);

  async function mergeSelectedSegments() {
    if (!mergePreview.ok || mergeSelectionIds.length < 2) return;
    setBusy(true);
    setStatus(t("mergingSegments"));
    try {
      const group = await createLocalDiveMergeGroup(mergeSelectionIds);
      setSelectedDiveIds(new Set());
      setSelectMode(false);
      setMergeConfirmOpen(false);
      await refreshDives(`merge:${group.id}`);
      setStatus(t("segmentsMerged", { count: mergeSelectionIds.length }));
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : t("segmentsMergeFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function unmergeSelectedPresentation() {
    if (!selected?.mergeGroupId) return;
    setBusy(true);
    setStatus(t("unmergingSegments"));
    try {
      const firstId = selected.memberDiveIds?.[0];
      await unmergeLocalDiveGroup(selected.mergeGroupId);
      setShowOriginalSegments(false);
      await refreshDives(firstId);
      setStatus(t("segmentsUnmerged"));
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : t("segmentsUnmergeFailed"),
      );
    } finally {
      setBusy(false);
    }
  }
  function selectVisibleDives() {
    setSelectedDiveIds(new Set(visibleDives.map((dive) => dive.id)));
  }

  function clearSelection() {
    setSelectedDiveIds(new Set());
  }

  async function createTripFromSelection(name: string) {
    const ids = expandSelectionToOriginalIds(
      visibleSelectedDiveIds(),
      mergeGroups,
    );
    if (!ids.length || !name.trim()) return;
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      await createLocalTripWithAssignments(name, ids);
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
    const ids = expandSelectionToOriginalIds(
      visibleSelectedDiveIds(),
      mergeGroups,
    );
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
    const ids = expandSelectionToOriginalIds(
      visibleSelectedDiveIds(),
      mergeGroups,
    );
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

  async function deleteSelectedDives() {
    const ids = visibleSelectedDiveIds();
    if (!ids.length) return false;
    const presentationIds = ids.filter((id) => isMergePresentationId(id));
    const originalIds = ids.filter((id) => !isMergePresentationId(id));
    if (presentationIds.length && originalIds.length) {
      setStatus(t("mergeSelectionMixed"));
      return false;
    }
    setBusy(true);
    if (presentationIds.length) {
      setStatus(t("unmergingSegments"));
      try {
        const groupIds = presentationIds
          .map(parseMergePresentationId)
          .filter((id): id is string => Boolean(id));
        await unmergeLocalDiveGroups(groupIds);
        setSelectedDiveIds(new Set());
        setSelectMode(false);
        setDeleteSelectedConfirmOpen(false);
        await refreshDives();
        setStatus(t("segmentsUnmerged"));
        return true;
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : t("segmentsUnmergeFailed"),
        );
        return false;
      } finally {
        setBusy(false);
      }
    }
    setStatus(t("deletingSelectedDives"));
    try {
      await deleteLocalDives(originalIds);
      setSelectedDiveIds(new Set());
      setSelectMode(false);
      setNewTripFormOpen(false);
      setNewTripNameDraft("");
      setAddToTripDraft("");
      setDeleteSelectedConfirmOpen(false);
      if (selectedId && ids.includes(selectedId)) {
        setAttachments([]);
        setSelectedId(null);
        setMobileDetail(false);
      }
      await refreshDives();
      setStatus(t("selectedDivesDeleted", { count: ids.length }));
      return true;
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : t("selectedDivesDeleteFailed"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function assignDiveTrip(diveId: string, tripId: string | null) {
    const ids = expandSelectionToOriginalIds([diveId], mergeGroups);
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      await setLocalDiveTripIds(ids, tripId);
      await refreshDives(diveId);
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
    const ids = expandSelectionToOriginalIds([diveId], mergeGroups);
    if (!ids.length || !name.trim()) return false;
    setBusy(true);
    setStatus(t("savingTripAssignment"));
    try {
      await createLocalTripWithAssignments(name, ids);
      await refreshDives(diveId);
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

  function beginTripHeaderRename(trip: Pick<LocalTrip, "id" | "name">) {
    setTripHeaderRenameId(trip.id);
    setTripHeaderRenameDraft(trip.name);
  }

  function cancelTripHeaderRename() {
    setTripHeaderRenameId(null);
    setTripHeaderRenameDraft("");
  }

  async function submitTripHeaderRename() {
    if (!tripHeaderRenameId || !tripHeaderRenameDraft.trim()) return;
    if (await renameTrip(tripHeaderRenameId, tripHeaderRenameDraft)) {
      cancelTripHeaderRename();
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
    <main className={`app-shell${mobileDetail ? " show-mobile-detail" : ""}`}>
      <AppTopbar
        subtitle={t("diveLogCompanion")}
        brand={{
          mode: "button",
          onClick: mobileDetail ? returnToDiveListAtCurrentDive : goFrontOfApp,
          ariaLabel: mobileDetail ? t("allDives") : t("home"),
        }}
        showHome={mobileDetail || importGuideOpen || bleImportOpen}
        onHomeFront={mobileDetail ? returnToDiveListAtCurrentDive : goFrontOfApp}
        showImportCluster
        onImportLog={() => {
          setBleImportOpen(false);
          setImportGuideOpen(true);
        }}
        onBleImport={
          bleImportAvailable
            ? () => {
                setImportGuideOpen(false);
                setBleImportOpen(true);
              }
            : undefined
        }
        importBusy={busy}
        leadingActions={
          status !== t("importDiveLog") ? (
            <span
              className="status-pill"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {busy ? <LoaderCircle size={14} className="spin" /> : <Droplets size={14} />}
              {status}
            </span>
          ) : null
        }
      />
      <input
        ref={importInput}
        type="file"
        accept=".db,.sqlite,.sqlite3,.ssrf,.xml,.uddf,.fit,application/x-sqlite3,application/xml,text/xml,application/octet-stream"
        multiple
        className="visually-hidden"
        onChange={importDatabase}
      />

      {bleImportOpen && !importGuideOpen ? (
        <BleImportPanel
          t={t}
          onClose={() => setBleImportOpen(false)}
          onImported={async () => {
            await refreshDives();
          }}
        />
      ) : null}

      {importGuideOpen ? (
        <ImportGuide
          busy={busy}
          onChooseFiles={() => importInput.current?.click()}
          t={t}
        />
      ) : dives.length === 0 ? (
        <EmptyState
          busy={busy}
          onImport={() => setImportGuideOpen(true)}
          onLoadSample={() => void loadSampleLog()}
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

          <div className="workspace-dock-anchor" ref={workspaceAnchorRef}>
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
                    className={gpsOnly ? "active" : ""}
                    onClick={() => setGpsOnly((value) => !value)}
                    aria-pressed={gpsOnly}
                  >
                    <Compass size={14} /> {t("gpsData")}
                  </button>
                  <button
                    type="button"
                    className={`filter-toggle ${filtersOpen || hasCollapsedActiveFilters ? "active" : ""}`}
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
                    className="filter-clear-main"
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
                    <div className="filter-panel-chips">
                      <button
                        type="button"
                        className={`filter-panel-chip ${namedOnly ? "active" : ""}`}
                        onClick={() => {
                          const next = !namedOnly;
                          setNamedOnly(next);
                          if (next) setUnnamedOnly(false);
                        }}
                        aria-pressed={namedOnly}
                      >
                        <MapPin size={14} /> {t("siteNamed")}
                      </button>
                      <button
                        type="button"
                        className={`filter-panel-chip ${unnamedOnly ? "active" : ""}`}
                        onClick={() => {
                          const next = !unnamedOnly;
                          setUnnamedOnly(next);
                          if (next) setNamedOnly(false);
                        }}
                        aria-pressed={unnamedOnly}
                      >
                        <MapPinOff size={14} /> {t("noSiteNamed")}
                      </button>
                      <button
                        type="button"
                        className={`filter-panel-chip ${gasDataOnly ? "active" : ""}`}
                        onClick={() => setGasDataOnly((value) => !value)}
                        aria-pressed={gasDataOnly}
                      >
                        <Gauge size={14} /> {t("gasData")}
                      </button>
                      <button
                        type="button"
                        className={`filter-panel-chip ${appSiteOnly ? "active" : ""}`}
                        onClick={() => setAppSiteOnly((value) => !value)}
                        aria-pressed={appSiteOnly}
                      >
                        <Sparkles size={14} /> {t("setInApp")}
                      </button>
                      <button
                        type="button"
                        className={`filter-panel-chip ${shortDiveOnly ? "active" : ""}`}
                        onClick={() => setShortDiveOnly((value) => !value)}
                        aria-pressed={shortDiveOnly}
                      >
                        <Clock3 size={14} /> {t("shortDives")}
                      </button>
                    </div>
                    <div className="filter-panel-fields">
                      <label className="filter-panel-field" htmlFor="short-dive-max-minutes">
                        <span>{t("maxDurationMinutes")}</span>
                        <input
                          id="short-dive-max-minutes"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={shortDiveMaxMinutesInput}
                          onChange={(event) =>
                            setShortDiveMaxMinutesInput(event.target.value)
                          }
                          aria-invalid={shortDiveMaxMinutes === null}
                        />
                      </label>
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
                  </div>
                ) : null}
                {selectMode ? (
                  <div className="select-action-bar">
                    <section className="select-action-group">
                      <span className="select-action-label">{t("selectionTools")}</span>
                      <div className="select-action-row">
                        <span className="select-action-count" aria-live="polite">
                          {t("selectedCount", { count: visibleSelectedCount })}
                        </span>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={selectVisibleDives}
                          disabled={busy || !visibleDives.length}
                          aria-describedby="select-visible-dives-hint"
                        >
                          {t("selectShown")}
                        </button>
                        <span id="select-visible-dives-hint" className="visually-hidden">
                          {t("selectShownHint")}
                        </span>
                        <button
                          type="button"
                          className="button button-quiet"
                          onClick={clearSelection}
                          disabled={busy || !visibleSelectedCount}
                        >
                          {t("clearSelection")}
                        </button>
                      </div>
                    </section>
                    <section className="select-action-group">
                      <span className="select-action-label">{t("trip")}</span>
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
                    </section>
                    <section className="select-action-group select-action-final">
                      <span className="select-action-label">{t("selectedDiveActions")}</span>
                      <div className="select-action-buttons">
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setMergeConfirmOpen(true)}
                          disabled={busy || visibleSelectedCount < 2}
                        >
                          <GitMerge size={16} /> {t("mergeSegments")}
                        </button>
                        <button
                          type="button"
                          className="button button-danger-secondary"
                          onClick={() => setDeleteSelectedConfirmOpen(true)}
                          disabled={busy || !visibleSelectedCount}
                        >
                          {t("deleteSelectedDives")}
                        </button>
                      </div>
                    </section>
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
                      mergedSegmentCount={row.dive.memberDiveIds?.length}
                      mergeStale={row.dive.mergeStale}
                    />
                  ) : (
                    <div className="trip-block" key={row.trip.id}>
                      <div className="trip-header-row">
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
                        <button
                          type="button"
                          className="trip-header-rename"
                          onClick={() => beginTripHeaderRename(row.trip)}
                          disabled={busy}
                          aria-label={`${t("renameTrip")}: ${row.trip.name}`}
                          title={t("renameTrip")}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          <span>{t("renameTrip")}</span>
                        </button>
                      </div>
                      {tripHeaderRenameId === row.trip.id ? (
                        <form
                          className="trip-header-rename-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void submitTripHeaderRename();
                          }}
                        >
                          <label
                            className="visually-hidden"
                            htmlFor={`trip-header-rename-${row.trip.id}`}
                          >
                            {t("renameTrip")}
                          </label>
                          <input
                            id={`trip-header-rename-${row.trip.id}`}
                            value={tripHeaderRenameDraft}
                            onChange={(event) =>
                              setTripHeaderRenameDraft(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelTripHeaderRename();
                              }
                            }}
                            maxLength={120}
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="button button-secondary"
                            disabled={busy || !tripHeaderRenameDraft.trim()}
                          >
                            {t("saveChanges")}
                          </button>
                          <button
                            type="button"
                            className="button button-quiet"
                            onClick={cancelTripHeaderRename}
                            disabled={busy}
                          >
                            {t("cancel")}
                          </button>
                        </form>
                      ) : null}
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
                              mergedSegmentCount={dive.memberDiveIds?.length}
                              mergeStale={dive.mergeStale}
                            />
                          ))}
                    </div>
                  ),
                )}
              </div>
            </aside>

            <section id="dive-detail" className="detail-panel">
              {selected ? (
                <DiveDetail
                  key={selected.id}
                  dive={selected}
                  attachments={attachments}
                  busy={busy}
                  gpsNameAttempted={gpsNameAttempted.has(selected.id)}
                  onUpload={uploadPhotos}
                  onAddPhotoFiles={savePhotoFiles}
                  onDeletePhoto={deletePhoto}
                  onSaveSite={saveDiveSite}
                  onClearSiteOverride={clearDiveSiteOverride}
                  onSaveDetails={saveDiveDetails}
                  onDeleteDive={deleteDiveLog}
                  onUnmerge={
                    selected.mergeGroupId ? unmergeSelectedPresentation : undefined
                  }
                  showOriginalSegments={showOriginalSegments}
                  onToggleOriginalSegments={() =>
                    setShowOriginalSegments((value) => !value)
                  }
                  originalSegments={
                    selected.memberDiveIds?.map(
                      (id) => dives.find((dive) => dive.id === id) ?? null,
                    ) ?? []
                  }
                  onSaveUserGps={saveDiveUserGps}
                  onSaveExportGpsPreference={saveDiveExportGpsPreference}
                  siteSuggestions={siteSuggestions}
                  locationSuggestions={locationSuggestions}
                  knownBuddyNames={knownBuddyNames}
                  siteLocationPairs={siteLocationSuggestions}
                  localDiveSiteCatalog={activeDiveSiteCatalog}
                  trips={trips}
                  onAssignTrip={assignDiveTrip}
                  onCreateTrip={createTripForDive}
                  onRenameTrip={renameTrip}
                  onDeleteTrip={removeTrip}
                  onDiveChange={(updated) => {
                    setDives((current) =>
                      current.map((dive) =>
                        dive.id === updated.id ? updated : dive,
                      ),
                    );
                  }}
                />
              ) : (
                <div className="no-selection">{t("chooseDive")}</div>
              )}
            </section>
          </section>
          </div>
        </>
      )}

      {deleteSelectedConfirmOpen ? (
        <div
          className="photo-location-help-backdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setDeleteSelectedConfirmOpen(false);
          }}
        >
          <section
            className="photo-location-help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-selected-dives-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="photo-location-help-header">
              <h2 id="delete-selected-dives-title">
                {selectedMergedOnly
                  ? t("deleteMergedIsUnmergeTitle")
                  : t("deleteSelectedDivesTitle", { count: visibleSelectedCount })}
              </h2>
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => setDeleteSelectedConfirmOpen(false)}
                aria-label={t("cancel")}
                title={t("cancel")}
              >
                <X size={16} />
              </button>
            </header>
            <p>
              {selectedMergedOnly
                ? t("deleteMergedIsUnmergeDescription")
                : t("deleteSelectedDivesDescription")}
            </p>
            <div className="details-editor-actions">
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => setDeleteSelectedConfirmOpen(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={busy || !visibleSelectedCount}
                onClick={() => {
                  void deleteSelectedDives();
                }}
              >
                {selectedMergedOnly ? t("unmergeSegments") : t("deleteSelectedDives")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {mergeConfirmOpen ? (
        <div
          className="photo-location-help-backdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setMergeConfirmOpen(false);
          }}
        >
          <section
            className="photo-location-help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="merge-segments-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="photo-location-help-header">
              <h2 id="merge-segments-title">
                {t("mergeSegmentsTitle", { count: mergeSelectionIds.length })}
              </h2>
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => setMergeConfirmOpen(false)}
                aria-label={t("cancel")}
                title={t("cancel")}
              >
                <X size={16} />
              </button>
            </header>
            <p>{t("mergeSegmentsDescription")}</p>
            <ul className="merge-segment-preview">
              {mergePreview.ordered.map((dive, index) => (
                <li key={dive.id}>
                  {t("dive")} {dive.diveNumber ?? "—"} ·{" "}
                  {formatDuration(dive.durationSeconds)}
                  {index < mergePreview.gapsSeconds.length ? (
                    <span>
                      {" "}
                      {t("mergeSegmentsGap", {
                        number: dive.diveNumber ?? index + 1,
                        gap: formatDuration(mergePreview.gapsSeconds[index]),
                      })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {mergePreview.clockDurationSeconds !== null ? (
              <p>
                {t("mergeSegmentsClockDuration", {
                  duration: formatDuration(mergePreview.clockDurationSeconds),
                })}
              </p>
            ) : null}
            {mergePreview.underwaterDurationSeconds !== null ? (
              <p>
                {t("mergeSegmentsUnderwaterDuration", {
                  duration: formatDuration(mergePreview.underwaterDurationSeconds),
                })}
              </p>
            ) : null}
            {mergePreview.errors.map((code) => (
              <p key={code} className="merge-segment-error">
                {mergeIssueText(code, t)}
              </p>
            ))}
            {mergePreview.warnings.map((code) => (
              <p key={code}>{mergeIssueText(code, t)}</p>
            ))}
            {!mergePreview.ok ? <p>{t("mergeSegmentsBlocked")}</p> : null}
            <div className="details-editor-actions">
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => setMergeConfirmOpen(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={busy || !mergePreview.ok}
                onClick={() => {
                  void mergeSelectedSegments();
                }}
              >
                <GitMerge size={16} /> {t("mergeSegments")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function EmptyState({
  busy,
  onImport,
  onLoadSample,
  status,
}: {
  busy: boolean;
  onImport: () => void;
  onLoadSample: () => void;
  status: string;
}) {
  const { t } = useAppI18n();
  return (
    <section className="empty-state">
      <svg
        className="empty-dive-profile"
        viewBox="0 0 1000 420"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M0 86
             C80 86 130 92 165 128
             C210 185 245 270 285 320
             C320 358 360 372 410 366
             C450 361 475 345 510 352
             C545 359 570 378 610 372
             C650 366 680 348 715 340
             C755 328 790 290 820 245
             C840 210 850 188 870 178
             L920 178
             C950 178 980 145 1000 112"
          fill="none"
          stroke="var(--profile-stroke)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="empty-content">
        <p className="eyebrow">{t("startWithExport")}</p>
        <h1>{t("emptyTitle")}</h1>
        <p>{t("emptyDescription")}</p>
        <div className="empty-import-actions">
          <button
            type="button"
            className="button button-primary button-large"
            onClick={onImport}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}
            {t("chooseDiveLog")}
          </button>
          <button
            type="button"
            className="button button-secondary button-large"
            onClick={onLoadSample}
            disabled={busy}
          >
            {t("loadSampleLog")}
          </button>
        </div>
        {status && status !== t("importDiveLog") && status !== t("loadingLogbook") ? (
          <span className="empty-status">{status}</span>
        ) : null}
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
  mergedSegmentCount,
  mergeStale = false,
}: {
  dive: Dive;
  language: AppLanguage;
  t: AppTranslate;
  selected: boolean;
  selectMode: boolean;
  isChecked: boolean;
  onClick: () => void;
  member?: boolean;
  mergedSegmentCount?: number;
  mergeStale?: boolean;
}) {
  return (
    <button
      type="button"
      id={`dive-row-${dive.id}`}
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
        {mergedSegmentCount && mergedSegmentCount > 1 ? (
          <span className="merged-segment-badge">
            {t("mergedSegmentsBadge", { count: mergedSegmentCount })}
            {mergeStale ? ` · ${t("staleMergeBadge")}` : ""}
          </span>
        ) : null}
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
  gpsNameAttempted,
  onUpload,
  onAddPhotoFiles,
  onDeletePhoto,
  onSaveSite,
  onClearSiteOverride,
  onSaveDetails,
  onDeleteDive,
  onUnmerge,
  showOriginalSegments = false,
  onToggleOriginalSegments,
  originalSegments = [],
  onSaveUserGps,
  onSaveExportGpsPreference,
  siteSuggestions,
  locationSuggestions,
  knownBuddyNames,
  siteLocationPairs,
  localDiveSiteCatalog,
  trips,
  onAssignTrip,
  onCreateTrip,
  onRenameTrip,
  onDeleteTrip,
  onDiveChange,
}: {
  dive: Dive;
  attachments: Attachment[];
  busy: boolean;
  gpsNameAttempted: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddPhotoFiles: (files: File[]) => Promise<boolean>;
  onDeletePhoto: (attachment: Attachment) => void;
  onSaveSite: (site: SiteSelection) => Promise<boolean>;
  onClearSiteOverride: () => Promise<LocalDive | null>;
  onSaveDetails: (details: {
    location?: string | null;
    buddy: string | null;
    notes: string | null;
    cylinderPresetId?: string | null;
    cylinderVolumeL?: number | null;
    startPressureBar?: number | null;
    endPressureBar?: number | null;
  }) => Promise<boolean>;
  onDeleteDive: (diveId: string) => Promise<boolean>;
  onUnmerge?: () => Promise<void> | void;
  showOriginalSegments?: boolean;
  onToggleOriginalSegments?: () => void;
  originalSegments?: Array<Dive | null>;
  onSaveUserGps: (
    diveId: string,
    gps: { lat: number; lng: number; source: UserGpsSource } | null,
  ) => Promise<boolean>;
  onSaveExportGpsPreference: (
    diveId: string,
    preferUser: boolean,
  ) => Promise<boolean>;
  siteSuggestions: string[];
  locationSuggestions: string[];
  knownBuddyNames: string[];
  siteLocationPairs: SiteLocationSuggestion[];
  localDiveSiteCatalog: DiveSiteCatalog;
  trips: LocalTrip[];
  onAssignTrip: (diveId: string, tripId: string | null) => Promise<boolean>;
  onCreateTrip: (diveId: string, name: string) => Promise<boolean>;
  onRenameTrip: (tripId: string, name: string) => Promise<boolean>;
  onDeleteTrip: (tripId: string) => Promise<boolean>;
  onDiveChange: (dive: Dive) => void;
}) {
  const { language, t } = useAppI18n();
  const merged = Boolean(dive.mergeGroupId);
  const composeDiveId = dive.memberDiveIds?.[0] ?? dive.id;
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
  const [locationDraft, setLocationDraft] = useState(dive.location ?? "");
  const [sharedBackgrounds, setSharedBackgrounds] = useState<SharedBackgroundChoice[]>([]);
  const [sitePickerOpen, setSitePickerOpen] = useState(
    !dive.mergeGroupId && !dive.userSite && !dive.site,
  );
  const siteEditorRef = useRef<HTMLDetailsElement>(null);
  const siteMutationInFlightRef = useRef(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [deleteDiveConfirmOpen, setDeleteDiveConfirmOpen] = useState(false);
  const [buddyDraft, setBuddyDraft] = useState(dive.buddy ?? "");
  const buddySuggestions = useMemo(
    () => matchBuddySuggestions(buddyDraft, knownBuddyNames),
    [buddyDraft, knownBuddyNames],
  );
  const [notesDraft, setNotesDraft] = useState(dive.notes ?? "");
  const [tripDraft, setTripDraft] = useState(dive.tripId ?? "");
  const [newTripNameDraft, setNewTripNameDraft] = useState("");
  const [tripRenameOpen, setTripRenameOpen] = useState(false);
  const [tripRenameDraft, setTripRenameDraft] = useState("");
  const [matchMemos, setMatchMemos] = useState<DiveMemo[]>([]);
  const needsPlaceName = diveNeedsPlaceNameHint(dive);
  const showMemoMatchHints =
    needsPlaceName &&
    listMemosNearDive(dive, matchMemos, MEMO_MATCH_WINDOWS_MS.widest).length >
      0;
  const hasDiveFrameSiteData = Boolean(
    dive.userSite ||
      dive.locationSource ||
      dive.userGpsSource ||
      dive.resolvedLocation ||
      dive.resolvedCity ||
      dive.resolvedCountry,
  );
  const siteLocationDraftDirty =
    manualSite.trim() !== (dive.userSite ?? dive.site ?? "").trim() ||
    (locationDraft.trim() || null) !== (dive.location?.trim() || null);
  const currentTrip = dive.tripId
    ? trips.find((trip) => trip.id === dive.tripId) ?? null
    : null;

  useEffect(() => {
    if (!needsPlaceName) {
      return;
    }
    let active = true;
    const reload = () =>
      listLocalDiveMemos()
        .then((listed) => {
          if (active) setMatchMemos(listed);
        })
        .catch(() => {
          if (active) setMatchMemos([]);
        });
    void reload();
    const unsubscribe = subscribeLocalDataChanges(() => void reload());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [dive.diveDate, dive.id, needsPlaceName]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listLocalBackgrounds(),
      getLocalAppPreferences(),
      fetch("/backgrounds/bubbles-bg.jpg")
        .then((response) => (response.ok ? response.blob() : null))
        .catch(() => null),
    ])
      .then(([backgrounds, preferences, bundled]) => {
        if (!active) return;
        const choices: SharedBackgroundChoice[] = backgrounds.map((background) => ({
          id: `background:${background.id}`,
          label: background.displayName || background.fileName,
          source: "library",
          blob: background.blob,
        }));
        if (bundled && !preferences?.bundledBackgroundHidden) {
          choices.push({
            id: "bundled:bubbles",
            label: "Bubbles",
            source: "bundled",
            blob: bundled,
          });
        }
        setSharedBackgrounds(choices);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [dive.id]);

  function resetTripEditorDrafts() {
    setTripDraft(dive.tripId ?? "");
    setNewTripNameDraft("");
    setTripRenameOpen(false);
    setTripRenameDraft("");
  }

  // A trip can change after an async create/assign/delete. Deferring the draft
  // reset avoids a synchronous effect cascade while keeping the open editor in
  // sync with the persisted assignment.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTripDraft(dive.tripId ?? "");
      setNewTripNameDraft("");
      setTripRenameOpen(false);
      setTripRenameDraft("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dive.tripId]);
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
  const siteNameSuggestions = useMemo(
    () => buildSiteNameSuggestions(localDiveSiteCatalog, siteSuggestions),
    [localDiveSiteCatalog, siteSuggestions],
  );
  const siteLocationSuggestions = useMemo(
    () =>
      buildSiteLocationSuggestions({
        catalog: localDiveSiteCatalog,
        selectedSite: manualSite,
        storedLocations: locationSuggestions,
        siteLocationPairs,
      }),
    [
      localDiveSiteCatalog,
      locationSuggestions,
      manualSite,
      siteLocationPairs,
    ],
  );
  const mapCoordinates = resolveDiveMapCoordinates(dive);
  const preferredCoordinates = resolvePreferredDiveCoordinates(dive);
  const storedUserCoordinates = Boolean(
    dive.userGpsLat !== null &&
      dive.userGpsLng !== null &&
      Number.isFinite(dive.userGpsLat) &&
      Number.isFinite(dive.userGpsLng) &&
      Math.abs(dive.userGpsLat) <= 90 &&
      Math.abs(dive.userGpsLng) <= 180,
  );
  const [geocodeResult, setGeocodeResult] = useState<{
    query: string;
    location: MapLocation | null;
  } | null>(null);

  useEffect(() => {
    if (mapCoordinates || !locationQuery) return;

    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10000);
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
        if ((error as DOMException)?.name !== "AbortError" || timedOut) {
          setGeocodeResult({ query: locationQuery, location: null });
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
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
  const [userGpsDraft, setUserGpsDraft] = useState(
    formatCoordinatePair(dive.userGpsLat, dive.userGpsLng),
  );
  const [photoGpsStatus, setPhotoGpsStatus] = useState<string | null>(null);
  const [photoGpsBusy, setPhotoGpsBusy] = useState(false);
  const [photoLocationHelpOpen, setPhotoLocationHelpOpen] = useState(false);
  useAppBackHandler(() => {
    if (!busy) setDeleteDiveConfirmOpen(false);
    return true;
  }, deleteDiveConfirmOpen);
  useAppBackHandler(() => {
    setPhotoLocationHelpOpen(false);
    return true;
  }, photoLocationHelpOpen);
  const [addLocationPhotoToDive, setAddLocationPhotoToDive] = useState(false);
  const photoLocationInputRef = useRef<HTMLInputElement>(null);

  const parsedUserGps = parseCoordinatePair(userGpsDraft);
  const userGpsDraftInvalid = userGpsDraft.trim() !== "" && parsedUserGps === null;

  async function saveManualUserGps() {
    if (!parsedUserGps) {
      setPhotoGpsStatus(t("invalidLocationValues"));
      return;
    }
    if (
      await onSaveUserGps(dive.id, {
        lat: parsedUserGps.latitude,
        lng: parsedUserGps.longitude,
        source: "manual",
      })
    ) {
      setUserGpsDraft(
        formatCoordinatePair(parsedUserGps.latitude, parsedUserGps.longitude),
      );
      setGpsEditorOpen(false);
    }
  }

  async function clearUserGps() {
    if (await onSaveUserGps(dive.id, null)) {
      setUserGpsDraft("");
      setGpsEditorOpen(false);
    }
  }

  async function applySelectedPhotoLocation(
    gps: { latitude: number; longitude: number } | null,
    file: File | null,
    shouldAddPhoto: boolean,
  ) {
    let locationSaved = false;
    if (gps) {
      locationSaved = await onSaveUserGps(dive.id, {
        lat: gps.latitude,
        lng: gps.longitude,
        source: "photo-exif",
      });
      if (locationSaved) {
        setUserGpsDraft(formatCoordinatePair(gps.latitude, gps.longitude));
      }
    }

    const photoAdded = !shouldAddPhoto
      ? null
      : file
        ? Boolean(await onAddPhotoFiles([file]))
        : false;

    if (gps && !locationSaved) {
      setPhotoGpsStatus(t("photoLocationSaveFailed"));
    } else if (locationSaved && photoAdded === true) {
      setPhotoGpsStatus(t("photoLocationSavedAndAdded"));
    } else if (locationSaved && photoAdded === false) {
      setPhotoGpsStatus(t("photoLocationSavedPhotoAddFailed"));
    } else if (locationSaved) {
      setPhotoGpsStatus(t("photoLocationSaved"));
    } else if (photoAdded === true) {
      setPhotoGpsStatus(t("photoAddedWithoutLocation"));
    } else {
      setPhotoGpsStatus(t("noPhotoLocationFound"));
    }
    if (!gps) setPhotoLocationHelpOpen(true);
  }

  async function handleWebPhotoLocationSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || photoGpsBusy) return;
    setPhotoGpsBusy(true);
    setPhotoGpsStatus(t("searchingPhotosForLocation"));
    try {
      const gps = await readPhotoExifGps(await file.arrayBuffer());
      await applySelectedPhotoLocation(gps, file, addLocationPhotoToDive);
    } catch {
      setPhotoGpsStatus(t("photoLocationReadFailed"));
    } finally {
      setPhotoGpsBusy(false);
    }
  }

  async function findLocationFromPhoto() {
    if (photoGpsBusy) return;
    setPhotoGpsStatus(null);

    if (!photoLocationCapability.isAvailable()) {
      // Keep this synchronous with the click so mobile browsers allow the
      // system file picker to open.
      photoLocationInputRef.current?.click();
      return;
    }

    setPhotoGpsBusy(true);
    setPhotoGpsStatus(t("searchingPhotosForLocation"));
    let tempFileUri: string | undefined;
    try {
      const result = await photoLocationCapability.pickPhotoLocation(
        addLocationPhotoToDive,
      );
      tempFileUri = result.tempFileUri;
      if (result.status === "cancelled") {
        setPhotoGpsStatus(null);
        return;
      }
      if (result.status === "permission-denied") {
        setPhotoGpsStatus(t("photoLocationPermissionDenied"));
        return;
      }
      if (result.status === "error") {
        setPhotoGpsStatus(result.message || t("photoLocationReadFailed"));
        return;
      }

      const gps =
        result.status === "found" &&
        Number.isFinite(result.latitude) &&
        Number.isFinite(result.longitude)
          ? { latitude: result.latitude!, longitude: result.longitude! }
          : null;
      const file = addLocationPhotoToDive
        ? await photoLocationCapability.readPickedPhoto(result)
        : null;
      await applySelectedPhotoLocation(gps, file, addLocationPhotoToDive);
    } catch {
      setPhotoGpsStatus(t("photoLocationReadFailed"));
    } finally {
      await photoLocationCapability.releasePickedPhoto(tempFileUri).catch(() => {});
      setPhotoGpsBusy(false);
    }
  }

  const selectedCylinder = cylinderPreset(
    dive.cylinderPresetId ?? defaultCylinderPresetId,
  );
  const cylinderVolumeL = dive.cylinderVolumeL ?? selectedCylinder.volumeL;
  // A merged presentation may span a surface gap or a cylinder change. Keep
  // SAC on the immutable original segments until continuity can be proven.
  const sacRate = dive.mergeGroupId || dive.gasConflict
    ? null
    : calculateSacLitresPerMinute({
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
    if (siteMutationInFlightRef.current) return;
    siteMutationInFlightRef.current = true;
    try {
      if (await onSaveSite(selection)) {
        setManualSite(selection.name);
        if (selection.location !== undefined) {
          setLocationDraft(selection.location ?? "");
        }
        if (selection.latitude !== null && selection.longitude !== null) {
          setUserGpsDraft(
            formatCoordinatePair(selection.latitude, selection.longitude),
          );
        }
        setSitePickerOpen(false);
      }
    } finally {
      siteMutationInFlightRef.current = false;
    }
  }

  function openSiteEditor() {
    if (merged) return;
    setSitePickerOpen(true);
    window.requestAnimationFrame(() => {
      siteEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function saveSiteAndLocation() {
    if (siteMutationInFlightRef.current) return;
    siteMutationInFlightRef.current = true;
    try {
      const name = manualSite.trim();
      const currentSite = (dive.userSite ?? dive.site ?? "").trim();
      if (name && name !== currentSite) {
        const saved = await onSaveSite({
          name,
          source: "manual",
          latitude: mapCoordinates?.latitude ?? null,
          longitude: mapCoordinates?.longitude ?? null,
        });
        if (!saved) return;
      }

      const location = locationDraft.trim() || null;
      if (location !== (dive.location ?? null)) {
        const saved = await onSaveDetails({
          location,
          buddy: dive.buddy ?? null,
          notes: dive.notes ?? null,
        });
        if (!saved) return;
      }

      setSitePickerOpen(false);
    } finally {
      siteMutationInFlightRef.current = false;
    }
  }

  async function clearSiteData() {
    if (siteMutationInFlightRef.current) return;
    siteMutationInFlightRef.current = true;
    try {
      const updated = await onClearSiteOverride();
      if (!updated) return;
      setManualSite(updated.userSite ?? updated.site ?? "");
      setLocationDraft(updated.location ?? "");
      setUserGpsDraft(
        formatCoordinatePair(updated.userGpsLat, updated.userGpsLng),
      );
    } finally {
      siteMutationInFlightRef.current = false;
    }
  }

  return (
    <div className="detail-content">
      {showMemoMatchHints ? (
        <MemoDiveMatchHints
          key={dive.id}
          mode="on-dive"
          dive={dive}
          memos={matchMemos}
          onMemosChange={setMatchMemos}
          onDiveChange={(updated) => {
            setManualSite(updated.userSite ?? updated.site ?? "");
            setLocationDraft(updated.location ?? "");
            setBuddyDraft(updated.buddy ?? "");
            setNotesDraft(updated.notes ?? "");
            onDiveChange(updated);
          }}
        />
      ) : null}

      <div className="detail-hero" id="dive-hero">
        <div className="hero-topline">
          <span>{t("dive")} {dive.diveNumber ?? "—"}</span>
          {dive.memberDiveIds && dive.memberDiveIds.length > 1 ? (
            <span className="merged-segment-badge">
              {t("mergedSegmentsBadge", { count: dive.memberDiveIds.length })}
              {dive.mergeStale ? ` · ${t("staleMergeBadge")}` : ""}
            </span>
          ) : null}
          <span>{formatDate(dive.diveDate, language, t("dateUnknown"))}</span>
        </div>
        <div className="detail-hero-site-row">
          <div className="detail-hero-site-title">
            <h2>{displaySite(dive, t("unnamedDiveSite"))}</h2>
            <button
              type="button"
              className="detail-site-edit-button"
              onClick={openSiteEditor}
              disabled={busy || merged}
              aria-label={t("editSite")}
              title={t("editSite")}
            >
              <Pencil size={17} />
            </button>
          </div>
          <button
            type="button"
            className="button button-secondary compose-hero-button"
            onClick={() => {
              document.getElementById("dive-gallery")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
          >
            <Share2 size={16} /> {t("shareImage")}
          </button>
        </div>
        <div className="detail-hero-actions">
          <p>
            <MapPin size={16} />
            {displayLocation(dive) ||
              (hasGps
                ? gpsNameAttempted
                  ? t("gpsNameUnavailable")
                  : t("resolvingGps")
                : t("locationNotEntered"))}
          </p>
          {onUnmerge ? (
            <div className="merged-segment-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => onToggleOriginalSegments?.()}
              >
                {showOriginalSegments
                  ? t("hideOriginalSegments")
                  : t("showOriginalSegments")}
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => void onUnmerge()}
              >
                {t("unmergeSegments")}
              </button>
            </div>
          ) : null}
          {showOriginalSegments ? (
            <ul className="merge-segment-preview">
              {originalSegments.map((segment) =>
                segment ? (
                  <li key={segment.id}>
                    {t("dive")} {segment.diveNumber ?? "—"} ·{" "}
                    {formatDuration(segment.durationSeconds)} ·{" "}
                    {formatDepth(segment.depth)}
                  </li>
                ) : null,
              )}
            </ul>
          ) : null}
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

      <details
        ref={siteEditorRef}
        className="card site-picker-card site-location-card"
        open={sitePickerOpen}
        onToggle={(event) => {
          if (merged) {
            event.currentTarget.open = false;
            setSitePickerOpen(false);
            return;
          }
          setSitePickerOpen(event.currentTarget.open);
        }}
      >
        <summary
          className="card-heading site-picker-summary"
          onClick={(event) => {
            if (merged) event.preventDefault();
          }}
        >
          <div>
            <p className="eyebrow">{t("siteAndLocation")}</p>
            <h3>{displaySite(dive, t("unnamedDiveSite"))}</h3>
            <small>{t("siteLocationEditorHint")}</small>
          </div>
          <span className="site-picker-toggle">
            {sitePickerOpen ? t("cancel") : t("editSite")} <ChevronDown size={17} />
          </span>
        </summary>
        <div className="site-picker-body">
          <form
            className="site-location-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSiteAndLocation();
            }}
          >
            <div className="details-editor-row location-editor-row">
              <label>
                <span>{t("diveSiteName")}</span>
                <input
                  value={manualSite}
                  onChange={(event) => setManualSite(event.target.value)}
                  list={`site-suggestions-${dive.id}`}
                  placeholder={t("typeSiteName")}
                  maxLength={120}
                />
                <datalist id={`site-suggestions-${dive.id}`}>
                  {siteNameSuggestions.map((site) => (
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
                  placeholder={t("locationNotEntered")}
                  maxLength={160}
                />
                <datalist id={`location-suggestions-${dive.id}`}>
                  {siteLocationSuggestions.map((location) => (
                    <option key={location} value={location} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="site-location-editor-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={busy || !siteLocationDraftDirty}
              >
                {t("saveSite")}
              </button>
              {hasDiveFrameSiteData ? (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => void clearSiteData()}
                  disabled={busy}
                >
                  {t("clearSiteData")}
                </button>
              ) : null}
            </div>
          </form>

          <DiveSiteSuggestions
            coordinates={preferredCoordinates}
            catalog={localDiveSiteCatalog}
            siteName={manualSite}
            hasUserGpsInput={photoGpsBusy || userGpsDraft.trim() !== ""}
            selectedName={dive.userSite}
            selectedCatalogId={dive.userSiteCatalogId}
            busy={busy || photoGpsBusy}
            onSelect={saveSiteAndCollapse}
          />

          <div className="user-gps-editor">
            <div className="user-gps-editor-header">
              <div>
                <p className="eyebrow">{t("location")}</p>
              </div>
              <button
                type="button"
                className="button button-quiet detail-edit-button"
                onClick={() => setGpsEditorOpen((value) => !value)}
                disabled={busy || merged}
              >
                {gpsEditorOpen ? t("cancel") : t("editLocation")}
              </button>
            </div>
            {gpsEditorOpen ? (
              <div className="user-gps-editor-body">
                <label className="coordinate-pair-field">
                  <span>{t("coordinates")}</span>
                  <input
                    type="text"
                    inputMode="text"
                    value={userGpsDraft}
                    onChange={(event) => {
                      setUserGpsDraft(event.target.value);
                      setPhotoGpsStatus(null);
                    }}
                    placeholder="19.09876, 72.87643"
                    aria-invalid={userGpsDraftInvalid}
                    aria-describedby={`coordinate-help-${dive.id}`}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small id={`coordinate-help-${dive.id}`}>{t("coordinatePairHint")}</small>
                </label>
                {userGpsDraftInvalid ? (
                  <p className="coordinate-input-error" role="alert">
                    {t("invalidLocationValues")}
                  </p>
                ) : null}
                <label className="photo-location-keep">
                  <input
                    type="checkbox"
                    checked={
                      dive.exportGpsPreference === "user" &&
                      storedUserCoordinates
                    }
                    disabled={busy || !storedUserCoordinates}
                    onChange={(event) => {
                      void onSaveExportGpsPreference(
                        dive.id,
                        event.target.checked,
                      );
                    }}
                  />
                  <span>{t("preferUserCoordinates")}</span>
                </label>
                <p className="user-gps-preference-hint">
                  {t("preferUserCoordinatesHint")}
                </p>
                <label className="photo-location-keep">
                  <input
                    type="checkbox"
                    checked={addLocationPhotoToDive}
                    onChange={(event) =>
                      setAddLocationPhotoToDive(event.target.checked)
                    }
                    disabled={busy || photoGpsBusy}
                  />
                  <span>{t("addLocationPhotoToDive")}</span>
                </label>
                <div className="user-gps-editor-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy || userGpsDraft.trim() === ""}
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
                    disabled={busy || photoGpsBusy}
                    onClick={() => void findLocationFromPhoto()}
                  >
                    {photoGpsBusy ? <LoaderCircle size={16} className="spin" /> : null}
                    {photoGpsBusy ? t("searchingPhotosForLocation") : t("useLocationFromPhoto")}
                  </button>
                </div>
                <input
                  ref={photoLocationInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.heic,.heif,image/jpeg,image/heic,image/heif"
                  onChange={(event) => void handleWebPhotoLocationSelection(event)}
                  className="visually-hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                />
                {photoGpsStatus ? (
                  <p className="photo-gps-status" role="status">
                    {photoGpsStatus}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </details>

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
                : dive.userGpsSource === "memo"
                  ? t("locationSourceMemo")
                  : dive.userGpsSource === "catalog"
                    ? t("locationSourceCatalog")
                    : dive.userGpsSource === "site-selection"
                      ? t("locationSourceSiteSelection")
                    : t("locationSourceManual")}
            </p>
          )}
          {!mapCoordinates && resolvedLocation && (
            <p className="map-source">
              {t("approximateMatch", { location: resolvedLocation.displayName })}
            </p>
          )}
        </section>

        <section className="card log-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{t("logNotes")}</p>
            </div>
            <button
              type="button"
              className="button button-quiet detail-edit-button"
              onClick={() => {
                resetTripEditorDrafts();
                setEditingDetails((value) => !value);
              }}
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
                  const saved = merged
                    ? true
                    : await onSaveDetails({
                        location: locationDraft.trim() || null,
                        buddy: buddyDraft.trim() || null,
                        notes: notesDraft.trim() || null,
                        cylinderPresetId: cylinderPresetDraft,
                        cylinderVolumeL: cylinderPreset(cylinderPresetDraft).volumeL,
                        startPressureBar: optionalPositiveNumber(startPressureDraft),
                        endPressureBar: optionalPositiveNumber(endPressureDraft),
                      });
                  if (saved) {
                    resetTripEditorDrafts();
                    setEditingDetails(false);
                  }
                })();
              }}
            >
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
                  autoComplete="off"
                  disabled={merged}
                />
              </label>
              {buddySuggestions.length ? (
                <div className="buddy-suggestions" role="listbox" aria-label={t("buddy")}>
                  {buddySuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="buddy-suggestion"
                      role="option"
                      aria-selected={false}
                      disabled={busy || merged}
                      onClick={() =>
                        setBuddyDraft(completeBuddyToken(buddyDraft, name))
                      }
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
              <label>
                <span>{t("notes")}</span>
                <textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  rows={5}
                  maxLength={5000}
                  disabled={merged}
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
                    disabled={merged}
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
                    disabled={merged}
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
                    disabled={merged}
                  />
                </label>
              </div>
              <p>{t("localDetailsHint")}</p>
              <div className="details-editor-actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={busy}
                >
                  {t("saveChanges")}
                </button>
              </div>
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
            <div className="source-row">
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

      <section id="dive-gallery" className="card photos-card">
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
              disabled={busy || merged}
              className="visually-hidden"
            />
          </label>
        </div>

        {attachments.length ? (
          <div className="photo-grid">
            {attachments.map((attachment) => (
              <article className="photo-tile" key={attachment.id}>
                <Link
                  href={`/compose?dive=${encodeURIComponent(attachment.diveId)}&photo=${encodeURIComponent(attachment.id)}`}
                  className="photo-compose-target"
                  aria-label={t("compose")}
                >
                  <LocalPhotoImage
                    attachment={attachment}
                    alt={attachment.caption || `Dive ${dive.diveNumber ?? ""} photo`}
                  />
                </Link>
                <div className="photo-overlay">
                  <span>{attachment.fileName}</span>
                </div>
                <button
                  type="button"
                  className="photo-delete-button"
                  onClick={() => onDeletePhoto(attachment)}
                  disabled={busy || merged}
                  aria-label={t("deletePhoto")}
                  title={t("deletePhoto")}
                >
                  <X size={15} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <>
            <label className="photo-drop">
              <Camera size={28} />
              <strong>{t("bringDiveBack")}</strong>
              <span>{t("choosePhotos")}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onUpload}
                disabled={busy || merged}
                className="visually-hidden"
              />
            </label>
            {sharedBackgrounds.length ? (
              <div className="shared-background-picker">
                <p className="control-hint">{t("chooseSharedBackground")}</p>
                <div className="shared-background-grid">
                  {sharedBackgrounds.map((background) => (
                    <SharedBackgroundChoiceTile
                      key={background.id}
                      background={background}
                      diveId={composeDiveId}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
        <div className="photo-gallery-actions">
          <Link
            href={`/compose?dive=${encodeURIComponent(composeDiveId)}`}
            className="button button-primary"
          >
            <Sparkles size={17} /> {t("createShareImage")}
          </Link>
        </div>
      </section>

      <div className="dive-delete-action">
        <button
          type="button"
          className="button button-danger-secondary"
          disabled={busy}
          onClick={() => setDeleteDiveConfirmOpen(true)}
        >
          {merged ? t("unmergeSegments") : t("deleteDiveLog")}
        </button>
      </div>

      {deleteDiveConfirmOpen ? (
        <div
          className="photo-location-help-backdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setDeleteDiveConfirmOpen(false);
          }}
        >
          <section
            className="photo-location-help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-dive-title-${dive.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="photo-location-help-header">
              <h2 id={`delete-dive-title-${dive.id}`}>
                {merged ? t("deleteMergedIsUnmergeTitle") : t("deleteDiveLogTitle")}
              </h2>
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => setDeleteDiveConfirmOpen(false)}
                aria-label={t("cancel")}
                title={t("cancel")}
              >
                <X size={16} />
              </button>
            </header>
            <p>
              {merged
                ? t("deleteMergedIsUnmergeDescription")
                : t("deleteDiveLogDescription")}
            </p>
            <div className="details-editor-actions">
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => setDeleteDiveConfirmOpen(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    if (await onDeleteDive(dive.id)) {
                      setDeleteDiveConfirmOpen(false);
                    }
                  })();
                }}
              >
                {merged ? t("unmergeSegments") : t("deleteDiveLog")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {photoLocationHelpOpen ? (
        <div
          className="photo-location-help-backdrop"
          role="presentation"
          onClick={() => setPhotoLocationHelpOpen(false)}
        >
          <section
            className="photo-location-help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`photo-location-help-title-${dive.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="photo-location-help-header">
              <h2 id={`photo-location-help-title-${dive.id}`}>
                {t("photoLocationHelpTitle")}
              </h2>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setPhotoLocationHelpOpen(false)}
                aria-label={t("photoLocationHelpClose")}
                title={t("photoLocationHelpClose")}
              >
                <X size={16} />
              </button>
            </header>
            <p>
              {t("photoLocationHelpBody")}{" "}
              <Link href="/android">{t("photoLocationHelpAndroidApp")}</Link>{" "}
              {t("photoLocationHelpBodySuffix")}
              <br />
              {t("photoLocationHelpSocial")}
            </p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setPhotoLocationHelpOpen(false)}
            >
              {t("photoLocationHelpClose")}
            </button>
          </section>
        </div>
      ) : null}
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

function SharedBackgroundChoiceTile({
  background,
  diveId,
  t,
}: {
  background: SharedBackgroundChoice;
  diveId: string;
  t: AppTranslate;
}) {
  const objectUrl = useMemo(
    () => URL.createObjectURL(background.blob),
    [background.blob],
  );
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);
  const sourceLabel =
    background.source === "bundled" ? t("includedBackground") : t("libraryPhoto");
  const label = background.source === "bundled" ? t("bubblesBackground") : background.label;

  return (
    <Link
      className="shared-background-choice"
      href={`/compose?dive=${encodeURIComponent(diveId)}&photo=${encodeURIComponent(background.id)}`}
      aria-label={`${label} · ${sourceLabel}`}
    >
      <span className="shared-background-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={objectUrl} alt="" loading="lazy" />
        <small>{sourceLabel}</small>
      </span>
      <span>{label}</span>
    </Link>
  );
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
  const { colorTheme } = useColorTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showPressure, setShowPressure] = useState(false);
  const normalized = useMemo(() => toNormalizedDive(dive), [dive]);
  const availability = chartAvailability(normalized);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !availability.depth) return;
    const draw = (force = false) => {
      const width = Math.max(320, canvas.clientWidth);
      const height = Math.max(190, Math.min(280, width * 0.34));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.round(width * pixelRatio);
      const nextHeight = Math.round(height * pixelRatio);
      const nextCssHeight = `${height}px`;
      // Skip no-op updates — writing canvas size/style inside ResizeObserver
      // re-triggers observation and can surface the "loop completed" error.
      if (
        !force &&
        canvas.width === nextWidth &&
        canvas.height === nextHeight &&
        canvas.style.height === nextCssHeight
      ) {
        return;
      }
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      canvas.style.height = nextCssHeight;
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
      settings.textColor = colorTheme === "light" ? "#123038" : "#ffffff";
      renderDiveChart(
        context,
        { x: 14, y: 12, width: width - 28, height: height - 18 },
        normalized,
        settings,
      );
    };
    draw(true);
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        draw(false);
      });
    });
    observer.observe(canvas);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    availability.depth,
    availability.pressure,
    colorTheme,
    dive.id,
    language,
    normalized,
    showPressure,
  ]);

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

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatDate(value: string | null, language: AppLanguage, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  const locale =
    language === "zh-Hant" ? "zh-HK" : language === "ja" ? "ja-JP" : "en";
  const datePart = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  // Keep date-only strings as dates; otherwise append 24h HH:MM.
  if (!/[T ]\d{1,2}:\d{2}/.test(value)) return datePart;
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${datePart}, ${timePart}`;
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

function mergeIssueText(
  code: SegmentMergeErrorCode | SegmentMergeWarningCode,
  t: AppTranslate,
) {
  const keys: Record<string, Parameters<AppTranslate>[0]> = {
    "too-few": "mergeErrorSelection",
    "duplicate-id": "mergeErrorSelection",
    overlap: "mergeErrorOverlap",
    "serial-mismatch": "mergeErrorComputer",
    "computer-mismatch": "mergeErrorComputer",
    "unknown-computer": "mergeErrorComputer",
    "category-mismatch": "mergeErrorCategory",
    "dive-mode-mismatch": "mergeErrorCategory",
    "gap-too-large": "mergeErrorGap",
    "missing-start": "mergeErrorDuration",
    "missing-duration": "mergeErrorDuration",
    "missing-serial": "mergeWarningComputerMissing",
    "unknown-dive-mode": "mergeWarningModeUnknown",
    "site-mismatch": "mergeWarningSite",
    "trip-mismatch": "mergeWarningTrip",
    "buddy-mismatch": "mergeWarningBuddy",
    "notes-mismatch": "mergeWarningNotes",
    "gas-conflict": "mergeWarningGas",
    "long-gap": "mergeWarningLongGap",
  };
  const key = keys[code];
  return key ? t(key) : code;
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
