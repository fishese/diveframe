"use client";

import Link from "next/link";
import { ArrowLeft, Download, ImagePlus, LoaderCircle, Settings as SettingsIcon, Waves } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultComposerSettings,
  type BlockPosition,
  type ComposerSettings,
  type DisplayField,
} from "@/lib/composer-settings";
import { chartAvailability } from "@/lib/chart-renderer";
import { exportComposition } from "@/lib/exporter";
import { loadPhoto, renderComposition } from "@/lib/image-composer";
import { translate } from "@/lib/i18n";
import {
  getLocalComposerSettings,
  listLocalAttachments,
  listLocalBackgrounds,
  listLocalDives,
  saveLocalComposerSettings,
  updateLocalDiveCategory,
  type LocalAttachment,
  type LocalBackground,
  type LocalDive,
} from "@/lib/indexed-db";
import { toNormalizedDive } from "@/lib/normalize-dive";
import { TEMPLATES } from "@/lib/templates";

type PhotoChoice = {
  id: string;
  label: string;
  source: "dive" | "library";
  blob: Blob;
};

const positions: BlockPosition[] = [
  "top-left", "top-centre", "top-right", "above-graph", "inside-panel",
  "bottom-left", "bottom-centre", "bottom-right", "hidden",
];
const fieldLabels: Array<[DisplayField, Parameters<typeof translate>[1]]> = [
  ["site", "diveSite"], ["category", "category"], ["date", "date"],
  ["startTime", "startTime"], ["duration", "diveTime"], ["maxDepth", "maximumDepth"],
  ["averageDepth", "averageDepth"], ["temperature", "waterTemperature"],
  ["gasMix", "gasMix"], ["startPressure", "startingTankPressure"],
  ["endPressure", "endingTankPressure"], ["coordinates", "coordinates"],
  ["diveNumber", "diveNumber"], ["computerModel", "computerModel"],
];

export function ComposerApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dive, setDive] = useState<LocalDive | null>(null);
  const [photos, setPhotos] = useState<PhotoChoice[]>([]);
  const [settings, setSettings] = useState<ComposerSettings | null>(null);
  const [bitmap, setBitmap] = useState<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const [logo, setLogo] = useState<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const [status, setStatus] = useState("Loading composer…");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requestedDive = parameters.get("dive");
    const requestedPhoto = parameters.get("photo");
    listLocalDives().then(async (dives) => {
      const selectedDive = dives.find((item) => item.id === requestedDive) ?? dives[0];
      if (!selectedDive) throw new Error("Import a dive before opening the composer.");
      const [attachments, backgrounds, saved] = await Promise.all([
        listLocalAttachments(selectedDive.id),
        listLocalBackgrounds(),
        getLocalComposerSettings(selectedDive.id),
      ]);
      const choices = [
        ...attachments.map(photoChoice),
        ...backgrounds.map(backgroundChoice),
      ];
      const initial = { ...defaultComposerSettings(selectedDive.id), ...saved };
      initial.categoryOverride = selectedDive.category;
      initial.selectedPhotoId =
        requestedPhoto && choices.some((item) => item.id === requestedPhoto)
          ? requestedPhoto
          : initial.selectedPhotoId && choices.some((item) => item.id === initial.selectedPhotoId)
            ? initial.selectedPhotoId
            : choices[0]?.id ?? null;
      setDive(selectedDive);
      setPhotos(choices);
      setSettings(initial);
      setStatus(choices.length ? "Ready" : "Add a dive photo or reusable background first.");
    }).catch((error) => setStatus(error instanceof Error ? error.message : "Could not open composer."));
  }, []);

  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === settings?.selectedPhotoId) ?? null,
    [photos, settings?.selectedPhotoId],
  );
  const normalized = useMemo(() => dive ? toNormalizedDive(dive) : null, [dive]);
  const t = useCallback(
    (key: Parameters<typeof translate>[1]) => translate(settings?.language ?? "en", key),
    [settings?.language],
  );

  useEffect(() => {
    if (!selectedPhoto) return;
    let cancelled = false;
    loadPhoto(selectedPhoto.blob).then((loaded) => {
      if (!cancelled) setBitmap(loaded);
    }).catch(() => setStatus("Could not decode this photo."));
    return () => { cancelled = true; };
  }, [selectedPhoto]);

  useEffect(() => {
    if (!canvasRef.current || !bitmap || !normalized || !settings) return;
    const previewRatio = settings.ratio === "original"
      ? bitmap.width / bitmap.height
      : (() => { const [w, h] = settings.ratio.split(":").map(Number); return w / h; })();
    const height = 900;
    renderComposition(canvasRef.current, bitmap, normalized, settings, Math.round(height * previewRatio), height, logo ?? undefined);
  }, [bitmap, normalized, settings, logo]);

  useEffect(() => {
    if (!settings) return;
    const timeout = window.setTimeout(() => saveLocalComposerSettings(settings), 350);
    return () => window.clearTimeout(timeout);
  }, [settings]);

  function update<K extends keyof ComposerSettings>(key: K, value: ComposerSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value, updatedAt: new Date().toISOString() } : current);
  }

  function toggleField(field: DisplayField) {
    setSettings((current) => current ? {
      ...current,
      visibleFields: { ...current.visibleFields, [field]: !current.visibleFields[field] },
    } : current);
  }

  async function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLogo(await loadPhoto(file));
  }

  async function exportImage() {
    if (!bitmap || !normalized || !settings) return;
    setExporting(true);
    setStatus("Rendering high-resolution image…");
    try {
      await exportComposition(bitmap, normalized, settings, logo ?? undefined);
      setStatus("Export ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not export image.");
    } finally {
      setExporting(false);
    }
  }

  if (!dive || !settings) {
    return <main className="composer-loading"><LoaderCircle className="spin" /> {status}</main>;
  }
  const availability = normalized ? chartAvailability(normalized) : { depth: false, pressure: false, temperature: false };

  return (
    <main className="composer-page">
      <header className="composer-topbar">
        <Link href={`/?dive=${encodeURIComponent(dive.id)}`} className="brand">
          <span className="brand-mark"><Waves size={18} /></span>
          <span><strong>DiveFrame</strong><small>{t("composer")}</small></span>
        </Link>
        <div className="composer-top-actions">
          <Link href="/settings" className="button button-quiet"><SettingsIcon size={16} /> Settings</Link>
          <button className="button button-primary" onClick={exportImage} disabled={!bitmap || exporting}>
            {exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />} {t("exportImage")}
          </button>
        </div>
      </header>

      <div className="composer-shell">
        <section className="composer-preview-pane">
          <div className="composer-preview-frame">
            {bitmap ? <canvas ref={canvasRef} aria-label="Live dive image preview" /> : (
              <div className="composer-empty-photo"><ImagePlus size={34} /><p>{status}</p><Link href={`/?dive=${encodeURIComponent(dive.id)}`}>Add a dive photo</Link></div>
            )}
          </div>
          <p className="composer-status" role="status">{status}</p>
          {!availability.depth && (
            <p className="composer-warning">{t("noProfile")}. Re-import your Subsurface log once to add profile samples to older locally stored dives.</p>
          )}
        </section>

        <aside className="composer-controls">
          <Link href={`/?dive=${encodeURIComponent(dive.id)}`} className="composer-back"><ArrowLeft size={15} /> {t("backToDive")}</Link>
          <ControlSection title={t("photo")}>
            <select value={settings.selectedPhotoId ?? ""} onChange={(event) => update("selectedPhotoId", event.target.value)}>
              {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.source === "library" ? "Library · " : "Dive · "}{photo.label}</option>)}
            </select>
            <p className="control-hint"><Link href="/settings">Manage reusable backgrounds</Link></p>
            <Control label="Fit"><select value={settings.photoFit} onChange={(event) => update("photoFit", event.target.value as ComposerSettings["photoFit"])}><option value="fill">Fill</option><option value="fit">Fit</option></select></Control>
            <Range label="Zoom" value={settings.photoZoom} min={0.5} max={3} step={0.05} onChange={(value) => update("photoZoom", value)} />
            <Range label="Horizontal position" value={settings.photoOffsetX} min={-0.5} max={0.5} step={0.01} onChange={(value) => update("photoOffsetX", value)} />
            <Range label="Vertical position" value={settings.photoOffsetY} min={-0.5} max={0.5} step={0.01} onChange={(value) => update("photoOffsetY", value)} />
            <Range label="Rotate" value={settings.photoRotation} min={-180} max={180} step={1} onChange={(value) => update("photoRotation", value)} />
          </ControlSection>

          <ControlSection title={t("template")}>
            <div className="template-picker">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className={settings.templateId === template.id ? "selected" : ""}
                  onClick={() => setSettings((current) => current ? {
                    ...current,
                    templateId: template.id,
                    blockPositions: { ...template.defaultPositions },
                  } : current)}
                >
                  <strong>{template.name}</strong><small>{template.description}</small>
                </button>
              ))}
            </div>
          </ControlSection>

          <ControlSection title={t("content")}>
            <Control label={t("diveSite")}><input value={settings.siteNameOverride} placeholder="Use log / app / GPS name" onChange={(event) => update("siteNameOverride", event.target.value)} /></Control>
            <Control label={t("category")}><select value={settings.categoryOverride} onChange={async (event) => { const category = event.target.value as ComposerSettings["categoryOverride"]; update("categoryOverride", category); setDive(await updateLocalDiveCategory(dive.id, category)); }}><option value="scuba">{t("scuba")}</option><option value="freediving">{t("freediving")}</option><option value="snorkelling">{t("snorkelling")}</option></select></Control>
            <div className="field-grid">
              {fieldLabels.map(([field, key]) => (
                <label key={field} className={!fieldAvailable(field, dive) ? "disabled" : ""}>
                  <input type="checkbox" checked={settings.visibleFields[field]} disabled={!fieldAvailable(field, dive)} onChange={() => toggleField(field)} /> {t(key)}
                </label>
              ))}
            </div>
            {(["site", "category", "date", "chart", "statistics", "logo"] as const).map((block) => (
              <Control key={block} label={`${block[0].toUpperCase()}${block.slice(1)} position`}>
                <select value={settings.blockPositions[block]} onChange={(event) => update("blockPositions", { ...settings.blockPositions, [block]: event.target.value as BlockPosition })}>
                  {positions.map((position) => <option value={position} key={position}>{position.replaceAll("-", " ")}</option>)}
                </select>
              </Control>
            ))}
            <label className="button button-secondary"><ImagePlus size={15} /> Optional logo<input type="file" accept="image/*" className="visually-hidden" onChange={chooseLogo} /></label>
          </ControlSection>

          <ControlSection title={t("chart")}>
            <Control label="Mode"><select value={settings.chartMode} onChange={(event) => update("chartMode", event.target.value as ComposerSettings["chartMode"])}>
              <option value="depth" disabled={!availability.depth}>Depth only</option>
              <option value="depth-pressure" disabled={!availability.pressure}>Depth and tank pressure</option>
              <option value="depth-temperature" disabled={!availability.temperature}>Depth and temperature</option>
              <option value="depth-pressure-temperature" disabled={!availability.pressure || !availability.temperature}>Depth, pressure and temperature</option>
              <option value="hidden">Hidden</option>
            </select></Control>
            <Color label="Depth line" value={settings.depthColor} onChange={(value) => update("depthColor", value)} />
            <Color label="Tank pressure line" value={settings.pressureColor} onChange={(value) => update("pressureColor", value)} />
            <Color label="Temperature line" value={settings.temperatureColor} onChange={(value) => update("temperatureColor", value)} />
            <Range label="Line thickness" value={settings.lineThickness} min={1} max={10} step={0.5} onChange={(value) => update("lineThickness", value)} />
            <Range label="Fill opacity" value={settings.fillOpacity} min={0} max={0.8} step={0.05} onChange={(value) => update("fillOpacity", value)} />
            <Range label="Chart height" value={settings.chartHeight} min={0.12} max={0.48} step={0.01} onChange={(value) => update("chartHeight", value)} />
            {(availability.pressure ||
              dive.tankPressuresStartBar.some((value) => value !== null)) && (
              <p className="control-hint">{t("cannotCalculateGas")}</p>
            )}
          </ControlSection>

          <ControlSection title={t("appearance")}>
            <Control label={t("language")}><select value={settings.language} onChange={(event) => update("language", event.target.value as ComposerSettings["language"])}><option value="en">English</option><option value="zh-Hant">繁體中文</option></select></Control>
            <Control label={t("units")}><select value={settings.units} onChange={(event) => update("units", event.target.value as ComposerSettings["units"])}><option value="metric">Metric</option><option value="imperial">Imperial</option></select></Control>
            <Control label="Date format"><select value={settings.dateFormat} onChange={(event) => update("dateFormat", event.target.value as ComposerSettings["dateFormat"])}><option value="medium">Medium</option><option value="numeric">Numeric</option><option value="iso">ISO</option></select></Control>
            <Control label="Time"><select value={settings.hourCycle} onChange={(event) => update("hourCycle", event.target.value as ComposerSettings["hourCycle"])}><option value="24">24 hour</option><option value="12">12 hour</option></select></Control>
            <Control label="Decimals"><select value={settings.decimals} onChange={(event) => update("decimals", Number(event.target.value) as ComposerSettings["decimals"])}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></Control>
            <Range label="Font size" value={settings.fontSize} min={0.65} max={1.6} step={0.05} onChange={(value) => update("fontSize", value)} />
            <Range label="Panel opacity" value={settings.panelOpacity} min={0} max={1} step={0.05} onChange={(value) => update("panelOpacity", value)} />
            <Range label="Background dimming" value={settings.backgroundDimming} min={0} max={0.8} step={0.05} onChange={(value) => update("backgroundDimming", value)} />
            <Range label="Safe margins" value={settings.safeMargin} min={0.02} max={0.14} step={0.005} onChange={(value) => update("safeMargin", value)} />
            <label className="composer-check"><input type="checkbox" checked={settings.blurBehindText} onChange={(event) => update("blurBehindText", event.target.checked)} /> Blur behind information</label>
            <label className="composer-check"><input type="checkbox" checked={settings.graphGradient} onChange={(event) => update("graphGradient", event.target.checked)} /> Gradient behind graph</label>
          </ControlSection>

          <ControlSection title={t("output")}>
            <Control label="Canvas ratio"><select value={settings.ratio} onChange={(event) => update("ratio", event.target.value as ComposerSettings["ratio"])}>{["original", "1:1", "4:5", "9:16", "16:9"].map((ratio) => <option key={ratio}>{ratio}</option>)}</select></Control>
            <Control label="Resolution"><select value={settings.outputSize} onChange={(event) => update("outputSize", event.target.value as ComposerSettings["outputSize"])}><option value="social">Social media</option><option value="high">High resolution</option><option value="source">Source-photo area</option></select></Control>
            <Control label="Format"><select value={settings.format} onChange={(event) => update("format", event.target.value as ComposerSettings["format"])}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></Control>
            {settings.format === "jpeg" && <Range label="JPEG quality" value={settings.jpegQuality} min={0.5} max={1} step={0.01} onChange={(value) => update("jpegQuality", value)} />}
            <button className="button button-primary composer-export" onClick={exportImage} disabled={!bitmap || exporting}><Download size={16} /> {t("exportImage")}</button>
          </ControlSection>
        </aside>
      </div>
    </main>
  );
}

function ControlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="composer-control-section"><h2>{title}</h2>{children}</section>;
}
function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="composer-control"><span>{label}</span>{children}</label>;
}
function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="composer-control composer-range"><span>{label}<output>{value}</output></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="composer-control color-control"><span>{label}</span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function photoChoice(photo: LocalAttachment): PhotoChoice {
  return { id: photo.id, label: photo.fileName, source: "dive", blob: photo.blob };
}
function backgroundChoice(photo: LocalBackground): PhotoChoice {
  return { id: `background:${photo.id}`, label: photo.fileName, source: "library", blob: photo.blob };
}
function fieldAvailable(field: DisplayField, dive: LocalDive) {
  const checks: Partial<Record<DisplayField, boolean>> = {
    site: Boolean(dive.site || dive.userSite || (dive.gpsEntryLat !== null && dive.gpsEntryLng !== null)),
    date: Boolean(dive.diveDate), startTime: Boolean(dive.diveDate),
    duration: dive.durationSeconds !== null, maxDepth: dive.maxDepthM !== null,
    averageDepth: dive.averageDepth !== null, temperature: dive.waterTemperatureC !== null,
    gasMix: dive.gasMixes.length > 0,
    startPressure: dive.tankPressuresStartBar.some((value) => value !== null),
    endPressure: dive.tankPressuresEndBar.some((value) => value !== null),
    coordinates: dive.gpsEntryLat !== null && dive.gpsEntryLng !== null,
    diveNumber: dive.diveNumber !== null, computerModel: Boolean(dive.computerModel),
  };
  return checks[field] ?? true;
}
