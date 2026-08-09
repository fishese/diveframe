export type DiveMemoMinute = 0 | 15 | 30 | 45;

export type DiveMemoSiteSource =
  | "catalog"
  | "suggestion"
  | "manual"
  | null;

export type DiveMemo = {
  id: string;
  heading: string;
  date: string;
  hour: number | null;
  /** Minutes 0–59; empty/null treated as 0 when saving. */
  minute: number | null;
  meridiem: "AM" | "PM";
  /** Selected dive-site name. Legacy memos may only have `location`. */
  siteName: string | null;
  siteSource: DiveMemoSiteSource;
  siteCatalogId: string | null;
  /** Place/region for a selected site, or the legacy memo site value. */
  location: string | null;
  lat: number | null;
  lng: number | null;
  buddies: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DiveMemoDefaults = Pick<
  DiveMemo,
  | "date"
  | "hour"
  | "minute"
  | "meridiem"
  | "siteName"
  | "siteSource"
  | "siteCatalogId"
  | "location"
  | "lat"
  | "lng"
  | "buddies"
  | "notes"
>;

/** Next unused sequential heading: Dive 1, Dive 2, … */
export function nextDiveMemoHeading(
  existing: ReadonlyArray<unknown>,
): string {
  let nextNumber = existing.length + 1;

  for (const entry of existing) {
    if (!entry || typeof entry !== "object") continue;
    const heading = (entry as { heading?: unknown }).heading;
    if (typeof heading !== "string") continue;
    const match = /^Dive\s+(\d+)$/i.exec(heading.trim());
    if (!match) continue;
    nextNumber = Math.max(nextNumber, Number.parseInt(match[1], 10) + 1);
  }

  return `Dive ${nextNumber}`;
}

export function defaultDiveMemoFields(
  now: Date = new Date(),
): DiveMemoDefaults {
  return {
    date: formatLocalDate(now),
    hour: 10,
    minute: 0,
    meridiem: "AM",
    siteName: null,
    siteSource: null,
    siteCatalogId: null,
    location: null,
    lat: null,
    lng: null,
    buddies: null,
    notes: null,
  };
}

export function memoLocalDateTimeFields(
  date: Date = new Date(),
): Pick<DiveMemo, "date" | "hour" | "minute" | "meridiem"> {
  const hour24 = date.getHours();
  return {
    date: formatLocalDate(date),
    hour: hour24 % 12 || 12,
    minute: date.getMinutes(),
    meridiem: hour24 >= 12 ? "PM" : "AM",
  };
}

/** 24-hour value for the persisted 12-hour tuple. */
export function memoHour24(
  memo: Pick<DiveMemo, "hour" | "meridiem">,
): number {
  let hour12 =
    memo.hour === null || !Number.isFinite(memo.hour)
      ? 10
      : Math.trunc(memo.hour);
  if (hour12 < 1 || hour12 > 12) hour12 = 10;
  if (memo.meridiem === "PM") return hour12 === 12 ? 12 : hour12 + 12;
  return hour12 === 12 ? 0 : hour12;
}

/** Convert a 24-hour UI value without changing the persisted timestamp shape. */
export function memoFieldsFromHour24(
  hour24: number,
): Pick<DiveMemo, "hour" | "meridiem"> {
  const normalized = Number.isFinite(hour24)
    ? Math.min(23, Math.max(0, Math.trunc(hour24)))
    : 10;
  return {
    hour: normalized % 12 || 12,
    meridiem: normalized >= 12 ? "PM" : "AM",
  };
}

export function stepMemoHour24(
  memo: Pick<DiveMemo, "hour" | "meridiem">,
  delta: 1 | -1,
): Pick<DiveMemo, "hour" | "meridiem"> {
  const next = (memoHour24(memo) + delta + 24) % 24;
  return memoFieldsFromHour24(next);
}

/**
 * Step hour by ±1 within 1–12. Wrapping 12↔1 does not flip AM/PM
 * (meridiem is owned by a separate control).
 */
export function stepMemoHour(
  hour: number | null,
  delta: 1 | -1,
): number {
  const current =
    hour === null || !Number.isFinite(hour) ? 10 : Math.trunc(hour);
  const clamped = ((current - 1) % 12 + 12) % 12 + 1;
  let next = clamped + delta;
  if (next > 12) next = 1;
  if (next < 1) next = 12;
  return next;
}

/** Empty / null minute is treated as :00 when saving or matching.
 *  Accepts any integer 0–59; invalid values fall back to 0. */
export function normalizeMemoMinute(
  minute: number | null | undefined | "",
): number {
  if (minute === null || minute === undefined || minute === "") return 0;
  if (!Number.isFinite(minute)) return 0;
  const truncated = Math.trunc(minute);
  if (truncated < 0 || truncated > 59) return 0;
  return truncated;
}

/** Local wall-clock ms from memo date + 12h time; invalid/missing date → null.
 *  Missing/invalid hour defaults to 10 (same as defaultDiveMemoFields).
 *  Non-PM meridiem is treated as AM. */
export function memoWallClockMs(
  memo: Pick<DiveMemo, "date" | "hour" | "minute" | "meridiem">,
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(memo.date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let hour12 =
    memo.hour === null || !Number.isFinite(memo.hour)
      ? 10
      : Math.trunc(memo.hour);
  if (hour12 < 1 || hour12 > 12) hour12 = 10;
  const isPm = memo.meridiem === "PM";
  const hour24 = isPm
    ? hour12 === 12
      ? 12
      : hour12 + 12
    : hour12 === 12
      ? 0
      : hour12;
  const timestamp = new Date(
    year,
    month - 1,
    day,
    hour24,
    normalizeMemoMinute(memo.minute),
    0,
  );
  // Date normalizes impossible values (for example 31 February) and DST gaps.
  // Reject those rather than matching a memo against a different wall time.
  if (
    timestamp.getFullYear() !== year ||
    timestamp.getMonth() !== month - 1 ||
    timestamp.getDate() !== day ||
    timestamp.getHours() !== hour24 ||
    timestamp.getMinutes() !== normalizeMemoMinute(memo.minute)
  ) {
    return null;
  }
  return timestamp.getTime();
}

export function memoSiteName(
  memo: Pick<DiveMemo, "siteName" | "location">,
): string | null {
  const selected = memo.siteName?.trim();
  if (selected) return selected;
  const legacy = memo.location?.trim();
  return legacy || null;
}

export function compareDiveMemos(a: DiveMemo, b: DiveMemo): number {
  const aTime = memoWallClockMs(a);
  const bTime = memoWallClockMs(b);
  if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime === null) return -1;
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Normalize records restored from backups created before site identity existed. */
export function hydrateDiveMemo(memo: DiveMemo): DiveMemo {
  const legacy = memo as DiveMemo & {
    siteName?: string | null;
    siteSource?: DiveMemoSiteSource;
    siteCatalogId?: string | null;
  };
  return {
    ...memo,
    siteName:
      legacy.siteName === undefined
        ? legacy.location?.trim() || null
        : legacy.siteName?.trim() || null,
    siteSource: legacy.siteSource ?? null,
    siteCatalogId: legacy.siteCatalogId ?? null,
    location: legacy.location?.trim() || null,
    minute: normalizeMemoMinute(legacy.minute),
  };
}

export function createDiveMemoId(): string {
  return crypto.randomUUID();
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
