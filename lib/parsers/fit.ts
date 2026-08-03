import FitParser from "fit-file-parser";
import type { DiveSample, GasMix } from "../dive-model";
import { gasMixLabel } from "../dive-model";
import type { LocalImportedDive } from "../indexed-db";
import { stablePortableSourceId } from "../dive-identity";
import { inferCategory } from "./parser-utils";
import { fitCoordinateDegrees, fitDepthMetres } from "../fit-units";

type FitValue = Record<string, unknown>;

// Garmin Dive and the current Suunto app both document FIT exports. FIT is a
// public protocol: https://developer.garmin.com/fit/protocol/
export async function readFitDive(file: File): Promise<LocalImportedDive[]> {
  const parser = new FitParser({
    force: false,
    mode: "list",
    elapsedRecordField: true,
    pressureUnit: "bar",
  });
  const parsed = (await parser.parseAsync(await file.arrayBuffer())) as unknown as FitValue;
  const session = firstRecord(parsed.sessions);
  const summary = asRecord(session?.dive_summary) ?? asRecord(parsed.dive_summary);
  const records = recordArray(parsed.records);
  const sport = stringValue(session?.sport);
  const subSport = stringValue(session?.sub_sport);
  const looksLikeDive =
    sport?.toLowerCase() === "diving" ||
    subSport?.toLowerCase().includes("diving") ||
    Boolean(summary) ||
    records.some((record) => finiteNumber(record.depth) !== null);
  if (!looksLikeDive) {
    throw new Error("This FIT file does not appear to contain a dive.");
  }

  const fileId = firstRecord(parsed.file_ids);
  const device = firstRecord(parsed.device_infos) ?? firstRecord(parsed.devices);
  const startDate =
    dateValue(session?.start_time) ??
    dateValue(session?.timestamp) ??
    dateValue(records[0]?.timestamp);
  const startMs = startDate?.getTime() ?? null;
  const tankUpdates = recordArray(parsed.tank_updates).sort(
    (a, b) => (dateValue(a.timestamp)?.getTime() ?? 0) - (dateValue(b.timestamp)?.getTime() ?? 0),
  );
  const sensorIds = [
    ...new Set(
      tankUpdates.map((update) => String(update.sensor ?? update.sensor_id ?? "0")),
    ),
  ];
  const currentPressures: Array<number | null> = Array(sensorIds.length).fill(null);
  let updateIndex = 0;
  const samples = records
    .map((record) => {
      const recordDate = dateValue(record.timestamp);
      const recordMs = recordDate?.getTime() ?? null;
      while (
        updateIndex < tankUpdates.length &&
        (dateValue(tankUpdates[updateIndex].timestamp)?.getTime() ?? Number.POSITIVE_INFINITY) <=
          (recordMs ?? Number.NEGATIVE_INFINITY)
      ) {
        const update = tankUpdates[updateIndex];
        const sensorIndex = sensorIds.indexOf(
          String(update.sensor ?? update.sensor_id ?? "0"),
        );
        const pressure = finiteNumber(
          update.pressure ?? update.tank_pressure ?? update.current_pressure,
        );
        if (sensorIndex >= 0 && pressure !== null) currentPressures[sensorIndex] = pressure;
        updateIndex += 1;
      }
      const depthM = fitDepthMetres(record.depth);
      const elapsedSeconds =
        finiteNumber(record.elapsed_time) ??
        (recordMs !== null && startMs !== null ? (recordMs - startMs) / 1000 : null);
      if (depthM === null || elapsedSeconds === null) return null;
      const temperatureC = finiteNumber(record.temperature);
      const ndlSeconds = finiteNumber(record.ndl_time);
      return {
        elapsedSeconds,
        depthM,
        ...(temperatureC === null ? {} : { temperatureC }),
        pressuresBar: currentPressures.map((value) => value ?? Number.NaN),
        ...(ndlSeconds === null ? {} : { ndlSeconds }),
      } satisfies DiveSample;
    })
    .filter((sample): sample is DiveSample => sample !== null)
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);

  const maxDepthM =
    fitDepthMetres(summary?.max_depth) ?? maximum(samples.map((sample) => sample.depthM));
  const averageDepthM =
    fitDepthMetres(summary?.avg_depth) ?? average(samples.map((sample) => sample.depthM));
  const durationSeconds =
    finiteNumber(session?.total_timer_time) ??
    finiteNumber(session?.total_elapsed_time) ??
    fitMilliseconds(summary?.bottom_time) ??
    samples.at(-1)?.elapsedSeconds ??
    null;
  const temperatures = samples
    .map((sample) => sample.temperatureC)
    .filter((value): value is number => value !== undefined);
  const waterTemperatureC =
    finiteNumber(session?.min_temperature) ??
    (temperatures.length ? Math.min(...temperatures) : null);
  const diveNumber =
    finiteNumber(summary?.dive_number) ?? finiteNumber(session?.dive_number);
  const latitude =
    fitCoordinateDegrees(session?.start_position_lat, -90, 90) ??
    fitCoordinateDegrees(session?.end_position_lat, -90, 90);
  const longitude =
    fitCoordinateDegrees(session?.start_position_long, -180, 180) ??
    fitCoordinateDegrees(session?.end_position_long, -180, 180);
  const exitLatitude = fitCoordinateDegrees(session?.end_position_lat, -90, 90);
  const exitLongitude = fitCoordinateDegrees(session?.end_position_long, -180, 180);
  const manufacturer =
    stringValue(device?.manufacturer) ?? stringValue(fileId?.manufacturer);
  const product = device?.product ?? fileId?.product;
  const productName =
    stringValue(device?.product_name) ?? stringValue(fileId?.product_name);
  const serialNumber =
    scalarString(device?.serial_number) ?? scalarString(fileId?.serial_number);
  const computerModel =
    productName ??
    (manufacturer
      ? `${titleCase(manufacturer)}${product === undefined ? "" : ` device ${String(product)}`}`
      : null);
  const gasMixes = recordArray(parsed.dive_gases).map(parseGas);
  const category = inferCategory(
    subSport?.toLowerCase().includes("apnea") ? "freediving" : subSport ?? sport,
  );
  const fileCreatedAt =
    dateValue(fileId?.time_created) ?? dateValue(fileId?.timestamp);
  const activityIdentityTime = fileCreatedAt ?? startDate;
  const deviceIdentity = [
    manufacturer ?? "fit",
    serialNumber ?? scalarString(product) ?? "unknown-device",
  ].join(":");
  const sourceId = stablePortableSourceId(
    activityIdentityTime
      ? `${deviceIdentity}:${activityIdentityTime.toISOString()}`
      : serialNumber && fileId?.number !== undefined
        ? `${deviceIdentity}:file-${String(fileId.number)}`
        : null,
    {
      startDateTime: startDate,
      serialNumber,
      maxDepthM,
      durationSeconds,
      samples,
    },
  );
  const tankBounds = getTankBounds(parsed, samples);

  return [{
    id: `fit:${sourceId}`,
    source: "fit",
    sourceId,
    diveNumber,
    diveDate: startDate ? startDate.toISOString().replace("T", " ").replace("Z", "") : null,
    lastModified: null,
    depth: maxDepthM === null ? null : String(maxDepthM),
    averageDepth: averageDepthM,
    minTemp: waterTemperatureC,
    maxTemp: temperatures.length ? Math.max(...temperatures) : waterTemperatureC,
    lengthText: durationSeconds === null ? null : String(durationSeconds),
    durationSeconds,
    location: null,
    site: null,
    buddy: null,
    notes: null,
    serialNumber,
    gpsEntryLat: latitude,
    gpsEntryLng: longitude,
    gpsExitLat: exitLatitude,
    gpsExitLng: exitLongitude,
    calculatedJson: null,
    category: category.category,
    categorySource: category.source,
    maxDepthM,
    waterTemperatureC,
    gasMixes,
    computerModel,
    samples,
    tankPressuresStartBar: tankBounds.start,
    tankPressuresEndBar: tankBounds.end,
  }];
}

function parseGas(gas: FitValue): GasMix {
  const oxygenPercent = percentage(gas.oxygen_content ?? gas.oxygen);
  const heliumPercent = percentage(gas.helium_content ?? gas.helium);
  return {
    oxygenPercent,
    heliumPercent,
    label: gasMixLabel(oxygenPercent, heliumPercent),
  };
}

function getTankBounds(parsed: FitValue, samples: DiveSample[]) {
  const summaries = recordArray(parsed.tank_summaries);
  if (summaries.length) {
    return {
      start: summaries.map((summary) =>
        finiteNumber(summary.start_pressure ?? summary.begin_pressure),
      ),
      end: summaries.map((summary) =>
        finiteNumber(summary.end_pressure ?? summary.final_pressure),
      ),
    };
  }
  const count = samples.reduce(
    (value, sample) => Math.max(value, sample.pressuresBar.length),
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

function recordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(asRecord).filter((record): record is FitValue => record !== null)
    : [];
}

function firstRecord(value: unknown) {
  return recordArray(value)[0] ?? null;
}

function asRecord(value: unknown): FitValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FitValue)
    : null;
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fitMilliseconds(value: unknown) {
  const number = finiteNumber(value);
  return number === null ? null : number / 1000;
}

function percentage(value: unknown) {
  const number = finiteNumber(value);
  if (number === null) return null;
  return number <= 1 ? number * 100 : number;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scalarString(value: unknown) {
  return stringValue(value) ?? (typeof value === "number" ? String(value) : null);
}

function maximum(values: number[]) {
  return values.length ? Math.max(...values) : null;
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
