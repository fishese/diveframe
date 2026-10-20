import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { prepareSources, runtimeFiles, sha256, verifyInputs, verifyRuntime } from "../scripts/ensure-sql-wasm.mjs";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "vendor/sql.js/dist");
const spec = JSON.parse(readFileSync(resolve(root, "scripts/sqljs-source.json"), "utf8"));
const provenance = JSON.parse(readFileSync(resolve(root, "public/sqljs-provenance.json"), "utf8"));
const variant = provenance.toolchain;
const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");
const wasmBinary = readFileSync(resolve(dist, "sql-wasm.wasm"));

test("sql.js resolves to the source-only local package after npm installation", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  assert.equal(pkg.dependencies["sql.js"], "file:vendor/sql.js");
  assert.equal(lock.packages["node_modules/sql.js"].link, true);
  assert.equal(realpathSync(resolve(root, "node_modules/sql.js")), realpathSync(resolve(root, "vendor/sql.js")));
  assert.equal(JSON.parse(readFileSync(resolve(root, "vendor/sql.js/package.json"), "utf8")).version, spec.version);
});

test("prepared runtime and all compiled source inputs match the reviewed provenance", () => {
  assert.ok(verifyInputs(resolve(root, ".sqljs-cache/source"), spec));
  assert.ok(verifyRuntime(dist, spec, variant));
  assert.equal(spec.version, "1.14.1");
  assert.equal(spec.sqliteVersion, "3.49.1");
  assert.notEqual(sha256(wasmBinary), "438c88f666dc054ce4e9395f80fe9db4218b1a3c379960454880f048a7898aed");
  assert.equal(provenance.wasmPath, "/sql-wasm." + sha256(wasmBinary) + ".wasm");
  assert.deepEqual(readFileSync(resolve(root, "public", provenance.wasmPath.slice(1))), wasmBinary);
});

test("provenance rejects missing WASM, changed WASM and a mismatched generated loader", () => {
  const temporary = mkdtempSync(join(tmpdir(), "diveframe-sqljs-pair-"));
  try {
    for (const file of runtimeFiles) copyFileSync(resolve(dist, file), resolve(temporary, file));
    assert.ok(verifyRuntime(temporary, spec, variant));
    rmSync(resolve(temporary, "sql-wasm.wasm"));
    assert.equal(verifyRuntime(temporary, spec, variant), false);
    const corrupted = Buffer.from(wasmBinary);
    corrupted[corrupted.length - 1] ^= 1;
    writeFileSync(resolve(temporary, "sql-wasm.wasm"), corrupted);
    assert.equal(verifyRuntime(temporary, spec, variant), false);
    copyFileSync(resolve(dist, "sql-wasm.wasm"), resolve(temporary, "sql-wasm.wasm"));
    writeFileSync(resolve(temporary, "sql-wasm-browser.js"), "// stale loader");
    assert.equal(verifyRuntime(temporary, spec, variant), false);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("source provenance rejects changed compilation inputs", () => {
  const temporary = mkdtempSync(join(tmpdir(), "diveframe-sqljs-input-"));
  try {
    const original = Buffer.from("verified C source");
    const pin = { inputs: { "source.c": sha256(original) } };
    writeFileSync(resolve(temporary, "source.c"), original);
    assert.ok(verifyInputs(temporary, pin));
    writeFileSync(resolve(temporary, "source.c"), "changed C source");
    assert.equal(verifyInputs(temporary, pin), false);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("offline preparation rejects absent or corrupt source archives without downloading", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "diveframe-sqljs-offline-"));
  const pin = { downloads: { "source.tgz": {
    url: "https://example.invalid/source.tgz", sha256: "0".repeat(64),
  } }, inputs: {} };
  try {
    await assert.rejects(prepareSources(temporary, pin, true), /Missing or invalid offline/);
    mkdirSync(resolve(temporary, ".sqljs-cache/downloads"), { recursive: true });
    writeFileSync(resolve(temporary, ".sqljs-cache/downloads/source.tgz"), "invalid archive");
    await assert.rejects(prepareSources(temporary, pin, true), /Missing or invalid offline/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("offline preparation uses verified extracted source after archives are removed", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "diveframe-sqljs-extracted-"));
  const source = resolve(temporary, ".sqljs-cache/source");
  const input = Buffer.from("verified sql.js source");
  const pin = { downloads: { "source.tgz": {
    url: "https://example.invalid/source.tgz", sha256: "0".repeat(64),
  } }, inputs: { "src/api.js": sha256(input) } };
  try {
    mkdirSync(resolve(source, "src"), { recursive: true });
    writeFileSync(resolve(source, "src/api.js"), input);
    assert.equal(await prepareSources(temporary, pin, true), source);
    writeFileSync(resolve(source, "src/api.js"), "modified source");
    await assert.rejects(prepareSources(temporary, pin, true), /Missing or invalid offline/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

async function loadParser() {
  const cache = new Map();
  function moduleUrl(path) {
    if (cache.has(path)) return cache.get(path);
    let js = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    js = js.replace(/from\s+["']([^"']+)["']/g, (match, name) => {
      if (name === "sql.js") {
        const wrapper = "import init from " + JSON.stringify(pathToFileURL(require.resolve("sql.js")).href) +
          ";import fs from 'node:fs';export default () => init({wasmBinary:fs.readFileSync(" +
          JSON.stringify(resolve(dist, "sql-wasm.wasm")) + ")});";
        return 'from "' + "data:text/javascript;base64," + Buffer.from(wrapper).toString("base64") + '"';
      }
      if (name === "sql.js/dist/wasm-url.mjs") {
        return 'from "' + pathToFileURL(resolve(dist, "wasm-url.mjs")).href + '"';
      }
      if (!name.startsWith(".")) throw new Error("Unexpected parser dependency " + name);
      return 'from "' + moduleUrl(resolve(dirname(path), name + ".ts")) + '"';
    });
    const url = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
    cache.set(path, url);
    return url;
  }
  return import(moduleUrl(resolve(root, "lib/parsers/shearwater.ts")));
}

test("source-built runtime imports a Shearwater database through the shared parser", async () => {
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  let binary;
  try {
    assert.equal(db.exec("SELECT sqlite_version()")[0].values[0][0], spec.sqliteVersion);
    db.run("CREATE TABLE dive_details (DiveId TEXT, DiveNumber INTEGER, DiveDate TEXT, Depth REAL, DiveLengthTime TEXT, GnssEntryLocation TEXT, Notes TEXT)");
    db.run("INSERT INTO dive_details VALUES (?, ?, ?, ?, ?, ?, ?)", [
      "source-proof", 42, "2026-10-20T10:00:00", 28.5, "43:20",
      JSON.stringify({ Latitude: 1.25, Longitude: 103.75 }), "Unicode: 潜水 🐟",
    ]);
    binary = db.export();
  } finally { db.close(); }
  const parser = await loadParser();
  const dives = await parser.readShearwaterDatabase(new File([binary], "synthetic.db"));
  assert.equal(dives.length, 1);
  assert.equal(dives[0].sourceId, "source-proof");
  assert.equal(dives[0].diveNumber, 42);
  assert.equal(dives[0].durationSeconds, 2600);
  assert.equal(dives[0].gpsEntryLat, 1.25);
  assert.equal(dives[0].notes, "Unicode: 潜水 🐟");
});
