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

let memoDiveApplyJs = await transpile("lib/memo-dive-apply.ts");
memoDiveApplyJs = memoDiveApplyJs.replace(
  /from "\.\/dive-gps(?:\.js)?"/,
  `from "${diveGpsUrl}"`,
);

const {
  planApplyEmptyMemoFields,
  preferredDiveNumberLabel,
  appendLinkedDiveNote,
} = await import(
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

test("preferredDiveNumberLabel prefers shearwater then subsurface", () => {
  assert.equal(
    preferredDiveNumberLabel({
      diveNumber: 9,
      sourceDiveNumbers: { shearwater: 42, subsurface: 7 },
    }),
    "42",
  );
  assert.equal(
    preferredDiveNumberLabel({
      diveNumber: 9,
      sourceDiveNumbers: { subsurface: 7 },
    }),
    "7",
  );
  assert.equal(
    preferredDiveNumberLabel({
      diveNumber: 9,
      sourceDiveNumbers: {},
    }),
    "9",
  );
  assert.equal(
    preferredDiveNumberLabel({
      diveNumber: null,
      sourceDiveNumbers: {},
    }),
    null,
  );
});

test("appendLinkedDiveNote appends or sets linked line", () => {
  assert.equal(appendLinkedDiveNote("surge", "42"), "surge\nLinked to dive #42");
  assert.equal(appendLinkedDiveNote(null, "42"), "Linked to dive #42");
  assert.equal(appendLinkedDiveNote("surge", null), "surge");
});
