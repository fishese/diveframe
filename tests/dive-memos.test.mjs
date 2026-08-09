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
  compareDiveMemos,
  hydrateDiveMemo,
  memoFieldsFromHour24,
  memoHour24,
  memoLocalDateTimeFields,
  memoWallClockMs,
  nextDiveMemoHeading,
  normalizeMemoMinute,
  stepMemoHour,
  stepMemoHour24,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`,
);

test("nextDiveMemoHeading starts at Dive 1 and avoids reused headings", () => {
  assert.equal(nextDiveMemoHeading([]), "Dive 1");
  assert.equal(nextDiveMemoHeading([{ heading: "Dive 1" }]), "Dive 2");
  assert.equal(
    nextDiveMemoHeading([{ heading: "Dive 1" }, { heading: "Custom" }]),
    "Dive 3",
  );
  assert.equal(
    nextDiveMemoHeading([{ heading: "Dive 2" }]),
    "Dive 3",
  );
});

test("defaultDiveMemoFields uses today and 10:00 AM", () => {
  const fields = defaultDiveMemoFields(new Date(2026, 7, 4, 15, 30, 0));
  assert.equal(fields.date, "2026-08-04");
  assert.equal(fields.hour, 10);
  assert.equal(fields.minute, 0);
  assert.equal(fields.meridiem, "AM");
  assert.equal(fields.siteName, null);
  assert.equal(fields.siteSource, null);
  assert.equal(fields.siteCatalogId, null);
  assert.equal(fields.location, null);
  assert.equal(fields.lat, null);
  assert.equal(fields.lng, null);
  assert.equal(fields.buddies, null);
  assert.equal(fields.notes, null);
});

test("memo UI helpers expose 24-hour time without changing storage fields", () => {
  assert.equal(memoHour24({ hour: 12, meridiem: "AM" }), 0);
  assert.equal(memoHour24({ hour: 1, meridiem: "PM" }), 13);
  assert.deepEqual(memoFieldsFromHour24(23), { hour: 11, meridiem: "PM" });
  assert.deepEqual(stepMemoHour24({ hour: 12, meridiem: "AM" }, -1), {
    hour: 11,
    meridiem: "PM",
  });
});

test("current-time fields update the local date and time together", () => {
  const fields = memoLocalDateTimeFields(new Date(2026, 7, 9, 23, 47));
  assert.deepEqual(fields, {
    date: "2026-08-09",
    hour: 11,
    minute: 47,
    meridiem: "PM",
  });
});

test("memo wall-clock parsing rejects impossible calendar dates", () => {
  assert.equal(
    memoWallClockMs({
      date: "2026-02-30",
      hour: 10,
      minute: 0,
      meridiem: "AM",
    }),
    null,
  );
});

test("legacy memo records gain site identity and sort by actual memo time", () => {
  const base = {
    id: "late",
    heading: "Late",
    date: "2026-08-09",
    hour: 1,
    minute: 30,
    meridiem: "PM",
    location: "Blue Corner",
    lat: null,
    lng: null,
    buddies: null,
    notes: null,
    createdAt: "2026-08-09T01:00:00Z",
    updatedAt: "2026-08-09T01:00:00Z",
  };
  const late = hydrateDiveMemo(base);
  const early = hydrateDiveMemo({
    ...base,
    id: "early",
    hour: 11,
    meridiem: "AM",
    createdAt: "2026-08-09T02:00:00Z",
  });
  assert.equal(late.siteName, "Blue Corner");
  assert.deepEqual([late, early].sort(compareDiveMemos).map((memo) => memo.id), [
    "early",
    "late",
  ]);
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
