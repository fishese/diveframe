import type { DiveSample, GasMix } from "../dive-model";
import { gasMixLabel } from "../dive-model";
import type { LocalImportedDive } from "../indexed-db";
import {
  parseDepthMetres,
  parseDurationSeconds,
  parsePressureBar,
  parseTemperatureCelsius,
  parseUnitNumber,
} from "../unit-conversion";
import { inferCategory, parseGpsPair } from "./parser-utils";

export function readSubsurfaceLog(xmlText: string): LocalImportedDive[] {
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (
    document.querySelector("parsererror") ||
    document.documentElement.tagName !== "divelog"
  ) {
    throw new Error("This does not look like a valid Subsurface log.");
  }

  const sites = new Map(
    Array.from(document.querySelectorAll("divesites > site")).map((site) => [
      site.getAttribute("uuid") ?? "",
      {
        name: site.getAttribute("name"),
        gps: parseGpsPair(site.getAttribute("gps")),
      },
    ]),
  );

  return Array.from(document.querySelectorAll("dives > dive")).map((dive) => {
    const computer = dive.querySelector("divecomputer");
    const depth = computer?.querySelector("depth");
    const temperature = computer?.querySelector("temperature");
    const extras = new Map(
      Array.from(computer?.querySelectorAll("extradata") ?? []).map((extra) => [
        extra.getAttribute("key")?.toLowerCase() ?? "",
        extra.getAttribute("value"),
      ]),
    );
    const site = sites.get(dive.getAttribute("divesiteid") ?? "");
    const entryGps = site?.gps ?? parseGpsPair(extras.get("start location") ?? null);
    const serial = extras.get("serial")?.trim() || null;
    const deviceId = computer?.getAttribute("deviceid") ?? "unknown-device";
    const computerDiveId =
      computer?.getAttribute("diveid") ??
      `${dive.getAttribute("date") ?? "unknown"}-${dive.getAttribute("time") ?? "unknown"}`;
    const sourceId = `${deviceId}:${computerDiveId}`;
    const date = dive.getAttribute("date");
    const time = dive.getAttribute("time");
    const maximumDepth = parseDepthMetres(depth?.getAttribute("max"));
    const averageDepth = parseDepthMetres(depth?.getAttribute("mean"));
    const waterTemperature = parseTemperatureCelsius(
      temperature?.getAttribute("water"),
    );
    const siteName =
      site?.name && !looksLikeCoordinates(site.name) ? site.name.trim() : null;
    const samples = Array.from(computer?.querySelectorAll("sample") ?? [])
      .map(parseSample)
      .filter((sample): sample is DiveSample => sample !== null)
      .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    const gasMixes = directChildren(dive, "cylinder").map(parseCylinder);
    const category = inferCategory(
      dive.getAttribute("type") ?? computer?.getAttribute("mode"),
    );
    const samplePressures = pressureBounds(samples);
    const durationSeconds =
      parseDurationSeconds(dive.getAttribute("duration")) ??
      samples.at(-1)?.elapsedSeconds ??
      null;

    return {
      id: `subsurface:${sourceId}`,
      source: "subsurface",
      sourceId,
      diveNumber: asNumber(dive.getAttribute("number")),
      diveDate: date ? `${date} ${time || "00:00:00"}` : null,
      lastModified: null,
      depth: maximumDepth === null ? null : String(maximumDepth),
      averageDepth,
      minTemp: waterTemperature,
      maxTemp: waterTemperature,
      lengthText: durationSeconds === null ? null : String(durationSeconds),
      durationSeconds,
      location: null,
      site: siteName,
      buddy: directChildText(dive, "buddy"),
      notes: directChildText(dive, "notes"),
      serialNumber: serial,
      gpsEntryLat: entryGps?.latitude ?? null,
      gpsEntryLng: entryGps?.longitude ?? null,
      gpsExitLat: null,
      gpsExitLng: null,
      calculatedJson:
        averageDepth === null && waterTemperature === null
          ? null
          : JSON.stringify({
              AverageDepth: averageDepth,
              MinTemp: waterTemperature,
              MaxTemp: waterTemperature,
            }),
      category: category.category,
      categorySource: category.source,
      maxDepthM:
        maximumDepth ??
        (samples.length ? Math.max(...samples.map((sample) => sample.depthM)) : null),
      waterTemperatureC:
        waterTemperature ??
        samples.find((sample) => sample.temperatureC !== undefined)?.temperatureC ??
        null,
      gasMixes,
      computerModel: computer?.getAttribute("model")?.trim() || null,
      samples,
      tankPressuresStartBar: samplePressures.start,
      tankPressuresEndBar: samplePressures.end,
    };
  });
}

function parseSample(element: Element): DiveSample | null {
  const elapsedSeconds = parseDurationSeconds(element.getAttribute("time"));
  const depthM = parseDepthMetres(element.getAttribute("depth"));
  if (elapsedSeconds === null || depthM === null) return null;
  const pressuresBar: number[] = [];
  for (const attribute of Array.from(element.attributes)) {
    const match = attribute.name.match(/^pressure(\d+)$/i);
    if (!match) continue;
    const index = Number(match[1]);
    const value = parsePressureBar(attribute.value);
    if (value !== null) pressuresBar[index] = value;
  }
  const temperatureC = parseTemperatureCelsius(element.getAttribute("temp"));
  const ndlSeconds = parseDurationSeconds(element.getAttribute("ndl"));
  return {
    elapsedSeconds,
    depthM,
    ...(temperatureC === null ? {} : { temperatureC }),
    pressuresBar,
    ...(ndlSeconds === null ? {} : { ndlSeconds }),
  };
}

function parseCylinder(element: Element): GasMix {
  const oxygenPercent = parseUnitNumber(element.getAttribute("o2")) ?? 21;
  const heliumPercent = parseUnitNumber(element.getAttribute("he")) ?? 0;
  return {
    oxygenPercent,
    heliumPercent,
    label: gasMixLabel(oxygenPercent, heliumPercent),
  };
}

function pressureBounds(samples: DiveSample[]) {
  const cylinderCount = samples.reduce(
    (maximum, sample) => Math.max(maximum, sample.pressuresBar.length),
    0,
  );
  const start: Array<number | null> = Array(cylinderCount).fill(null);
  const end: Array<number | null> = Array(cylinderCount).fill(null);
  for (const sample of samples) {
    sample.pressuresBar.forEach((pressure, index) => {
      if (!Number.isFinite(pressure)) return;
      if (start[index] === null) start[index] = pressure;
      end[index] = pressure;
    });
  }
  return { start, end };
}

function directChildren(parent: Element, tagName: string) {
  return Array.from(parent.children).filter(
    (child) => child.tagName.toLocaleLowerCase("en") === tagName,
  );
}

function directChildText(parent: Element, tagName: string) {
  const child = directChildren(parent, tagName)[0];
  return child?.textContent?.trim() || null;
}

function looksLikeCoordinates(value: string) {
  return /^-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?$/.test(value.trim());
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
