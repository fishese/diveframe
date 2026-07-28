"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  Camera,
  ChevronDown,
  ChevronLeft,
  Compass,
  Database as DatabaseIcon,
  Droplets,
  ImagePlus,
  Images,
  LoaderCircle,
  MapPin,
  Search,
  Settings,
  Share2,
  Sparkles,
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
  listLocalAttachments,
  listLocalDives,
  requestPersistentLocalStorage,
  type LocalAttachment,
  type LocalDive,
  type LocalImportedDive,
  updateLocalDiveLocation,
  updateLocalDiveSite,
  upsertLocalDives,
} from "@/lib/indexed-db";
import { readShearwaterDatabase } from "@/lib/parsers/shearwater";
import { readSubsurfaceLog } from "@/lib/parsers/subsurface";
import diveSiteCatalog from "@/data/dive-sites.json";
import type { AppLanguage } from "@/lib/app-i18n";
import { useAppI18n } from "./AppI18nProvider";

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
  name: string;
  aliases?: string[];
  latitude: number;
  longitude: number;
  distanceKm: number;
  source: "catalog" | "openstreetmap";
  notes?: string;
};

type SiteSelection = {
  name: string;
  source: "catalog" | "suggestion" | "manual";
  catalogId?: string;
  latitude: number;
  longitude: number;
};

export function DiveFrameApp() {
  const { language, t } = useAppI18n();
  const [dives, setDives] = useState<Dive[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [query, setQuery] = useState("");
  const [namedOnly, setNamedOnly] = useState(false);
  const [gpsOnly, setGpsOnly] = useState(false);
  const [appSiteOnly, setAppSiteOnly] = useState(false);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [status, setStatus] = useState(t("loadingLogbook"));
  const [busy, setBusy] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const enrichingLocations = useRef(false);

  const refreshDives = useCallback(async (preferredId?: string) => {
    const next = await listLocalDives();
    setDives(next);
    setSelectedId((current) => preferredId ?? current ?? next[0]?.id ?? null);
    setStatus(next.length ? t("divesReady", { count: next.length }) : t("importDiveLog"));
  }, [t]);

  useEffect(() => {
    let active = true;
    listLocalDives()
      .then((next) => {
        if (!active) return;
        setDives(next);
        setSelectedId(next[0]?.id ?? null);
        setStatus(next.length ? t("divesReady", { count: next.length }) : t("importDiveLog"));
        void requestPersistentLocalStorage();
      })
      .catch((error) => {
        if (active) {
          setStatus(error instanceof Error ? error.message : t("unableLoadDives"));
        }
      });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [t]);

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
            `/api/geocode?lat=${encodeURIComponent(String(dive.gpsEntryLat))}&lng=${encodeURIComponent(String(dive.gpsEntryLng))}`,
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

  const visibleDives = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dives
      .filter((dive) => {
        if (namedOnly && !displayLocation(dive)) return false;
        if (gpsOnly && (dive.gpsEntryLat === null || dive.gpsEntryLng === null)) {
          return false;
        }
        if (appSiteOnly && !dive.userSite) return false;
        if (!needle) return true;
        return [
          dive.diveNumber,
          dive.sourceDiveNumbers?.shearwater,
          dive.sourceDiveNumbers?.subsurface,
          dive.userSite,
          dive.site,
          displayLocation(dive),
          dive.buddy,
          dive.notes,
          dive.diveDate,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => compareDivesByDate(a, b, sortDirection));
  }, [appSiteOnly, dives, gpsOnly, namedOnly, query, sortDirection]);

  const stats = useMemo(
    () => ({
      dives: dives.length,
      photos: dives.reduce((sum, dive) => sum + dive.photoCount, 0),
      gps: dives.filter((dive) => dive.gpsEntryLat !== null).length,
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
    }),
    [dives],
  );

  async function importDatabase(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus(t("readingExtract"));
    try {
      const imported = await readDiveImport(file);
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
      } else {
        downloadBlob(blob, fileName);
      }
      setStatus(t("shareCardReady"));
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        setStatus(error instanceof Error ? error.message : t("shareCardFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveDiveSite(selection: SiteSelection) {
    if (!selected) return;
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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("siteSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function chooseDive(id: string) {
    setSelectedId(id);
    setMobileDetail(true);
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
          <span className="status-pill">
            {busy ? <LoaderCircle size={14} className="spin" /> : <Droplets size={14} />}
            {status}
          </span>
          <Link href="/settings" className="button button-quiet">
            <Settings size={16} />
            {t("settings")}
          </Link>
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
            accept=".db,.sqlite,.sqlite3,.ssrf,.xml,application/x-sqlite3,application/xml,text/xml"
            className="visually-hidden"
            onChange={importDatabase}
          />
        </div>
      </header>

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
              <Stat icon={<MapPin size={19} />} value={stats.gps} label={t("mapped")} />
              <Stat icon={<Images size={19} />} value={stats.photos} label={t("photos")} />
              <Stat icon={<Users size={19} />} value={stats.buddies} label={t("buddies")} />
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
                    <span>{t("orderByDate")}</span>
                    <select
                      value={sortDirection}
                      onChange={(event) =>
                        setSortDirection(event.target.value as "desc" | "asc")
                      }
                      aria-label={t("orderByDate")}
                    >
                      <option value="desc">{t("newestFirst")}</option>
                      <option value="asc">{t("oldestFirst")}</option>
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
                    onClick={() => setNamedOnly((value) => !value)}
                    aria-pressed={namedOnly}
                  >
                    <MapPin size={14} /> {t("siteNamed")}
                  </button>
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
                    className={appSiteOnly ? "active" : ""}
                    onClick={() => setAppSiteOnly((value) => !value)}
                    aria-pressed={appSiteOnly}
                  >
                    <Sparkles size={14} /> {t("setInApp")}
                  </button>
                </div>
                {visibleDives.map((dive) => (
                  <button
                    type="button"
                    key={dive.id}
                    className={`dive-row ${dive.id === selectedId ? "active" : ""}`}
                    onClick={() => chooseDive(dive.id)}
                  >
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
                      <span>
                        {dive.photoCount > 0 && <Camera size={13} />}
                        {dive.photoCount || ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="detail-panel">
              {selected ? (
                <DiveDetail
                  key={selected.id}
                  dive={selected}
                  attachments={attachments}
                  busy={busy}
                  onBack={() => setMobileDetail(false)}
                  onUpload={uploadPhotos}
                  onShare={sharePhoto}
                  onSaveSite={saveDiveSite}
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

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="stat">
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function DiveDetail({
  dive,
  attachments,
  busy,
  onBack,
  onUpload,
  onShare,
  onSaveSite,
}: {
  dive: Dive;
  attachments: Attachment[];
  busy: boolean;
  onBack: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onShare: (attachment: Attachment) => void;
  onSaveSite: (site: SiteSelection) => Promise<void>;
}) {
  const { language, t } = useAppI18n();
  const calculated = safeJson(dive.calculatedJson);
  const averageDepth =
    numberFrom(calculated?.AverageDepth) ?? positiveNumber(dive.averageDepth);
  const minTemp = numberFrom(calculated?.MinTemp) ?? positiveNumber(dive.minTemp);
  const hasGps = dive.gpsEntryLat !== null && dive.gpsEntryLng !== null;
  const [manualSite, setManualSite] = useState(dive.userSite ?? dive.site ?? "");
  const [nearbySites, setNearbySites] = useState<NearbySite[] | null>(null);
  const [sitePickerOpen, setSitePickerOpen] = useState(!dive.userSite);
  const locationQuery = [dive.site, dive.location]
    .filter((value, index, values): value is string =>
      Boolean(value && values.indexOf(value) === index),
    )
    .join(", ");
  const [geocodeResult, setGeocodeResult] = useState<{
    query: string;
    location: MapLocation | null;
  } | null>(null);

  useEffect(() => {
    if (hasGps || !locationQuery) return;

    const controller = new AbortController();
    fetch(`/api/geocode?q=${encodeURIComponent(locationQuery)}`, {
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
  }, [dive.id, hasGps, locationQuery]);

  const resolvedLocation =
    geocodeResult?.query === locationQuery ? geocodeResult.location : null;
  const mapLookup =
    hasGps || !locationQuery
      ? "idle"
      : geocodeResult?.query !== locationQuery
        ? "loading"
        : resolvedLocation
          ? "found"
          : "missing";
  const mapLatitude = hasGps ? dive.gpsEntryLat : resolvedLocation?.latitude ?? null;
  const mapLongitude = hasGps ? dive.gpsEntryLng : resolvedLocation?.longitude ?? null;
  const hasMap = mapLatitude !== null && mapLongitude !== null;
  const siteNotes = catalogNotesForDive(dive);

  async function saveSiteAndCollapse(selection: SiteSelection) {
    await onSaveSite(selection);
    setManualSite(selection.name);
    setSitePickerOpen(false);
  }

  useEffect(() => {
    if (!hasGps) return;
    const controller = new AbortController();
    fetch(
      `/api/nearby-sites?lat=${encodeURIComponent(String(dive.gpsEntryLat))}&lng=${encodeURIComponent(String(dive.gpsEntryLng))}`,
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
      .then((sites) =>
        setNearbySites([...sites].sort((a, b) => a.distanceKm - b.distanceKm)),
      )
      .catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") setNearbySites([]);
      });
    return () => controller.abort();
  }, [dive.gpsEntryLat, dive.gpsEntryLng, hasGps]);

  return (
    <div className="detail-content">
      <button type="button" className="mobile-back" onClick={onBack}>
        <ChevronLeft size={18} /> {t("allDives")}
      </button>

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
      </div>

      <div className="detail-grid">
        <section className="card map-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{t("divePosition")}</p>
              <h3>
                {hasGps
                  ? t("entryLocation")
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
          {!hasGps && resolvedLocation && (
            <p className="map-source">
              {t("approximateMatch", { location: resolvedLocation.displayName })}
            </p>
          )}
        </section>

        <section className="card log-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{t("logNotes")}</p>
              <h3>{t("peopleAndMemory")}</h3>
            </div>
          </div>
          <dl className="details-list">
            <div>
              <dt><Users size={16} /> {t("buddy")}</dt>
              <dd>{dive.buddy || t("notEntered")}</dd>
            </div>
            <div>
              <dt><DatabaseIcon size={16} /> {t("computer")}</dt>
              <dd>{dive.computerModel || t("unknown")}</dd>
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
            {siteNotes && (
              <div className="notes-row">
                <dt><MapPin size={16} /> {t("siteNotes")}</dt>
                <dd>{siteNotes}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {hasGps && !dive.site && (
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
                {nearbySites.map((site) => (
                  <button
                    type="button"
                    key={site.id}
                    onClick={() =>
                      void saveSiteAndCollapse({
                        name: site.name,
                        source: site.source === "catalog" ? "catalog" : "suggestion",
                        catalogId:
                          site.source === "catalog"
                            ? site.id.replace(/^catalog-/, "")
                            : undefined,
                        latitude: site.latitude,
                        longitude: site.longitude,
                      })
                    }
                    disabled={busy}
                    aria-pressed={dive.userSiteCatalogId === site.id.replace(/^catalog-/, "")}
                  >
                    <span>{site.name}</span>
                    {site.aliases?.length ? (
                      <em>{site.aliases.join(" / ")}</em>
                    ) : null}
                    <small>
                      {formatDistance(site.distanceKm)}
                      {" · "}
                      {site.source === "catalog" ? t("catalogSource") : t("mapFallback")}
                    </small>
                  </button>
                ))}
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

async function readDiveImport(file: File): Promise<ImportedDive[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "ssrf" || extension === "xml") {
    return readSubsurfaceLog(await file.text());
  }
  return readShearwaterDatabase(file);
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

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
  return source;
}

function sourceDiveNumber(dive: Dive, source: string) {
  if (source !== "shearwater" && source !== "subsurface") return null;
  const number = dive.sourceDiveNumbers?.[source];
  if (number !== undefined && number !== null) return number;
  if (source === "shearwater" && dive.sources.includes("shearwater")) {
    return dive.diveNumber;
  }
  return null;
}

function compareDivesByDate(
  a: Pick<Dive, "diveDate" | "diveNumber">,
  b: Pick<Dive, "diveDate" | "diveNumber">,
  direction: "desc" | "asc",
) {
  const aTime = diveTimestamp(a.diveDate);
  const bTime = diveTimestamp(b.diveDate);
  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime === null) return -1;
  const multiplier = direction === "desc" ? -1 : 1;
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return (aTime - bTime) * multiplier;
  }
  if (a.diveNumber === null && b.diveNumber !== null) return 1;
  if (a.diveNumber !== null && b.diveNumber === null) return -1;
  return ((a.diveNumber ?? 0) - (b.diveNumber ?? 0)) * multiplier;
}

function diveTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
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
  return new Intl.DateTimeFormat(language === "zh-Hant" ? "zh-HK" : "en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function catalogNotesForDive(dive: Dive) {
  const catalogId = dive.userSiteCatalogId;
  if (catalogId) {
    const direct = diveSiteCatalog.sites.find((site) => site.id === catalogId);
    if (direct?.notes) return direct.notes;
  }
  const names = [dive.userSite, dive.site].filter(
    (value): value is string => Boolean(value),
  );
  if (!names.length) return null;
  const normalized = new Set(names.map(normalizeSiteName));
  const match = diveSiteCatalog.sites.find((site) =>
    [site.name, ...(site.aliases ?? [])]
      .map(normalizeSiteName)
      .some((name) => normalized.has(name)),
  );
  return match?.notes ?? null;
}

function normalizeSiteName(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function formatDepth(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)} m` : "—";
}

function formatDuration(value: string | null) {
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
