/**
 * Offline recovery: read Shearwater GNSS out of rawDiveRecords in a DiveFrame
 * backup JSON and fill empty gpsEntry*/gpsExit* fields on matching dives.
 *
 * Usage:
 *   node recover-from-backup.mjs <backup.json>
 *   node recover-from-backup.mjs <backup.json> --write
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

async function loadExtractor() {
  const sourcePath = new URL("./shearwater-raw-gnss.ts", import.meta.url);
  const source = await readFile(sourcePath, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

const backupPath = process.argv[2];
const write = process.argv.includes("--write");

if (!backupPath) {
  console.error(
    "Usage: node recover-from-backup.mjs <backup.json> [--write]",
  );
  process.exit(1);
}

const { readShearwaterRawGnss } = await loadExtractor();
const backup = JSON.parse(await readFile(backupPath, "utf8"));
const stores = backup.stores ?? backup;
const dives = stores.dives ?? [];
const rawRecords = stores.rawDiveRecords ?? [];
const divesById = new Map(dives.map((dive) => [dive.id, dive]));

let updated = 0;
let alreadyPresent = 0;
let withoutFix = 0;
const rows = [];

for (const raw of rawRecords) {
  const b64 = raw.rawBytesBase64;
  if (typeof b64 !== "string") {
    withoutFix += 1;
    continue;
  }
  const gnss = readShearwaterRawGnss(new Uint8Array(Buffer.from(b64, "base64")));
  if (!gnss.entry && !gnss.exit) {
    withoutFix += 1;
    continue;
  }
  const dive = divesById.get(raw.diveId);
  if (!dive) continue;
  if (dive.gpsEntryLat != null) {
    alreadyPresent += 1;
    continue;
  }
  dive.gpsEntryLat = gnss.entry?.latitude ?? dive.gpsEntryLat ?? null;
  dive.gpsEntryLng = gnss.entry?.longitude ?? dive.gpsEntryLng ?? null;
  dive.gpsExitLat = gnss.exit?.latitude ?? dive.gpsExitLat ?? null;
  dive.gpsExitLng = gnss.exit?.longitude ?? dive.gpsExitLng ?? null;
  updated += 1;
  rows.push({
    dive: String(raw.diveId).split(":").pop(),
    date: dive.diveDate?.slice?.(0, 10) ?? "?",
    entry: gnss.entry
      ? `${gnss.entry.latitude}, ${gnss.entry.longitude}`
      : "-",
    exit: gnss.exit ? `${gnss.exit.latitude}, ${gnss.exit.longitude}` : "-",
  });
}

console.table(rows);
console.log({
  scanned: rawRecords.length,
  updated,
  alreadyPresent,
  withoutFix,
  write,
});

if (write) {
  const outPath = backupPath.replace(/(\.json)?$/i, "-recovered.json");
  await writeFile(outPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.resolve(outPath)}`);
} else {
  console.log("Dry-run only. Pass --write to emit *-recovered.json.");
}
