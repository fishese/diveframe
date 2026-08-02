import type { LocalDive } from "./indexed-db";

export type SubsurfaceLogbookExportValidation =
  | { ok: true }
  | { ok: false; incompleteDiveIds: string[] };

/**
 * A portable logbook must include a date, a duration, and a usable depth/time
 * profile for every exported dive. This deliberately rejects sparse Cloud-only
 * records instead of creating a file that appears more complete than it is.
 */
export function validateSubsurfaceLogbookExport(
  dives: LocalDive[],
): SubsurfaceLogbookExportValidation {
  const incompleteDiveIds = dives
    .filter((dive) => !isPortableDive(dive))
    .map((dive) => dive.id);
  return incompleteDiveIds.length
    ? { ok: false, incompleteDiveIds }
    : { ok: true };
}

export function createSubsurfaceLogbook(dives: LocalDive[]) {
  const validation = validateSubsurfaceLogbookExport(dives);
  if (!validation.ok) {
    throw new Error(
      `Cannot export ${validation.incompleteDiveIds.length} incomplete dive record(s).`,
    );
  }

  const sites = new Map<string, ExportSite>();
  const siteIdByDiveId = new Map<string, string>();
  dives.forEach((dive) => {
    const site = exportSiteForDive(dive, sites.size + 1);
    if (!site) return;
    const key = `${site.name}\u0000${site.gps ?? ""}`;
    const existing = sites.get(key) ?? site;
    sites.set(key, existing);
    siteIdByDiveId.set(dive.id, existing.id);
  });

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<divelog program="DiveFrame" version="1">',
    "  <divesites>",
    ...[...sites.values()].map(
      (site) =>
        `    <site uuid="${escapeXml(site.id)}" name="${escapeXml(site.name)}"${
          site.gps ? ` gps="${escapeXml(site.gps)}"` : ""
        }/>`,
    ),
    "  </divesites>",
    "  <dives>",
    ...dives.flatMap((dive, index) =>
      serializeDive(dive, index + 1, siteIdByDiveId.get(dive.id) ?? null),
    ),
    "  </dives>",
    "</divelog>",
    "",
  ];
  return lines.join("\n");
}

type ExportSite = { id: string; name: string; gps: string | null };

function isPortableDive(dive: LocalDive) {
  const samples = dive.samples
    .filter(
      (sample) =>
        Number.isFinite(sample.elapsedSeconds) && Number.isFinite(sample.depthM),
    )
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  return (
    Boolean(dateAndTime(dive.diveDate)) &&
    Number.isFinite(dive.durationSeconds) &&
    (dive.durationSeconds ?? 0) > 0 &&
    samples.length >= 2 &&
    samples.at(-1)!.elapsedSeconds > 0
  );
}

function exportSiteForDive(dive: LocalDive, index: number): ExportSite | null {
  const latitude =
    dive.gpsEntryLat ?? dive.userGpsLat ?? null;
  const longitude =
    dive.gpsEntryLng ?? dive.userGpsLng ?? null;
  const gps =
    latitude !== null && longitude !== null
      ? `${latitude.toFixed(6)} ${longitude.toFixed(6)}`
      : null;
  const name = dive.userSite?.trim() || dive.site?.trim() || gps;
  return name ? { id: `diveframe-site-${index}`, name, gps } : null;
}

function serializeDive(dive: LocalDive, index: number, siteId: string | null) {
  const stamp = dateAndTime(dive.diveDate)!;
  const samples = [...dive.samples]
    .filter(
      (sample) =>
        Number.isFinite(sample.elapsedSeconds) && Number.isFinite(sample.depthM),
    )
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  const maximumDepth =
    dive.maxDepthM ??
    finiteNumber(dive.depth) ??
    Math.max(...samples.map((sample) => sample.depthM));
  const averageDepth =
    dive.averageDepth ??
    samples.reduce((sum, sample) => sum + sample.depthM, 0) / samples.length;
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
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/,
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

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === "'") return "&apos;";
    return "&quot;";
  });
}
