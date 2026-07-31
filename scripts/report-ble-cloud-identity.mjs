import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import ts from "typescript";

function transpile(file, imports = {}) {
  let js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  for (const [key, value] of Object.entries(imports)) {
    js = js.replaceAll(
      new RegExp(`from\\s+["']${key}["']`, "g"),
      `from "${value}"`,
    );
  }
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}

const diveModel = transpile("lib/dive-model.ts");
const normalizer = transpile("lib/ble-dive-normalizer.ts", {
  "./dive-model": diveModel,
});
const fixtureMod = await import(
  transpile("lib/ble-capture-fixture.ts", {
    "./dive-computer-capability": `data:text/javascript;base64,${Buffer.from("export {};").toString("base64")}`,
    "./ble-dive-normalizer": normalizer,
  })
);
const identity = await import(
  transpile("lib/ble-cloud-identity.ts", {
    "./ble-dive-normalizer": normalizer,
  })
);

const fixture = fixtureMod.parseBleCaptureFixture(
  JSON.parse(fs.readFileSync(process.env.BLE_CAPTURE_FIXTURE, "utf8")),
);

const SQL = await initSqlJs({
  locateFile: (file) => path.resolve("node_modules", "sql.js", "dist", file),
});
const db = new SQL.Database(fs.readFileSync(process.env.SHEARWATER_DB_FIXTURE));
const result = db.exec(`
  SELECT DiveId, DiveNumber, DiveDate, DiveLengthTime, Depth, SerialNumber
  FROM dive_details
`);
const cols = Object.fromEntries(result[0].columns.map((name, i) => [name, i]));

function durationSeconds(text) {
  if (text == null) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) return asNumber;
  const match = String(text).match(/(\d+):(\d+):(\d+)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const cloud = result[0].values.map((row) => ({
  diveId: String(row[cols.DiveId]),
  diveNumber: row[cols.DiveNumber] == null ? null : Number(row[cols.DiveNumber]),
  diveDate: row[cols.DiveDate] == null ? null : String(row[cols.DiveDate]),
  serialNumber:
    row[cols.SerialNumber] == null ? null : String(row[cols.SerialNumber]),
  durationSeconds: durationSeconds(row[cols.DiveLengthTime]),
  maxDepthM: row[cols.Depth] == null ? null : Number(row[cols.Depth]),
}));

const report = identity.matchBleToCloudDives(
  fixture.normalizedPreview,
  cloud,
);

const summary = {
  bleProduct: fixture.download.product,
  bleSerialHex: fixture.download.serialHex,
  bleCount: report.bleCount,
  cloudCount: report.cloudCount,
  matches: report.matches.map((match) => {
    const ble = fixture.normalizedPreview.find(
      (dive) => dive.sourceId === match.bleSourceId,
    );
    return {
      bleFingerprint: match.bleSourceId,
      cloudDiveId: match.cloudDiveId,
      cloudDiveNumber: match.cloudDiveNumber,
      confidence: match.confidence,
      reasons: match.reasons,
      diveDate: ble?.diveDate ?? null,
      durationSeconds: ble?.durationSeconds ?? null,
      maxDepthM: ble?.maxDepthM ?? null,
    };
  }),
  unmatchedBle: report.unmatchedBle,
};

console.log(JSON.stringify(summary, null, 2));
db.close();
