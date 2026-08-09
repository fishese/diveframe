"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
  LoaderCircle,
  Navigation,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppI18n } from "../AppI18nProvider";
import { AppTopbar } from "../components/AppTopbar";
import { MemoDiveMatchHints } from "../components/MemoDiveMatchHints";
import {
  createDiveMemoId,
  compareDiveMemos,
  defaultDiveMemoFields,
  memoFieldsFromHour24,
  memoHour24,
  memoLocalDateTimeFields,
  memoSiteName,
  nextDiveMemoHeading,
  normalizeMemoMinute,
  stepMemoHour24,
  type DiveMemo,
} from "@/lib/dive-memos";
import {
  deleteLocalDiveMemo,
  getLocalSupplementaryCatalog,
  listLocalDiveMemos,
  listLocalDives,
  saveLocalDiveMemo,
  type LocalDive,
} from "@/lib/indexed-db";
import {
  resolveActiveDiveSiteCatalog,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import bundledDiveSiteCatalog from "@/data/dive-sites.json";
import {
  buildSiteNameSuggestions,
  type SiteSelection,
} from "@/lib/dive-site-suggestions";
import { DiveSiteSuggestions } from "../components/DiveSiteSuggestions";
import {
  formatCoordinatePair,
  parseCoordinatePair,
} from "@/lib/coordinate-input";
import { photoLocationCapability } from "@/lib/photo-location-capability";
import { readPhotoExifGps } from "@/lib/photo-exif-gps";
import type { AppTranslate } from "@/lib/app-i18n";

const NOTES_PLACEHOLDER =
  "Note other info such as gas mixes, weight, exposures here";

const MINUTE_SUGGESTIONS = [0, 15, 30, 45] as const;
const SAVE_DEBOUNCE_MS = 400;

function roundCoord(value: number) {
  return Math.round(value * 1e5) / 1e5;
}

export function MemosApp() {
  const { t } = useAppI18n();
  const [memos, setMemos] = useState<DiveMemo[]>([]);
  const [dives, setDives] = useState<LocalDive[]>([]);
  const [supplementaryCatalog, setSupplementaryCatalog] = useState<{
    catalog: DiveSiteCatalog;
  } | null>(null);
  const [status, setStatus] = useState(t("loadingLogbook"));
  const [busy, setBusy] = useState(false);
  const [editingHeadingId, setEditingHeadingId] = useState<string | null>(null);
  const [photoHelpOpen, setPhotoHelpOpen] = useState(false);
  const [scrollToMemoId, setScrollToMemoId] = useState<string | null>(null);
  const webPhotoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetIdRef = useRef<string | null>(null);
  const photoPendingSaveRef = useRef<Promise<DiveMemo | null> | null>(null);

  const refresh = useCallback(async () => {
    const listed = await listLocalDiveMemos();
    if (listed.length === 0) {
      const now = new Date().toISOString();
      const defaults = defaultDiveMemoFields();
      const first: DiveMemo = {
        id: createDiveMemoId(),
        heading: nextDiveMemoHeading([]),
        ...defaults,
        createdAt: now,
        updatedAt: now,
      };
      await saveLocalDiveMemo(first);
      setMemos([first]);
    } else {
      setMemos(listed);
    }
    setStatus("");
  }, []);

  useEffect(() => {
    void refresh().catch((error) => {
      setStatus(error instanceof Error ? error.message : t("unableLoadDives"));
    });
  }, [refresh, t]);

  useEffect(() => {
    void Promise.all([listLocalDives(), getLocalSupplementaryCatalog()])
      .then(([listedDives, supplementary]) => {
        setDives(listedDives);
        setSupplementaryCatalog(supplementary);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : t("unableLoadDives"));
      });
  }, [t]);

  const activeDiveSiteCatalog = useMemo(
    () =>
      resolveActiveDiveSiteCatalog(
        bundledDiveSiteCatalog as DiveSiteCatalog,
        supplementaryCatalog?.catalog ?? null,
      ),
    [supplementaryCatalog],
  );
  const siteNameSuggestions = useMemo(
    () =>
      buildSiteNameSuggestions(
        activeDiveSiteCatalog,
        dives.flatMap((dive) => [dive.userSite, dive.site]),
      ),
    [activeDiveSiteCatalog, dives],
  );

  function handleMemoChange(updated: DiveMemo) {
    setMemos((current) => {
      const without = current.filter((memo) => memo.id !== updated.id);
      return [...without, updated].sort(compareDiveMemos);
    });
  }

  function handleDiveChange(updated: LocalDive) {
    setDives((current) =>
      current.map((dive) => (dive.id === updated.id ? updated : dive)),
    );
  }

  function handleMemoDeleted(id: string) {
    setMemos((current) => {
      const remaining = current.filter((memo) => memo.id !== id);
      if (remaining.length === 0) {
        void refresh();
      }
      return remaining;
    });
  }

  useEffect(() => {
    if (!scrollToMemoId) return;
    const node = document.getElementById(`memo-${scrollToMemoId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    setScrollToMemoId(null);
  }, [scrollToMemoId, memos]);

  async function persist(next: DiveMemo) {
    const stored = await saveLocalDiveMemo({
      ...next,
      minute: normalizeMemoMinute(next.minute),
      hour: next.hour === null || next.hour === undefined ? 10 : next.hour,
      meridiem: next.meridiem || "AM",
      updatedAt: new Date().toISOString(),
    });
    setMemos((current) => {
      const without = current.filter((memo) => memo.id !== stored.id);
      return [...without, stored].sort(compareDiveMemos);
    });
    return stored;
  }

  async function addMemo() {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const defaults = defaultDiveMemoFields();
      const memo: DiveMemo = {
        id: createDiveMemoId(),
        heading: nextDiveMemoHeading(memos),
        ...defaults,
        createdAt: now,
        updatedAt: now,
      };
      await persist(memo);
      setEditingHeadingId(memo.id);
      setScrollToMemoId(memo.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeMemo(id: string) {
    setBusy(true);
    try {
      await deleteLocalDiveMemo(id);
      const remaining = memos.filter((memo) => memo.id !== id);
      if (remaining.length === 0) {
        await refresh();
      } else {
        setMemos(remaining);
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestDeviceGps(
    id: string,
    pendingSave: Promise<DiveMemo | null>,
  ) {
    setBusy(true);
    try {
      const positionRequest = new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error(t("memoGpsUnsupported")));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
        });
      });
      const [position, savedDraft] = await Promise.all([
        positionRequest,
        pendingSave,
      ]);
      const memo = savedDraft ?? memos.find((item) => item.id === id);
      if (!memo) return;
      await persist({
        ...memo,
        lat: roundCoord(position.coords.latitude),
        lng: roundCoord(position.coords.longitude),
      });
      setStatus(t("memoGpsCaptured"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("memoGpsFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function applyPhotoGps(
    id: string,
    gps: { lat: number; lng: number } | null,
    pendingSave: Promise<DiveMemo | null>,
  ) {
    if (!gps) {
      setPhotoHelpOpen(true);
      setStatus(t("noPhotoLocationFound"));
      return;
    }
    const savedDraft = await pendingSave;
    const memo = savedDraft ?? memos.find((item) => item.id === id);
    if (!memo) return;
    await persist({
      ...memo,
      lat: roundCoord(gps.lat),
      lng: roundCoord(gps.lng),
    });
    setStatus(t("memoGpsCaptured"));
  }

  async function pickPhotoGps(
    id: string,
    pendingSave: Promise<DiveMemo | null>,
  ) {
    setBusy(true);
    photoTargetIdRef.current = id;
    photoPendingSaveRef.current = pendingSave;
    try {
      if (photoLocationCapability.isAvailable()) {
        const result = await photoLocationCapability.pickPhotoLocation(false);
        if (result.status === "cancelled") {
          return;
        }
        const gps =
          result.status === "found" &&
          result.latitude != null &&
          result.longitude != null
            ? { lat: result.latitude, lng: result.longitude }
            : null;
        await applyPhotoGps(id, gps, pendingSave);
      } else {
        webPhotoInputRef.current?.click();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("memoGpsFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleWebPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const id = photoTargetIdRef.current;
    const pendingSave = photoPendingSaveRef.current ?? Promise.resolve(null);
    if (!file || !id) return;
    setBusy(true);
    try {
      const gps = await readPhotoExifGps(await file.arrayBuffer());
      await applyPhotoGps(
        id,
        gps ? { lat: gps.latitude, lng: gps.longitude } : null,
        pendingSave,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("memoGpsFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="memos-page">
      <AppTopbar
        subtitle={t("diveMemosTitle")}
        brand={{ mode: "link", href: "/", ariaLabel: t("home") }}
        showHome
        showImportCluster
      />

      <div className="memos-shell">
        <section className="memos-hero">
          <h1>{t("diveMemosTitle")}</h1>
          <p>{t("diveMemosIntro")}</p>
          {status ? <p className="composer-status">{status}</p> : null}
        </section>

        <input
          ref={webPhotoInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          onChange={(event) => void handleWebPhotoChange(event)}
        />

        <button
          type="button"
          className="button button-secondary memos-add"
          disabled={busy}
          onClick={() => void addMemo()}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
          {t("diveMemosAdd")}
        </button>

        <div className="memos-list">
          {memos.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              dives={dives}
              diveSiteCatalog={activeDiveSiteCatalog}
              siteNameSuggestions={siteNameSuggestions}
              busy={busy}
              editingHeading={editingHeadingId === memo.id}
              onEditHeading={() => setEditingHeadingId(memo.id)}
              onHeadingBlur={() => setEditingHeadingId(null)}
              onChange={persist}
              onMemoChange={handleMemoChange}
              onDiveChange={handleDiveChange}
              onMemoDeleted={handleMemoDeleted}
              onDelete={() => void removeMemo(memo.id)}
              onDeviceGps={(pendingSave) =>
                void requestDeviceGps(memo.id, pendingSave)
              }
              onPhotoGps={(pendingSave) =>
                void pickPhotoGps(memo.id, pendingSave)
              }
              t={t}
            />
          ))}
        </div>

        <button
          type="button"
          className="button button-secondary memos-add"
          disabled={busy}
          onClick={() => void addMemo()}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
          {t("diveMemosAdd")}
        </button>
      </div>

      {photoHelpOpen ? (
        <div
          className="photo-location-help-backdrop"
          role="presentation"
          onClick={() => setPhotoHelpOpen(false)}
        >
          <section
            className="photo-location-help-panel"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="photo-location-help-header">
              <h2>{t("photoLocationHelpTitle")}</h2>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setPhotoHelpOpen(false)}
                aria-label={t("photoLocationHelpClose")}
              >
                {t("photoLocationHelpClose")}
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
              onClick={() => setPhotoHelpOpen(false)}
            >
              {t("photoLocationHelpClose")}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function MemoCard({
  memo,
  dives,
  diveSiteCatalog,
  siteNameSuggestions,
  busy,
  editingHeading,
  onEditHeading,
  onHeadingBlur,
  onChange,
  onMemoChange,
  onDiveChange,
  onMemoDeleted,
  onDelete,
  onDeviceGps,
  onPhotoGps,
  t,
}: {
  memo: DiveMemo;
  dives: LocalDive[];
  diveSiteCatalog: DiveSiteCatalog;
  siteNameSuggestions: string[];
  busy: boolean;
  editingHeading: boolean;
  onEditHeading: () => void;
  onHeadingBlur: () => void;
  onChange: (memo: DiveMemo) => Promise<DiveMemo>;
  onMemoChange: (memo: DiveMemo) => void;
  onDiveChange: (dive: LocalDive) => void;
  onMemoDeleted: (id: string) => void;
  onDelete: () => void;
  onDeviceGps: (pendingSave: Promise<DiveMemo | null>) => void;
  onPhotoGps: (pendingSave: Promise<DiveMemo | null>) => void;
  t: AppTranslate;
}) {
  const headingRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(memo);
  const draftRef = useRef(draft);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<DiveMemo | null>>(Promise.resolve(null));
  const onChangeRef = useRef(onChange);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const [coordsDraft, setCoordsDraft] = useState(
    formatCoordinatePair(memo.lat, memo.lng),
  );
  const coordsInvalid =
    coordsDraft.trim() !== "" && parseCoordinatePair(coordsDraft) === null;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Sync draft from parent when GPS or another external action changes the memo.
  // Defer the state update so a user edit that lands first can mark the draft dirty.
  useEffect(() => {
    if (dirtyRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (dirtyRef.current) return;
      draftRef.current = memo;
      setDraft(memo);
      setCoordsDraft(
        formatCoordinatePair(
          memo.lat == null ? null : roundCoord(memo.lat),
          memo.lng == null ? null : roundCoord(memo.lng),
        ),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [memo]);

  useEffect(() => {
    if (editingHeading) headingRef.current?.focus();
  }, [editingHeading]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        saveChainRef.current = saveChainRef.current
          .catch(() => null)
          .then(() => onChangeRef.current(draftRef.current))
          .catch(() => null);
      }
    };
  }, []);

  function queueSave(next: DiveMemo, revision: number) {
    saveChainRef.current = saveChainRef.current
      .catch(() => null)
      .then(() => onChangeRef.current(next))
      .then((stored) => {
        if (mountedRef.current && revisionRef.current === revision) {
          dirtyRef.current = false;
          const synced = { ...draftRef.current, updatedAt: stored.updatedAt };
          draftRef.current = synced;
          setDraft(synced);
        }
        return stored;
      })
      .catch(() => null);
    return saveChainRef.current;
  }

  function scheduleSave(next: DiveMemo) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void queueSave(next, revisionRef.current);
    }, SAVE_DEBOUNCE_MS);
  }

  function updateDraft(patch: Partial<DiveMemo>) {
    const next = { ...draftRef.current, ...patch };
    revisionRef.current += 1;
    dirtyRef.current = true;
    draftRef.current = next;
    setDraft(next);
    onMemoChange(next);
    scheduleSave(next);
  }

  function flushSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return queueSave(draftRef.current, revisionRef.current);
  }

  function commitCoordsDraft() {
    if (coordsDraft.trim() === "") {
      if (draft.lat != null || draft.lng != null) {
        updateDraft({ lat: null, lng: null });
      }
      flushSave();
      return;
    }
    const parsed = parseCoordinatePair(coordsDraft);
    if (!parsed) return;
    updateDraft({
      lat: roundCoord(parsed.latitude),
      lng: roundCoord(parsed.longitude),
    });
    flushSave();
  }

  return (
    <article className="memo-card" id={`memo-${memo.id}`}>
      <header className="memo-card-header">
        {editingHeading ? (
          <input
            ref={headingRef}
            className="memo-heading-input"
            value={draft.heading}
            disabled={busy}
            onChange={(event) => updateDraft({ heading: event.target.value })}
            onBlur={() => {
              flushSave();
              onHeadingBlur();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            aria-label={t("diveMemosHeading")}
          />
        ) : (
          <button
            type="button"
            className="memo-heading-button"
            onClick={onEditHeading}
          >
            {draft.heading || t("diveMemosHeading")}
          </button>
        )}
        <button
          type="button"
          className="button button-quiet"
          disabled={busy}
          onClick={onDelete}
          aria-label={t("deleteMemo")}
          title={t("deleteMemo")}
        >
          <Trash2 size={16} />
        </button>
      </header>

      <div className="memo-field-grid">
        <div className="memo-datetime-row memo-span-2">
          <label className="memo-date-field">
            <span>{t("diveMemosDate")}</span>
            <input
              type="date"
              value={draft.date}
              disabled={busy}
              onChange={(event) => updateDraft({ date: event.target.value })}
              onBlur={flushSave}
            />
          </label>

          <div className="memo-time-row">
            <span>{t("diveMemosTime")}</span>
            <div className="memo-time-controls">
              <button
                type="button"
                className="button button-quiet memo-step-button"
                disabled={busy}
                onClick={() => updateDraft(stepMemoHour24(draft, -1))}
                aria-label={t("diveMemosHourDown")}
              >
                <ChevronLeft size={14} />
              </button>
              <input
                className="memo-hour-input"
                type="number"
                min={0}
                max={23}
                inputMode="numeric"
                value={memoHour24(draft)}
                disabled={busy}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") return;
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  updateDraft(memoFieldsFromHour24(value));
                }}
                onBlur={flushSave}
                aria-label={t("diveMemosHour")}
              />
              <button
                type="button"
                className="button button-quiet memo-step-button"
                disabled={busy}
                onClick={() => updateDraft(stepMemoHour24(draft, 1))}
                aria-label={t("diveMemosHourUp")}
              >
                <ChevronRight size={14} />
              </button>
              <span className="memo-time-colon">:</span>
              <input
                className="memo-minute-input"
                type="number"
                min={0}
                max={59}
                inputMode="numeric"
                list={`memo-minute-suggestions-${memo.id}`}
                value={
                  draft.minute === null || draft.minute === undefined
                    ? ""
                    : String(normalizeMemoMinute(draft.minute)).padStart(2, "0")
                }
                disabled={busy}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") {
                    updateDraft({ minute: null });
                    return;
                  }
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  updateDraft({
                    minute: Math.min(59, Math.max(0, Math.trunc(value))),
                  });
                }}
                onBlur={flushSave}
                aria-label={t("diveMemosMinute")}
              />
              <datalist id={`memo-minute-suggestions-${memo.id}`}>
                {MINUTE_SUGGESTIONS.map((minute) => (
                  <option
                    key={minute}
                    value={String(minute).padStart(2, "0")}
                  />
                ))}
              </datalist>
              <button
                type="button"
                className="button button-secondary memo-compact-button memo-now-button"
                disabled={busy}
                onClick={() => {
                  updateDraft(memoLocalDateTimeFields());
                  void flushSave();
                }}
                aria-label={t("diveMemosNow")}
                title={t("diveMemosNow")}
              >
                <Clock3 size={14} /> {t("diveMemosNow")}
              </button>
            </div>
          </div>
        </div>

        <label className="memo-span-2">
          <span>{t("diveMemosLocation")}</span>
          <input
            type="text"
            value={memoSiteName(draft) ?? ""}
            disabled={busy}
            list={`memo-site-suggestions-${memo.id}`}
            onChange={(event) =>
              updateDraft({
                siteName: event.target.value || null,
                siteSource: event.target.value ? "manual" : null,
                siteCatalogId: null,
                location: null,
              })
            }
            onBlur={flushSave}
          />
          <datalist id={`memo-site-suggestions-${memo.id}`}>
            {siteNameSuggestions.map((site) => (
              <option key={site} value={site} />
            ))}
          </datalist>
        </label>

        <div className="memo-span-2 memo-site-suggestions">
          <DiveSiteSuggestions
            coordinates={
              draft.lat !== null && draft.lng !== null
                ? { latitude: draft.lat, longitude: draft.lng }
                : null
            }
            catalog={diveSiteCatalog}
            selectedName={memoSiteName(draft)}
            selectedCatalogId={draft.siteCatalogId}
            busy={busy}
            onSelect={(selection: SiteSelection) => {
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
              }
              const next = {
                ...draftRef.current,
                siteName: selection.name,
                siteSource: selection.source,
                siteCatalogId: selection.catalogId ?? null,
                location: selection.location?.trim() || null,
              } satisfies DiveMemo;
              revisionRef.current += 1;
              dirtyRef.current = true;
              draftRef.current = next;
              setDraft(next);
              onMemoChange(next);
              void queueSave(next, revisionRef.current);
            }}
          />
        </div>

        <div className="memo-span-2 memo-coords-row">
          <span>{t("diveMemosCoordinates")}</span>
          <div className="memo-coords-controls">
            <input
              className="memo-coords-input"
              type="text"
              value={coordsDraft}
              disabled={busy}
              placeholder="19.09876, 72.87643"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={coordsInvalid}
              onChange={(event) => setCoordsDraft(event.target.value)}
              onBlur={() => commitCoordsDraft()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              aria-label={t("diveMemosCoordinates")}
            />
            <div className="memo-coord-actions">
              <button
                type="button"
                className="button button-secondary memo-compact-button"
                disabled={busy}
                onClick={() => {
                  onDeviceGps(flushSave());
                }}
              >
                <Navigation size={14} /> {t("diveMemosUseGps")}
              </button>
              <button
                type="button"
                className="button button-secondary memo-compact-button"
                disabled={busy}
                onClick={() => {
                  onPhotoGps(flushSave());
                }}
              >
                <ImageIcon size={14} /> {t("diveMemosPhotoGps")}
              </button>
              {draft.lat != null || draft.lng != null ? (
                <button
                  type="button"
                  className="button button-secondary memo-compact-button"
                  disabled={busy}
                  onClick={() => {
                    setCoordsDraft("");
                    updateDraft({ lat: null, lng: null });
                    flushSave();
                  }}
                >
                  {t("diveMemosClearGps")}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <label className="memo-span-2">
          <span>{t("buddy")}</span>
          <input
            type="text"
            value={draft.buddies ?? ""}
            disabled={busy}
            onChange={(event) =>
              updateDraft({ buddies: event.target.value || null })
            }
            onBlur={flushSave}
          />
        </label>

        <label className="memo-span-2">
          <span>{t("notes")}</span>
          <textarea
            rows={3}
            value={draft.notes ?? ""}
            disabled={busy}
            placeholder={NOTES_PLACEHOLDER}
            onChange={(event) =>
              updateDraft({ notes: event.target.value || null })
            }
            onBlur={flushSave}
          />
        </label>
      </div>

      <MemoDiveMatchHints
        mode="on-memo"
        memo={draft}
        dives={dives}
        onDiveChange={onDiveChange}
        onMemoDeleted={onMemoDeleted}
      />
    </article>
  );
}
