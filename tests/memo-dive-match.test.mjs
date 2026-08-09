import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function transpile(path) {
  const source = await readFile(path, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

const diveMemosJs = await transpile("lib/dive-memos.ts");
const diveMemosUrl = `data:text/javascript;base64,${Buffer.from(diveMemosJs).toString("base64")}`;

let memoDiveMatchJs = await transpile("lib/memo-dive-match.ts");
memoDiveMatchJs = memoDiveMatchJs.replace(
  /from "\.\/dive-memos(?:\.js)?"/,
  `from "${diveMemosUrl}"`,
);

const { memoWallClockMs } = await import(diveMemosUrl);
const {
  diveNeedsPlaceNameHint,
  evaluateMemoCandidate,
  listDivesNearMemo,
  listMemosNearDive,
} = await import(
  `data:text/javascript;base64,${Buffer.from(memoDiveMatchJs).toString("base64")}`
);

function memoAt(id, date, hour, meridiem, minute = 0) {
  return { id, date, hour, minute, meridiem };
}

test("memoWallClockMs builds local wall clock from date and 12h time", () => {
  const ms = memoWallClockMs({
    date: "2026-08-05",
    hour: 11,
    minute: 0,
    meridiem: "AM",
  });
  assert.equal(ms, new Date(2026, 7, 5, 11, 0, 0).getTime());
});

test("memoWallClockMs defaults missing/invalid hour to 10:00 AM", () => {
  const expected = new Date(2026, 7, 5, 10, 0, 0).getTime();
  assert.equal(
    memoWallClockMs({
      date: "2026-08-05",
      hour: null,
      minute: 0,
      meridiem: "AM",
    }),
    expected,
  );
  assert.equal(
    memoWallClockMs({
      date: "2026-08-05",
      hour: Number.NaN,
      minute: null,
      meridiem: "AM",
    }),
    expected,
  );
  assert.equal(
    memoWallClockMs({
      date: "2026-08-05",
      hour: 99,
      minute: 0,
      meridiem: "AM",
    }),
    expected,
  );
  // Invalid meridiem defaults to AM with the 10:00 default hour.
  assert.equal(
    memoWallClockMs({
      date: "2026-08-05",
      hour: null,
      minute: 0,
      meridiem: "nope",
    }),
    expected,
  );
  assert.equal(
    memoWallClockMs({
      date: "not-a-date",
      hour: null,
      minute: 0,
      meridiem: "AM",
    }),
    null,
  );
});

test("diveNeedsPlaceNameHint is false when any place string is set", () => {
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: null, site: null, location: null }),
    true,
  );
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: "Blue", site: null, location: null }),
    false,
  );
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: null, site: "X", location: null }),
    false,
  );
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: null, site: null, location: "Hong Kong" }),
    false,
  );
});

test("listMemosNearDive respects half-window and sorts by |delta|", () => {
  const dive = { diveDate: "2026-08-05 12:00:00" };
  const memos = [
    memoAt("a", "2026-08-05", 11, "AM"), // -1h
    memoAt("b", "2026-08-05", 8, "PM"), // +8h
    memoAt("c", "2026-08-04", 12, "PM"), // -24h
  ];
  const within6 = listMemosNearDive(dive, memos, 6 * 3600_000);
  assert.deepEqual(within6.map((r) => r.memo.id), ["a"]);
  const within12 = listMemosNearDive(dive, memos, 12 * 3600_000);
  assert.deepEqual(within12.map((r) => r.memo.id), ["a", "b"]);
});

test("each imported dive independently receives every qualifying memo", () => {
  const memos = [
    memoAt("memo-1", "2026-08-05", 11, "AM"),
    memoAt("memo-2", "2026-08-05", 1, "PM", 30),
  ];
  const dives = [
    { id: "dive-a", diveDate: "2026-08-05 11:43:00" },
    { id: "dive-b", diveDate: "2026-08-05 14:49:00" },
  ];

  assert.deepEqual(
    listMemosNearDive(dives[0], memos, 6 * 3600_000).map(({ memo }) => memo.id),
    ["memo-1", "memo-2"],
  );
  assert.deepEqual(
    listMemosNearDive(dives[1], memos, 6 * 3600_000).map(({ memo }) => memo.id),
    ["memo-2", "memo-1"],
  );
  assert.deepEqual(
    listDivesNearMemo(memos[0], dives, 6 * 3600_000).map(({ dive }) => dive.id),
    ["dive-a", "dive-b"],
  );
});

test("the same memo remains a candidate for multiple dives", () => {
  const memo = memoAt("shared", "2026-08-05", 11, "AM");
  const dives = [
    { id: "before", diveDate: "2026-08-05 10:30:00" },
    { id: "after", diveDate: "2026-08-05 11:45:00" },
  ];
  assert.deepEqual(
    dives.map((dive) => listMemosNearDive(dive, [memo], 6 * 3600_000).length),
    [1, 1],
  );
});

test("6, 12, and 24 hour windows include exact boundaries", () => {
  const dive = { diveDate: "2026-08-05 12:00:00" };
  const memos = [
    memoAt("minus-24", "2026-08-04", 12, "PM"),
    memoAt("minus-12", "2026-08-05", 12, "AM"),
    memoAt("minus-6", "2026-08-05", 6, "AM"),
    memoAt("outside-6", "2026-08-05", 5, "AM", 59),
    memoAt("plus-6", "2026-08-05", 6, "PM"),
    memoAt("plus-12", "2026-08-06", 12, "AM"),
    memoAt("plus-24", "2026-08-06", 12, "PM"),
  ];
  assert.deepEqual(
    listMemosNearDive(dive, memos, 6 * 3600_000).map(({ memo }) => memo.id),
    ["minus-6", "plus-6"],
  );
  assert.deepEqual(
    new Set(
      listMemosNearDive(dive, memos, 12 * 3600_000).map(({ memo }) => memo.id),
    ),
    new Set(["minus-12", "minus-6", "outside-6", "plus-6", "plus-12"]),
  );
  assert.equal(listMemosNearDive(dive, memos, 24 * 3600_000).length, 7);
});

test("matching crosses midnight using local wall-clock time", () => {
  const dive = { diveDate: "2026-08-06 00:20:00" };
  const memos = [memoAt("previous-day", "2026-08-05", 11, "PM", 50)];
  const [match] = listMemosNearDive(dive, memos, 6 * 3600_000);
  assert.equal(match.memo.id, "previous-day");
  assert.equal(match.deltaMs, -30 * 60_000);
});

test("candidate diagnostics explain invalid and outside-window records", () => {
  const dive = { diveDate: "2026-08-05 12:00:00" };
  assert.equal(
    evaluateMemoCandidate(dive, memoAt("far", "2026-08-06", 1, "PM"), 6 * 3600_000)
      .exclusion,
    "outside-window",
  );
  assert.equal(
    evaluateMemoCandidate(
      { diveDate: null },
      memoAt("valid", "2026-08-05", 1, "PM"),
      6 * 3600_000,
    ).exclusion,
    "invalid-dive-time",
  );
});

test("date-only dive timestamps are interpreted as local midnight", () => {
  const evaluation = evaluateMemoCandidate(
    { diveDate: "2026-08-05" },
    memoAt("midnight", "2026-08-05", 12, "AM"),
    0,
  );
  assert.equal(evaluation.qualifies, true);
  assert.equal(evaluation.deltaMs, 0);
});
