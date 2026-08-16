import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import test from "node:test";
import initSqlJs from "sql.js";
import ts from "typescript";

const bleFixturePath = process.env.BLE_CAPTURE_FIXTURE;
const cloudFixturePath = process.env.SHEARWATER_DB_FIXTURE;

async function loadIdentityModules() {
  const diveModelUrl = `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(await readFile("lib/dive-model.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`;

  const readerUrl = `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(await readFile("lib/shearwater-raw-dive-number.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`;

  const normalizerSource = await readFile("lib/ble-dive-normalizer.ts", "utf8");
  let normalizerJs = ts.transpileModule(normalizerSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  normalizerJs = normalizerJs
    .replaceAll(/from\s+["']\.\/dive-model["']/g, `from "${diveModelUrl}"`)
    .replaceAll(
      /from\s+["']\.\/shearwater-raw-dive-number["']/g,
      `from "${readerUrl}"`,
    );
  const normalizerUrl = `data:text/javascript;base64,${Buffer.from(normalizerJs).toString("base64")}`;

  const fixtureSource = await readFile("lib/ble-capture-fixture.ts", "utf8");
  let fixtureJs = ts.transpileModule(fixtureSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  fixtureJs = fixtureJs
    .replaceAll(
      /from\s+["']\.\/dive-computer-capability["']/g,
      `from "data:text/javascript;base64,${Buffer.from("export {};").toString("base64")}"`,
    )
    .replaceAll(/from\s+["']\.\/ble-dive-normalizer["']/g, `from "${normalizerUrl}"`);
  const fixtureMod = await import(
    `data:text/javascript;base64,${Buffer.from(fixtureJs).toString("base64")}`
  );

  const identitySource = await readFile("lib/ble-cloud-identity.ts", "utf8");
  let identityJs = ts.transpileModule(identitySource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  identityJs = identityJs.replaceAll(
    /from\s+["']\.\/ble-dive-normalizer["']/g,
    `from "${normalizerUrl}"`,
  );
  const identity = await import(
    `data:text/javascript;base64,${Buffer.from(identityJs).toString("base64")}`
  );

  return { fixtureMod, identity };
}

function parseDurationSeconds(text) {
  if (!text) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) return asNumber;
  const match = String(text).match(/(\d+):(\d+):(\d+)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

test(
  "offline BLE capture fixture normalizes without the dive computer",
  { skip: !bleFixturePath },
  async () => {
    const { fixtureMod } = await loadIdentityModules();
    const raw = JSON.parse(fs.readFileSync(bleFixturePath, "utf8"));
    const fixture = fixtureMod.parseBleCaptureFixture(raw);
    assert.ok(fixture.download.diveCount >= 1);
    assert.ok(fixture.download.dives.every((dive) => dive.dataBase64.length > 0));
    assert.equal(fixture.normalizedPreview.length, fixture.download.diveCount);
    assert.ok(fixture.normalizedPreview.every((dive) => dive.parseOk));
  },
);

test(
  "offline BLE↔Cloud identity report for paired fixtures",
  { skip: !bleFixturePath || !cloudFixturePath },
  async () => {
    const { fixtureMod, identity } = await loadIdentityModules();
    const fixture = fixtureMod.parseBleCaptureFixture(
      JSON.parse(fs.readFileSync(bleFixturePath, "utf8")),
    );

    const SQL = await initSqlJs({
      locateFile: (file) =>
        path.resolve("node_modules", "sql.js", "dist", file),
    });
    const database = new SQL.Database(fs.readFileSync(cloudFixturePath));
    try {
      const result = database.exec(`
        SELECT DiveId, DiveNumber, DiveDate, DiveLengthTime, Depth, SerialNumber
        FROM dive_details
      `);
      assert.equal(result.length, 1);
      const columns = result[0].columns;
      const index = Object.fromEntries(columns.map((name, i) => [name, i]));
      const cloudRows = result[0].values.map((row) => ({
        diveId: String(row[index.DiveId]),
        diveNumber:
          row[index.DiveNumber] == null ? null : Number(row[index.DiveNumber]),
        diveDate:
          row[index.DiveDate] == null ? null : String(row[index.DiveDate]),
        serialNumber:
          row[index.SerialNumber] == null
            ? null
            : String(row[index.SerialNumber]),
        durationSeconds: parseDurationSeconds(row[index.DiveLengthTime]),
        maxDepthM: row[index.Depth] == null ? null : Number(row[index.Depth]),
      }));

      const report = identity.matchBleToCloudDives(
        fixture.normalizedPreview,
        cloudRows,
      );
      assert.equal(report.bleCount, fixture.normalizedPreview.length);
      const linked = report.matches.filter((row) => row.cloudDiveId);
      assert.ok(
        linked.length >= 1,
        `expected at least one BLE↔Cloud link, got ${JSON.stringify(report.matches, null, 2)}`,
      );
    } finally {
      database.close();
    }
  },
);
