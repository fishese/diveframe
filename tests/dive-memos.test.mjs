import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-memos.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  createDiveMemoId,
  defaultDiveMemoFields,
  nextDiveMemoHeading,
  normalizeMemoMinute,
  stepMemoHour,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`,
);

test("nextDiveMemoHeading starts at Dive 1 and increments by count", () => {
  assert.equal(nextDiveMemoHeading([]), "Dive 1");
  assert.equal(nextDiveMemoHeading([{ heading: "Dive 1" }]), "Dive 2");
  assert.equal(
    nextDiveMemoHeading([{ heading: "Dive 1" }, { heading: "Custom" }]),
    "Dive 3",
  );
});

test("defaultDiveMemoFields uses today and 10:00 AM", () => {
  const fields = defaultDiveMemoFields(new Date(2026, 7, 4, 15, 30, 0));
  assert.equal(fields.date, "2026-08-04");
  assert.equal(fields.hour, 10);
  assert.equal(fields.minute, 0);
  assert.equal(fields.meridiem, "AM");
  assert.equal(fields.location, null);
  assert.equal(fields.lat, null);
  assert.equal(fields.lng, null);
  assert.equal(fields.buddies, null);
  assert.equal(fields.notes, null);
});

test("stepMemoHour wraps 12↔1 without depending on meridiem", () => {
  assert.equal(stepMemoHour(12, 1), 1);
  assert.equal(stepMemoHour(1, -1), 12);
  assert.equal(stepMemoHour(10, 1), 11);
  assert.equal(stepMemoHour(10, -1), 9);
  assert.equal(stepMemoHour(null, 1), 11);
});

test("normalizeMemoMinute treats empty as 0 and accepts 0–59", () => {
  assert.equal(normalizeMemoMinute(null), 0);
  assert.equal(normalizeMemoMinute(undefined), 0);
  assert.equal(normalizeMemoMinute(""), 0);
  assert.equal(normalizeMemoMinute(0), 0);
  assert.equal(normalizeMemoMinute(15), 15);
  assert.equal(normalizeMemoMinute(30), 30);
  assert.equal(normalizeMemoMinute(45), 45);
  assert.equal(normalizeMemoMinute(7), 7);
  assert.equal(normalizeMemoMinute(59), 59);
  assert.equal(normalizeMemoMinute(60), 0);
  assert.equal(normalizeMemoMinute(-1), 0);
});

test("createDiveMemoId returns a UUID string", () => {
  const id = createDiveMemoId();
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.notEqual(createDiveMemoId(), id);
});
