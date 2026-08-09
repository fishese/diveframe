"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Crosshair,
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
      </div>
    </main>
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
      {marker.sites.length > 1 ? (
        <div className="dive-map-site-breakdown">
          <h3>{t("sitesInThisMarker")}</h3>
          <ul>
            {marker.sites.map((site) => (
              <li key={site.id}>
                <span>{site.name}</span>
                <strong>{site.diveCount}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="dive-map-dive-list">
        <h3>{t("divesAtThisPlace")}</h3>
        {marker.dives.map((dive) => (
          <DiveMapDiveLink key={dive.id} dive={dive} language={language} />
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
