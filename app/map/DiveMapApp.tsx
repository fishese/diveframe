"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Crosshair,
  Database,
  LoaderCircle,
  MapPinned,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import bundledDiveSiteCatalog from "@/data/dive-sites.json";
import {
  buildDiveMapData,
  DIVE_MAP_HEIGHT,
  DIVE_MAP_WIDTH,
  type DiveMapDiveSummary,
  type DiveMapMarker,
} from "@/lib/dive-map";
import {
  buildDiveSiteCoordinateAudit,
  catalogSiteLocation,
  type DiveSiteCoordinateAudit,
  type DiveSiteAuditGroup,
} from "@/lib/dive-map-site-audit";
import {
  applyCatalogSiteCoordinatesToLocalDives,
  getLocalSupplementaryCatalog,
  listLocalDives,
  type LocalDive,
} from "@/lib/indexed-db";
import {
  resolveActiveDiveSiteCatalog,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import { subscribeLocalDataChanges } from "@/lib/cross-tab-sync";
import { useAppI18n } from "../AppI18nProvider";
import { AppTopbar } from "../components/AppTopbar";

type MapView = { x: number; y: number; width: number; height: number };

const WORLD_VIEW: MapView = {
  x: 0,
  y: 0,
  width: DIVE_MAP_WIDTH,
  height: DIVE_MAP_HEIGHT,
};
const MIN_VIEW_WIDTH = 150;

export function DiveMapApp() {
  const { language, t } = useAppI18n();
  const [dives, setDives] = useState<LocalDive[]>([]);
  const [supplementaryCatalog, setSupplementaryCatalog] = useState<{
    catalog: DiveSiteCatalog;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [unmappedOpen, setUnmappedOpen] = useState(false);
  const [siteAudit, setSiteAudit] = useState<DiveSiteCoordinateAudit | null>(null);
  const [siteAuditBusy, setSiteAuditBusy] = useState(false);
  const [applyingAuditKey, setApplyingAuditKey] = useState<string | null>(null);
  const [siteAuditStatus, setSiteAuditStatus] = useState<string | null>(null);
  const [view, setView] = useState<MapView>(WORLD_VIEW);
  const [canvasWidth, setCanvasWidth] = useState(DIVE_MAP_WIDTH);
  const canvasRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startView: MapView;
  } | null>(null);
  const dragMovedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [nextDives, nextSupplementaryCatalog] = await Promise.all([
        listLocalDives(),
        getLocalSupplementaryCatalog(),
      ]);
      setDives(nextDives);
      setSupplementaryCatalog(nextSupplementaryCatalog);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : t("unableLoadDiveMap"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void refresh();
    });
    const unsubscribe = subscribeLocalDataChanges(() => {
      void refresh();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [refresh]);

  const catalog = useMemo(
    () =>
      resolveActiveDiveSiteCatalog(
        bundledDiveSiteCatalog as DiveSiteCatalog,
        supplementaryCatalog?.catalog ?? null,
      ),
    [supplementaryCatalog],
  );
  const mapData = useMemo(
    () => buildDiveMapData(dives, catalog),
    [catalog, dives],
  );
  const selectedMarker = useMemo(
    () =>
      mapData.markers.find((marker) => marker.id === selectedMarkerId) ?? null,
    [mapData.markers, selectedMarkerId],
  );

  const zoom = DIVE_MAP_WIDTH / view.width;
  const pixelsPerMapUnit = canvasWidth / view.width;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const width = canvas.getBoundingClientRect().width;
      if (width > 0) setCanvasWidth(width);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const timer = window.setTimeout(measure, 100);

    observer?.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [error, loading, mapData.mappedDiveCount]);

  function zoomAt(factor: number, anchor?: { x: number; y: number }) {
    setView((current) => {
      const center = anchor ?? {
        x: current.x + current.width / 2,
        y: current.y + current.height / 2,
      };
      const nextWidth = Math.min(
        DIVE_MAP_WIDTH,
        Math.max(MIN_VIEW_WIDTH, current.width / factor),
      );
      const scale = nextWidth / current.width;
      return clampView({
        x: center.x - (center.x - current.x) * scale,
        y: center.y - (center.y - current.y) * scale,
        width: nextWidth,
        height: nextWidth / 2,
      });
    });
  }

  function fitToDives() {
    if (!mapData.markers.length) {
      setView(WORLD_VIEW);
      return;
    }
    const xs = mapData.markers.map((marker) => marker.position.x);
    const ys = mapData.markers.map((marker) => marker.position.y);
    const minimumX = Math.min(...xs);
    const maximumX = Math.max(...xs);
    const minimumY = Math.min(...ys);
    const maximumY = Math.max(...ys);
    const centerX = (minimumX + maximumX) / 2;
    const centerY = (minimumY + maximumY) / 2;
    const contentWidth = Math.max(
      maximumX - minimumX,
      (maximumY - minimumY) * 2,
    );
    const width = Math.min(
      DIVE_MAP_WIDTH,
      Math.max(220, contentWidth * 1.35 + 60),
    );
    setView(
      clampView({
        x: centerX - width / 2,
        y: centerY - width / 4,
        width,
        height: width / 2,
      }),
    );
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const anchor = clientToMapPoint(
      event.currentTarget,
      event.clientX,
      event.clientY,
      view,
    );
    zoomAt(event.deltaY < 0 ? 1.25 : 0.8, anchor);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragMovedRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startView: view,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) dragMovedRef.current = true;
    setView(
      clampView({
        ...drag.startView,
        x: drag.startView.x - (deltaX / rect.width) * drag.startView.width,
        y: drag.startView.y - (deltaY / rect.height) * drag.startView.height,
      }),
    );
  }

  function finishPointer(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function chooseMarker(marker: DiveMapMarker) {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    setSelectedMarkerId(marker.id);
    setUnmappedOpen(false);
  }

  async function runSiteCoordinateAudit() {
    setSiteAuditBusy(true);
    setSiteAuditStatus(null);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    setSiteAudit(buildDiveSiteCoordinateAudit(dives, catalog));
    setSiteAuditBusy(false);
  }

  async function applyAuditCandidate(
    group: DiveSiteAuditGroup,
    candidateIndex: number,
  ) {
    const candidate = group.candidates[candidateIndex];
    if (!candidate) return;
    setApplyingAuditKey(group.key);
    setSiteAuditStatus(null);
    try {
      const updated = await applyCatalogSiteCoordinatesToLocalDives(
        group.dives.map((dive) => dive.id),
        candidate.site,
      );
      const byId = new Map(updated.map((dive) => [dive.id, dive]));
      setDives((current) => current.map((dive) => byId.get(dive.id) ?? dive));
      setSiteAudit((current) =>
        current
          ? {
              ...current,
              matched: current.matched.filter((item) => item.key !== group.key),
              namedDiveCount: Math.max(
                0,
                current.namedDiveCount - group.dives.length,
              ),
            }
          : current,
      );
      setSiteAuditStatus(
        t("catalogCoordinatesApplied", { count: updated.length }),
      );
    } catch (applyError) {
      setSiteAuditStatus(
        applyError instanceof Error
          ? applyError.message
          : t("unableApplyCatalogCoordinates"),
      );
    } finally {
      setApplyingAuditKey(null);
    }
  }

  return (
    <main className="app-shell dive-map-page">
      <AppTopbar
        subtitle={t("diveMap")}
        brand={{ mode: "link", href: "/" }}
        showHome
        showDiveMap={false}
      />
      <div className="dive-map-shell">
        <header className="dive-map-hero">
          <div>
            <p className="eyebrow">{t("diveMapEyebrow")}</p>
            <h1>{t("diveMapTitle")}</h1>
            <p>{t("diveMapDescription")}</p>
          </div>
          {!loading && !error ? (
            <div className="dive-map-summary" aria-live="polite">
              <strong>
                {t(
                  mapData.mappedDiveCount === 1
                    ? "mappedDiveCountOne"
                    : "mappedDivesCount",
                  { count: mapData.mappedDiveCount },
                )}
              </strong>
              <span>·</span>
              <span>
                {t(
                  mapData.placeCount === 1
                    ? "mappedPlaceCountOne"
                    : "mappedPlacesCount",
                  { count: mapData.placeCount },
                )}
              </span>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setUnmappedOpen((current) => !current);
                  setSelectedMarkerId(null);
                }}
                disabled={mapData.unmappableDiveCount === 0}
              >
                {t("unmappedDivesCount", {
                  count: mapData.unmappableDiveCount,
                })}
              </button>
              {mapData.distinctKnownSiteCount > 0 ? (
                <>
                  <span>·</span>
                  <span>
                    {t(
                      mapData.distinctKnownSiteCount === 1
                        ? "knownSiteCountOne"
                        : "knownSitesCount",
                      { count: mapData.distinctKnownSiteCount },
                    )}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </header>

        {loading ? (
          <div className="dive-map-state" role="status">
            <LoaderCircle className="spin" size={24} />
            <p>{t("loadingDiveMap")}</p>
          </div>
        ) : error ? (
          <div className="dive-map-state dive-map-error" role="alert">
            <p>{error}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void refresh()}
            >
              {t("tryAgain")}
            </button>
          </div>
        ) : mapData.mappedDiveCount === 0 ? (
          <div className="dive-map-state dive-map-empty">
            <MapPinned size={30} />
            <h2>{t("noDivesToMap")}</h2>
            <p>{t("noDivesToMapDescription")}</p>
            {mapData.unmappableDiveCount > 0 ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setUnmappedOpen((current) => !current)}
              >
                {t("viewUnmappedDives")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="dive-map-layout">
            <section className="dive-map-card" aria-label={t("diveMap")}>
              <div className="dive-map-toolbar">
                <p>{t("diveMapInstructions")}</p>
                <div className="dive-map-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={fitToDives}
                  >
                    <Crosshair size={16} />
                    {t("fitToDives")}
                  </button>
                  <div
                    className="dive-map-zoom-actions"
                    aria-label={t("mapZoomControls")}
                  >
                    <button
                      type="button"
                      onClick={() => zoomAt(1.6)}
                      disabled={view.width <= MIN_VIEW_WIDTH + 0.01}
                      aria-label={t("zoomIn")}
                      title={t("zoomIn")}
                    >
                      <Plus size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => zoomAt(1 / 1.6)}
                      disabled={view.width >= DIVE_MAP_WIDTH - 0.01}
                      aria-label={t("zoomOut")}
                      title={t("zoomOut")}
                    >
                      <Minus size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView(WORLD_VIEW)}
                      disabled={view.width >= DIVE_MAP_WIDTH - 0.01}
                      aria-label={t("resetMap")}
                      title={t("resetMap")}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <svg
                ref={canvasRef}
                className="dive-map-canvas"
                viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                role="application"
                aria-label={t(
                  mapData.markers.length === 1
                    ? "diveMapCanvasLabelOne"
                    : "diveMapCanvasLabel",
                  { count: mapData.markers.length },
                )}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
              >
                <image
                  href="/maps/world-dive-map.svg"
                  width={DIVE_MAP_WIDTH}
                  height={DIVE_MAP_HEIGHT}
                  aria-hidden="true"
                />
                {mapData.markers.map((marker) => (
                  <DiveMapMarkerView
                    key={marker.id}
                    marker={marker}
                    selected={marker.id === selectedMarkerId}
                    pixelsPerMapUnit={pixelsPerMapUnit}
                    fallbackTitle={t("diveLocation")}
                    ariaLabel={t(
                      marker.diveCount === 1
                        ? "diveMapMarkerLabelOne"
                        : "diveMapMarkerLabel",
                      {
                        place: marker.title ?? t("diveLocation"),
                        count: marker.diveCount,
                      },
                    )}
                    onChoose={() => chooseMarker(marker)}
                  />
                ))}
              </svg>
              <footer className="dive-map-attribution">
                <span>{t("mapMadeWithNaturalEarth")}</span>
                <span>{Math.round(zoom * 10) / 10}×</span>
              </footer>
            </section>

            <aside className="dive-map-details" aria-live="polite">
              {selectedMarker ? (
                <DiveMapDetails
                  marker={selectedMarker}
                  language={language}
                  onClose={() => setSelectedMarkerId(null)}
                />
              ) : unmappedOpen ? (
                <UnmappedDiveList
                  dives={mapData.unmappableDives}
                  language={language}
                  onClose={() => setUnmappedOpen(false)}
                />
              ) : (
                <div className="dive-map-details-placeholder">
                  <MapPinned size={25} />
                  <h2>{t("chooseMapMarker")}</h2>
                  <p>{t("chooseMapMarkerDescription")}</p>
                  <MappedPlaceList
                    markers={mapData.markers}
                    onChoose={chooseMarker}
                  />
                </div>
              )}
            </aside>
          </div>
        )}

        {mapData.mappedDiveCount === 0 && unmappedOpen ? (
          <aside className="dive-map-details dive-map-unmapped-standalone">
            <UnmappedDiveList
              dives={mapData.unmappableDives}
              language={language}
              onClose={() => setUnmappedOpen(false)}
            />
          </aside>
        ) : null}
        {!loading && !error ? (
          <DiveSiteCoordinateAuditPanel
            audit={siteAudit}
            busy={siteAuditBusy}
            applyingKey={applyingAuditKey}
            status={siteAuditStatus}
            language={language}
            onRun={() => void runSiteCoordinateAudit()}
            onApply={(group, candidateIndex) =>
              void applyAuditCandidate(group, candidateIndex)
            }
          />
        ) : null}
      </div>
    </main>
  );
}

function MappedPlaceList({
  markers,
  onChoose,
}: {
  markers: DiveMapMarker[];
  onChoose: (marker: DiveMapMarker) => void;
}) {
  const { t } = useAppI18n();
  return (
    <div className="dive-map-place-list">
      <h3>{t("mappedPlacesTitle")}</h3>
      {markers.map((marker) => (
        <button key={marker.id} type="button" onClick={() => onChoose(marker)}>
          <span>
            <strong>{marker.title ?? t("diveLocation")}</strong>
            {marker.regionName && marker.regionName !== marker.title ? (
              <small>{marker.regionName}</small>
            ) : null}
          </span>
          <b>{marker.diveCount}</b>
        </button>
      ))}
    </div>
  );
}

function DiveSiteCoordinateAuditPanel({
  audit,
  busy,
  applyingKey,
  status,
  language,
  onRun,
  onApply,
}: {
  audit: DiveSiteCoordinateAudit | null;
  busy: boolean;
  applyingKey: string | null;
  status: string | null;
  language: "en" | "zh-Hant" | "ja";
  onRun: () => void;
  onApply: (group: DiveSiteAuditGroup, candidateIndex: number) => void;
}) {
  const { t } = useAppI18n();
  return (
    <section className="dive-site-audit">
      <div className="dive-site-audit-heading">
        <div>
          <p className="eyebrow">{t("needsLocation")}</p>
          <h2>{t("siteCoordinateAuditTitle")}</h2>
          <p>{t("siteCoordinateAuditDescription")}</p>
          <small>{t("siteCoordinateAuditPerformance")}</small>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={onRun}
          disabled={busy || applyingKey !== null}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <Database size={17} />}
          {busy ? t("checkingSiteCoordinates") : t("checkSiteCoordinates")}
        </button>
      </div>
      {status ? <p className="dive-site-audit-status" role="status">{status}</p> : null}
      {audit ? (
        <div className="dive-site-audit-results">
          <p className="dive-site-audit-summary">
            {t("siteCoordinateAuditSummary", { count: audit.namedDiveCount })}
          </p>
          {audit.namedDiveCount === 0 ? (
            <p>{t("noNamedDivesNeedCoordinates")}</p>
          ) : null}
          {audit.matched.length > 0 ? (
            <div className="dive-site-audit-section">
              <h3>{t("siteCoordinateMatchesTitle")}</h3>
              {audit.matched.map((group) => (
                <div className="dive-site-audit-card" key={group.key}>
                  <div className="dive-site-audit-compare">
                    <div className="dive-site-audit-column">
                      <h4>{t("diveLogVersion")}</h4>
                      <dl>
                        <dt>{t("storedSiteName")}</dt>
                        <dd>{group.diveSiteName}</dd>
                        <dt>{t("storedLocationName")}</dt>
                        <dd>{group.diveLocationName ?? t("locationNotEntered")}</dd>
                      </dl>
                      <AuditDiveLinks group={group} language={language} />
                    </div>
                    <div className="dive-site-audit-column">
                      <h4>{t("catalogVersion")}</h4>
                      {group.candidates.map((candidate, candidateIndex) => (
                        <div className="dive-site-audit-candidate" key={candidate.site.id}>
                          <strong>{candidate.site.name}</strong>
                          <span>{catalogSiteLocation(candidate.site) || t("locationNotEntered")}</span>
                          <small>
                            {t("latitude")}: {candidate.site.coordinates.latitude.toFixed(5)} · {t("longitude")}: {candidate.site.coordinates.longitude.toFixed(5)}
                          </small>
                          {candidate.matchedName !== candidate.site.name ? (
                            <small>{t("siteMatchedByAlias", { name: candidate.matchedName })}</small>
                          ) : null}
                          <button
                            className="button button-primary"
                            type="button"
                            disabled={applyingKey !== null}
                            onClick={() => onApply(group, candidateIndex)}
                          >
                            {applyingKey === group.key
                              ? t("applyingCatalogCoordinates")
                              : t("useCatalogCoordinates")}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {audit.notFound.length > 0 ? (
            <div className="dive-site-audit-section dive-site-audit-not-found">
              <h3>{t("siteCoordinateNotFoundTitle")}</h3>
              <p>{t("siteCoordinateNotFoundDescription")}</p>
              {audit.notFound.map((group) => (
                <div className="dive-site-audit-missing" key={group.key}>
                  <span>
                    <strong>{group.diveSiteName}</strong>
                    <small>{group.diveLocationName ?? t("locationNotEntered")}</small>
                  </span>
                  <AuditDiveLinks group={group} language={language} />
                </div>
              ))}
              <Link className="button button-secondary" href="/settings">
                {t("openCatalogSettings")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AuditDiveLinks({
  group,
  language,
}: {
  group: DiveSiteAuditGroup;
  language: "en" | "zh-Hant" | "ja";
}) {
  const { t } = useAppI18n();
  return (
    <div className="dive-site-audit-dives">
      <span>
        {t(
          group.dives.length === 1 ? "affectedDiveCountOne" : "affectedDivesCount",
          { count: group.dives.length },
        )}
      </span>
      {group.dives.map((dive) => (
        <Link key={dive.id} href={`/?dive=${encodeURIComponent(dive.id)}`}>
          {dive.date ? formatDate(dive.date, language) : t("dateUnknown")}
        </Link>
      ))}
    </div>
  );
}

function DiveMapMarkerView({
  marker,
  selected,
  pixelsPerMapUnit,
  fallbackTitle,
  ariaLabel,
  onChoose,
}: {
  marker: DiveMapMarker;
  selected: boolean;
  pixelsPerMapUnit: number;
  fallbackTitle: string;
  ariaLabel: string;
  onChoose: () => void;
}) {
  const radius = (marker.diveCount > 1 ? 12 : 8.5) / pixelsPerMapUnit;
  const hitRadius = 22 / pixelsPerMapUnit;
  const fontSize = 9 / pixelsPerMapUnit;
  return (
    <g
      className={`dive-map-marker${selected ? " selected" : ""}`}
      transform={`translate(${marker.position.x} ${marker.position.y})`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onChoose}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onChoose();
        }
      }}
    >
      <title>{marker.title ?? fallbackTitle}</title>
      <circle className="dive-map-marker-hit" r={hitRadius} />
      <circle className="dive-map-marker-pin" r={radius} />
      {marker.diveCount > 1 ? (
        <text y={fontSize * 0.34} fontSize={fontSize}>
          {marker.diveCount}
        </text>
      ) : (
        <circle className="dive-map-marker-dot" r={2.2 / pixelsPerMapUnit} />
      )}
    </g>
  );
}

function DiveMapDetails({
  marker,
  language,
  onClose,
}: {
  marker: DiveMapMarker;
  language: "en" | "zh-Hant" | "ja";
  onClose: () => void;
}) {
  const { t } = useAppI18n();
  return (
    <div>
      <div className="dive-map-details-heading">
        <div>
          <p className="eyebrow">{t("mappedPlace")}</p>
          <h2>{marker.title ?? t("diveLocation")}</h2>
          {marker.regionName && marker.regionName !== marker.title ? (
            <p>{marker.regionName}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closeMapDetails")}
          title={t("closeMapDetails")}
        >
          <X size={18} />
        </button>
      </div>
      <div className="dive-map-detail-summary">
        <strong>
          {t(
            marker.diveCount === 1 ? "markerDiveCountOne" : "markerDivesCount",
            { count: marker.diveCount },
          )}
        </strong>
        {marker.knownSiteCount > 1 ? (
          <span>· {t("markerSitesCount", { count: marker.knownSiteCount })}</span>
        ) : null}
        {marker.dateFrom ? (
          <span className="dive-map-date-range">
            <CalendarDays size={14} />
            {formatDateRange(marker.dateFrom, marker.dateTo, language)}
          </span>
        ) : null}
      </div>
      <div className="dive-map-dive-list">
        <h3>{marker.sites.length > 1 ? t("divesGroupedBySite") : t("divesAtThisPlace")}</h3>
        {groupDivesBySite(marker.dives, t("unnamedDiveSite")).map((group) => (
          <div className="dive-map-site-dive-group" key={group.key}>
            {marker.dives.length > 1 ? (
              <h4>
                <span>{group.name}</span>
                <strong>{group.dives.length}</strong>
              </h4>
            ) : null}
            {group.dives.map((dive) => (
              <DiveMapDiveLink key={dive.id} dive={dive} language={language} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function UnmappedDiveList({
  dives,
  language,
  onClose,
}: {
  dives: DiveMapDiveSummary[];
  language: "en" | "zh-Hant" | "ja";
  onClose: () => void;
}) {
  const { t } = useAppI18n();
  return (
    <div>
      <div className="dive-map-details-heading">
        <div>
          <p className="eyebrow">{t("needsLocation")}</p>
          <h2>{t("unmappedDiveListTitle")}</h2>
          <p>{t("unmappedDiveListDescription")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closeMapDetails")}
          title={t("closeMapDetails")}
        >
          <X size={18} />
        </button>
      </div>
      <div className="dive-map-dive-list">
        {dives.map((dive) => (
          <DiveMapDiveLink key={dive.id} dive={dive} language={language} />
        ))}
      </div>
    </div>
  );
}

function DiveMapDiveLink({
  dive,
  language,
}: {
  dive: DiveMapDiveSummary;
  language: "en" | "zh-Hant" | "ja";
}) {
  const { t } = useAppI18n();
  const date = dive.date ? formatDate(dive.date, language) : t("dateUnknown");
  const label = dive.siteName ?? dive.locationName ?? t("diveLocation");
  return (
    <Link href={`/?dive=${encodeURIComponent(dive.id)}`}>
      <span>
        <strong>{date}</strong>
        <small>{label}</small>
      </span>
      <ChevronRight size={17} />
    </Link>
  );
}

function groupDivesBySite(
  dives: DiveMapDiveSummary[],
  unnamedSite: string,
) {
  const groups = new Map<
    string,
    { key: string; name: string; dives: DiveMapDiveSummary[] }
  >();
  dives.forEach((dive) => {
    const name = dive.siteName?.trim() || unnamedSite;
    const key = name.toLocaleLowerCase();
    const group = groups.get(key) ?? { key, name, dives: [] };
    group.dives.push(dive);
    groups.set(key, group);
  });
  return [...groups.values()].sort((left, right) =>
    left.name === unnamedSite
      ? 1
      : right.name === unnamedSite
        ? -1
        : left.name.localeCompare(right.name),
  );
}

function clampView(view: MapView): MapView {
  const width = Math.min(DIVE_MAP_WIDTH, Math.max(MIN_VIEW_WIDTH, view.width));
  const height = width / 2;
  return {
    x: Math.min(DIVE_MAP_WIDTH - width, Math.max(0, view.x)),
    y: Math.min(DIVE_MAP_HEIGHT - height, Math.max(0, view.y)),
    width,
    height,
  };
}

function clientToMapPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  view: MapView,
) {
  const rect = svg.getBoundingClientRect();
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.width,
    y: view.y + ((clientY - rect.top) / rect.height) * view.height,
  };
}

function localeFor(language: "en" | "zh-Hant" | "ja") {
  return language === "zh-Hant" ? "zh-HK" : language;
}

function formatDate(value: string, language: "en" | "zh-Hant" | "ja") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateRange(
  from: string,
  to: string | null,
  language: "en" | "zh-Hant" | "ja",
) {
  if (!to || from === to) return formatDate(from, language);
  return `${formatDate(from, language)} – ${formatDate(to, language)}`;
}
