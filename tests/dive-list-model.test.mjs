import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/dive-list-model.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  buildDiveListRows,
  compareDives,
  diveMatchesListFilters,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

function dive(overrides = {}) {
  return {
    id: "d1",
    diveDate: null,
    diveNumber: null,
    durationSeconds: null,
    maxDepthM: null,
    depth: null,
    tripId: null,
    computerModel: null,
    userSite: null,
    site: null,
    location: null,
    resolvedLocation: null,
    gpsEntryLat: null,
    gpsEntryLng: null,
    userGpsLat: null,
    userGpsLng: null,
    buddy: null,
    notes: null,
    sources: [],
    sourceDiveNumbers: {},
    ...overrides,
  };
}

function defaultFilters(overrides = {}) {
  return {
    namedOnly: false,
    gpsOnly: false,
    appSiteOnly: false,
    dateFrom: null,
    dateTo: null,
    computerModel: null,
    searchText: "",
    ...overrides,
  };
}

test("groups trip members contiguously and sorts by current option", () => {
  const trips = [{ id: "t1", name: "Maldives 2026" }];
  const dives = [
    dive({ id: "a", diveDate: "2026-08-01", tripId: null }),
    dive({ id: "b", diveDate: "2026-07-21", tripId: "t1" }),
    dive({ id: "c", diveDate: "2026-07-20", tripId: "t1" }),
  ];
  const rows = buildDiveListRows(dives, trips, "date-desc");
  assert.equal(rows[0].kind, "solo");
  assert.equal(rows[0].dive.id, "a");
  assert.equal(rows[1].kind, "trip");
  assert.equal(rows[1].trip.name, "Maldives 2026");
  assert.deepEqual(rows[1].dives.map((d) => d.id), ["b", "c"]);
});

test("dateFrom/dateTo and computerModel filter predicates", () => {
  assert.equal(
    diveMatchesListFilters(
      dive({ diveDate: "2026-07-21", computerModel: "Peregrine" }),
      defaultFilters({
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        computerModel: "Peregrine",
      }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ diveDate: "2026-08-01", computerModel: "Peregrine" }),
      defaultFilters({
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        computerModel: null,
      }),
    ),
    false,
  );
});

test("gpsOnly filter matches dives with only user GPS", () => {
  assert.equal(
    diveMatchesListFilters(
      dive({ userGpsLat: 22.1, userGpsLng: 114.1 }),
      defaultFilters({ gpsOnly: true }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ gpsEntryLat: 22.1, gpsEntryLng: 114.1 }),
      defaultFilters({ gpsOnly: true }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(dive(), defaultFilters({ gpsOnly: true })),
    false,
  );
});

test("partial match leaves only matching members under trip", () => {
  const matched = [
    dive({ id: "b", diveDate: "2026-07-21", tripId: "t1" }),
  ];
  const rows = buildDiveListRows(
    matched,
    [{ id: "t1", name: "Maldives 2026" }],
    "date-desc",
  );
  assert.equal(rows[0].kind, "trip");
  assert.equal(rows[0].dives.length, 1);
});

test("orphan tripId renders as solo dive", () => {
  const rows = buildDiveListRows(
    [dive({ id: "x", tripId: "missing-trip" })],
    [],
    "date-desc",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "solo");
  assert.equal(rows[0].dive.id, "x");
});

test("compareDives sorts by duration with date tie-break desc", () => {
  const shallow = dive({ diveDate: "2026-07-01", durationSeconds: 100 });
  const deep = dive({ diveDate: "2026-07-02", durationSeconds: 200 });
  assert.ok(compareDives(deep, shallow, "duration-desc") < 0);
  assert.ok(compareDives(shallow, deep, "duration-asc") < 0);
});

test("unknown depth sorts after a real zero-depth value", () => {
  const unknown = dive({ diveDate: "2026-07-02", maxDepthM: null, depth: null });
  const surface = dive({ diveDate: "2026-07-01", maxDepthM: 0, depth: "0" });
  assert.ok(compareDives(unknown, surface, "depth-asc") > 0);
  assert.ok(compareDives(unknown, surface, "depth-desc") > 0);
});

test("diveMatchesListFilters search includes computerModel", () => {
  assert.equal(
    diveMatchesListFilters(
      dive({ computerModel: "Peregrine TX" }),
      defaultFilters({ searchText: "peregrine" }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ computerModel: "Perdix 2" }),
      defaultFilters({ searchText: "peregrine" }),
    ),
    false,
  );
});
