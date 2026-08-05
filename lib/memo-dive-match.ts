import { memoWallClockMs, type DiveMemo } from "./dive-memos";

export const MEMO_MATCH_WINDOWS_MS = {
  preferred: 6 * 3600_000,
  wider: 12 * 3600_000,
  widest: 24 * 3600_000,
} as const;

export function diveWallClockMs(diveDate: string | null): number | null {
  if (!diveDate) return null;
  const timestamp = new Date(diveDate.replace(" ", "T")).getTime();
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
    const memoMs = memoWallClockMs(memo);
    if (memoMs === null) continue;
    const deltaMs = memoMs - diveMs;
    if (Math.abs(deltaMs) <= halfWindowMs) {
      results.push({ memo, deltaMs });
    }
  }
  results.sort((a, b) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs));
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
