"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Navigation,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppI18n } from "../AppI18nProvider";
import { AndroidAppLink } from "../components/AndroidAppLink";
import {
  createDiveMemoId,
  defaultDiveMemoFields,
  nextDiveMemoHeading,
  normalizeMemoMinute,
  stepMemoHour,
  type DiveMemo,
  type DiveMemoMinute,
} from "@/lib/dive-memos";
import {
  deleteLocalDiveMemo,
  listLocalDiveMemos,
  saveLocalDiveMemo,
} from "@/lib/indexed-db";
import { photoLocationCapability } from "@/lib/photo-location-capability";
import { readPhotoExifGps } from "@/lib/photo-exif-gps";
import type { AppTranslate } from "@/lib/app-i18n";

const NOTES_PLACEHOLDER =
  "Note other info such as gas mixes, weight, exposures here so you can refer to it after you import the log";

const MINUTE_OPTIONS: DiveMemoMinute[] = [0, 15, 30, 45];

export function MemosApp() {
  const { t } = useAppI18n();
  const [memos, setMemos] = useState<DiveMemo[]>([]);
  const [status, setStatus] = useState(t("loadingLogbook"));
  const [busy, setBusy] = useState(false);
  const [editingHeadingId, setEditingHeadingId] = useState<string | null>(null);
  const [photoHelpOpen, setPhotoHelpOpen] = useState(false);
  const webPhotoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetIdRef = useRef<string | null>(null);

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
      return [...without, stored].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
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

  async function requestDeviceGps(id: string) {
    setBusy(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error(t("memoGpsUnsupported")));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
        });
      });
      const memo = memos.find((item) => item.id === id);
      if (!memo) return;
      await persist({
        ...memo,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setStatus(t("memoGpsCaptured"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("memoGpsFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function applyPhotoGps(id: string, gps: { lat: number; lng: number } | null) {
    if (!gps) {
      setPhotoHelpOpen(true);
      setStatus(t("noPhotoLocationFound"));
      return;
    }
    const memo = memos.find((item) => item.id === id);
    if (!memo) return;
    await persist({ ...memo, lat: gps.lat, lng: gps.lng });
    setStatus(t("memoGpsCaptured"));
  }

  async function pickPhotoGps(id: string) {
    setBusy(true);
    photoTargetIdRef.current = id;
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
        await applyPhotoGps(id, gps);
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
    if (!file || !id) return;
    setBusy(true);
    try {
      const gps = await readPhotoExifGps(await file.arrayBuffer());
      await applyPhotoGps(
        id,
        gps ? { lat: gps.latitude, lng: gps.longitude } : null,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("memoGpsFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="memos-page">
      <header className="topbar">
        <Link href="/" className="brand" aria-label={t("home")}>
          <span className="brand-mark">
            <Image
              src="/icons/diveframe-icon.svg"
              alt=""
              aria-hidden="true"
              width={52}
              height={52}
            />
          </span>
          <span>
            <strong>DiveFrame</strong>
            <small>{t("diveMemosTitle")}</small>
          </span>
        </Link>
        <div className="topbar-actions">
          <AndroidAppLink />
          <Link href="/" className="button button-quiet">
            <ArrowLeft size={16} /> {t("backToDives")}
          </Link>
        </div>
      </header>

      <div className="memos-shell">
        <section className="memos-hero">
          <p className="eyebrow">{t("diveMemosEyebrow")}</p>
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

        <div className="memos-list">
          {memos.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              busy={busy}
              editingHeading={editingHeadingId === memo.id}
              onEditHeading={() => setEditingHeadingId(memo.id)}
              onHeadingBlur={() => setEditingHeadingId(null)}
              onChange={(next) => void persist(next)}
              onDelete={() => void removeMemo(memo.id)}
              onDeviceGps={() => void requestDeviceGps(memo.id)}
              onPhotoGps={() => void pickPhotoGps(memo.id)}
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
  busy,
  editingHeading,
  onEditHeading,
  onHeadingBlur,
  onChange,
  onDelete,
  onDeviceGps,
  onPhotoGps,
  t,
}: {
  memo: DiveMemo;
  busy: boolean;
  editingHeading: boolean;
  onEditHeading: () => void;
  onHeadingBlur: () => void;
  onChange: (memo: DiveMemo) => void;
  onDelete: () => void;
  onDeviceGps: () => void;
  onPhotoGps: () => void;
  t: AppTranslate;
}) {
  const headingRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingHeading) headingRef.current?.focus();
  }, [editingHeading]);

  return (
    <article className="memo-card">
      <header className="memo-card-header">
        {editingHeading ? (
          <input
            ref={headingRef}
            className="memo-heading-input"
            value={memo.heading}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...memo, heading: event.target.value })
            }
            onBlur={onHeadingBlur}
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
            {memo.heading || t("diveMemosHeading")}
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
        <label>
          <span>{t("diveMemosDate")}</span>
          <input
            type="date"
            value={memo.date}
            disabled={busy}
            onChange={(event) => onChange({ ...memo, date: event.target.value })}
          />
        </label>

        <div className="memo-time-row">
          <span>{t("diveMemosTime")}</span>
          <div className="memo-time-controls">
            <div className="memo-stepper">
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() =>
                  onChange({
                    ...memo,
                    hour: stepMemoHour(memo.hour, 1),
                  })
                }
                aria-label={t("diveMemosHourUp")}
              >
                <ChevronUp size={14} />
              </button>
              <input
                type="number"
                min={1}
                max={12}
                value={memo.hour ?? ""}
                disabled={busy}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") {
                    onChange({ ...memo, hour: null });
                    return;
                  }
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  const clamped = Math.min(12, Math.max(1, Math.trunc(value)));
                  onChange({ ...memo, hour: clamped });
                }}
                aria-label={t("diveMemosHour")}
              />
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() =>
                  onChange({
                    ...memo,
                    hour: stepMemoHour(memo.hour, -1),
                  })
                }
                aria-label={t("diveMemosHourDown")}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <span className="memo-time-colon">:</span>
            <select
              value={normalizeMemoMinute(memo.minute)}
              disabled={busy}
              onChange={(event) =>
                onChange({
                  ...memo,
                  minute: Number(event.target.value) as DiveMemoMinute,
                })
              }
              aria-label={t("diveMemosMinute")}
            >
              {MINUTE_OPTIONS.map((minute) => (
                <option key={minute} value={minute}>
                  {String(minute).padStart(2, "0")}
                </option>
              ))}
            </select>
            <select
              value={memo.meridiem}
              disabled={busy}
              onChange={(event) =>
                onChange({
                  ...memo,
                  meridiem: event.target.value === "PM" ? "PM" : "AM",
                })
              }
              aria-label={t("diveMemosMeridiem")}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>

        <label className="memo-span-2">
          <span>{t("diveMemosLocation")}</span>
          <input
            type="text"
            value={memo.location ?? ""}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...memo, location: event.target.value || null })
            }
          />
        </label>

        <div className="memo-span-2 memo-coords">
          <span>{t("diveMemosCoordinates")}</span>
          <p className="memo-coord-values">
            {memo.lat != null && memo.lng != null
              ? `${memo.lat.toFixed(5)}, ${memo.lng.toFixed(5)}`
              : t("diveMemosNoCoordinates")}
          </p>
          <div className="memo-coord-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={onDeviceGps}
            >
              <Navigation size={16} /> {t("diveMemosUseGps")}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={onPhotoGps}
            >
              <ImageIcon size={16} /> {t("diveMemosPhotoGps")}
            </button>
            {memo.lat != null || memo.lng != null ? (
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => onChange({ ...memo, lat: null, lng: null })}
              >
                <MapPin size={16} /> {t("diveMemosClearGps")}
              </button>
            ) : null}
          </div>
        </div>

        <label className="memo-span-2">
          <span>{t("buddy")}</span>
          <input
            type="text"
            value={memo.buddies ?? ""}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...memo, buddies: event.target.value || null })
            }
          />
        </label>

        <label className="memo-span-2">
          <span>{t("notes")}</span>
          <textarea
            rows={4}
            value={memo.notes ?? ""}
            disabled={busy}
            placeholder={NOTES_PLACEHOLDER}
            onChange={(event) =>
              onChange({ ...memo, notes: event.target.value || null })
            }
          />
        </label>
      </div>
    </article>
  );
}
