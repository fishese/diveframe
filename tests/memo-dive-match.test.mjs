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
