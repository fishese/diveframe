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

const diveGpsJs = await transpile("lib/dive-gps.ts");
const diveGpsUrl = `data:text/javascript;base64,${Buffer.from(diveGpsJs).toString("base64")}`;
const diveMemosJs = await transpile("lib/dive-memos.ts");
const diveMemosUrl = `data:text/javascript;base64,${Buffer.from(diveMemosJs).toString("base64")}`;

let memoDiveApplyJs = await transpile("lib/memo-dive-apply.ts");
memoDiveApplyJs = memoDiveApplyJs.replace(
  /from "\.\/dive-gps(?:\.js)?"/,
  `from "${diveGpsUrl}"`,
);
memoDiveApplyJs = memoDiveApplyJs.replace(
  /from "\.\/dive-memos(?:\.js)?"/,
  `from "${diveMemosUrl}"`,
);

const { planApplyEmptyMemoFields } = await import(
  `data:text/javascript;base64,${Buffer.from(memoDiveApplyJs).toString("base64")}`
);

test("planApplyEmptyMemoFields fills only empty dive fields", () => {
  const plan = planApplyEmptyMemoFields(
    {
      location: "Blue Corner",
      lat: 7.1,
      lng: 134.2,
      buddies: "Sam",
      notes: "surge",
    },
    {
      userSite: null,
      site: null,
      location: null,
      gpsEntryLat: null,
      gpsEntryLng: null,
      userGpsLat: null,
      userGpsLng: null,
      buddy: "Existing",
      notes: null,
    },
  );
  assert.equal(plan.setUserSite, "Blue Corner");
  assert.equal(plan.setLocation, "Blue Corner");
  assert.deepEqual(plan.setUserGps, { lat: 7.1, lng: 134.2 });
  assert.equal(plan.setBuddy, undefined);
  assert.equal(plan.setNotes, "surge");
});

test("planApplyEmptyMemoFields skips site when userSite or site is set", () => {
  const plan = planApplyEmptyMemoFields(
    { location: "Blue Corner", lat: null, lng: null, buddies: null, notes: null },
    {
      userSite: null,
      site: "Imported Site",
      location: null,
      gpsEntryLat: null,
      gpsEntryLng: null,
      userGpsLat: null,
      userGpsLng: null,
      buddy: null,
      notes: null,
    },
  );
  assert.equal(plan.setUserSite, undefined);
  assert.equal(plan.setLocation, "Blue Corner");
});

test("planApplyEmptyMemoFields skips GPS when dive already has coordinates", () => {
  const plan = planApplyEmptyMemoFields(
    { location: null, lat: 7.1, lng: 134.2, buddies: null, notes: null },
    {
      userSite: null,
      site: null,
      location: null,
      gpsEntryLat: 1,
      gpsEntryLng: 2,
      userGpsLat: null,
      userGpsLng: null,
      buddy: null,
      notes: null,
    },
  );
  assert.equal(plan.setUserGps, undefined);
});

test("planApplyEmptyMemoFields treats computer exit GPS as existing coordinates", () => {
  const plan = planApplyEmptyMemoFields(
    { location: null, lat: 7.1, lng: 134.2, buddies: null, notes: null },
    {
      userSite: null,
      site: null,
      location: null,
      gpsEntryLat: null,
      gpsEntryLng: null,
      gpsExitLat: 1,
      gpsExitLng: 2,
      userGpsLat: null,
      userGpsLng: null,
      buddy: null,
      notes: null,
    },
  );
  assert.equal(plan.setUserGps, undefined);
});

test("catalog memo applies site identity separately from its place", () => {
  const plan = planApplyEmptyMemoFields(
    {
      siteName: "Blue Corner",
      location: "Palau",
      lat: 7.1,
      lng: 134.2,
      buddies: null,
      notes: null,
    },
    {
      userSite: null,
      site: null,
      location: null,
      gpsEntryLat: null,
      gpsEntryLng: null,
      userGpsLat: null,
      userGpsLng: null,
      buddy: null,
      notes: null,
    },
  );
  assert.equal(plan.setUserSite, "Blue Corner");
  assert.equal(plan.setLocation, "Palau");
});

test("applying one memo to two dives produces independent plans", () => {
  const memo = {
    siteName: "Shared briefing site",
    location: "Shared region",
    lat: null,
    lng: null,
    buddies: "Sam",
    notes: "Current from the north",
  };
  const emptyDive = {
    userSite: null,
    site: null,
    location: null,
    gpsEntryLat: null,
    gpsEntryLng: null,
    userGpsLat: null,
    userGpsLng: null,
    buddy: null,
    notes: null,
  };
  const first = planApplyEmptyMemoFields(memo, { ...emptyDive });
  const second = planApplyEmptyMemoFields(memo, { ...emptyDive });
  assert.deepEqual(second, first);
  assert.equal(first.setUserSite, "Shared briefing site");
  assert.equal(first.setBuddy, "Sam");
});
