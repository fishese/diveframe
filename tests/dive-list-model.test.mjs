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
  DEFAULT_SHORT_DIVE_MAX_MINUTES,
  diveMatchesListFilters,
  diveWasEditedHere,
  flattenDiveListRows,
  parsePositiveWholeMinutes,
  shortDiveCandidateIds,
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
    tankPressuresStartBar: [],
    tankPressuresEndBar: [],
    tanks: [],
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
    unnamedOnly: false,
    gpsOnly: false,
    appSiteOnly: false,
    gasDataOnly: false,
    shortDiveMaxMinutes: null,
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
  assert.deepEqual(flattenDiveListRows(rows).map((d) => d.id), ["a", "b", "c"]);
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

test("named and unnamed site filters use site names rather than place text", () => {
  assert.equal(
    diveMatchesListFilters(
      dive({ userSite: "Blue Corner" }),
      defaultFilters({ namedOnly: true }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ location: "Palau" }),
      defaultFilters({ namedOnly: true }),
    ),
    false,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ location: "Palau" }),
      defaultFilters({ unnamedOnly: true }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ site: "German Channel" }),
      defaultFilters({ unnamedOnly: true }),
    ),
    false,
  );
});

test("gas data filter requires a positive pressure reading", () => {
  assert.equal(
    diveMatchesListFilters(
      dive({ tankPressuresStartBar: [200] }),
      defaultFilters({ gasDataOnly: true }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ tanks: [{ endPressureBar: 65 }] }),
      defaultFilters({ gasDataOnly: true }),
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ tankPressuresStartBar: [null, 0] }),
      defaultFilters({ gasDataOnly: true }),
    ),
    false,
  );
});

test("short-dive duration composes with the other filters", () => {
  const filters = defaultFilters({
    unnamedOnly: true,
    gasDataOnly: true,
    shortDiveMaxMinutes: 5,
  });
  assert.equal(
    diveMatchesListFilters(
      dive({ durationSeconds: 300, tankPressuresEndBar: [80] }),
      filters,
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ durationSeconds: 301, tankPressuresEndBar: [80] }),
      filters,
    ),
    false,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ durationSeconds: 60, tankPressuresEndBar: [] }),
      filters,
    ),
    false,
  );
});

test("edited-here filter matches appEditedAt and legacy app-only fields", () => {
  assert.equal(diveWasEditedHere(dive()), false);
  assert.equal(diveWasEditedHere(dive({ userSite: "Site A" })), true);
  assert.equal(
    diveWasEditedHere(dive({ userGpsLat: 1, userGpsLng: 2 })),
    true,
  );
  assert.equal(diveWasEditedHere(dive({ tripId: "t1" })), true);
  assert.equal(diveWasEditedHere(dive({ cylinderVolumeL: 12 })), true);
  assert.equal(
    diveWasEditedHere(dive({ appEditedAt: "2026-08-04T00:00:00.000Z" })),
    true,
  );
  assert.equal(
    diveMatchesListFilters(dive({ buddy: "Ada" }), defaultFilters({ appSiteOnly: true })),
    false,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ appEditedAt: "2026-08-04T00:00:00.000Z", buddy: "Ada" }),
      defaultFilters({ appSiteOnly: true }),
    ),
    true,
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

test("short-dive threshold is a positive whole number of minutes defaulting to 3", () => {
  assert.equal(DEFAULT_SHORT_DIVE_MAX_MINUTES, 3);
  assert.equal(parsePositiveWholeMinutes(3), 3);
  assert.equal(parsePositiveWholeMinutes("3"), 3);
  assert.equal(parsePositiveWholeMinutes("01"), null);
  assert.equal(parsePositiveWholeMinutes(0), null);
  assert.equal(parsePositiveWholeMinutes(-3), null);
  assert.equal(parsePositiveWholeMinutes(3.5), null);
  assert.equal(parsePositiveWholeMinutes("3.5"), null);
  assert.equal(parsePositiveWholeMinutes(""), null);
  assert.equal(parsePositiveWholeMinutes("abc"), null);
  assert.equal(parsePositiveWholeMinutes(Number.NaN), null);
  assert.equal(parsePositiveWholeMinutes(Number.POSITIVE_INFINITY), null);
});

test("short-dive candidates include 180s and exclude 181s at the 3-minute default", () => {
  const dives = [
    dive({ id: "at-limit", durationSeconds: 180 }),
    dive({ id: "over-limit", durationSeconds: 181 }),
    dive({ id: "one-second", durationSeconds: 1 }),
  ];
  assert.deepEqual(shortDiveCandidateIds(dives, DEFAULT_SHORT_DIVE_MAX_MINUTES), [
    "at-limit",
    "one-second",
  ]);
});

test("unknown, zero, negative, and non-finite durations are never short-dive candidates", () => {
  const dives = [
    dive({ id: "null-duration", durationSeconds: null }),
    dive({ id: "zero", durationSeconds: 0 }),
    dive({ id: "negative", durationSeconds: -12 }),
    dive({ id: "nan", durationSeconds: Number.NaN }),
    dive({ id: "infinity", durationSeconds: Number.POSITIVE_INFINITY }),
    dive({ id: "valid", durationSeconds: 60 }),
  ];
  assert.deepEqual(shortDiveCandidateIds(dives, 3), ["valid"]);
  assert.deepEqual(shortDiveCandidateIds(dives, 0), []);
  assert.deepEqual(shortDiveCandidateIds(dives, 2.5), []);
  assert.deepEqual(shortDiveCandidateIds(dives, Number.NaN), []);
});

test("active search, date, and computer filters constrain short-dive candidates", () => {
  const dives = [
    dive({
      id: "in-range",
      diveDate: "2026-07-15",
      durationSeconds: 90,
      computerModel: "Peregrine",
      notes: "pool check",
    }),
    dive({
      id: "wrong-date",
      diveDate: "2026-08-01",
      durationSeconds: 60,
      computerModel: "Peregrine",
      notes: "pool check",
    }),
    dive({
      id: "wrong-computer",
      diveDate: "2026-07-15",
      durationSeconds: 45,
      computerModel: "Perdix 2",
      notes: "pool check",
    }),
    dive({
      id: "wrong-search",
      diveDate: "2026-07-15",
      durationSeconds: 30,
      computerModel: "Peregrine",
      notes: "reef wall",
    }),
    dive({
      id: "too-long",
      diveDate: "2026-07-15",
      durationSeconds: 240,
      computerModel: "Peregrine",
      notes: "pool check",
    }),
  ];
  const visible = dives.filter((item) =>
    diveMatchesListFilters(
      item,
      defaultFilters({
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        computerModel: "Peregrine",
        searchText: "pool",
      }),
    ),
  );
  assert.deepEqual(
    visible.map((item) => item.id),
    ["in-range", "too-long"],
  );
  assert.deepEqual(shortDiveCandidateIds(visible, 3), ["in-range"]);
});
