import initSqlJs, { type QueryExecResult } from "sql.js";
import type { LocalImportedDive } from "../indexed-db";
import { gasMixLabel } from "../dive-model";
import {
  parseDurationSeconds,
  parsePressureBar,
} from "../unit-conversion";
import {
  inferCategory,
  numberFrom,
  safeJson,
} from "./parser-utils";
import { normalizeShearwaterPressurePair } from "../gas-calculations";

const DIVE_DETAIL_COLUMNS = [
  "DiveId",
  "DiveNumber",
  "DiveDate",
  "LastModified",
  "Depth",
  "AverageDepth",
  "MinTemp",
  "MaxTemp",
  "DiveLengthTime",
  "Location",
  "Site",
  "Buddy",
  "Notes",
  "SerialNumber",
  "GnssEntryLocation",
  "GnssExitLocation",
  "Tank1PressureStart",
  "Tank1PressureEnd",
  "Tank2PressureStart",
  "Tank2PressureEnd",
  "Tank3PressureStart",
  "Tank3PressureEnd",
  "Tank4PressureStart",
  "Tank4PressureEnd",
  "Apparatus",
  "GasNotes",
] as const;

export async function readShearwaterDatabase(
  file: File,
): Promise<LocalImportedDive[]> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const database = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const tables = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='dive_details'",
    );
    if (!tables[0]?.values.length) {
      throw new Error("This does not look like a Shearwater Cloud database.");
    }
    const diveColumns = tableColumns(database, "dive_details");
    if (!diveColumns.has("diveid")) {
      throw new Error("This Shearwater database has no dive identifier column.");
    }
    const logColumns = tableColumns(database, "log_data");
    const canJoinLogData =
      logColumns.has("log_id") &&
      logColumns.has("calculated_values_from_samples");
    // Shearwater app versions do not all ship the same optional columns. NULL
    // aliases preserve the normalized import shape without rejecting a basic
    // database that still contains usable dive details.
    const selectedColumns = DIVE_DETAIL_COLUMNS.map((column) =>
      diveColumns.has(column.toLowerCase())
        ? `d.${column}`
        : `NULL AS ${column}`,
    );
    selectedColumns.push(
      canJoinLogData
        ? "l.calculated_values_from_samples"
        : "NULL AS calculated_values_from_samples",
    );
    const result = database.exec(`
      SELECT ${selectedColumns.join(", ")}
      FROM dive_details d
      ${canJoinLogData ? "LEFT JOIN log_data l ON l.log_id = d.DiveId" : ""}
      ORDER BY ${diveColumns.has("divedate") ? "d.DiveDate" : "d.DiveId"} DESC
    `);
    const computerNames = readStoredComputerNames(database);
    if (!result[0]) return [];
    return rowsFrom(result[0]).map((row) => {
      const entry = locationFrom(row.GnssEntryLocation);
      const exit = locationFrom(row.GnssExitLocation);
      const calculated = safeJson(asString(row.calculated_values_from_samples));
      const category = inferCategory(asString(row.Apparatus));
      const maxDepthM = asNumber(row.Depth);
      const waterTemperatureC =
        numberFrom(calculated?.MinTemp) ??
        asNumber(row.MinTemp) ??
        asNumber(row.MaxTemp);
      const gasNotes = asString(row.GasNotes);
      const gasOxygen = gasNotes?.match(/(?:O2|O₂|oxygen)\D*(\d+(?:\.\d+)?)/i);
      const oxygenPercent = gasOxygen ? Number(gasOxygen[1]) : null;

      return {
        id: String(row.DiveId),
        source: "shearwater",
        sourceId: String(row.DiveId),
        diveNumber: asNumber(row.DiveNumber),
        diveDate: asString(row.DiveDate),
        lastModified: asString(row.LastModified),
        depth: asString(row.Depth),
        averageDepth:
          numberFrom(calculated?.AverageDepth) ?? asNumber(row.AverageDepth),
        minTemp: numberFrom(calculated?.MinTemp) ?? asNumber(row.MinTemp),
        maxTemp: numberFrom(calculated?.MaxTemp) ?? asNumber(row.MaxTemp),
        lengthText: asString(row.DiveLengthTime),
        durationSeconds: parseDurationSeconds(asString(row.DiveLengthTime)),
        location: asString(row.Location),
        site: asString(row.Site),
        buddy: asString(row.Buddy),
        notes: asString(row.Notes),
        serialNumber: asString(row.SerialNumber),
        gpsEntryLat: entry?.latitude ?? null,
        gpsEntryLng: entry?.longitude ?? null,
        gpsExitLat: exit?.latitude ?? null,
        gpsExitLng: exit?.longitude ?? null,
        calculatedJson: asString(row.calculated_values_from_samples),
        category: category.category,
        categorySource: category.source,
        maxDepthM,
        waterTemperatureC,
        gasMixes:
          oxygenPercent === null
            ? []
            : [
                {
                  oxygenPercent,
                  heliumPercent: null,
                  label: gasMixLabel(oxygenPercent, null),
                },
              ],
        computerModel: findComputerName(computerNames, row.SerialNumber),
        samples: [],
        ...readTankPressures(row),
      };
    });
  } finally {
    database.close();
  }
}

function readStoredComputerNames(database: {
  exec: (sql: string) => QueryExecResult[];
}) {
  const exists = database.exec(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name='StoredDiveComputer'
  `);
  if (!exists[0]?.values.length) return new Map<string, string>();

  const columns = tableColumns(database, "StoredDiveComputer");
  if (!columns.has("serialnumber") || !columns.has("jsondata")) {
    return new Map<string, string>();
  }
  const result = database.exec("SELECT SerialNumber, JsonData FROM StoredDiveComputer");
  const names = new Map<string, string>();
  for (const [serialNumber, jsonData] of result[0]?.values ?? []) {
    const device = safeJson(asString(jsonData));
    const name =
      asString(device?.DeviceName) ?? asString(device?.BroadcastName);
    if (!name) continue;
    for (const key of serialLookupKeys(serialNumber)) names.set(key, name);
  }
  return names;
}

function tableColumns(
  database: { exec: (sql: string) => QueryExecResult[] },
  tableName: string,
) {
  const result = database.exec(`PRAGMA table_info('${tableName}')`)[0];
  if (!result) return new Set<string>();
  const nameIndex = result.columns.indexOf("name");
  if (nameIndex < 0) return new Set<string>();
  return new Set(
    result.values
      .map((row) => row[nameIndex])
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.toLowerCase()),
  );
}

function findComputerName(
  computerNames: Map<string, string>,
  serialNumber: unknown,
) {
  for (const key of serialLookupKeys(serialNumber)) {
    const name = computerNames.get(key);
    if (name) return name;
  }
  return null;
}

function serialLookupKeys(value: unknown) {
  if (value === null || value === undefined || value === "") return [];
  const raw = String(value).trim();
  const normalized = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const keys = new Set<string>([normalized]);
  if (/^\d+$/.test(raw)) {
    try {
      keys.add(BigInt(raw).toString(16).padStart(8, "0").toUpperCase());
    } catch {
      // Retain the normalized source value when it is not a valid integer.
    }
  }
  return [...keys];
}

function rowsFrom(result: QueryExecResult) {
  return result.values.map((values) =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
  );
}

function locationFrom(value: unknown) {
  const parsed = safeJson(asString(value));
  const latitude = numberFrom(parsed?.Latitude ?? parsed?.latitude);
  const longitude = numberFrom(parsed?.Longitude ?? parsed?.longitude);
  return latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
    ? null
    : { latitude, longitude };
}

function asString(value: unknown) {
  if (value === null || value === undefined) return null;
  const string = String(value).trim();
  return string || null;
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readTankPressures(row: Record<string, unknown>) {
  const start: Array<number | null> = [];
  const end: Array<number | null> = [];
  for (let index = 1; index <= 4; index += 1) {
    const rawStart = parsePressureBar(
      asString(row[`Tank${index}PressureStart`]),
    );
    const rawEnd = parsePressureBar(asString(row[`Tank${index}PressureEnd`]));
    const normalized = normalizeShearwaterPressurePair(rawStart, rawEnd);
    start.push(normalized.start);
    end.push(normalized.end);
  }
  return {
    tankPressuresStartBar: start,
    tankPressuresEndBar: end,
  };
}
