import type { LocalDive, SourceRecord } from "./indexed-db";
import { subsurfaceSourceId } from "./parsers/subsurface";

export type SubsurfaceSiteExportResult = {
  xml: string;
  updatedDives: number;
  addedSites: number;
  updatedBuddies: number;
  updatedNotes: number;
};

// This is deliberately a pass-through transformation. DiveFrame's normalized
// model is not a round-trip representation of Subsurface XML, so we edit a
// freshly supplied source document and leave all unrelated nodes untouched.
export async function addDiveFrameSitesToSubsurface(
  file: File,
  dives: LocalDive[],
  sourceRecords: SourceRecord[],
): Promise<SubsurfaceSiteExportResult> {
  const document = new DOMParser().parseFromString(
    await file.text(),
    "application/xml",
  );
  if (
    document.querySelector("parsererror") ||
    document.documentElement.tagName !== "divelog"
  ) {
    throw new Error("This does not look like a valid Subsurface XML log.");
  }

  const canonicalById = new Map(dives.map((dive) => [dive.id, dive]));
  const canonicalIdBySource = new Map(
    sourceRecords
      .filter((record) => record.source === "subsurface")
      .map((record) => [record.sourceId, record.diveId]),
  );
  const divesRoot = document.querySelector("dives");
  if (!divesRoot) throw new Error("This Subsurface log has no dives section.");
  const sitesRoot = ensureDiveSites(document, divesRoot);
  const sites = Array.from(sitesRoot.querySelectorAll(":scope > site"));
  const sitesByKey = new Map(
    sites.map((site) => [
      siteKey(site.getAttribute("name") ?? "", site.getAttribute("gps")),
      site,
    ]),
  );
  const sitesById = new Map(
    sites
      .map((site) => [site.getAttribute("uuid"), site] as const)
      .filter((entry): entry is [string, Element] => Boolean(entry[0])),
  );
  const existingIds = new Set(sitesById.keys());
  let updatedDives = 0;
  let addedSites = 0;
  let updatedBuddies = 0;
  let updatedNotes = 0;

  for (const sourceDive of Array.from(divesRoot.querySelectorAll("dive"))) {
    const sourceId = subsurfaceSourceId(sourceDive);
    const canonicalId = canonicalIdBySource.get(sourceId);
    const dive = canonicalId ? canonicalById.get(canonicalId) : null;
    if (!dive) continue;
    let changed = false;
    const targetName =
      dive.userSite?.trim() ||
      dive.sourceSiteNames.shearwater?.trim() ||
      null;
    const currentSite = sitesById.get(
      sourceDive.getAttribute("divesiteid") ?? "",
    );
    const sourceGps =
      currentSite?.getAttribute("gps")?.trim() ||
      sourceDiveGps(sourceDive);
    const userGps = formattedGps(dive.userGpsLat, dive.userGpsLng);
    const targetGps = sourceGps || userGps;
    const currentName = currentSite?.getAttribute("name")?.trim() || null;
    const resolvedName = targetName || currentName || targetGps;
    if (resolvedName) {
      const key = siteKey(resolvedName, targetGps);
      const currentKey = currentSite
        ? siteKey(
            currentSite.getAttribute("name") ?? "",
            currentSite.getAttribute("gps"),
          )
        : null;
      if (currentKey !== key) {
        let targetSite = sitesByKey.get(key);
        if (!targetSite) {
          targetSite = document.createElement("site");
          const uuid = createSiteId(existingIds);
          targetSite.setAttribute("uuid", uuid);
          targetSite.setAttribute("name", resolvedName);
          if (targetGps) targetSite.setAttribute("gps", targetGps);
          sitesRoot.appendChild(document.createTextNode("\n"));
          sitesRoot.appendChild(targetSite);
          sitesRoot.appendChild(document.createTextNode("\n"));
          sitesByKey.set(key, targetSite);
          sitesById.set(uuid, targetSite);
          addedSites += 1;
        }
        sourceDive.setAttribute("divesiteid", targetSite.getAttribute("uuid")!);
        changed = true;
      }
    }

    if (setDirectChildText(document, sourceDive, "buddy", dive.buddy)) {
      updatedBuddies += 1;
      changed = true;
    }
    if (setDirectChildText(document, sourceDive, "notes", dive.notes)) {
      updatedNotes += 1;
      changed = true;
    }
    if (changed) updatedDives += 1;
  }

  return {
    xml: new XMLSerializer().serializeToString(document),
    updatedDives,
    addedSites,
    updatedBuddies,
    updatedNotes,
  };
}

function ensureDiveSites(document: XMLDocument, divesRoot: Element) {
  const existing = document.querySelector("divelog > divesites");
  if (existing) return existing;
  const sites = document.createElement("divesites");
  document.documentElement.insertBefore(sites, divesRoot);
  document.documentElement.insertBefore(
    document.createTextNode("\n"),
    divesRoot,
  );
  return sites;
}

function siteKey(name: string, gps: string | null) {
  return `${name.trim().toLocaleLowerCase("en").replace(/\s+/g, " ")}\u0000${
    gps?.trim().replace(/\s+/g, " ") ?? ""
  }`;
}

function sourceDiveGps(dive: Element) {
  const computer = dive.querySelector("divecomputer");
  const startLocation = Array.from(
    computer?.querySelectorAll("extradata") ?? [],
  ).find(
    (extra) =>
      extra.getAttribute("key")?.trim().toLocaleLowerCase("en") ===
      "start location",
  );
  return startLocation?.getAttribute("value")?.trim() || null;
}

function formattedGps(latitude: number | null, longitude: number | null) {
  return latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? `${latitude.toFixed(6)} ${longitude.toFixed(6)}`
    : null;
}

function createSiteId(existingIds: Set<string>) {
  let id = "";
  do {
    id = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

function setDirectChildText(
  document: XMLDocument,
  parent: Element,
  tagName: string,
  value: string | null,
) {
  const next = value?.trim();
  if (!next) return false;
  const existing = Array.from(parent.children).find(
    (child) => child.tagName.toLocaleLowerCase("en") === tagName,
  );
  if (existing?.textContent?.trim() === next) return false;
  if (existing) {
    existing.textContent = next;
    return true;
  }
  const element = document.createElement(tagName);
  element.textContent = next;
  const firstComputer = Array.from(parent.children).find(
    (child) => child.tagName.toLocaleLowerCase("en") === "divecomputer",
  );
  parent.insertBefore(document.createTextNode("  "), firstComputer ?? null);
  parent.insertBefore(element, firstComputer ?? null);
  parent.insertBefore(document.createTextNode("\n"), firstComputer ?? null);
  return true;
}
