export type DiveMemoMinute = 0 | 15 | 30 | 45;

export type DiveMemo = {
  id: string;
  heading: string;
  date: string;
  hour: number | null;
  /** Minutes 0–59; empty/null treated as 0 when saving. */
  minute: number | null;
  meridiem: "AM" | "PM";
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
  | "location"
  | "lat"
  | "lng"
  | "buddies"
  | "notes"
>;

/** Next heading from existing memo count: Dive 1, Dive 2, … */
export function nextDiveMemoHeading(
  existing: ReadonlyArray<unknown>,
): string {
  return `Dive ${existing.length + 1}`;
}

export function defaultDiveMemoFields(
  now: Date = new Date(),
): DiveMemoDefaults {
  return {
    date: formatLocalDate(now),
    hour: 10,
    minute: 0,
    meridiem: "AM",
    location: null,
    lat: null,
    lng: null,
    buddies: null,
    notes: null,
  };
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

/** Local wall-clock ms from memo date + 12h time; invalid input → null. */
export function memoWallClockMs(
  memo: Pick<DiveMemo, "date" | "hour" | "minute" | "meridiem">,
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(memo.date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (memo.hour === null || !Number.isFinite(memo.hour)) return null;
  const hour12 = Math.trunc(memo.hour);
  if (hour12 < 1 || hour12 > 12) return null;
  const hour24 =
    memo.meridiem === "AM"
      ? hour12 === 12
        ? 0
        : hour12
      : hour12 === 12
        ? 12
        : hour12 + 12;
  const timestamp = new Date(
    year,
    month - 1,
    day,
    hour24,
    normalizeMemoMinute(memo.minute),
    0,
  ).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
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
