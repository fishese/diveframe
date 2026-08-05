import { resolveDiveMapCoordinates } from "./dive-gps";
import type { DiveMemo } from "./dive-memos";

export type MemoDiveApplyPlan = {
  setUserSite?: string;
  setLocation?: string | null;
  setUserGps?: { lat: number; lng: number };
  setBuddy?: string | null;
  setNotes?: string | null;
};

function isNonBlank(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validatedMemoGps(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  return (
    lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
      ? { lat, lng }
      : null
  );
}

function isSiteEmpty(dive: {
  userSite: string | null;
  site: string | null;
}): boolean {
  return !isNonBlank(dive.userSite) && !isNonBlank(dive.site);
}

export function planApplyEmptyMemoFields(
  memo: Pick<DiveMemo, "location" | "lat" | "lng" | "buddies" | "notes">,
  dive: {
    userSite: string | null;
    site: string | null;
    location: string | null;
    gpsEntryLat: number | null;
    gpsEntryLng: number | null;
    userGpsLat: number | null;
    userGpsLng: number | null;
    buddy: string | null;
    notes: string | null;
  },
): MemoDiveApplyPlan {
  const plan: MemoDiveApplyPlan = {};
  const memoLocation = isNonBlank(memo.location) ? memo.location!.trim() : null;

  if (isSiteEmpty(dive) && memoLocation) {
    plan.setUserSite = memoLocation;
  }

  if (!isNonBlank(dive.location) && memoLocation) {
    plan.setLocation = memoLocation;
  }

  if (resolveDiveMapCoordinates(dive) === null) {
    const gps = validatedMemoGps(memo.lat, memo.lng);
    if (gps) {
      plan.setUserGps = gps;
    }
  }

  if (!isNonBlank(dive.buddy) && isNonBlank(memo.buddies)) {
    plan.setBuddy = memo.buddies!.trim();
  }

  if (!isNonBlank(dive.notes) && isNonBlank(memo.notes)) {
    plan.setNotes = memo.notes!.trim();
  }

  return plan;
}

export function isMemoDiveApplyPlanEmpty(plan: MemoDiveApplyPlan): boolean {
  return Object.keys(plan).length === 0;
}

export function preferredDiveNumberLabel(dive: {
  diveNumber: number | null;
  sourceDiveNumbers: Partial<
    Record<"shearwater" | "subsurface" | "uddf" | "fit", number | null>
  >;
}): string | null {
  const shearwater = dive.sourceDiveNumbers.shearwater;
  if (shearwater != null && Number.isFinite(shearwater)) {
    return String(shearwater);
  }
  const subsurface = dive.sourceDiveNumbers.subsurface;
  if (subsurface != null && Number.isFinite(subsurface)) {
    return String(subsurface);
  }
  if (dive.diveNumber != null && Number.isFinite(dive.diveNumber)) {
    return String(dive.diveNumber);
  }
  return null;
}

export function appendLinkedDiveNote(
  existingNotes: string | null,
  diveNumberLabel: string | null,
): string | null {
  if (diveNumberLabel === null) {
    return existingNotes;
  }
  const line = `Linked to dive #${diveNumberLabel}`;
  if (!isNonBlank(existingNotes)) {
    return line;
  }
  return `${existingNotes!.trimEnd()}\n${line}`;
}
