import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTsModule(modulePath) {
  const source = await readFile(modulePath, "utf8");
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

const { readShearwaterRawDiveNumber } = await loadTsModule(
  new URL("../lib/shearwater-raw-dive-number.ts", import.meta.url),
);

const RECORD = 32;
const OPENING_0 = 0x10;
const CLOSING_0 = 0x20;

function payload(records) {
  const out = new Uint8Array(records.length * RECORD);
  records.forEach((record, index) => out.set(record, index * RECORD));
  return out;
}

function opening0(diveNumber) {
  const record = new Uint8Array(RECORD);
  record[0] = OPENING_0;
  record[1] = 0xff;
  record[2] = (diveNumber >> 8) & 0xff;
  record[3] = diveNumber & 0xff;
  return record;
}

test("reads the sequential dive number from opening record 0", () => {
  assert.equal(readShearwaterRawDiveNumber(payload([opening0(31)])), 31);
});

test("keeps factory test dive number 0", () => {
  assert.equal(readShearwaterRawDiveNumber(payload([opening0(0)])), 0);
});

test("reads dive numbers above 255 as a big-endian 16-bit value", () => {
  assert.equal(readShearwaterRawDiveNumber(payload([opening0(300)])), 300);
});

test("ignores sample records until opening 0", () => {
  const sample = new Uint8Array(RECORD);
  sample[0] = 0x01;
  assert.equal(
    readShearwaterRawDiveNumber(payload([sample, opening0(64)])),
    64,
  );
});

test("returns null when opening record 0 is missing", () => {
  const closing = new Uint8Array(RECORD);
  closing[0] = CLOSING_0;
  closing[2] = 0;
  closing[3] = 12;
  assert.equal(readShearwaterRawDiveNumber(payload([closing])), null);
});

test("returns null for truncated or empty payloads", () => {
  assert.equal(readShearwaterRawDiveNumber(new Uint8Array(8)), null);
  assert.equal(readShearwaterRawDiveNumber(new Uint8Array()), null);
});
