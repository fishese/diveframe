import type { DiveSample, GasMix } from "./dive-model";

export const MERGE_PRESENTATION_PREFIX = "merge:";
export const SEGMENT_CLOCK_SKEW_SECONDS = 2;
export const DEFAULT_SEGMENT_GAP_SOFT_MAX_SECONDS = 15 * 60;
export const SEGMENT_GAP_HARD_MAX_SECONDS = 60 * 60;

export type SegmentMergeErrorCode =
  | "too-few"
  | "duplicate-id"
  | "missing-start"
  | "missing-duration"
  | "overlap"
  | "serial-mismatch"
  | "computer-mismatch"
  | "unknown-computer"
  | "category-mismatch"
  | "dive-mode-mismatch"
  | "gap-too-large";

export type SegmentMergeWarningCode =
  | "missing-serial"
  | "unknown-dive-mode"
  | "site-mismatch"
  | "trip-mismatch"
  | "buddy-mismatch"
  | "notes-mismatch"
  | "gas-conflict"
  | "long-gap";

export type SegmentMergeDive = {
  id: string;
  diveDate: string | null;
  diveNumber?: number | null;
  durationSeconds: number | null;
  maxDepthM?: number | null;
  depth?: string | null;
  serialNumber?: string | null;
  computerModel?: string | null;
  category?: string | null;
  diveMode?: string | null;
  site?: string | null;
  userSite?: string | null;
  userSiteSource?: string | null;
  location?: string | null;
  locationSource?: string | null;
  tripId?: string | null;
  buddy?: string | null;
  notes?: string | null;
  gasMixes?: GasMix[];
  tanks?: unknown[];
  samples?: DiveSample[];
  photoCount?: number;
  sources?: string[];
  sourceDiveNumbers?: Record<string, number | null | undefined>;
  sourceSiteNames?: Record<string, string | null | undefined>;
  sourceLocations?: Record<string, string | null | undefined>;
  userGpsLat?: number | null;
  userGpsLng?: number | null;
  userGpsSource?: string | null;
  userGpsUpdatedAt?: string | null;
  gpsEntryLat?: number | null;
  gpsEntryLng?: number | null;
  gpsExitLat?: number | null;
  gpsExitLng?: number | null;
  userSiteCatalogId?: string | null;
  resolvedLocation?: string | null;
  resolvedCity?: string | null;
  resolvedCountry?: string | null;
  exportGpsPreference?: string | null;
  importedAt?: string;
  appEditedAt?: string | null;
  averageDepth?: number | null;
  minTemp?: number | null;
  maxTemp?: number | null;
  waterTemperatureC?: number | null;
  cylinderPresetId?: string | null;
  cylinderVolumeL?: number | null;
  tankPressuresStartBar?: Array<number | null>;
  tankPressuresEndBar?: Array<number | null>;
};

export type MergeGroupOverlay = {
  buddy?: string | null;
  notes?: string | null;
  userSite?: string | null;
  userSiteSource?: "catalog" | "suggestion" | "manual" | "memo" | null;
  userSiteCatalogId?: string | null;
  userGpsLat?: number | null;
  userGpsLng?: number | null;
  userGpsSource?:
    | "manual"
    | "photo-exif"
    | "memo"
    | "catalog"
    | "site-selection"
    | null;
  exportGpsPreference?: "computer" | "user" | "user-if-missing";
};

export type LocalDiveMergeGroup = {
  id: string;
  memberDiveIds: string[];
  createdAt: string;
  updatedAt: string;
  memberRevision: Array<{
    diveId: string;
    importedAt: string;
    appEditedAt: string | null;
    diveDate: string | null;
    durationSeconds: number | null;
    maxDepthM: number | null;
  }>;
  overlay?: MergeGroupOverlay | null;
};

export type SegmentMergeEvaluation<T extends SegmentMergeDive> = {
  ok: boolean;
  errors: SegmentMergeErrorCode[];
  warnings: SegmentMergeWarningCode[];
  ordered: T[];
  gapsSeconds: number[];
  clockDurationSeconds: number | null;
  underwaterDurationSeconds: number | null;
};

export type MergedProfile = {
  samples: DiveSample[];
  durationSeconds: number;
  maxDepthM: number | null;
  averageDepthM: number | null;
  gasConflict: boolean;
};

export type ProjectedMergeFields = {
  mergeGroupId: string;
  memberDiveIds: string[];
  gasConflict: boolean;
  mergeStale: boolean;
};

export function mergePresentationId(groupId: string) {
  return `${MERGE_PRESENTATION_PREFIX}${groupId}`;
}

export function parseMergePresentationId(id: string) {
  if (!id.startsWith(MERGE_PRESENTATION_PREFIX)) return null;
  const groupId = id.slice(MERGE_PRESENTATION_PREFIX.length);
  return groupId || null;
}

export function isMergePresentationId(id: string) {
  return parseMergePresentationId(id) !== null;
}

export function parseDiveStartMs(diveDate: string | null | undefined) {
  if (!diveDate) return null;
  const timestamp = new Date(diveDate.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function normalizeComputerSerial(value: string | null | undefined) {
  const normalized = value?.replace(/[^a-z0-9]/gi, "").toUpperCase() ?? "";
  return normalized || null;
}

export function orderSegmentMembers<T extends SegmentMergeDive>(members: T[]) {
  return [...members].sort((left, right) => {
    const leftStart = parseDiveStartMs(left.diveDate) ?? Number.POSITIVE_INFINITY;
    const rightStart = parseDiveStartMs(right.diveDate) ?? Number.POSITIVE_INFINITY;
    if (leftStart !== rightStart) return leftStart - rightStart;
    return (
      (left.diveNumber ?? 0) - (right.diveNumber ?? 0) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function surfaceGapSeconds(
  first: SegmentMergeDive,
  second: SegmentMergeDive,
) {
  const firstStart = parseDiveStartMs(first.diveDate);
  const secondStart = parseDiveStartMs(second.diveDate);
  if (
    firstStart === null ||
    secondStart === null ||
    first.durationSeconds === null ||
    !Number.isFinite(first.durationSeconds)
  ) {
    return null;
  }
  return (secondStart - (firstStart + first.durationSeconds * 1000)) / 1000;
}

export function gasesAreCompatible(
  first: SegmentMergeDive,
  second: SegmentMergeDive,
) {
  const firstMixes = first.gasMixes ?? [];
  const secondMixes = second.gasMixes ?? [];
  if (firstMixes.length !== secondMixes.length) return false;
  const mixesMatch = firstMixes.every((mix, index) => {
    const other = secondMixes[index];
    const oxygen = (mix.oxygenPercent ?? 21) - (other.oxygenPercent ?? 21);
    const helium = (mix.heliumPercent ?? 0) - (other.heliumPercent ?? 0);
    return Math.abs(oxygen) <= 1 && Math.abs(helium) <= 1;
  });
  if (!mixesMatch) return false;
  if ((first.tanks?.length ?? 0) !== (second.tanks?.length ?? 0)) return false;
  const firstVolume = first.cylinderVolumeL;
  const secondVolume = second.cylinderVolumeL;
  return !(
    typeof firstVolume === "number" &&
    Number.isFinite(firstVolume) &&
    typeof secondVolume === "number" &&
    Number.isFinite(secondVolume) &&
    Math.abs(firstVolume - secondVolume) > 0.3
  );
}

export function evaluateSegmentMerge<T extends SegmentMergeDive>(
  members: T[],
): SegmentMergeEvaluation<T> {
  const errors: SegmentMergeErrorCode[] = [];
  const warnings: SegmentMergeWarningCode[] = [];
  const unique = [...new Map(members.map((dive) => [dive.id, dive])).values()];
  if (unique.length < 2) errors.push("too-few");
  if (unique.length !== members.length) errors.push("duplicate-id");
  const ordered = orderSegmentMembers(unique);
  const gapsSeconds: number[] = [];
  let underwaterDurationSeconds = 0;

  for (const dive of ordered) {
    if (parseDiveStartMs(dive.diveDate) === null) errors.push("missing-start");
    if (
      dive.durationSeconds === null ||
      !Number.isFinite(dive.durationSeconds) ||
      dive.durationSeconds <= 0
    ) {
      errors.push("missing-duration");
    } else {
      underwaterDurationSeconds += dive.durationSeconds;
    }
  }

  const serials = ordered.map((dive) =>
    normalizeComputerSerial(dive.serialNumber),
  );
  const models = ordered.map((dive) => dive.computerModel?.trim() || null);
  if (serials.every(Boolean)) {
    if (new Set(serials).size > 1) errors.push("serial-mismatch");
  } else if (models.every(Boolean)) {
    if (new Set(models).size > 1) errors.push("computer-mismatch");
    if (serials.some((serial) => !serial)) warnings.push("missing-serial");
  } else {
    errors.push("unknown-computer");
  }

  const categories = new Set(ordered.map((dive) => dive.category ?? "scuba"));
  if (categories.size > 1) errors.push("category-mismatch");

  const knownModes = ordered
    .map((dive) => dive.diveMode)
    .filter((mode): mode is string => Boolean(mode) && mode !== "unknown");
  if (new Set(knownModes).size > 1) errors.push("dive-mode-mismatch");
  if (ordered.some((dive) => !dive.diveMode || dive.diveMode === "unknown")) {
    warnings.push("unknown-dive-mode");
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const gap = surfaceGapSeconds(ordered[index], ordered[index + 1]);
    if (gap === null) continue;
    const clamped = gap + SEGMENT_CLOCK_SKEW_SECONDS < 0 ? gap : Math.max(0, gap);
    gapsSeconds.push(clamped);
    if (gap + SEGMENT_CLOCK_SKEW_SECONDS < 0) errors.push("overlap");
    else if (clamped > SEGMENT_GAP_HARD_MAX_SECONDS) errors.push("gap-too-large");
    else if (clamped > DEFAULT_SEGMENT_GAP_SOFT_MAX_SECONDS) {
      warnings.push("long-gap");
    }
  }

  const sites = new Set(
    ordered.map((dive) =>
      (dive.userSite?.trim() || dive.site?.trim() || "").toLowerCase(),
    ),
  );
  if (sites.size > 1) warnings.push("site-mismatch");
  const trips = new Set(ordered.map((dive) => dive.tripId ?? ""));
  if (trips.size > 1) warnings.push("trip-mismatch");
  const buddies = ordered.map((dive) => dive.buddy?.trim() || "").filter(Boolean);
  if (new Set(buddies).size > 1) warnings.push("buddy-mismatch");
  const notes = ordered.map((dive) => dive.notes?.trim() || "").filter(Boolean);
  if (new Set(notes).size > 1) warnings.push("notes-mismatch");
  if (
    ordered.some((dive, index) =>
      ordered.slice(index + 1).some((other) => !gasesAreCompatible(dive, other)),
    )
  ) {
    warnings.push("gas-conflict");
  }

  const firstStart = parseDiveStartMs(ordered[0]?.diveDate ?? null);
  const last = ordered.at(-1);
  const lastStart = parseDiveStartMs(last?.diveDate ?? null);
  const lastDuration = last?.durationSeconds;
  const clockDurationSeconds =
    firstStart !== null &&
    lastStart !== null &&
    lastDuration !== null &&
    lastDuration !== undefined &&
    Number.isFinite(lastDuration)
      ? (lastStart + lastDuration * 1000 - firstStart) / 1000
      : null;

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    ordered,
    gapsSeconds,
    clockDurationSeconds,
    underwaterDurationSeconds: ordered.length ? underwaterDurationSeconds : null,
  };
}

export function averageSampleDepthM(
  samples: DiveSample[],
  options: { includeSurface?: boolean } = {},
) {
  const includeSurface = options.includeSurface === true;
  const readings = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.elapsedSeconds) && Number.isFinite(sample.depthM),
    )
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  if (readings.length < 2) return readings[0]?.depthM ?? null;
  let weightedTotal = 0;
  let totalSeconds = 0;
  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const current = readings[index];
    const interval = current.elapsedSeconds - previous.elapsedSeconds;
    if (interval <= 0) continue;
    if (!includeSurface && previous.depthM === 0 && current.depthM === 0) {
      continue;
    }
    weightedTotal += ((previous.depthM + current.depthM) / 2) * interval;
    totalSeconds += interval;
  }
  return totalSeconds > 0 ? weightedTotal / totalSeconds : null;
}

export function buildMergedProfile(members: SegmentMergeDive[]): MergedProfile {
  const ordered = orderSegmentMembers(members);
  const evaluation = evaluateSegmentMerge(ordered);
  const firstStart = parseDiveStartMs(ordered[0]?.diveDate ?? null) ?? 0;
  const samples: DiveSample[] = [];
  const pushUnique = (sample: DiveSample) => {
    const previous = samples.at(-1);
    if (
      previous &&
      previous.elapsedSeconds === sample.elapsedSeconds &&
      previous.depthM === sample.depthM
    ) {
      return;
    }
    samples.push(sample);
  };

  ordered.forEach((member, index) => {
    const start = parseDiveStartMs(member.diveDate) ?? firstStart;
    const offset = (start - firstStart) / 1000;
    const duration = member.durationSeconds ?? 0;
    for (const sample of member.samples ?? []) {
      pushUnique({
        ...sample,
        pressuresBar: [...(sample.pressuresBar ?? [])],
        elapsedSeconds: sample.elapsedSeconds + offset,
      });
    }
    if (index < ordered.length - 1) {
      const gap = evaluation.gapsSeconds[index] ?? 0;
      if (gap > SEGMENT_CLOCK_SKEW_SECONDS) {
        pushUnique({
          elapsedSeconds: offset + duration,
          depthM: 0,
          pressuresBar: [],
        });
        const nextStart = parseDiveStartMs(ordered[index + 1].diveDate) ?? start;
        pushUnique({
          elapsedSeconds: (nextStart - firstStart) / 1000,
          depthM: 0,
          pressuresBar: [],
        });
      }
    }
  });

  const last = ordered.at(-1);
  const lastStart = parseDiveStartMs(last?.diveDate ?? null) ?? firstStart;
  const durationSeconds =
    evaluation.clockDurationSeconds ??
    (lastStart - firstStart) / 1000 + (last?.durationSeconds ?? 0);
  const depths = ordered
    .map((member) => member.maxDepthM)
    .filter((depth): depth is number => depth !== null && Number.isFinite(depth));

  return {
    samples,
    durationSeconds,
    maxDepthM: depths.length ? Math.max(...depths) : null,
    averageDepthM: averageSampleDepthM(samples),
    gasConflict: evaluation.warnings.includes("gas-conflict"),
  };
}

export function captureMemberRevision(dive: SegmentMergeDive) {
  return {
    diveId: dive.id,
    importedAt: dive.importedAt ?? "",
    appEditedAt: dive.appEditedAt ?? null,
    diveDate: dive.diveDate,
    durationSeconds: dive.durationSeconds,
    maxDepthM: dive.maxDepthM ?? null,
  };
}

export function isMergeGroupStale(
  group: LocalDiveMergeGroup,
  members: SegmentMergeDive[],
) {
  if (!group.memberRevision?.length) return false;
  const byId = new Map(members.map((dive) => [dive.id, dive]));
  return group.memberRevision.some((revision) => {
    const current = byId.get(revision.diveId);
    if (!current) return true;
    return (
      (current.importedAt ?? "") !== revision.importedAt ||
      (current.appEditedAt ?? null) !== revision.appEditedAt ||
      current.diveDate !== revision.diveDate ||
      current.durationSeconds !== revision.durationSeconds ||
      (current.maxDepthM ?? null) !== revision.maxDepthM
    );
  });
}

export function projectMergedDive<T extends SegmentMergeDive>(
  members: T[],
  group: LocalDiveMergeGroup,
): T & ProjectedMergeFields {
  const evaluation = evaluateSegmentMerge(members);
  const ordered = evaluation.ordered.length ? evaluation.ordered : members;
  const profile = buildMergedProfile(ordered);
  const first = ordered[0];
  const overlay = group.overlay ?? {};
  const siteDive =
    ordered.find((dive) => dive.userSite?.trim()) ??
    ordered.find((dive) => dive.site?.trim()) ??
    first;
  const locationDive =
    ordered.find((dive) => dive.locationSource && dive.location?.trim()) ??
    ordered.find((dive) => dive.location?.trim()) ??
    first;
  const overlayGps = validatedCoordinatePair(
    overlay.userGpsLat,
    overlay.userGpsLng,
  );
  const gpsDive = ordered.find((dive) =>
    Boolean(validatedCoordinatePair(dive.userGpsLat, dive.userGpsLng)),
  );
  const computerGpsDive = ordered.find(
    (dive) =>
      Boolean(validatedCoordinatePair(dive.gpsEntryLat, dive.gpsEntryLng)) ||
      Boolean(validatedCoordinatePair(dive.gpsExitLat, dive.gpsExitLng)),
  );
  const tripIds = new Set(ordered.map((dive) => dive.tripId ?? null));
  const sources = [...new Set(ordered.flatMap((dive) => dive.sources ?? []))];
  const gasDive = ordered.find((dive) => (dive.gasMixes?.length ?? 0) > 0) ?? first;
  const tankDive = ordered.find((dive) => (dive.tanks?.length ?? 0) > 0) ?? first;
  const projected = {
    ...first,
    id: mergePresentationId(group.id),
    diveDate: first?.diveDate ?? null,
    diveNumber: first?.diveNumber ?? null,
    durationSeconds: profile.durationSeconds,
    lengthText: String(Math.round(profile.durationSeconds)),
    maxDepthM: profile.maxDepthM,
    depth:
      profile.maxDepthM !== null
        ? String(profile.maxDepthM)
        : (first?.depth ?? null),
    averageDepth: profile.averageDepthM,
    samples: profile.samples,
    site: siteDive?.site ?? null,
    userSite: overlay.userSite ?? siteDive?.userSite ?? null,
    userSiteSource: overlay.userSiteSource ?? siteDive?.userSiteSource ?? null,
    userSiteCatalogId:
      overlay.userSiteCatalogId ?? siteDive?.userSiteCatalogId ?? null,
    location: locationDive?.location ?? null,
    locationSource: locationDive?.locationSource ?? null,
    tripId: tripIds.size === 1 ? [...tripIds][0] : null,
    buddy:
      overlay.buddy ?? ordered.find((dive) => dive.buddy?.trim())?.buddy ?? null,
    notes:
      overlay.notes ?? ordered.find((dive) => dive.notes?.trim())?.notes ?? null,
    gasMixes: profile.gasConflict ? [] : (gasDive?.gasMixes ?? []),
    tanks: profile.gasConflict ? [] : (tankDive?.tanks ?? []),
    photoCount: ordered.reduce((total, dive) => total + (dive.photoCount ?? 0), 0),
    sources,
    sourceDiveNumbers: mergeSourceMapsFirstWins(
      ordered.map((dive) => dive.sourceDiveNumbers),
    ),
    sourceSiteNames: mergeSourceMapsFirstWins(
      ordered.map((dive) => dive.sourceSiteNames),
    ),
    sourceLocations: mergeSourceMapsFirstWins(
      ordered.map((dive) => dive.sourceLocations),
    ),
    userGpsLat: overlayGps?.latitude ?? gpsDive?.userGpsLat ?? null,
    userGpsLng: overlayGps?.longitude ?? gpsDive?.userGpsLng ?? null,
    userGpsSource: overlayGps
      ? (overlay.userGpsSource ?? null)
      : (gpsDive?.userGpsSource ?? null),
    userGpsUpdatedAt: overlayGps ? group.updatedAt : (gpsDive?.userGpsUpdatedAt ?? null),
    gpsEntryLat: computerGpsDive?.gpsEntryLat ?? first?.gpsEntryLat ?? null,
    gpsEntryLng: computerGpsDive?.gpsEntryLng ?? first?.gpsEntryLng ?? null,
    gpsExitLat: computerGpsDive?.gpsExitLat ?? first?.gpsExitLat ?? null,
    gpsExitLng: computerGpsDive?.gpsExitLng ?? first?.gpsExitLng ?? null,
    exportGpsPreference:
      overlay.exportGpsPreference ??
      gpsDive?.exportGpsPreference ??
      first?.exportGpsPreference ??
      "computer",
    importedAt: ordered.reduce(
      (latest, dive) =>
        (dive.importedAt ?? "") > latest ? (dive.importedAt ?? latest) : latest,
      first?.importedAt ?? "",
    ),
    mergeGroupId: group.id,
    memberDiveIds: ordered.map((dive) => dive.id),
    gasConflict: profile.gasConflict,
    mergeStale: isMergeGroupStale(group, ordered) || !evaluation.ok,
  };
  return projected as T & ProjectedMergeFields;
}

export function projectLogbookDives<T extends SegmentMergeDive>(
  dives: T[],
  groups: LocalDiveMergeGroup[],
): Array<T | (T & ProjectedMergeFields)> {
  const divesById = new Map(dives.map((dive) => [dive.id, dive]));
  const hidden = new Set<string>();
  const projected: Array<T | (T & ProjectedMergeFields)> = [];

  for (const group of groups) {
    const members = group.memberDiveIds
      .map((id) => divesById.get(id))
      .filter((dive): dive is T => Boolean(dive));
    if (
      members.length !== group.memberDiveIds.length ||
      members.length < 2 ||
      members.some((member) => hidden.has(member.id))
    ) {
      continue;
    }
    members.forEach((dive) => hidden.add(dive.id));
    projected.push(projectMergedDive(members, group));
  }

  for (const dive of dives) {
    if (!hidden.has(dive.id)) projected.push(dive);
  }

  return projected.sort((left, right) => {
    const dateOrder = String(right.diveDate ?? "").localeCompare(
      String(left.diveDate ?? ""),
    );
    return dateOrder || (right.diveNumber ?? 0) - (left.diveNumber ?? 0);
  });
}

function validatedCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  return typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function mergeSourceMapsFirstWins<T>(
  maps: Array<Record<string, T | undefined> | undefined>,
) {
  const result: Record<string, T> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map ?? {})) {
      if (!(key in result) && value !== undefined) result[key] = value;
    }
  }
  return result;
}

export function expandSelectionToOriginalIds(
  ids: readonly string[],
  groups: LocalDiveMergeGroup[],
) {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const expanded: string[] = [];
  for (const id of ids) {
    const groupId = parseMergePresentationId(id);
    if (groupId) {
      const group = groupById.get(groupId);
      if (group) expanded.push(...group.memberDiveIds);
      continue;
    }
    expanded.push(id);
  }
  return [...new Set(expanded)];
}
