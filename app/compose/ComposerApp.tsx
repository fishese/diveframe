"use client";

import Link from "next/link";
import { ArrowLeft, BookmarkPlus, ChevronDown, Crop, Download, House, ImagePlus, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  defaultComposerSettings,
  type BlockPosition,
  type ComposerSettings,
  type DisplayField,
} from "@/lib/composer-settings";
import { chartAvailability } from "@/lib/chart-renderer";
import { ensureOverlayFont, getOverlayFont, OVERLAY_FONTS } from "@/lib/composer-fonts";
import {
  applyComposerPreset,
  reusableComposerSettings,
} from "@/lib/composer-presets";
import { exportComposition } from "@/lib/exporter";
import { savedFileNotice } from "@/lib/file-export";
import { loadPhoto, renderComposition } from "@/lib/image-composer";
import type { AppTranslate, AppTranslationKey } from "@/lib/app-i18n";
import {
  getLocalComposerSettings,
  getLocalAppPreferences,
  getLocalOverlayLogo,
  deleteLocalComposerPreset,
  listLocalAttachments,
  listLocalBackgrounds,
  listLocalComposerPresets,
  listLocalDives,
  saveLocalComposerPreset,
  saveLocalComposerSettings,
  saveLocalAppPreferences,
  updateLocalDiveCategory,
  type LocalAttachment,
  type LocalBackground,
  type LocalComposerPreset,
  type LocalDive,
} from "@/lib/indexed-db";
import { toNormalizedDive } from "@/lib/normalize-dive";
import { TEMPLATES } from "@/lib/templates";
import { useAppI18n } from "../AppI18nProvider";

type PhotoChoice = {
  id: string;
  label: string;
  source: "dive" | "library" | "bundled" | "transparent";
  blob: Blob;
};

const BUNDLED_BACKGROUND_ID = "bundled:bubbles";
const TRANSPARENT_BACKGROUND_ID = "background:transparent";

const positions: BlockPosition[] = [
  "top-left", "top-centre", "top-right", "above-graph", "inside-panel",
  "bottom-left", "bottom-centre", "bottom-right", "hidden",
];
const logoPositions = positions.filter((position) => position !== "hidden");
const fieldLabels: Array<[DisplayField, AppTranslationKey]> = [
  ["site", "diveSite"], ["category", "category"], ["date", "date"],
  ["startTime", "startTime"], ["duration", "diveTime"], ["maxDepth", "maximumDepth"],
  ["averageDepth", "averageDepth"], ["temperature", "waterTemperature"],
  ["gasMix", "gasMix"], ["startPressure", "startingTankPressure"],
  ["endPressure", "endingTankPressure"], ["coordinates", "coordinates"],
  ["diveNumber", "diveNumber"], ["computerModel", "computerModel"],
];
const templateTranslationKeys = {
  "bottom-profile": { name: "bottomProfile", description: "bottomProfileDescription" },
  "right-panel": { name: "rightPanel", description: "rightPanelDescription" },
  "full-width-graph": { name: "fullWidthGraph", description: "fullWidthGraphDescription" },
  "landscape-dashboard": { name: "landscapeDashboard", description: "landscapeDashboardDescription" },
  "cinematic-split": { name: "cinematicSplit", description: "cinematicSplitDescription" },
} as const satisfies Record<
  (typeof TEMPLATES)[number]["id"],
  { name: AppTranslationKey; description: AppTranslationKey }
>;

export function ComposerApp() {
  const { t } = useAppI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropDrag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [dive, setDive] = useState<LocalDive | null>(null);
  const [photos, setPhotos] = useState<PhotoChoice[]>([]);
  const [settings, setSettings] = useState<ComposerSettings | null>(null);
  const [presets, setPresets] = useState<LocalComposerPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [bitmap, setBitmap] = useState<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const [logo, setLogo] = useState<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const [status, setStatus] = useState(t("loadingComposer"));
  const [exporting, setExporting] = useState(false);
  const [cropMode, setCropMode] = useState(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requestedDive = parameters.get("dive");
    const requestedPhoto = parameters.get("photo");
    listLocalDives().then(async (dives) => {
      const selectedDive = dives.find((item) => item.id === requestedDive) ?? dives[0];
      if (!selectedDive) throw new Error(t("importBeforeComposer"));
      const [
        attachments,
        backgrounds,
        saved,
        savedLogo,
        savedPresets,
        bundledBackground,
        appPreferences,
      ] = await Promise.all([
        listLocalAttachments(selectedDive.id),
        listLocalBackgrounds(),
        getLocalComposerSettings(selectedDive.id),
        getLocalOverlayLogo(),
        listLocalComposerPresets(),
        loadBundledBackground(),
        getLocalAppPreferences(),
      ]);
      const choices = [
        ...attachments.map(photoChoice),
        ...backgrounds.map(backgroundChoice),
        ...(bundledBackground && !appPreferences?.bundledBackgroundHidden
          ? [bundledBackground]
          : []),
        transparentPhotoChoice(),
      ];
      const initial = { ...defaultComposerSettings(selectedDive.id), ...saved };
      if (!saved) {
        initial.outputSize =
          appPreferences?.lastComposerOutputSize ?? initial.outputSize;
        initial.format = appPreferences?.lastComposerFormat ?? initial.format;
        initial.jpegQuality =
          appPreferences?.lastComposerJpegQuality ?? initial.jpegQuality;
      }
      repairLegacyTemplatePositions(initial);
      initial.fontFamily = getOverlayFont(initial.fontFamily).id;
      if (initial.blockPositions.logo === "hidden") {
        initial.blockPositions = { ...initial.blockPositions, logo: "top-right" };
        if (saved && !("showLogo" in saved)) initial.showLogo = false;
      }
      initial.categoryOverride = selectedDive.category;
      const defaultPhotoId =
        choices.find((item) => item.source !== "transparent")?.id ??
        TRANSPARENT_BACKGROUND_ID;
      initial.selectedPhotoId =
        requestedPhoto && choices.some((item) => item.id === requestedPhoto)
          ? requestedPhoto
          : saved && saved.selectedPhotoId === null
            ? null
          : initial.selectedPhotoId && choices.some((item) => item.id === initial.selectedPhotoId)
            ? initial.selectedPhotoId
            : defaultPhotoId;
      setDive(selectedDive);
      setPhotos(choices);
      setPresets(savedPresets);
      setSettings(initial);
      if (savedLogo) setLogo(await loadPhoto(savedLogo.blob));
      setStatus(choices.length ? t("ready") : t("addPhotoFirst"));
    }).catch((error) => setStatus(error instanceof Error ? error.message : t("composerOpenFailed")));
  }, [t]);

  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === settings?.selectedPhotoId) ?? null,
    [photos, settings?.selectedPhotoId],
  );
  const transparentPhoto = useMemo(
    () => photos.find((photo) => photo.source === "transparent") ?? null,
    [photos],
  );
  const activePhoto = selectedPhoto ?? transparentPhoto;
  const normalized = useMemo(() => dive ? toNormalizedDive(dive) : null, [dive]);
  const lastOutputSize = settings?.outputSize;
  const lastOutputFormat = settings?.format;
  const lastJpegQuality = settings?.jpegQuality;
  useEffect(() => {
    if (!activePhoto) return;
    let cancelled = false;
    loadPhoto(activePhoto.blob).then((loaded) => {
      if (!cancelled) setBitmap(loaded);
    }).catch(() => setStatus(t("photoDecodeFailed")));
    return () => { cancelled = true; };
  }, [activePhoto, t]);

  useEffect(() => {
    if (!canvasRef.current || !bitmap || !normalized || !settings) return;
    const previewRatio = settings.ratio === "original"
      ? bitmap.width / bitmap.height
      : (() => { const [w, h] = settings.ratio.split(":").map(Number); return w / h; })();
    const height = 900;
    let cancelled = false;
    void ensureOverlayFont(settings.fontFamily).finally(() => {
      if (!cancelled && canvasRef.current) {
        renderComposition(canvasRef.current, bitmap, normalized, settings, Math.round(height * previewRatio), height, logo ?? undefined);
        if (cropMode) drawCropGuide(canvasRef.current);
      }
    });
    return () => { cancelled = true; };
  }, [bitmap, normalized, settings, logo, cropMode]);

  useEffect(() => {
    if (!settings) return;
    const timeout = window.setTimeout(() => saveLocalComposerSettings(settings), 350);
    return () => window.clearTimeout(timeout);
  }, [settings]);

  useEffect(() => {
    if (!lastOutputSize || !lastOutputFormat || lastJpegQuality === undefined) return;
    const timeout = window.setTimeout(() => {
      void saveLocalAppPreferences({
        lastComposerOutputSize: lastOutputSize,
        lastComposerFormat: lastOutputFormat,
        lastComposerJpegQuality: lastJpegQuality,
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [lastJpegQuality, lastOutputFormat, lastOutputSize]);

  function update<K extends keyof ComposerSettings>(key: K, value: ComposerSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value, updatedAt: new Date().toISOString() } : current);
  }

  function toggleField(field: DisplayField) {
    setSettings((current) => current ? {
      ...current,
      visibleFields: { ...current.visibleFields, [field]: !current.visibleFields[field] },
    } : current);
  }

  async function savePreset() {
    if (!settings || !presetName.trim()) {
      setStatus(t("enterPresetName"));
      return;
    }
    try {
      const saved = await saveLocalComposerPreset(
        presetName,
        reusableComposerSettings(settings),
      );
      setPresets(await listLocalComposerPresets());
      setSelectedPresetId(saved.id);
      setPresetName(saved.name);
      setStatus(t("composerPresetSaved", { name: saved.name }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("composerPresetSaveFailed"));
    }
  }

  function applySelectedPreset() {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    setSettings((current) =>
      current ? applyComposerPreset(current, preset.settings) : current,
    );
    setStatus(t("composerPresetApplied", { name: preset.name }));
  }

  async function removeSelectedPreset() {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset || !window.confirm(t("deleteComposerPresetConfirm", { name: preset.name }))) {
      return;
    }
    try {
      await deleteLocalComposerPreset(preset.id);
      setPresets((items) => items.filter((item) => item.id !== preset.id));
      setSelectedPresetId("");
      setStatus(t("composerPresetRemoved", { name: preset.name }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("composerPresetRemoveFailed"));
    }
  }

  async function removeBundledBackground() {
    const remaining = photos.filter((photo) => photo.id !== BUNDLED_BACKGROUND_ID);
    setPhotos(remaining);
    if (settings?.selectedPhotoId === BUNDLED_BACKGROUND_ID) {
      update(
        "selectedPhotoId",
        remaining.find((photo) => photo.source !== "transparent")?.id ?? null,
      );
      if (!remaining.length) setBitmap(null);
    }
    try {
      await saveLocalAppPreferences({ bundledBackgroundHidden: true });
      setStatus(
        remaining.length ? t("bundledBackgroundRemoved") : t("addPhotoFirst"),
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : t("settingsSaveFailed"),
      );
    }
  }

  function startCrop() {
    setCropMode(true);
    setSettings((current) => {
      if (!current) return current;
      const photoZoom = Math.max(1, current.photoZoom);
      const offset = constrainCropOffsets(
        current.photoOffsetX,
        current.photoOffsetY,
        bitmap,
        canvasRef.current,
        photoZoom,
      );
      return {
        ...current,
        photoFit: "fill",
        photoZoom,
        photoOffsetX: offset.x,
        photoOffsetY: offset.y,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function resetCrop() {
    setSettings((current) =>
      current
        ? {
            ...current,
            photoFit: "fill",
            photoZoom: 1,
            photoOffsetX: 0,
            photoOffsetY: 0,
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
  }

  function beginCropDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!cropMode || !settings) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDrag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: settings.photoOffsetX,
      offsetY: settings.photoOffsetY,
    };
  }

  function moveCrop(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = cropDrag.current;
    if (!cropMode || !settings || !drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = constrainCropOffsets(
      drag.offsetX + (event.clientX - drag.x) / Math.max(1, bounds.width),
      drag.offsetY + (event.clientY - drag.y) / Math.max(1, bounds.height),
      bitmap,
      event.currentTarget,
      settings.photoZoom,
    );
    setSettings((current) =>
      current
        ? {
            ...current,
            photoOffsetX: offset.x,
            photoOffsetY: offset.y,
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
  }

  function endCropDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (cropDrag.current?.pointerId !== event.pointerId) return;
    cropDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function zoomCrop(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (!cropMode) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 0.08 : -0.08;
    setSettings((current) => {
      if (!current) return current;
      const photoZoom = Math.min(
        3,
        Math.max(1, current.photoZoom + direction),
      );
      const offset = constrainCropOffsets(
        current.photoOffsetX,
        current.photoOffsetY,
        bitmap,
        canvasRef.current,
        photoZoom,
      );
      return {
        ...current,
        photoZoom,
        photoOffsetX: offset.x,
        photoOffsetY: offset.y,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async function exportImage() {
    if (!bitmap || !normalized || !settings) return;
    setExporting(true);
    setStatus(t("renderingImage"));
    try {
      const saved = await exportComposition(
        bitmap,
        normalized,
        settings,
        logo ?? undefined,
      );
      setStatus(savedFileNotice(saved, t) ?? t("exportReady"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("exportFailed"));
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
          <span className="brand-mark">
            <img src="/icons/diveframe-icon.svg" alt="" aria-hidden="true" />
          </span>
          <span><strong>DiveFrame</strong><small>{t("composer")}</small></span>
        </Link>
        <div className="composer-top-actions">
          <Link
            href="/"
            className="button button-quiet composer-home-link"
            aria-label={t("home")}
            title={t("home")}
          >
            <House size={17} />
          </Link>
          <Link
            href={`/?dive=${encodeURIComponent(dive.id)}`}
            className="button button-quiet composer-back-link"
            aria-label={t("backToDives")}
            title={t("backToDives")}
          >
            <ArrowLeft size={17} />
          </Link>
          <button className="button button-primary" onClick={exportImage} disabled={!bitmap || exporting}>
            {exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />} {t("exportImage")}
          </button>
        </div>
      </header>

      <div className="composer-shell">
        <section className="composer-preview-pane">
          <div className="composer-preview-frame">
            {bitmap ? (
              <canvas
                ref={canvasRef}
                aria-label={cropMode ? t("cropPhoto") : t("composer")}
                className={cropMode ? "crop-mode" : ""}
                onPointerDown={beginCropDrag}
                onPointerMove={moveCrop}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
                onWheel={zoomCrop}
              />
            ) : (
              <div className="composer-empty-photo"><ImagePlus size={34} /><p>{status}</p><Link href={`/?dive=${encodeURIComponent(dive.id)}`}>{t("addDivePhoto")}</Link></div>
            )}
          </div>
          <p className="composer-status" role="status">{status}</p>
          {cropMode ? <p className="crop-instructions">{t("cropInstructions")}</p> : null}
          {!availability.depth && (
            <p className="composer-warning">{t("noProfile")}. {t("olderProfileHint")}</p>
          )}
        </section>

        <aside className="composer-controls">
          <ControlSection title={t("photo")} initialOpen>
            <div className="photo-choice-grid" role="listbox" aria-label={t("photo")}>
              {photos.map((photo) => (
                <PhotoChoiceTile
                  key={photo.id}
                  photo={photo}
                  selected={settings.selectedPhotoId === photo.id}
                  onSelect={() =>
                    update(
                      "selectedPhotoId",
                      settings.selectedPhotoId === photo.id ? null : photo.id,
                    )
                  }
                  t={t}
                />
              ))}
            </div>
            <select className="photo-choice-select" value={settings.selectedPhotoId ?? ""} onChange={(event) => update("selectedPhotoId", event.target.value)}>
              {photos.map((photo) => (
                <option key={photo.id} value={photo.id}>
                  {photo.source === "library"
                    ? `${t("libraryPhoto")} · `
                    : photo.source === "bundled"
                      ? `${t("includedBackground")} · `
                      : `${t("divePhoto")} · `}
                  {photo.label}
                </option>
              ))}
            </select>
            <p className="control-hint">
              {selectedPhoto ? t("photoChoiceHint") : t("transparentPhotoSelected")}
              {" Â· "}
              <Link href="/settings">{t("manageBackgrounds")}</Link>
              {selectedPhoto?.source === "bundled" ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="inline-control-button"
                    onClick={() => void removeBundledBackground()}
                  >
                    {t("removeIncludedBackground")}
                  </button>
                </>
              ) : null}
            </p>
            <div className="crop-actions">
              <button
                type="button"
                className={cropMode ? "button button-primary" : "button button-secondary"}
                onClick={() => (cropMode ? setCropMode(false) : startCrop())}
                disabled={!bitmap}
              >
                <Crop size={16} /> {cropMode ? t("finishCrop") : t("cropPhoto")}
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={resetCrop}
                disabled={!bitmap}
              >
                <RotateCcw size={15} /> {t("resetCrop")}
              </button>
            </div>
            <Control label={t("fitMode")}><select value={settings.photoFit} onChange={(event) => update("photoFit", event.target.value as ComposerSettings["photoFit"])}><option value="fill">{t("fill")}</option><option value="fit">{t("fit")}</option></select></Control>
            <Range label={t("zoom")} value={settings.photoZoom} min={cropMode ? 1 : 0.5} max={3} step={0.05} onChange={(value) => update("photoZoom", value)} />
            <Range label={t("horizontalPosition")} value={settings.photoOffsetX} min={-0.5} max={0.5} step={0.01} onChange={(value) => update("photoOffsetX", value)} />
            <Range label={t("verticalPosition")} value={settings.photoOffsetY} min={-0.5} max={0.5} step={0.01} onChange={(value) => update("photoOffsetY", value)} />
            <Range label={t("rotate")} value={settings.photoRotation} min={-180} max={180} step={1} onChange={(value) => update("photoRotation", value)} />
          </ControlSection>

          <ControlSection title={t("template")} initialOpen>
            <div className="template-picker">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className={settings.templateId === template.id ? "selected" : ""}
                  onClick={() => setSettings((current) => current ? {
                    ...current,
                    templateId: template.id,
                    ratio: template.defaultRatio,
                    chartHeight: template.defaultChartHeight,
                    blockPositions: { ...template.defaultPositions },
                  } : current)}
                >
                  <strong>{t(templateTranslationKeys[template.id].name)}</strong><small>{t(templateTranslationKeys[template.id].description)}</small>
                </button>
              ))}
            </div>
          </ControlSection>

          <ControlSection title={t("personalComposerPresets")}>
            <p className="control-hint preset-hint">{t("composerPresetDescription")}</p>
            <div className="preset-save-row">
              <input
                value={presetName}
                aria-label={t("composerPresetName")}
                placeholder={t("composerPresetName")}
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void savePreset();
                }}
              />
              <button
                type="button"
                className="button button-primary"
                onClick={() => void savePreset()}
              >
                <BookmarkPlus size={15} /> {t("savePersonalPreset")}
              </button>
            </div>
            <Control label={t("savedPresets")}>
              <select
                value={selectedPresetId}
                onChange={(event) => {
                  setSelectedPresetId(event.target.value);
                  const preset = presets.find((item) => item.id === event.target.value);
                  if (preset) setPresetName(preset.name);
                }}
              >
                <option value="">{t("choosePreset")}</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
            </Control>
            <div className="preset-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={!selectedPresetId}
                onClick={applySelectedPreset}
              >
                {t("applyPreset")}
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={!selectedPresetId}
                onClick={() => void removeSelectedPreset()}
              >
                <Trash2 size={14} /> {t("deletePreset")}
              </button>
            </div>
          </ControlSection>

          <ControlSection title={t("content")}>
            <Control label={t("diveSite")}><input value={settings.siteNameOverride} placeholder={t("useLogSite")} onChange={(event) => update("siteNameOverride", event.target.value)} /></Control>
            <Control label={t("category")}><select value={settings.categoryOverride} onChange={async (event) => { const category = event.target.value as ComposerSettings["categoryOverride"]; update("categoryOverride", category); setDive(await updateLocalDiveCategory(dive.id, category)); }}><option value="scuba">{t("scuba")}</option><option value="freediving">{t("freediving")}</option><option value="snorkelling">{t("snorkelling")}</option></select></Control>
            <div className="field-grid">
              {fieldLabels.map(([field, key]) => (
                <label key={field} className={!fieldAvailable(field, dive) ? "disabled" : ""}>
                  <input type="checkbox" checked={settings.visibleFields[field]} disabled={!fieldAvailable(field, dive)} onChange={() => toggleField(field)} /> {t(key)}
                </label>
              ))}
            </div>
            {(["site", "category", "date", "chart", "statistics"] as const).map((block) => (
              <Control key={block} label={`${blockLabel(block, t)} ${t("position")}`}>
                <select value={settings.blockPositions[block]} onChange={(event) => update("blockPositions", { ...settings.blockPositions, [block]: event.target.value as BlockPosition })}>
                  {positions.map((position) => <option value={position} key={position}>{positionLabel(position, t)}</option>)}
                </select>
              </Control>
            ))}
          </ControlSection>

          <ControlSection title={t("chart")}>
            <Control label={t("mode")}><select value={settings.chartMode} onChange={(event) => update("chartMode", event.target.value as ComposerSettings["chartMode"])}>
              <option value="depth" disabled={!availability.depth}>{t("depthOnly")}</option>
              <option value="depth-pressure" disabled={!availability.pressure}>{t("depthPressure")}</option>
              <option value="depth-temperature" disabled={!availability.temperature}>{t("depthTemperature")}</option>
              <option value="depth-pressure-temperature" disabled={!availability.pressure || !availability.temperature}>{t("depthPressureTemperature")}</option>
              <option value="hidden">{t("hidden")}</option>
            </select></Control>
            <Color label={t("depthLine")} value={settings.depthColor} onChange={(value) => update("depthColor", value)} />
            <Color label={t("pressureLine")} value={settings.pressureColor} onChange={(value) => update("pressureColor", value)} />
            <Color label={t("temperatureLine")} value={settings.temperatureColor} onChange={(value) => update("temperatureColor", value)} />
            <Range label={t("lineThickness")} value={settings.lineThickness} min={1} max={10} step={0.5} onChange={(value) => update("lineThickness", value)} />
            <Range label={t("fillOpacity")} value={settings.fillOpacity} min={0} max={0.8} step={0.05} onChange={(value) => update("fillOpacity", value)} />
            <Control label={t("depthFillStyle")}><select value={settings.depthFillMode} onChange={(event) => update("depthFillMode", event.target.value as ComposerSettings["depthFillMode"])}><option value="fade">{t("fadeFill")}</option><option value="solid">{t("solidFill")}</option></select></Control>
            <Range label={t("chartHeight")} value={settings.chartHeight} min={0.12} max={0.48} step={0.01} onChange={(value) => update("chartHeight", value)} />
            <label className="composer-check"><input type="checkbox" checked={settings.showAxisLabels} onChange={(event) => update("showAxisLabels", event.target.checked)} /> {t("showAxisLabels")}</label>
            {(availability.pressure ||
              dive.tankPressuresStartBar.some((value) => value !== null)) && (
              <p className="control-hint">{t("cannotCalculateGas")}</p>
            )}
          </ControlSection>

          <ControlSection title={t("logo")}>
            <label className={`composer-check${logo ? "" : " disabled"}`}>
              <input
                type="checkbox"
                checked={settings.showLogo && Boolean(logo)}
                disabled={!logo}
                onChange={(event) => update("showLogo", event.target.checked)}
              />{" "}
              {t("showLogo")}
            </label>
            <Control label={t("logoPosition")}>
              <select
                value={settings.blockPositions.logo}
                disabled={!logo || !settings.showLogo}
                onChange={(event) => update("blockPositions", { ...settings.blockPositions, logo: event.target.value as BlockPosition })}
              >
                {logoPositions.map((position) => <option value={position} key={position}>{positionLabel(position, t)}</option>)}
              </select>
            </Control>
            {logo && settings.showLogo ? (
              <>
                <Range
                  label={t("horizontalPosition")}
                  value={settings.logoOffsetX}
                  min={-0.5}
                  max={0.5}
                  step={0.01}
                  onChange={(value) => update("logoOffsetX", value)}
                />
                <Range
                  label={t("verticalPosition")}
                  value={settings.logoOffsetY}
                  min={-0.5}
                  max={0.5}
                  step={0.01}
                  onChange={(value) => update("logoOffsetY", value)}
                />
              </>
            ) : null}
            <p className="control-hint">
              {logo ? null : `${t("noLogoSaved")} `}
              <Link href="/settings">{logo ? t("changeLogoInSettings") : t("setLogoInSettings")}</Link>
            </p>
          </ControlSection>

          <ControlSection title={t("appearance")}>
            <Control label={t("overlayLanguage")}><select value={settings.language} onChange={(event) => update("language", event.target.value as ComposerSettings["language"])}><option value="en">{t("english")}</option><option value="zh-Hant">{t("traditionalChineseHK")}</option><option value="ja">{t("japanese")}</option></select></Control>
            <Control label={t("fontFamily")}><select value={settings.fontFamily} onChange={(event) => update("fontFamily", event.target.value as ComposerSettings["fontFamily"])}>
              {OVERLAY_FONTS.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}
            </select></Control>
            <p className="font-preview" style={{ fontFamily: getOverlayFont(settings.fontFamily).stack }}>{t("fontPreview")}</p>
            <Color label={t("fontColor")} value={settings.textColor} onChange={(value) => update("textColor", value)} />
            <Control label={t("units")}><select value={settings.units} onChange={(event) => update("units", event.target.value as ComposerSettings["units"])}><option value="metric">{t("metric")}</option><option value="imperial">{t("imperial")}</option></select></Control>
            <Control label={t("dateFormat")}><select value={settings.dateFormat} onChange={(event) => update("dateFormat", event.target.value as ComposerSettings["dateFormat"])}><option value="medium">{t("mediumDate")}</option><option value="numeric">{t("numericDate")}</option><option value="iso">{t("isoDate")}</option></select></Control>
            <Control label={t("timeFormat")}><select value={settings.hourCycle} onChange={(event) => update("hourCycle", event.target.value as ComposerSettings["hourCycle"])}><option value="24">{t("hour24")}</option><option value="12">{t("hour12")}</option></select></Control>
            <Control label={t("decimals")}><select value={settings.decimals} onChange={(event) => update("decimals", Number(event.target.value) as ComposerSettings["decimals"])}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></Control>
            <Control label={t("textAlignment")}><select value={settings.textAlign} onChange={(event) => update("textAlign", event.target.value as ComposerSettings["textAlign"])}><option value="left">{t("left")}</option><option value="centre">{t("centre")}</option><option value="right">{t("right")}</option></select></Control>
            <Control label={t("textContrast")}><select value={settings.textTreatment} onChange={(event) => update("textTreatment", event.target.value as ComposerSettings["textTreatment"])}><option value="shadow">{t("shadow")}</option><option value="outline">{t("outline")}</option><option value="none">{t("none")}</option></select></Control>
            <Range label={t("fontSize")} value={settings.fontSize} min={0.65} max={1.6} step={0.05} onChange={(value) => update("fontSize", value)} />
            <Range label={t("panelOpacity")} value={settings.panelOpacity} min={0} max={1} step={0.05} onChange={(value) => update("panelOpacity", value)} />
            <Range label={t("backgroundDimming")} value={settings.backgroundDimming} min={0} max={0.8} step={0.05} onChange={(value) => update("backgroundDimming", value)} />
            <Range label={t("safeMargins")} value={settings.safeMargin} min={0.02} max={0.14} step={0.005} onChange={(value) => update("safeMargin", value)} />
            <label className="composer-check"><input type="checkbox" checked={settings.blurBehindText} onChange={(event) => update("blurBehindText", event.target.checked)} /> {t("blurBehind")}</label>
            <label className="composer-check"><input type="checkbox" checked={settings.graphGradient} onChange={(event) => update("graphGradient", event.target.checked)} /> {t("gradientBehind")}</label>
          </ControlSection>

          <ControlSection title={t("output")}>
            <Control label={t("canvasRatio")}><select value={settings.ratio} onChange={(event) => update("ratio", event.target.value as ComposerSettings["ratio"])}>{["original", "1:1", "4:5", "9:16", "16:9"].map((ratio) => <option key={ratio}>{ratio === "original" ? t("optionalOriginal") : ratio}</option>)}</select></Control>
            <Control label={t("resolution")}><select value={settings.outputSize} onChange={(event) => update("outputSize", event.target.value as ComposerSettings["outputSize"])}><option value="social">{t("socialMedia")}</option><option value="high">{t("highResolution")}</option><option value="source">{t("sourcePhoto")}</option></select></Control>
            <Control label={t("format")}><select value={settings.format} onChange={(event) => update("format", event.target.value as ComposerSettings["format"])}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></Control>
            {settings.format === "jpeg" && <Range label={t("jpegQuality")} value={settings.jpegQuality} min={0.5} max={1} step={0.01} onChange={(value) => update("jpegQuality", value)} />}
            <button className="button button-primary composer-export" onClick={exportImage} disabled={!bitmap || exporting}><Download size={16} /> {t("exportImage")}</button>
          </ControlSection>
        </aside>
      </div>
    </main>
  );
}

function PhotoChoiceTile({
  photo,
  selected,
  onSelect,
  t,
}: {
  photo: PhotoChoice;
  selected: boolean;
  onSelect: () => void;
  t: AppTranslate;
}) {
  const objectUrl = useMemo(
    () =>
      photo.source === "transparent" ? null : URL.createObjectURL(photo.blob),
    [photo.blob, photo.source],
  );
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );
  const label =
    photo.source === "transparent"
      ? t("transparentBackground")
      : photo.label;
  const sourceLabel =
    photo.source === "library"
      ? t("libraryPhoto")
      : photo.source === "bundled"
        ? t("includedBackground")
        : photo.source === "transparent"
          ? t("transparentBackground")
          : t("divePhoto");
  return (
    <button
      type="button"
      className={`photo-choice-tile ${selected ? "selected" : ""} ${photo.source !== "dive" ? "shared" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      title={selected ? t("clearPhotoSelection") : label}
    >
      <span className="photo-choice-thumb">
        {photo.source === "transparent" ? (
          <span className="photo-choice-transparent" aria-hidden="true" />
        ) : objectUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={objectUrl} alt="" />
        ) : null}
        {photo.source !== "dive" ? (
          <span className="photo-choice-source">{sourceLabel}</span>
        ) : null}
      </span>
      <small>{label}</small>
    </button>
  );
}

function ControlSection({
  title,
  children,
  initialOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <section className="composer-control-section">
      <button
        type="button"
        className="composer-section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <h2>{title}</h2>
        <ChevronDown className={open ? "open" : ""} size={17} />
      </button>
      {open ? <div className="composer-section-body">{children}</div> : null}
    </section>
  );
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
async function loadBundledBackground(): Promise<PhotoChoice | null> {
  try {
    const response = await fetch("/backgrounds/bubbles-bg.jpg");
    if (!response.ok) return null;
    return {
      id: BUNDLED_BACKGROUND_ID,
      label: "Bubbles",
      source: "bundled",
      blob: await response.blob(),
    };
  } catch {
    return null;
  }
}
function photoChoice(photo: LocalAttachment): PhotoChoice {
  return { id: photo.id, label: photo.fileName, source: "dive", blob: photo.blob };
}
function backgroundChoice(photo: LocalBackground): PhotoChoice {
  return {
    id: `background:${photo.id}`,
    label: photo.displayName || photo.fileName,
    source: "library",
    blob: photo.blob,
  };
}

function transparentPhotoChoice(): PhotoChoice {
  return {
    id: TRANSPARENT_BACKGROUND_ID,
    label: "Transparent",
    source: "transparent",
    blob: new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="none"/></svg>',
      ],
      { type: "image/svg+xml" },
    ),
  };
}

function constrainCropOffsets(
  x: number,
  y: number,
  image: (CanvasImageSource & { width: number; height: number }) | null,
  canvas: HTMLCanvasElement | null,
  zoom: number,
) {
  if (!image || !canvas || !canvas.width || !canvas.height) {
    return { x: 0, y: 0 };
  }
  const baseScale = Math.max(
    canvas.width / image.width,
    canvas.height / image.height,
  );
  const drawnWidth = image.width * baseScale * zoom;
  const drawnHeight = image.height * baseScale * zoom;
  const limitX = Math.max(0, (drawnWidth - canvas.width) / (2 * canvas.width));
  const limitY = Math.max(0, (drawnHeight - canvas.height) / (2 * canvas.height));
  return {
    x: Math.min(limitX, Math.max(-limitX, x)),
    y: Math.min(limitY, Math.max(-limitY, y)),
  };
}

function drawCropGuide(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const inset = Math.max(3, Math.round(Math.min(width, height) * 0.015));
  const dash = Math.max(5, width * 0.008);

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.82)";
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.003);
  context.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  context.strokeStyle = "rgba(255, 255, 255, 0.46)";
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.0015);
  context.setLineDash([dash, dash]);
  for (const fraction of [1 / 3, 2 / 3]) {
    const x = inset + (width - inset * 2) * fraction;
    const y = inset + (height - inset * 2) * fraction;
    context.beginPath();
    context.moveTo(x, inset);
    context.lineTo(x, height - inset);
    context.stroke();
    context.beginPath();
    context.moveTo(inset, y);
    context.lineTo(width - inset, y);
    context.stroke();
  }
  context.restore();
}

function repairLegacyTemplatePositions(settings: ComposerSettings) {
  if (["minimal", "poster"].includes(settings.templateId as string)) {
    const replacement = TEMPLATES[0];
    settings.templateId = replacement.id;
    settings.ratio = replacement.defaultRatio;
    settings.chartHeight = replacement.defaultChartHeight;
    settings.blockPositions = { ...replacement.defaultPositions };
  }
  if (
    ["bottom-profile", "full-width-graph"].includes(settings.templateId) &&
    settings.blockPositions.logo === "top-right"
  ) {
    settings.blockPositions = {
      ...settings.blockPositions,
      logo: "top-centre",
    };
  }
  if (
    settings.templateId === "full-width-graph" &&
    settings.blockPositions.chart === "bottom-centre" &&
    settings.blockPositions.statistics === "bottom-centre"
  ) {
    settings.blockPositions = {
      ...settings.blockPositions,
      chart: "above-graph",
      statistics: "inside-panel",
    };
  }
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

function blockLabel(
  block: keyof ComposerSettings["blockPositions"],
  t: AppTranslate,
) {
  const keys = {
    site: "diveSite",
    category: "category",
    date: "date",
    chart: "chart",
    statistics: "statistics",
    logo: "logo",
  } as const;
  return t(keys[block]);
}

function positionLabel(
  position: BlockPosition,
  t: AppTranslate,
) {
  const keys = {
    "top-left": "topLeft",
    "top-centre": "topCentre",
    "top-right": "topRight",
    "above-graph": "aboveGraph",
    "inside-panel": "insidePanel",
    "bottom-left": "bottomLeft",
    "bottom-centre": "bottomCentre",
    "bottom-right": "bottomRight",
    hidden: "hidden",
  } as const;
  return t(keys[position]);
}
