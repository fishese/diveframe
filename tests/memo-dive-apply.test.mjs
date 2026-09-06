import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

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

const { planApplyEmptyMemoFields, planUseMemoLocation, revalidateEmptyMemoPlan, isMemoDiveApplyPlanEmpty } = await import(
  `data:text/javascript;base64,${Buffer.from(memoDiveApplyJs).toString("base64")}`
);

test("stale fill-empty plans preserve newly saved fields and do not mutate the plan", () => {
  const plan = { setUserSite: "Memo site", setUserSiteCatalogId: "memo-site", setUserGps: { lat: 1, lng: 2 }, setLocation: "Memo region", setBuddy: "Memo buddy", setNotes: "Memo notes" };
  const latest = { userSite: "Saved site", location: "Saved region", gpsExitLat: 3, gpsExitLng: 4, buddy: "Saved buddy", notes: "Saved notes" };
  assert.equal(isMemoDiveApplyPlanEmpty(revalidateEmptyMemoPlan(plan, latest)), true);
  assert.equal(plan.setUserSite, "Memo site");
  assert.deepEqual(revalidateEmptyMemoPlan(plan, { ...latest, notes: null }), { setNotes: "Memo notes" });
});

test("memo mutation rereads current saves and duplicate application makes no second write", async () => {
  const source = await readFile("lib/indexed-db.ts", "utf8");
  const parsed = ts.createSourceFile("indexed-db.ts", source, ts.ScriptTarget.Latest, true);
  const method = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "applyLocalDiveMemoPlan");
  const javascript = ts.transpileModule(method.getText(parsed).replace("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let stored = { id: "dive", userSite: "New site", userSiteCatalogId: "new-site", gpsEntryLat: 3, gpsEntryLng: 4, buddy: "New buddy", notes: null, appEditedAt: "before", exportGpsPreference: "user", samples: [{ elapsedSeconds: 0, depthM: 2, pressuresBar: [200] }] };
  let writes = 0;
  let notifications = 0;
  const deleted = [];
  const transaction = { objectStore: (name) => name === "dives" ? { get: () => structuredClone(stored), put: (value) => { stored = structuredClone(value); writes++; } } : { delete: (id) => deleted.push(id) } };
  const context = vm.createContext({
    openDatabase: async () => ({ transaction(names, mode) { assert.equal(mode, "readwrite"); return transaction; } }),
    DIVES_STORE: "dives", SITE_CONTRIBUTIONS_STORE: "contributions",
    request: async (value) => value, hydrateDive: (value) => value,
    revalidateEmptyMemoPlan, isMemoDiveApplyPlanEmpty,
    transactionComplete: async () => {}, notifyLocalDataChanged: () => notifications++,
  });
  vm.runInContext(javascript, context);
  const plan = { setUserSite: "Old memo site", setUserSiteCatalogId: "old", setUserGps: { lat: 1, lng: 2 }, setBuddy: "Old buddy", setNotes: "Memo notes" };
  const before = structuredClone(stored);
  await context.applyLocalDiveMemoPlan("dive", plan);
  assert.equal(stored.notes, "Memo notes");
  for (const key of ["userSite", "userSiteCatalogId", "gpsEntryLat", "gpsEntryLng", "buddy", "exportGpsPreference", "samples"]) assert.deepEqual(stored[key], before[key]);
  const saved = structuredClone(stored);
  await context.applyLocalDiveMemoPlan("dive", plan);
  assert.deepEqual(stored, saved);
  assert.equal(writes, 1);
  assert.equal(notifications, 1);
  assert.deepEqual(deleted, []);
});

test("copying buddy or notes preserves the other current value and supports explicit clearing", async () => {
  const source = await readFile("lib/indexed-db.ts", "utf8");
  const parsed = ts.createSourceFile("indexed-db.ts", source, ts.ScriptTarget.Latest, true);
  const method = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "updateLocalDiveDetails");
  const javascript = ts.transpileModule(method.getText(parsed).replace("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let stored = { buddy: "Current buddy", notes: "Current notes" };
  const context = vm.createContext({ updateDive: async (_id, change) => { stored = change(stored); return stored; } });
  vm.runInContext(javascript, context);
  await context.updateLocalDiveDetails("dive", { buddy: "Memo buddy" });
  assert.equal(stored.notes, "Current notes");
  await context.updateLocalDiveDetails("dive", { notes: "Memo notes" });
  assert.equal(stored.buddy, "Memo buddy");
  await context.updateLocalDiveDetails("dive", { buddy: null });
  assert.equal(stored.buddy, null);
  assert.equal(stored.notes, "Memo notes");
});

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
      siteCatalogId: "pw-blue-corner",
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
  assert.equal(plan.setUserSiteCatalogId, "pw-blue-corner");
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

test("Use location copies a catalog site and its coordinates together", () => {
  assert.deepEqual(
    planUseMemoLocation({
      siteName: "Blue Corner",
      siteCatalogId: "pw-blue-corner",
      location: "Palau",
      lat: 7.1,
      lng: 134.2,
    }),
    {
      type: "site",
      name: "Blue Corner",
      catalogId: "pw-blue-corner",
      location: "Palau",
      gps: { lat: 7.1, lng: 134.2 },
    },
  );
});

test("Use location copies coordinates alone when the memo has no site", () => {
  assert.deepEqual(
    planUseMemoLocation({
      siteName: null,
      siteCatalogId: null,
      location: null,
      lat: 7.1,
      lng: 134.2,
    }),
    { type: "gps", gps: { lat: 7.1, lng: 134.2 } },
  );
});

test("Use location can copy a site without coordinates", () => {
  assert.deepEqual(
    planUseMemoLocation({
      siteName: "Blue Corner",
      siteCatalogId: null,
      location: "Palau",
      lat: null,
      lng: null,
    }),
    {
      type: "site",
      name: "Blue Corner",
      catalogId: null,
      location: "Palau",
      gps: null,
    },
  );
});
