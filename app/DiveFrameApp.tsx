"use client";

import initSqlJs, { type QueryExecResult } from "sql.js";
import {
  ArrowDownToLine,
  Camera,
  ChevronLeft,
  Compass,
  Database as DatabaseIcon,
  Droplets,
  ImagePlus,
  Images,
  LoaderCircle,
  MapPin,
  Search,
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

type Dive = {
  id: string;
  diveNumber: number | null;
  diveDate: string | null;
  lastModified: string | null;
  depth: string | null;
  averageDepth: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  lengthText: string | null;
  location: string | null;
  site: string | null;
  buddy: string | null;
  notes: string | null;
  serialNumber: string | null;
  gpsEntryLat: number | null;
  gpsEntryLng: number | null;
  gpsExitLat: number | null;
  gpsExitLng: number | null;
  calculatedJson: string | null;
  importedAt: string;
  photoCount: number;
};

type Attachment = {
  id: string;
  diveId: string;
  fileName: string;
  contentType: string;
  size: number;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
};

type MapLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
};

type ImportedDive = Omit<Dive, "importedAt" | "photoCount">;

export function DiveFrameApp() {
  const [dives, setDives] = useState<Dive[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading your private logbook…");
  const [busy, setBusy] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const refreshDives = useCallback(async (preferredId?: string) => {
    const response = await fetch("/api/dives", { cache: "no-store" });
    const payload = (await response.json()) as { dives?: Dive[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to load dives.");
    const next = payload.dives ?? [];
    setDives(next);
    setSelectedId((current) => preferredId ?? current ?? next[0]?.id ?? null);
    setStatus(next.length ? `${next.length} dives ready` : "Import a Shearwater extract");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dives", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { dives?: Dive[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load dives.");
        return payload.dives ?? [];
      })
      .then((next) => {
        setDives(next);
        setSelectedId(next[0]?.id ?? null);
        setStatus(next.length ? `${next.length} dives ready` : "Import a Shearwater extract");
      })
      .catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") {
          setStatus(error instanceof Error ? error.message : "Unable to load dives.");
        }
      });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => controller.abort();
  }, []);

  const selected = useMemo(
    () => dives.find((dive) => dive.id === selectedId) ?? null,
    [dives, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/dives/${encodeURIComponent(selectedId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          attachments?: Attachment[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error);
        setAttachments(payload.attachments ?? []);
      })
      .catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") setAttachments([]);
      });
    return () => controller.abort();
  }, [selectedId]);

  const visibleDives = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return dives;
    return dives.filter((dive) =>
      [
        dive.diveNumber,
        dive.site,
        dive.location,
        dive.buddy,
        dive.notes,
        dive.diveDate,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [dives, query]);

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
    setStatus("Reading the extract on this device…");
    try {
      const imported = await readShearwaterDatabase(file);
      setStatus(`Found ${imported.length} dives. Updating your view…`);
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dives: imported }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Import failed.");
      await refreshDives(imported[0]?.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !selected) return;
    setBusy(true);
    setStatus(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("photos", file));
      const response = await fetch(
        `/api/dives/${encodeURIComponent(selected.id)}/photos`,
        { method: "POST", body: formData },
      );
      const responseText = await response.text();
      const payload = parseJsonResponse<{
        attachments?: Attachment[];
        error?: string;
      }>(responseText);
      if (!response.ok) throw new Error(payload.error ?? "Upload failed.");
      setAttachments((current) => [...current, ...(payload.attachments ?? [])]);
      await refreshDives(selected.id);
      setStatus("Photos added");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sharePhoto(attachment: Attachment) {
    if (!selected) return;
    setBusy(true);
    setStatus("Creating your share card…");
    try {
      const blob = await createShareCard(selected, attachment);
      const fileName = `dive-${selected.diveNumber ?? "log"}-share.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: displaySite(selected),
          text: `Dive ${selected.diveNumber ?? ""} · ${formatDate(selected.diveDate)}`,
        });
      } else {
        downloadBlob(blob, fileName);
      }
      setStatus("Share card ready");
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        setStatus(error instanceof Error ? error.message : "Could not create card.");
      }
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
          aria-label="DiveFrame home"
        >
          <span className="brand-mark">
            <Waves size={24} strokeWidth={2.4} />
          </span>
          <span>
            <strong>DiveFrame</strong>
            <small>Shearwater companion</small>
          </span>
        </button>
        <div className="topbar-actions">
          <span className="status-pill">
            {busy ? <LoaderCircle size={14} className="spin" /> : <Droplets size={14} />}
            {status}
          </span>
          <button
            type="button"
            className="button button-primary"
            onClick={() => importInput.current?.click()}
            disabled={busy}
          >
            <Upload size={17} />
            Import extract
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".db,.sqlite,.sqlite3,application/x-sqlite3"
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
              <p className="eyebrow">Private dive archive</p>
              <h1>Your dives, finally given room to breathe.</h1>
              <p>
                Shearwater stays your source of truth. DiveFrame turns each extract
                into a visual logbook for maps, memories, and share-ready stories.
              </p>
            </div>
            <div className="stat-grid">
              <Stat icon={<Compass size={19} />} value={stats.dives} label="dives" />
              <Stat icon={<MapPin size={19} />} value={stats.gps} label="mapped" />
              <Stat icon={<Images size={19} />} value={stats.photos} label="photos" />
              <Stat icon={<Users size={19} />} value={stats.buddies} label="buddies" />
            </div>
          </section>

          <section className={`workspace ${mobileDetail ? "show-detail" : ""}`}>
            <aside className="dive-browser">
              <div className="browser-heading">
                <div>
                  <p className="eyebrow">Logbook</p>
                  <h2>{visibleDives.length} dives</h2>
                </div>
                <div className="search-box">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Site, buddy, notes…"
                    aria-label="Search dives"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="dive-list">
                {visibleDives.map((dive) => (
                  <button
                    type="button"
                    key={dive.id}
                    className={`dive-row ${dive.id === selectedId ? "active" : ""}`}
                    onClick={() => chooseDive(dive.id)}
                  >
                    <span className="dive-number">
                      <small>DIVE</small>
                      {dive.diveNumber ?? "—"}
                    </span>
                    <span className="dive-summary">
                      <strong>{displaySite(dive)}</strong>
                      <span>{formatDate(dive.diveDate)}</span>
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
                  dive={selected}
                  attachments={attachments}
                  busy={busy}
                  onBack={() => setMobileDetail(false)}
                  onUpload={uploadPhotos}
                  onShare={sharePhoto}
                />
              ) : (
                <div className="no-selection">Choose a dive to explore it.</div>
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
  return (
    <section className="empty-state">
      <div className="empty-orbit orbit-one" />
      <div className="empty-orbit orbit-two" />
      <div className="empty-content">
        <span className="empty-icon">
          <DatabaseIcon size={34} />
        </span>
        <p className="eyebrow">Start with your Shearwater export</p>
        <h1>A more visual home for every dive.</h1>
        <p>
          Choose your Shearwater Cloud database. It is read locally in this
          browser; the original file is never changed.
        </p>
        <button
          type="button"
          className="button button-primary button-large"
          onClick={onImport}
          disabled={busy}
        >
          {busy ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}
          Choose database extract
        </button>
        <span className="empty-status">{status}</span>
      </div>
      <div className="empty-proof">
        <span><Sparkles size={16} /> Maps from hidden GNSS fields</span>
        <span><Camera size={16} /> Photos stay linked across imports</span>
        <span><Share2 size={16} /> Share cards made on demand</span>
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
}: {
  dive: Dive;
  attachments: Attachment[];
  busy: boolean;
  onBack: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onShare: (attachment: Attachment) => void;
}) {
  const calculated = safeJson(dive.calculatedJson);
  const averageDepth =
    numberFrom(calculated?.AverageDepth) ?? positiveNumber(dive.averageDepth);
  const minTemp = numberFrom(calculated?.MinTemp) ?? positiveNumber(dive.minTemp);
  const hasGps = dive.gpsEntryLat !== null && dive.gpsEntryLng !== null;
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

  return (
    <div className="detail-content">
      <button type="button" className="mobile-back" onClick={onBack}>
        <ChevronLeft size={18} /> All dives
      </button>

      <div className="detail-hero">
        <div className="hero-topline">
          <span>Dive {dive.diveNumber ?? "—"}</span>
          <span>{formatDate(dive.diveDate)}</span>
        </div>
        <h2>{displaySite(dive)}</h2>
        <p>
          <MapPin size={16} />
          {dive.location || (hasGps ? "GNSS entry recorded" : "Location not entered")}
        </p>
      </div>

      <div className="metric-grid">
        <Metric label="Maximum depth" value={formatDepth(dive.depth)} icon={<Waves />} />
        <Metric
          label="Dive time"
          value={formatDuration(dive.lengthText)}
          icon={<Compass />}
        />
        <Metric
          label="Average depth"
          value={averageDepth ? `${averageDepth.toFixed(1)} m` : "—"}
          icon={<Droplets />}
        />
        <Metric
          label="Minimum temp"
          value={minTemp ? `${minTemp.toFixed(1)} °C` : "—"}
          icon={<Thermometer />}
        />
      </div>

      <div className="detail-grid">
        <section className="card map-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Dive position</p>
              <h3>
                {hasGps
                  ? "Entry location"
                  : hasMap
                    ? "Approximate location"
                    : mapLookup === "loading"
                      ? "Finding this location…"
                      : "No map location found"}
              </h3>
            </div>
            {hasMap && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${mapLatitude}&mlon=${mapLongitude}#map=14/${mapLatitude}/${mapLongitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Open map
              </a>
            )}
          </div>
          {hasMap ? (
            <iframe
              title={`Map for ${displaySite(dive)}`}
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
                  ? `Looking up ${locationQuery}…`
                  : locationQuery
                    ? `No map match was found for ${locationQuery}.`
                    : "This dive has no GNSS coordinate or location name."}
              </p>
            </div>
          )}
          {!hasGps && resolvedLocation && (
            <p className="map-source">
              Approximate match: {resolvedLocation.displayName}
            </p>
          )}
        </section>

        <section className="card log-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Log notes</p>
              <h3>People & memory</h3>
            </div>
          </div>
          <dl className="details-list">
            <div>
              <dt><Users size={16} /> Buddy</dt>
              <dd>{dive.buddy || "Not entered"}</dd>
            </div>
            <div>
              <dt><DatabaseIcon size={16} /> Computer</dt>
              <dd>{dive.serialNumber ? `Serial ${dive.serialNumber}` : "Unknown"}</dd>
            </div>
            <div className="notes-row">
              <dt><Sparkles size={16} /> Notes</dt>
              <dd>{dive.notes || "No notes for this dive yet."}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="card photos-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Dive gallery</p>
            <h3>{attachments.length ? `${attachments.length} memories` : "Add your first photos"}</h3>
          </div>
          <label className="button button-secondary">
            <ImagePlus size={17} />
            Add photos
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
                {/* The API returns private same-origin image data. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${encodeURIComponent(attachment.id)}`}
                  alt={attachment.caption || `Dive ${dive.diveNumber ?? ""} photo`}
                  loading="lazy"
                />
                <div className="photo-overlay">
                  <span>{attachment.fileName}</span>
                  <button
                    type="button"
                    onClick={() => onShare(attachment)}
                    disabled={busy}
                  >
                    <Share2 size={16} /> Share card
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <label className="photo-drop">
            <Camera size={28} />
            <strong>Bring this dive back to life</strong>
            <span>Choose photos from your phone or computer.</span>
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

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

async function readShearwaterDatabase(file: File): Promise<ImportedDive[]> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const database = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const tables = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='dive_details'",
    );
    if (!tables[0]?.values.length) {
      throw new Error("This does not look like a Shearwater Cloud database.");
    }
    const result = database.exec(`
      SELECT d.DiveId, d.DiveNumber, d.DiveDate, d.LastModified,
             d.Depth, d.AverageDepth, d.MinTemp, d.MaxTemp,
             d.DiveLengthTime, d.Location, d.Site, d.Buddy, d.Notes,
             d.SerialNumber, d.GnssEntryLocation, d.GnssExitLocation,
             l.calculated_values_from_samples
      FROM dive_details d
      LEFT JOIN log_data l ON l.log_id = d.DiveId
      ORDER BY d.DiveDate DESC
    `);
    if (!result[0]) return [];
    return rowsFrom(result[0]).map((row) => {
      const entry = locationFrom(row.GnssEntryLocation);
      const exit = locationFrom(row.GnssExitLocation);
      const calculated = safeJson(asString(row.calculated_values_from_samples));
      return {
        id: String(row.DiveId),
        diveNumber: asNumber(row.DiveNumber),
        diveDate: asString(row.DiveDate),
        lastModified: asString(row.LastModified),
        depth: asString(row.Depth),
        averageDepth:
          numberFrom(calculated?.AverageDepth) ?? asNumber(row.AverageDepth),
        minTemp: numberFrom(calculated?.MinTemp) ?? asNumber(row.MinTemp),
        maxTemp: numberFrom(calculated?.MaxTemp) ?? asNumber(row.MaxTemp),
        lengthText: asString(row.DiveLengthTime),
        location: asString(row.Location),
        site: asString(row.Site),
        buddy: asString(row.Buddy),
        notes: asString(row.Notes),
        serialNumber: asString(row.SerialNumber),
        gpsEntryLat: entry?.latitude ?? null,
        gpsEntryLng: entry?.longitude ?? null,
        gpsExitLat: exit?.latitude ?? null,
        gpsExitLng: exit?.longitude ?? null,
        calculatedJson: asString(row.calculated_values_from_samples),
      };
    });
  } finally {
    database.close();
  }
}

function rowsFrom(result: QueryExecResult) {
  return result.values.map((values) =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
  );
}

function locationFrom(value: unknown) {
  const parsed = safeJson(asString(value));
  const latitude = numberFrom(parsed?.Latitude);
  const longitude = numberFrom(parsed?.Longitude);
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

async function createShareCard(dive: Dive, attachment: Attachment) {
  const response = await fetch(`/api/photos/${encodeURIComponent(attachment.id)}`);
  if (!response.ok) throw new Error("The selected photo could not be loaded.");
  const sourceBlob = await response.blob();
  const image = await loadImage(sourceBlob);
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
  context.fillText(`DIVE ${dive.diveNumber ?? "—"}  ·  ${formatDate(dive.diveDate).toUpperCase()}`, 96, 1385);
  context.fillStyle = "#ffffff";
  context.font = "700 78px Arial";
  drawWrappedText(context, displaySite(dive), 96, 1485, width - 192, 86, 2);

  const details = [
    `${formatDepth(dive.depth)} MAX`,
    `${formatDuration(dive.lengthText)} DIVE TIME`,
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

function displaySite(dive: Pick<Dive, "site" | "location">) {
  return dive.site || dive.location || "Unnamed dive site";
}

function formatDate(value: string | null) {
  if (!value) return "Date unknown";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
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

function asString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNumber(value: unknown) {
  const number = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(number)
    ? null
    : number;
}

function parseJsonResponse<T extends { error?: string }>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return { error: value || "The server returned an unexpected response." } as T;
  }
}

function numberFrom(value: unknown) {
  return asNumber(value);
}

function positiveNumber(value: number | null) {
  return value && value > 0 ? value : null;
}
