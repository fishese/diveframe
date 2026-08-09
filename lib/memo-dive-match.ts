import { memoWallClockMs, type DiveMemo } from "./dive-memos";

export const MEMO_MATCH_WINDOWS_MS = {
  preferred: 6 * 3600_000,
  wider: 12 * 3600_000,
  widest: 24 * 3600_000,
} as const;

export type MemoCandidateExclusion =
  | "invalid-dive-time"
  | "invalid-memo-time"
  | "outside-window"
  | null;

export type MemoCandidateEvaluation = {
  diveMs: number | null;
  memoMs: number | null;
  deltaMs: number | null;
  halfWindowMs: number;
  qualifies: boolean;
  exclusion: MemoCandidateExclusion;
};

export function diveWallClockMs(diveDate: string | null): number | null {
  if (!diveDate) return null;
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(
    diveDate,
  );
  if (local) {
    const year = Number(local[1]);
    const month = Number(local[2]);
    const day = Number(local[3]);
    const hour = Number(local[4] ?? 0);
    const minute = Number(local[5] ?? 0);
    const second = Number(local[6] ?? 0);
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute ||
      date.getSeconds() !== second
    ) {
      return null;
    }
    return date.getTime();
  }
  const timestamp = new Date(diveDate).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function diveNeedsPlaceNameHint(dive: {
  userSite: string | null;
  site: string | null;
  location: string | null;
}): boolean {
  return (
    !hasPlaceName(dive.userSite) &&
    !hasPlaceName(dive.site) &&
    !hasPlaceName(dive.location)
  );
}

function hasPlaceName(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Pure diagnostic for one dive/memo pair; safe to inspect in development. */
export function evaluateMemoCandidate(
  dive: { diveDate: string | null },
  memo: Pick<DiveMemo, "date" | "hour" | "minute" | "meridiem">,
  halfWindowMs: number,
): MemoCandidateEvaluation {
  const diveMs = diveWallClockMs(dive.diveDate);
  if (diveMs === null) {
    return {
      diveMs,
      memoMs: null,
      deltaMs: null,
      halfWindowMs,
      qualifies: false,
      exclusion: "invalid-dive-time",
    };
  }
  const memoMs = memoWallClockMs(memo);
  if (memoMs === null) {
    return {
      diveMs,
      memoMs,
      deltaMs: null,
      halfWindowMs,
      qualifies: false,
      exclusion: "invalid-memo-time",
    };
  }
  const deltaMs = memoMs - diveMs;
  const qualifies = Math.abs(deltaMs) <= halfWindowMs;
  return {
    diveMs,
    memoMs,
    deltaMs,
    halfWindowMs,
    qualifies,
    exclusion: qualifies ? null : "outside-window",
  };
}

export function listMemosNearDive<
  T extends Pick<DiveMemo, "date" | "hour" | "minute" | "meridiem"> & {
    id: string;
  },
>(
  dive: { diveDate: string | null },
  memos: ReadonlyArray<T>,
  halfWindowMs: number,
): Array<{ memo: T; deltaMs: number }> {
  const diveMs = diveWallClockMs(dive.diveDate);
  if (diveMs === null) return [];

  const results: Array<{ memo: T; deltaMs: number }> = [];
  for (const memo of memos) {
    const evaluation = evaluateMemoCandidate(dive, memo, halfWindowMs);
    if (evaluation.qualifies && evaluation.deltaMs !== null) {
      results.push({ memo, deltaMs: evaluation.deltaMs });
    }
  }
  results.sort(
    (a, b) =>
      Math.abs(a.deltaMs) - Math.abs(b.deltaMs) ||
      a.deltaMs - b.deltaMs ||
      a.memo.id.localeCompare(b.memo.id),
  );
  return results;
}

export function listDivesNearMemo<
  T extends { diveDate: string | null },
>(
  memo: Pick<DiveMemo, "date" | "hour" | "minute" | "meridiem">,
  dives: ReadonlyArray<T>,
  halfWindowMs: number,
): Array<{ dive: T; deltaMs: number }> {
  const memoMs = memoWallClockMs(memo);
  if (memoMs === null) return [];

  const results: Array<{ dive: T; deltaMs: number }> = [];
  for (const dive of dives) {
    const diveMs = diveWallClockMs(dive.diveDate);
    if (diveMs === null) continue;
    const deltaMs = memoMs - diveMs;
    if (Math.abs(deltaMs) <= halfWindowMs) {
      results.push({ dive, deltaMs });
    }
  }
  results.sort((a, b) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs));
  return results;
}

export function resolveMatchHalfWindowMs(
  preferredHits: number,
  expanded: "preferred" | "wider" | "widest",
): number {
  if (preferredHits > 0) {
    return MEMO_MATCH_WINDOWS_MS.preferred;
  }
  if (expanded === "widest") {
    return MEMO_MATCH_WINDOWS_MS.widest;
  }
  return MEMO_MATCH_WINDOWS_MS.wider;
}
