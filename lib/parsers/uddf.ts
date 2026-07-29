import type { DiveSample, GasMix } from "../dive-model";
import { gasMixLabel } from "../dive-model";
import type { LocalImportedDive } from "../indexed-db";
import { stablePortableSourceId } from "../dive-identity";
import { inferCategory } from "./parser-utils";

// UDDF is an open, SI-unit XML format. Oceanic+ documents UDDF as its log
// export format: https://www.oceanicworldwide.com/blog/faq/what-format-will-my-dives-be-downloaded-to/
export function readUddfLog(xmlText: string): LocalImportedDive[] {
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (
    document.querySelector("parsererror") ||
    localName(document.documentElement) !== "uddf"
  ) {
    throw new Error("This does not look like a valid UDDF dive log.");
  }

  const idMap = new Map<string, Element>();
  for (const element of Array.from(document.getElementsByTagName("*"))) {
    const id = element.getAttribute("id");
    if (id) idMap.set(id, element);
  }

  const profileRoots = descendants(document.documentElement, "profiledata");
  const diveElements = profileRoots.flatMap((root) => descendants(root, "dive"));
  return diveElements.map((dive) => parseDive(dive, idMap));
}

function parseDive(
  dive: Element,
  idMap: Map<string, Element>,
): LocalImportedDive {
  const information = first(dive, "informationbeforedive") ?? dive;
  const samples = parseSamples(dive);
  const referencedSite = resolveReference(
    first(information, "divesite") ?? first(information, "site"),
    idMap,
  );
  const siteElement =
    referencedSite ??
    first(information, "divesite") ??
    first(information, "site");
  const siteName =
    directText(siteElement, "name") ??
    directText(siteElement, "objectname") ??
    directText(siteElement, "location");
  const latitude = coordinate(siteElement, "latitude", -90, 90);
  const longitude = coordinate(siteElement, "longitude", -180, 180);
  const dateTime =
    text(information, "datetime") ??
    text(information, "date") ??
    text(dive, "datetime");
  const maximumDepth =
    numericText(dive, "greatestdepth") ??
    numericText(dive, "maximumdepth") ??
    maximum(samples.map((sample) => sample.depthM));
  const averageDepth =
    numericText(dive, "averagedepth") ?? average(samples.map((sample) => sample.depthM));
  const durationSeconds =
    samples.at(-1)?.elapsedSeconds ??
    numericText(dive, "diveduration") ??
    numericText(dive, "bottomtime");
  const temperatures = samples
    .map((sample) => sample.temperatureC)
    .filter((value): value is number => value !== undefined);
  const waterTemperature =
    kelvinToCelsius(numericText(dive, "lowesttemperature")) ??
    (temperatures.length ? Math.min(...temperatures) : null);
  const computerElement = resolveReference(first(dive, "divecomputer"), idMap);
  const computerModel =
    text(computerElement, "model") ??
    text(computerElement, "name") ??
    text(computerElement, "manufacturer");
  const serialNumber =
    text(computerElement, "serialnumber") ?? text(computerElement, "serial");
  const gasMixes = parseGasMixes(dive, idMap);
  const category = inferCategory(
    text(information, "divemode") ?? text(dive, "divemode") ?? text(dive, "type"),
  );
  const diveNumber =
    numericText(information, "divenumber") ?? numericText(dive, "divenumber");
  const sourceId = stablePortableSourceId(dive.getAttribute("id"), {
    startDateTime: dateTime,
    serialNumber,
    maxDepthM: maximumDepth,
    durationSeconds,
    samples,
  });
  const pressureBounds = getPressureBounds(samples);

  return {
    id: `uddf:${sourceId}`,
    source: "uddf",
    sourceId,
    diveNumber,
    diveDate: normalizeDateTime(dateTime),
    lastModified: null,
    depth: maximumDepth === null ? null : String(maximumDepth),
    averageDepth,
    minTemp: waterTemperature,
    maxTemp: temperatures.length ? Math.max(...temperatures) : waterTemperature,
    lengthText: durationSeconds === null ? null : String(durationSeconds),
    durationSeconds,
    location: null,
    site: siteName,
    buddy: text(dive, "buddy"),
    notes: text(dive, "notes") ?? text(dive, "remarks"),
    serialNumber,
    gpsEntryLat: latitude,
    gpsEntryLng: longitude,
    gpsExitLat: null,
    gpsExitLng: null,
    calculatedJson: null,
    category: category.category,
    categorySource: category.source,
    maxDepthM: maximumDepth,
    waterTemperatureC: waterTemperature,
    gasMixes,
    computerModel,
    samples,
    tankPressuresStartBar: pressureBounds.start,
    tankPressuresEndBar: pressureBounds.end,
  };
}

function parseSamples(dive: Element): DiveSample[] {
  const tankReferences = [
    ...new Set(
      descendants(dive, "tankpressure")
        .map(
          (pressure) =>
            pressure.getAttribute("ref") ?? pressure.getAttribute("tankref"),
        )
        .filter((reference): reference is string => reference !== null),
    ),
  ];
  const maximumTankCount = descendants(dive, "waypoint").reduce(
    (count, waypoint) =>
      Math.max(count, descendants(waypoint, "tankpressure").length),
    tankReferences.length,
  );
  const waypointSamples = descendants(dive, "waypoint")
    .map((waypoint) => {
      const elapsedSeconds = numericText(waypoint, "divetime");
      const depthM = numericText(waypoint, "depth");
      if (elapsedSeconds === null || depthM === null) return null;
      const pressureElements = descendants(waypoint, "tankpressure");
      const pressuresBar: number[] = Array(maximumTankCount).fill(Number.NaN);
      pressureElements.forEach((pressure, localIndex) => {
        const reference =
          pressure.getAttribute("ref") ??
          pressure.getAttribute("tankref") ??
          null;
        const referencedIndex =
          reference === null ? -1 : tankReferences.indexOf(reference);
        const tankIndex = referencedIndex >= 0 ? referencedIndex : localIndex;
        const value = pressurePaToBar(Number(pressure.textContent));
        if (tankIndex >= 0 && value !== null) pressuresBar[tankIndex] = value;
      });
      const temperatureC = kelvinToCelsius(numericText(waypoint, "temperature"));
      const ndlSeconds = numericText(waypoint, "nodecotime");
      return {
        elapsedSeconds,
        depthM,
        ...(temperatureC === null ? {} : { temperatureC }),
        pressuresBar,
        ...(ndlSeconds === null ? {} : { ndlSeconds }),
      } satisfies DiveSample;
    })
    .filter((sample): sample is DiveSample => sample !== null);
  if (waypointSamples.length) {
    return waypointSamples.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  }

  // Some older exporters encode a profile as depth elements with attributes.
  let cumulativeSeconds = 0;
  return descendants(first(dive, "samples") ?? dive, "depth")
    .map((depth): DiveSample | null => {
      const depthM = finiteNumber(depth.textContent);
      const absolute = finiteNumber(depth.getAttribute("divetime"));
      const delta = finiteNumber(depth.getAttribute("deltatime"));
      if (absolute !== null) cumulativeSeconds = absolute;
      else if (delta !== null) cumulativeSeconds += delta;
      if (depthM === null || (absolute === null && delta === null)) return null;
      const temperatureC = kelvinToCelsius(
        finiteNumber(depth.getAttribute("temperature")),
      );
      return {
        elapsedSeconds: cumulativeSeconds,
        depthM,
        ...(temperatureC === null ? {} : { temperatureC }),
        pressuresBar: [] as number[],
      } satisfies DiveSample;
    })
    .filter((sample): sample is DiveSample => sample !== null)
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
}

function parseGasMixes(dive: Element, idMap: Map<string, Element>): GasMix[] {
  const referenced = descendants(dive, "switchmix")
    .map((element) => resolveReference(element, idMap))
    .filter((element): element is Element => element !== null);
  const mixes =
    referenced.length > 0
      ? referenced
      : descendants(dive.ownerDocument.documentElement, "mix").filter((mix) => {
          const parent = mix.parentElement;
          return parent ? localName(parent).includes("gas") : false;
        });
  const unique = [...new Set(mixes)];
  return unique.map((mix) => {
    const oxygenPercent = fractionToPercent(numericText(mix, "o2"));
    const heliumPercent = fractionToPercent(numericText(mix, "he"));
    return {
      oxygenPercent,
      heliumPercent,
      label: gasMixLabel(oxygenPercent, heliumPercent),
    };
  });
}

function descendants(root: Element, name: string) {
  return Array.from(root.querySelectorAll("*")).filter(
    (element) => localName(element) === name,
  );
}

function first(root: Element | null, name: string) {
  if (!root) return null;
  return descendants(root, name)[0] ?? null;
}

function text(root: Element | null, name: string) {
  return first(root, name)?.textContent?.trim() || null;
}

function directText(root: Element | null, name: string) {
  if (!root) return null;
  const element = Array.from(root.children).find(
    (child) => localName(child) === name,
  );
  return element?.textContent?.trim() || null;
}

function numericText(root: Element | null, name: string) {
  return finiteNumber(text(root, name));
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveReference(element: Element | null, idMap: Map<string, Element>) {
  if (!element) return null;
  const reference =
    element.getAttribute("ref") ??
    element.getAttribute("idref") ??
    element.getAttribute("link");
  return (reference ? idMap.get(reference.replace(/^#/, "")) : null) ?? element;
}

function coordinate(
  element: Element | null,
  name: string,
  minimum: number,
  maximumValue: number,
) {
  const value = numericText(element, name);
  return value !== null && value >= minimum && value <= maximumValue ? value : null;
}

function fractionToPercent(value: number | null) {
  if (value === null) return null;
  return value <= 1 ? value * 100 : value;
}

function kelvinToCelsius(value: number | null) {
  if (value === null) return null;
  return value > 100 ? value - 273.15 : value;
}

function pressurePaToBar(value: number) {
  if (!Number.isFinite(value)) return null;
  return value > 2_000 ? value / 100_000 : value;
}

function maximum(values: number[]) {
  return values.length ? Math.max(...values) : null;
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function normalizeDateTime(value: string | null) {
  if (!value) return null;
  return value.replace("T", " ").replace(/Z$/, "");
}

function getPressureBounds(samples: DiveSample[]) {
  const count = samples.reduce(
    (current, sample) => Math.max(current, sample.pressuresBar.length),
    0,
  );
  const start: Array<number | null> = Array(count).fill(null);
  const end: Array<number | null> = Array(count).fill(null);
  for (const sample of samples) {
    sample.pressuresBar.forEach((pressure, index) => {
      if (!Number.isFinite(pressure)) return;
      if (start[index] === null) start[index] = pressure;
      end[index] = pressure;
    });
  }
  return { start, end };
}

function localName(element: Element) {
  return element.localName.toLocaleLowerCase("en");
}
