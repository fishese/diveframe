import type { LocalDive } from "./indexed-db";

export type SubsurfaceLogbookExportValidation =
  | { ok: true }
  | { ok: false; incompleteDiveIds: string[] };

/**
 * A portable logbook needs a date, a duration, and a usable depth/time profile.
 * Incomplete Cloud-only or sparse records are skipped so the rest can still
 * export, instead of failing the whole logbook.
 */
export function partitionSubsurfaceLogbookDives(dives: LocalDive[]) {
  const portable: LocalDive[] = [];
  const incompleteDiveIds: string[] = [];
  for (const dive of dives) {
    if (isPortableDive(dive)) portable.push(dive);
    else incompleteDiveIds.push(dive.id);
  }
  return { portable, incompleteDiveIds };
}

export function validateSubsurfaceLogbookExport(
  dives: LocalDive[],
): SubsurfaceLogbookExportValidation {
  const { incompleteDiveIds } = partitionSubsurfaceLogbookDives(dives);
  return incompleteDiveIds.length
    ? { ok: false, incompleteDiveIds }
    : { ok: true };
}

export function createSubsurfaceLogbook(dives: LocalDive[]) {
  const { portable } = partitionSubsurfaceLogbookDives(dives);
  if (!portable.length) {
    throw new Error("Cannot export a Subsurface logbook with no complete dive records.");
  }

  const sites = new Map<string, ExportSite>();
  const siteIdByDiveId = new Map<string, string>();
  const usedSiteIds = new Set<string>();
  portable.forEach((dive) => {
    const draft = exportSiteForDive(dive);
    if (!draft) return;
    const key = `${draft.name}\u0000${draft.gps ?? ""}`;
    const existing = sites.get(key);
    if (existing) {
      siteIdByDiveId.set(dive.id, existing.id);
      return;
    }
    let id = siteUuidForKey(key);
    let collision = 0;
    while (usedSiteIds.has(id)) {
      collision += 1;
      id = ((Number.parseInt(siteUuidForKey(key), 16) + collision) >>> 0)
        .toString(16)
        .padStart(8, "0");
    }
    usedSiteIds.add(id);
    const site = { ...draft, id };
    sites.set(key, site);
    siteIdByDiveId.set(dive.id, id);
  });

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<divelog program="DiveFrame" version="3">',
    "  <divesites>",
    ...[...sites.values()].map(
      (site) =>
        `    <site uuid="${escapeXml(site.id)}" name="${escapeXml(site.name)}"${
          site.gps ? ` gps="${escapeXml(site.gps)}"` : ""
        }></site>`,
    ),
    "  </divesites>",
    "  <dives>",
    ...portable.flatMap((dive, index) =>
      serializeDive(dive, index + 1, siteIdByDiveId.get(dive.id) ?? null),
    ),
    "  </dives>",
    "</divelog>",
    "",
  ];
  return lines.join("\n");
}

type ExportSite = { id: string; name: string; gps: string | null };

/** Subsurface v3 site ids are short hex tokens; keep them stable per name+gps. */
function siteUuidForKey(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isPortableDive(dive: LocalDive) {
  const samples = profileSamples(dive);
  const distinctTimes = new Set(samples.map((sample) => sample.elapsedSeconds));
  return (
    Boolean(dateAndTime(dive.diveDate)) &&
    Number.isFinite(dive.durationSeconds) &&
    (dive.durationSeconds ?? 0) > 0 &&
    samples.length >= 2 &&
    distinctTimes.size >= 2 &&
    samples.some((sample) => sample.depthM > 0) &&
    samples.at(-1)!.elapsedSeconds > samples[0].elapsedSeconds
  );
}

function exportSiteForDive(dive: LocalDive): Omit<ExportSite, "id"> | null {
  const coordinates = exportCoordinates(dive);
  const gps = coordinates
    ? `${coordinates.latitude.toFixed(6)} ${coordinates.longitude.toFixed(6)}`
    : null;
  const name = dive.userSite?.trim() || dive.site?.trim() || gps;
  return name ? { name, gps } : null;
}

function serializeDive(dive: LocalDive, index: number, siteId: string | null) {
  const stamp = dateAndTime(dive.diveDate)!;
  const samples = profileSamples(dive);
  const maximumDepth =
    finiteNonNegative(dive.maxDepthM) ??
    finiteNonNegative(finiteNumber(dive.depth)) ??
    Math.max(...samples.map((sample) => sample.depthM));
  const averageDepth =
    finiteNonNegative(dive.averageDepth) ?? timeWeightedAverageDepth(samples);
  const attributes = [
    `number="${dive.diveNumber ?? index}"`,
    `date="${stamp.date}"`,
    `time="${stamp.time}"`,
    `duration="${formatDuration(dive.durationSeconds!)}"`,
    `type="${categoryForSubsurface(dive.category)}"`,
    ...(siteId ? [`divesiteid="${escapeXml(siteId)}"`] : []),
  ];
  const lines = [`    <dive ${attributes.join(" ")}>`];
  if (dive.buddy?.trim()) lines.push(`      <buddy>${escapeXml(dive.buddy.trim())}</buddy>`);
  if (dive.notes?.trim()) lines.push(`      <notes>${escapeXml(dive.notes.trim())}</notes>`);
  dive.gasMixes.forEach((mix) => {
    const oxygen = mix.oxygenPercent ?? 21;
    const helium = mix.heliumPercent ?? 0;
    lines.push(`      <cylinder o2="${oxygen}%" he="${helium}%"/>`);
  });
  lines.push(
    `      <divecomputer model="${escapeXml(dive.computerModel ?? "DiveFrame")}" deviceid="diveframe" diveid="${escapeXml(dive.id)}">`,
    `        <depth max="${maximumDepth.toFixed(2)} m" mean="${averageDepth.toFixed(2)} m"/>`,
  );
  if (dive.waterTemperatureC !== null && Number.isFinite(dive.waterTemperatureC)) {
    lines.push(`        <temperature water="${dive.waterTemperatureC.toFixed(1)} C"/>`);
  }
  if (dive.serialNumber?.trim()) {
    lines.push(`        <extradata key="serial" value="${escapeXml(dive.serialNumber.trim())}"/>`);
  }
  samples.forEach((sample) => {
    const pressureAttributes = sample.pressuresBar
      .map((pressure, pressureIndex) =>
        Number.isFinite(pressure)
          ? ` pressure${pressureIndex}="${pressure.toFixed(1)} bar"`
          : "",
      )
      .join("");
    const temperature =
      sample.temperatureC !== undefined && Number.isFinite(sample.temperatureC)
        ? ` temp="${sample.temperatureC.toFixed(1)} C"`
        : "";
    const ndl =
      sample.ndlSeconds !== undefined && Number.isFinite(sample.ndlSeconds)
        ? ` ndl="${formatDuration(sample.ndlSeconds)}"`
        : "";
    lines.push(
      `        <sample time="${formatDuration(sample.elapsedSeconds)}" depth="${sample.depthM.toFixed(2)} m"${pressureAttributes}${temperature}${ndl}/>`,
    );
  });
  lines.push("      </divecomputer>", "    </dive>");
  return lines;
}

function dateAndTime(value: string | null) {
  const match = value?.trim().match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!match) return null;
  return { date: match[1], time: match[2] ?? "00:00:00" };
}

function categoryForSubsurface(category: LocalDive["category"]) {
  if (category === "freediving") return "freedive";
  if (category === "snorkelling") return "snorkeling";
  return "scuba";
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} min`;
}

function finiteNumber(value: string | null) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNonNegative(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function profileSamples(dive: LocalDive) {
  return dive.samples
    .filter(
      (sample) =>
        Number.isFinite(sample.elapsedSeconds) &&
        sample.elapsedSeconds >= 0 &&
        Number.isFinite(sample.depthM) &&
        sample.depthM >= 0,
    )
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
}

function timeWeightedAverageDepth(
  samples: Array<{ elapsedSeconds: number; depthM: number }>,
) {
  let depthSeconds = 0;
  let elapsedSeconds = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const interval = current.elapsedSeconds - previous.elapsedSeconds;
    if (interval <= 0) continue;
    depthSeconds += ((previous.depthM + current.depthM) / 2) * interval;
    elapsedSeconds += interval;
  }
  return elapsedSeconds > 0
    ? depthSeconds / elapsedSeconds
    : samples.reduce((sum, sample) => sum + sample.depthM, 0) / samples.length;
}

function exportCoordinates(dive: LocalDive) {
  const computer = validCoordinatePair(dive.gpsEntryLat, dive.gpsEntryLng);
  const user = validCoordinatePair(dive.userGpsLat, dive.userGpsLng);
  if (dive.exportGpsPreference === "user") return user;
  if (dive.exportGpsPreference === "user-if-missing") return computer ?? user;
  return computer;
}

function validCoordinatePair(latitude: number | null, longitude: number | null) {
  return latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === "'") return "&apos;";
    return "&quot;";
  });
}
