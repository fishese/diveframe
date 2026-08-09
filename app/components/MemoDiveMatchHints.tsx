"use client";

import { useState } from "react";
import { useAppI18n } from "@/app/AppI18nProvider";
import type { AppLanguage } from "@/lib/app-i18n";
import { formatCoordinatePair } from "@/lib/coordinate-input";
import type { DiveMemo } from "@/lib/dive-memos";
import { memoSiteName, memoWallClockMs } from "@/lib/dive-memos";
import {
  deleteLocalDiveMemo,
  type LocalDive,
  updateLocalDiveDetails,
  updateLocalDiveSite,
  updateLocalDiveUserGps,
} from "@/lib/indexed-db";
import {
  isMemoDiveApplyPlanEmpty,
  planApplyEmptyMemoFields,
  type MemoDiveApplyPlan,
} from "@/lib/memo-dive-apply";
import {
  diveWallClockMs,
  listDivesNearMemo,
  listMemosNearDive,
  MEMO_MATCH_WINDOWS_MS,
  resolveMatchHalfWindowMs,
} from "@/lib/memo-dive-match";

type WindowLevel = "preferred" | "wider" | "widest";

type MemoDiveMatchHintsBase = {
  /** Called after a memo is deleted from IndexedDB (× or post-apply Delete). */
  onMemoDeleted?: (id: string) => void;
};

export type MemoDiveMatchHintsProps = MemoDiveMatchHintsBase &
  (
    | {
        mode: "on-dive";
        dive: LocalDive;
        memos: DiveMemo[];
        onMemosChange: (memos: DiveMemo[]) => void;
        onDiveChange: (dive: LocalDive) => void;
      }
    | {
        mode: "on-memo";
        memo: DiveMemo;
        dives: LocalDive[];
        onDiveChange: (dive: LocalDive) => void;
      }
  );

type PostApplyState = {
  memo: DiveMemo;
  dive: LocalDive;
};

function localeForLanguage(language: AppLanguage): string {
  if (language === "zh-Hant") return "zh-HK";
  if (language === "ja") return "ja";
  return "en";
}

/** Collapsed-row datetime, e.g. `5 Aug, 11:00 AM`. */
export function formatMatchSummaryDateTime(
  ms: number,
  language: AppLanguage = "en",
): string {
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function nonBlank(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function divePlaceLabel(dive: LocalDive): string | null {
  if (nonBlank(dive.userSite)) return dive.userSite.trim();
  if (nonBlank(dive.site)) return dive.site.trim();
  if (nonBlank(dive.location)) return dive.location.trim();
  return null;
}

function formatSummaryLine(
  ms: number | null,
  place: string | null,
  language: AppLanguage,
): string {
  const when =
    ms === null ? "—" : formatMatchSummaryDateTime(ms, language);
  if (place && place.trim()) return `${when}, ${place.trim()}`;
  return when;
}

function effectiveHalfWindowMs(
  windowLevel: WindowLevel,
  preferredHits: number,
): number {
  if (windowLevel === "preferred") {
    return resolveMatchHalfWindowMs(preferredHits, "preferred");
  }
  return MEMO_MATCH_WINDOWS_MS[windowLevel];
}

function hasValidMemoGps(memo: DiveMemo): boolean {
  return (
    memo.lat !== null &&
    memo.lng !== null &&
    Number.isFinite(memo.lat) &&
    Number.isFinite(memo.lng) &&
    Math.abs(memo.lat) <= 90 &&
    Math.abs(memo.lng) <= 180
  );
}

async function writeApplyPlan(
  plan: MemoDiveApplyPlan,
  memo: DiveMemo,
  dive: LocalDive,
): Promise<LocalDive> {
  let current = dive;

  if (plan.setUserSite) {
    current = await updateLocalDiveSite(current.id, {
      name: plan.setUserSite,
      source: "memo",
      latitude: memo.lat,
      longitude: memo.lng,
      ...(plan.setLocation !== undefined
        ? { location: plan.setLocation }
        : {}),
    });
  } else if (plan.setLocation !== undefined) {
    current = await updateLocalDiveDetails(current.id, {
      location: plan.setLocation,
      locationSource: "memo",
      buddy: current.buddy,
      notes: current.notes,
    });
  }

  if (plan.setUserGps) {
    current = await updateLocalDiveUserGps(current.id, {
      lat: plan.setUserGps.lat,
      lng: plan.setUserGps.lng,
      source: "memo",
    });
  }

  if (plan.setBuddy !== undefined || plan.setNotes !== undefined) {
    current = await updateLocalDiveDetails(current.id, {
      buddy: plan.setBuddy !== undefined ? plan.setBuddy : current.buddy,
      notes: plan.setNotes !== undefined ? plan.setNotes : current.notes,
    });
  }

  return current;
}

export function MemoDiveMatchHints(props: MemoDiveMatchHintsProps) {
  const { language, t } = useAppI18n();
  const [windowLevel, setWindowLevel] = useState<WindowLevel>("preferred");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [postApply, setPostApply] = useState<PostApplyState | null>(null);
  const [memoDeleted, setMemoDeleted] = useState(false);

  if (memoDeleted) return null;

  const preferredHalf = MEMO_MATCH_WINDOWS_MS.preferred;

  const preferredHits =
    props.mode === "on-dive"
      ? listMemosNearDive(props.dive, props.memos, preferredHalf).length
      : listDivesNearMemo(props.memo, props.dives, preferredHalf).length;

  const halfWindowMs = effectiveHalfWindowMs(windowLevel, preferredHits);

  const memoMatches =
    props.mode === "on-dive"
      ? listMemosNearDive(props.dive, props.memos, halfWindowMs)
      : [];
  const diveMatches =
    props.mode === "on-memo"
      ? listDivesNearMemo(props.memo, props.dives, halfWindowMs)
      : [];

  const candidateCount =
    props.mode === "on-dive" ? memoMatches.length : diveMatches.length;

  const canShow12h = windowLevel === "preferred" && preferredHits > 0;
  const canShow24h =
    windowLevel !== "widest" &&
    (windowLevel === "wider" ||
      (windowLevel === "preferred" && preferredHits === 0));

  // Dive detail: omit when nothing to show and no further widen offer.
  // Keep mounted while the post-apply dialog is open (Apply empty defers
  // onDiveChange so place-name gates stay true; this covers empty lists too).
  if (
    props.mode === "on-dive" &&
    candidateCount === 0 &&
    !canShow24h &&
    !postApply
  ) {
    return null;
  }

  function notifyMemoDeleted(id: string) {
    if (props.mode === "on-dive") {
      props.onMemosChange(props.memos.filter((item) => item.id !== id));
    }
    props.onMemoDeleted?.(id);
  }

  async function deleteMemo(memo: DiveMemo) {
    await deleteLocalDiveMemo(memo.id);
    notifyMemoDeleted(memo.id);
    setExpandedId(null);
    setPostApply(null);
    if (props.mode === "on-memo") setMemoDeleted(true);
  }

  async function confirmDeleteMemo(memo: DiveMemo) {
    if (!window.confirm(t("memoMatchDeleteConfirm"))) return;
    setBusy(true);
    setStatus(null);
    try {
      await deleteMemo(memo);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyEmpty(memo: DiveMemo, dive: LocalDive) {
    const plan = planApplyEmptyMemoFields(memo, dive);
    if (isMemoDiveApplyPlanEmpty(plan)) {
      setStatus(t("memoMatchNothingToApply"));
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const updated = await writeApplyPlan(plan, memo, dive);
      // Defer onDiveChange until Keep/Delete/backdrop so parents that gate on
      // dive place name keep this component mounted for the post-apply dialog.
      setPostApply({ memo, dive: updated });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyLocation(memo: DiveMemo, dive: LocalDive) {
    const name = memoSiteName(memo);
    if (!name) return;
    setBusy(true);
    setStatus(null);
    try {
      const updated = await updateLocalDiveSite(dive.id, {
        name,
        source: "memo",
        latitude: memo.lat,
        longitude: memo.lng,
        location: memo.siteName ? memo.location : name,
      });
      props.onDiveChange(updated);
      setStatus(t("manualSiteSaved", { name }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyGps(memo: DiveMemo, dive: LocalDive) {
    if (!hasValidMemoGps(memo)) return;
    setBusy(true);
    setStatus(null);
    try {
      const updated = await updateLocalDiveUserGps(dive.id, {
        lat: memo.lat!,
        lng: memo.lng!,
        source: "memo",
      });
      props.onDiveChange(updated);
      setStatus(t("diveDetailsSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyBuddy(memo: DiveMemo, dive: LocalDive) {
    if (!nonBlank(memo.buddies)) return;
    setBusy(true);
    setStatus(null);
    try {
      const updated = await updateLocalDiveDetails(dive.id, {
        buddy: memo.buddies!.trim(),
        notes: dive.notes,
      });
      props.onDiveChange(updated);
      setStatus(t("diveDetailsSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyNotes(memo: DiveMemo, dive: LocalDive) {
    if (!nonBlank(memo.notes)) return;
    setBusy(true);
    setStatus(null);
    try {
      const updated = await updateLocalDiveDetails(dive.id, {
        buddy: dive.buddy,
        notes: memo.notes!.trim(),
      });
      props.onDiveChange(updated);
      setStatus(t("diveDetailsSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function keepMemoAfterApply() {
    if (!postApply) return;
    props.onDiveChange(postApply.dive);
    setPostApply(null);
  }

  async function deleteMemoAfterApply() {
    if (!postApply) return;
    const { memo, dive } = postApply;
    setBusy(true);
    setStatus(null);
    try {
      await deleteMemo(memo);
      props.onDiveChange(dive);
      setPostApply(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function dismissPostApplyDialog() {
    if (busy || !postApply) return;
    props.onDiveChange(postApply.dive);
    setPostApply(null);
  }

  function renderExpandedFields(memo: DiveMemo, dive: LocalDive) {
    const applyPlan = planApplyEmptyMemoFields(memo, dive);
    const canApplyEmpty = !isMemoDiveApplyPlanEmpty(applyPlan);
    const coords = formatCoordinatePair(memo.lat, memo.lng);
    return (
      <div className="memo-match-expand">
        {nonBlank(memo.heading) ? (
          <p className="memo-match-field">
            <span className="memo-match-field-label">
              {t("diveMemosHeading")}
            </span>
            <span className="memo-match-field-value">{memo.heading}</span>
          </p>
        ) : null}

        <div className="memo-match-field memo-match-field-row">
          <div className="memo-match-field-main">
            <span className="memo-match-field-label">
              {t("diveMemosLocation")}
            </span>
            <span className="memo-match-field-value">
              {memoSiteName(memo) ?? "—"}
            </span>
          </div>
          {memoSiteName(memo) ? (
            <button
              type="button"
              className="button button-secondary memo-compact-button"
              disabled={busy}
              onClick={() => void copyLocation(memo, dive)}
            >
              {t("memoMatchCopyLocation")}
            </button>
          ) : null}
        </div>

        <div className="memo-match-field memo-match-field-row">
          <div className="memo-match-field-main">
            <span className="memo-match-field-label">
              {t("diveMemosCoordinates")}
            </span>
            <span className="memo-match-field-value">
              {coords || t("diveMemosNoCoordinates")}
            </span>
          </div>
          {hasValidMemoGps(memo) ? (
            <button
              type="button"
              className="button button-secondary memo-compact-button"
              disabled={busy}
              onClick={() => void copyGps(memo, dive)}
            >
              {t("memoMatchCopyGps")}
            </button>
          ) : null}
        </div>

        <div className="memo-match-field memo-match-field-row">
          <div className="memo-match-field-main">
            <span className="memo-match-field-label">{t("buddy")}</span>
            <span className="memo-match-field-value">
              {nonBlank(memo.buddies) ? memo.buddies : "—"}
            </span>
          </div>
          {nonBlank(memo.buddies) ? (
            <button
              type="button"
              className="button button-secondary memo-compact-button"
              disabled={busy}
              onClick={() => void copyBuddy(memo, dive)}
            >
              {t("memoMatchCopyBuddies")}
            </button>
          ) : null}
        </div>

        <div className="memo-match-field memo-match-field-row">
          <div className="memo-match-field-main">
            <span className="memo-match-field-label">{t("notes")}</span>
            <span className="memo-match-field-value memo-match-notes">
              {nonBlank(memo.notes) ? memo.notes : "—"}
            </span>
          </div>
          {nonBlank(memo.notes) ? (
            <button
              type="button"
              className="button button-secondary memo-compact-button"
              disabled={busy}
              onClick={() => void copyNotes(memo, dive)}
            >
              {t("memoMatchCopyNotes")}
            </button>
          ) : null}
        </div>

        <div className="memo-match-expand-actions">
          <button
            type="button"
            className="button button-primary memo-compact-button"
            disabled={busy || !canApplyEmpty}
            onClick={() => void applyEmpty(memo, dive)}
          >
            {t("memoMatchApplyEmpty")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={
        props.mode === "on-dive"
          ? "memo-match-hints memo-match-callout"
          : "memo-match-hints"
      }
    >
      <h3 className="memo-match-title">
        {props.mode === "on-dive"
          ? t("memoMatchTitle")
          : t("memoMatchTitleFromMemo")}
      </h3>

      {status ? <p className="composer-status memo-match-status">{status}</p> : null}

      {props.mode === "on-memo" && candidateCount === 0 ? (
        <p className="memo-match-empty">{t("memoMatchNoCandidates")}</p>
      ) : null}

      {props.mode === "on-dive"
        ? memoMatches.map(({ memo }) => {
            const summary = formatSummaryLine(
              memoWallClockMs(memo),
              memoSiteName(memo),
              language,
            );
            const expanded = expandedId === memo.id;
            return (
              <div key={memo.id} className="memo-match-row-block">
                <div className="memo-match-row">
                  <button
                    type="button"
                    className="memo-match-summary"
                    disabled={busy}
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === memo.id ? null : memo.id,
                      )
                    }
                  >
                    {summary}
                  </button>
                  <button
                    type="button"
                    className="button button-quiet memo-match-delete"
                    disabled={busy}
                    aria-label={t("memoMatchDeleteConfirm")}
                    title={t("memoMatchDeleteConfirm")}
                    onClick={() => void confirmDeleteMemo(memo)}
                  >
                    ×
                  </button>
                </div>
                {expanded
                  ? renderExpandedFields(memo, props.dive)
                  : null}
              </div>
            );
          })
        : diveMatches.map(({ dive }) => {
            const summary = formatSummaryLine(
              diveWallClockMs(dive.diveDate),
              divePlaceLabel(dive),
              language,
            );
            const expanded = expandedId === dive.id;
            return (
              <div key={dive.id} className="memo-match-row-block">
                <div className="memo-match-row">
                  <button
                    type="button"
                    className="memo-match-summary"
                    disabled={busy}
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === dive.id ? null : dive.id,
                      )
                    }
                  >
                    {summary}
                  </button>
                  <button
                    type="button"
                    className="button button-quiet memo-match-delete"
                    disabled={busy}
                    aria-label={t("memoMatchDeleteConfirm")}
                    title={t("memoMatchDeleteConfirm")}
                    onClick={() => void confirmDeleteMemo(props.memo)}
                  >
                    ×
                  </button>
                </div>
                {expanded
                  ? renderExpandedFields(props.memo, dive)
                  : null}
              </div>
            );
          })}

      {canShow12h ? (
        <button
          type="button"
          className="button button-quiet memo-match-widen"
          disabled={busy}
          onClick={() => setWindowLevel("wider")}
        >
          {t("memoMatchShow12h")}
        </button>
      ) : null}

      {canShow24h ? (
        <button
          type="button"
          className="button button-quiet memo-match-widen"
          disabled={busy}
          onClick={() => setWindowLevel("widest")}
        >
          {t("memoMatchShow24h")}
        </button>
      ) : null}

      {postApply ? (
        <div
          className="memo-match-dialog-backdrop"
          role="presentation"
          onClick={dismissPostApplyDialog}
        >
          <section
            className="memo-match-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="memo-match-applied-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="memo-match-applied-title">{t("memoMatchAppliedTitle")}</h2>
            <div className="memo-match-dialog-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                onClick={() => void keepMemoAfterApply()}
              >
                {t("memoMatchKeepMemo")}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => void deleteMemoAfterApply()}
              >
                {t("memoMatchDeleteMemo")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
