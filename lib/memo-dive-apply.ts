import { resolveDiveMapCoordinates } from "./dive-gps";
import { memoSiteName, type DiveMemo } from "./dive-memos";

export type MemoDiveApplyPlan = {
  setUserSite?: string;
  setUserSiteCatalogId?: string;
  setLocation?: string | null;
  setUserGps?: { lat: number; lng: number };
  setBuddy?: string | null;
  setNotes?: string | null;
};

export type MemoLocationApplyPlan =
  | {
      type: "site";
      name: string;
      catalogId: string | null;
      location: string | null;
      gps: { lat: number; lng: number } | null;
    }
  | {
      type: "gps";
      gps: { lat: number; lng: number };
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
  memo: Pick<
    DiveMemo,
    | "siteName"
    | "siteCatalogId"
    | "location"
    | "lat"
    | "lng"
    | "buddies"
    | "notes"
  >,
  dive: {
    userSite: string | null;
    site: string | null;
    location: string | null;
    gpsEntryLat: number | null;
    gpsEntryLng: number | null;
    gpsExitLat?: number | null;
    gpsExitLng?: number | null;
    userGpsLat: number | null;
    userGpsLng: number | null;
    buddy: string | null;
    notes: string | null;
  },
): MemoDiveApplyPlan {
  const plan: MemoDiveApplyPlan = {};
  const memoSite = memoSiteName(memo);
  const memoLocation = isNonBlank(memo.siteName)
    ? memo.location?.trim() || null
    : memoSite;

  if (isSiteEmpty(dive) && memoSite) {
    plan.setUserSite = memoSite;
    const catalogId = memo.siteCatalogId?.trim();
    if (catalogId) plan.setUserSiteCatalogId = catalogId;
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

/** Recheck a snapshot's fill-empty plan inside the storage transaction. */
export function revalidateEmptyMemoPlan(
  plan: MemoDiveApplyPlan,
  dive: Parameters<typeof planApplyEmptyMemoFields>[1],
): MemoDiveApplyPlan {
  const next = { ...plan };
  if (!isSiteEmpty(dive)) {
    delete next.setUserSite;
    delete next.setUserSiteCatalogId;
  }
  if (isNonBlank(dive.location)) delete next.setLocation;
  if (resolveDiveMapCoordinates(dive) !== null) delete next.setUserGps;
  if (isNonBlank(dive.buddy)) delete next.setBuddy;
  if (isNonBlank(dive.notes)) delete next.setNotes;
  return next;
}

/** Build the explicit "Use location" action: site + GPS, or GPS by itself. */
export function planUseMemoLocation(
  memo: Pick<
    DiveMemo,
    "siteName" | "siteCatalogId" | "location" | "lat" | "lng"
  >,
): MemoLocationApplyPlan | null {
  const name = memoSiteName(memo);
  const gps = validatedMemoGps(memo.lat, memo.lng);
  if (name) {
    return {
      type: "site",
      name,
      catalogId: memo.siteCatalogId?.trim() || null,
      location: isNonBlank(memo.siteName)
        ? memo.location?.trim() || null
        : name,
      gps,
    };
  }
  return gps ? { type: "gps", gps } : null;
}
