# Trip, User GPS, Alias Display & List Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship trip assignment (detail + bulk), user GPS (manual + JPEG EXIF), catalog alias-as-display-name, and collapsible date/computer list filters in the shared web/Android UI.

**Architecture:** Keep pure list/GPS/EXIF logic in small `lib/` modules with node tests. Add trip CRUD and user-GPS writers in `indexed-db.ts`. Wire UI in `DiveFrameApp.tsx` (+ CSS/i18n). No schema bump — v8 fields already exist.

**Tech Stack:** React 19, IndexedDB (`lib/indexed-db.ts`), node:test + TypeScript transpile pattern used by existing `tests/*.test.mjs`, EN/zh-Hant/ja via `lib/app-i18n.ts`.

## Global Constraints

- Shared web UI only (browser + Capacitor APK); no native-only editors.
- Never overwrite computer `gpsEntry*` / `gpsExit*` with user GPS.
- Map / display coords: computer GPS → user GPS → name geocode.
- No `exportGpsPreference` UI this round (default `"computer"`).
- No hard consecutive-date limit on trip membership.
- Trip collapse state is session-only (not IndexedDB / preferences).
- Filter/search partial matches: trip header + matching members only (approach A).
- Prefer TDD for pure helpers; app-contract asserts for UI wiring.
- Do not `adb install` while the user is mid-download on device.
- Commit after each task; do not push unless asked.

---

## File structure

| File | Responsibility |
|---|---|
| Create: `lib/dive-list-model.ts` | Filter predicates, sort option type, trip block grouping |
| Create: `lib/dive-gps.ts` | `resolveDiveMapCoordinates` (computer → user) |
| Create: `lib/photo-exif-gps.ts` | Read lat/lng from JPEG `ArrayBuffer` (null if absent) |
| Create: `tests/dive-list-model.test.mjs` | Grouping / filter / partial-match tests |
| Create: `tests/dive-gps.test.mjs` | Resolution + EXIF helper tests |
| Modify: `lib/indexed-db.ts` | Trip CRUD, bulk `tripId`, `updateLocalDiveUserGps` |
| Modify: `app/DiveFrameApp.tsx` | List blocks, select mode, details editors, filters, alias expand |
| Modify: `app/globals.css` | Indent, trip header, filter panel, alias chips |
| Modify: `lib/app-i18n.ts` | EN / zh-Hant / ja strings |
| Modify: `tests/app-contract.test.mjs` | Assert new UI / helper imports |
| Modify: `docs/USER-GUIDE.md`, `docs/PRODUCT-SPEC.md`, `docs/2026-07-30-indexeddb-v8-planning.md`, `docs/2026-08-01-ble-product-import-session.md` | Docs catch-up |
| Spec (read-only): `docs/superpowers/specs/2026-08-01-trip-user-gps-editors-design.md` | Source of truth |

---

### Task 1: Dive list model (filter + trip blocks)

**Files:**
- Create: `lib/dive-list-model.ts`
- Create: `tests/dive-list-model.test.mjs`
- Modify: `package.json` (add test file to `"test"` script)

**Interfaces:**
- Produces:
  - `export type DiveSortOption = "date-desc" | "date-asc" | "duration-desc" | "duration-asc" | "depth-desc" | "depth-asc"`
  - `export type DiveListTrip = { id: string; name: string }`
  - `export type DiveListItem = { id: string; diveDate: string | null; diveNumber: number | null; durationSeconds: number | null; maxDepthM: number | null; depth?: string | null; tripId: string | null; computerModel: string | null; /* plus fields needed by filters/search */ }`
  - `export type DiveListFilters = { namedOnly: boolean; gpsOnly: boolean; appSiteOnly: boolean; dateFrom: string | null; dateTo: string | null; computerModel: string | null; searchText: string; sourceOnly?: ... }` — keep compatible with existing `parseDiveSearch` usage; either accept pre-parsed search or call a shared parse
  - `export function compareDives(a, b, option: DiveSortOption): number`
  - `export function diveMatchesListFilters(dive, filters): boolean`
  - `export type DiveListRow = { kind: "solo"; dive: T } | { kind: "trip"; trip: DiveListTrip; dives: T[]; collapsed?: boolean }`
  - `export function buildDiveListRows<T extends DiveListItem>(dives: T[], trips: DiveListTrip[], option: DiveSortOption, filtersActive: boolean): DiveListRow<T>[]`  
    — Input `dives` are **already filter-matched**. When building trips, group by `tripId`; orphan `tripId` (missing trip row) treat as solo. Sort members with `compareDives`. Sort blocks by comparing each block’s **anchor dive** (first member after in-trip sort) via `compareDives`. Solo dives are one-dive blocks. `filtersActive` is documentation only if input is already filtered (partial match A is “only matching members in the input”).

- [ ] **Step 1: Write failing tests**

```js
// tests/dive-list-model.test.mjs — transpile lib/dive-list-model.ts like ble-persist tests
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
      { dateFrom: "2026-07-01", dateTo: "2026-07-31", computerModel: "Peregrine", /* chips false, search "" */ },
    ),
    true,
  );
  assert.equal(
    diveMatchesListFilters(
      dive({ diveDate: "2026-08-01", computerModel: "Peregrine" }),
      { dateFrom: "2026-07-01", dateTo: "2026-07-31", computerModel: null },
    ),
    false,
  );
});

test("partial match leaves only matching members under trip", () => {
  const matched = [
    dive({ id: "b", diveDate: "2026-07-21", tripId: "t1" }),
  ];
  const rows = buildDiveListRows(matched, [{ id: "t1", name: "Maldives 2026" }], "date-desc");
  assert.equal(rows[0].kind, "trip");
  assert.equal(rows[0].dives.length, 1);
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `node --test tests/dive-list-model.test.mjs`  
Expected: FAIL resolving `lib/dive-list-model.ts` / missing exports

- [ ] **Step 3: Implement `lib/dive-list-model.ts`**

Move `compareDives` / date helpers out of `DiveFrameApp.tsx` into this module (or duplicate minimally then delete from app in Task 3). Implement `diveMatchesListFilters` for chips + date bounds (inclusive `YYYY-MM-DD` string compare is OK if dates are ISO dates) + `computerModel` exact match when set + search needle over the same fields as today **plus** `computerModel`.

- [ ] **Step 4: Green**

Run: `node --test tests/dive-list-model.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/dive-list-model.ts tests/dive-list-model.test.mjs package.json
git commit -m "Add dive list grouping and filter model helpers."
```

---

### Task 2: Trip + user GPS IndexedDB writers

**Files:**
- Modify: `lib/indexed-db.ts`
- Modify: `tests/app-contract.test.mjs` (assert exported symbol names appear in source)
- Optional: `tests/indexed-db-trips.test.mjs` only if fake-IDB is already patterned; otherwise contract + manual PC is enough

**Interfaces:**
- Consumes: `LocalTrip`, `LocalDive`, `UserGpsSource`, existing `updateDive` pattern
- Produces:
  - `listLocalTrips(): Promise<LocalTrip[]>`
  - `createLocalTrip(name: string): Promise<LocalTrip>` — `id: crypto.randomUUID()`, `updatedAt: ISO`
  - `renameLocalTrip(id: string, name: string): Promise<LocalTrip>`
  - `deleteLocalTrip(id: string, options?: { clearAssignments?: boolean }): Promise<void>`  
    — If dives still reference `id` and `clearAssignments` is not true, throw. If `clearAssignments: true`, clear those `tripId`s then delete trip.
  - `setLocalDiveTripId(diveId: string, tripId: string | null): Promise<LocalDive>`
  - `setLocalDiveTripIds(diveIds: string[], tripId: string | null): Promise<void>` — one transaction
  - `updateLocalDiveUserGps(id: string, gps: { lat: number; lng: number; source: UserGpsSource } | null): Promise<LocalDive>`  
    — `null` clears all four user GPS fields; never touches `gpsEntry*`

- [ ] **Step 1: Failing contract asserts**

```js
assert.match(indexedDbSource, /export async function listLocalTrips/);
assert.match(indexedDbSource, /export async function createLocalTrip/);
assert.match(indexedDbSource, /export async function renameLocalTrip/);
assert.match(indexedDbSource, /export async function deleteLocalTrip/);
assert.match(indexedDbSource, /export async function setLocalDiveTripIds/);
assert.match(indexedDbSource, /export async function updateLocalDiveUserGps/);
```

- [ ] **Step 2: Implement writers** using existing `openDatabase` / `request` / `transactionComplete` patterns. `createLocalTrip` trims name; reject empty.

- [ ] **Step 3: Green contract subset + commit**

```bash
git add lib/indexed-db.ts tests/app-contract.test.mjs
git commit -m "Add trip CRUD and user GPS IndexedDB writers."
```

---

### Task 3: Trip UI — list blocks, select mode, details assignment

**Files:**
- Modify: `app/DiveFrameApp.tsx`
- Modify: `app/globals.css`
- Modify: `lib/app-i18n.ts` (trip strings EN + zh-Hant + ja)
- Modify: `tests/app-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 `buildDiveListRows` / `compareDives`; Task 2 trip APIs
- Produces: Working trip UX on dive list + Edit dive details

- [ ] **Step 1: Load trips with dives**  
  On refresh, `listLocalTrips()` alongside `listLocalDives()`. Keep `trips` in state.

- [ ] **Step 2: Render block list**  
  Replace flat `visibleDives.map` with rows from `buildDiveListRows`.  
  - Trip header button toggles session `collapsedTripIds: Set<string>` (default empty = all expanded).  
  - Members use indented class `dive-row dive-row-trip-member`.  
  - Header shows name + dive count when collapsed.  
  - Do **not** persist collapse.

- [ ] **Step 3: Select mode**  
  - Toggle `selectMode`. While on: checkboxes on dive rows; clicking row toggles selection instead of `chooseDive`.  
  - Action bar: New trip (prompt/name) → `createLocalTrip` + `setLocalDiveTripIds`; Add to existing (pick trip); Remove from trip (`tripId: null`).  
  - Exit select mode clears selection.

- [ ] **Step 4: Edit dive details trip controls**  
  Select: None / existing / “New trip…”. Rename when assigned. Delete trip via confirm using `deleteLocalTrip` (with clear if needed).

- [ ] **Step 5: CSS + i18n + contract asserts** (`selectMode`, `buildDiveListRows`, trip class names).

- [ ] **Step 6: Commit**

```bash
git commit -m "Add trip list blocks, select mode, and detail assignment."
```

---

### Task 4: User GPS + map resolution + JPEG EXIF

**Files:**
- Create: `lib/dive-gps.ts`
- Create: `lib/photo-exif-gps.ts`
- Create: `tests/dive-gps.test.mjs`
- Modify: `app/DiveFrameApp.tsx` (details form + map lat/lng source)
- Modify: `lib/app-i18n.ts`
- Modify: `package.json` test script
- Modify: `tests/app-contract.test.mjs`

**Interfaces:**
- Produces:
  - `resolveDiveMapCoordinates(dive: { gpsEntryLat, gpsEntryLng, userGpsLat, userGpsLng }): { latitude: number; longitude: number; source: "computer" | "user" } | null`
  - `readJpegExifGps(buffer: ArrayBuffer): Promise<{ latitude: number; longitude: number } | null>`  
    — Prefer adding dependency `exifr` **or** a minimal GPS-IFD reader; pick one in implementation and cover with a tiny JPEG fixture under `tests/fixtures/` (or inline base64). Return `null` when no GPS / not JPEG.

- [ ] **Step 1: Failing tests for resolution order and EXIF null/valid**

```js
test("prefers computer GPS over user GPS", () => {
  const coords = resolveDiveMapCoordinates({
    gpsEntryLat: 22.1, gpsEntryLng: 114.1,
    userGpsLat: 1, userGpsLng: 2,
  });
  assert.equal(coords.source, "computer");
});

test("falls back to user GPS", () => {
  const coords = resolveDiveMapCoordinates({
    gpsEntryLat: null, gpsEntryLng: null,
    userGpsLat: 3, userGpsLng: 4,
  });
  assert.deepEqual(coords, { latitude: 3, longitude: 4, source: "user" });
});
```

- [ ] **Step 2: Implement helpers; wire map** in `DiveDetail` to use `resolveDiveMapCoordinates` before geocode. Geocode remains when both GPS pairs absent.

- [ ] **Step 3: Details UI** — lat/lng inputs, Clear → `updateLocalDiveUserGps(id, null)`, Save manual → `source: "manual"`. “Use location from photo” iterates `attachments`, reads blob → `readJpegExifGps`, on hit saves `source: "photo-exif"`; on miss show status string.

- [ ] **Step 4: Green tests + commit**

```bash
git commit -m "Add user GPS editing, map resolution, and JPEG EXIF import."
```

---

### Task 5: Catalog alias expand-in-picker

**Files:**
- Modify: `app/DiveFrameApp.tsx` (nearby site list)
- Modify: `app/globals.css`
- Modify: `lib/app-i18n.ts`
- Modify: `tests/app-contract.test.mjs`

**Interfaces:**
- Consumes: existing `onSaveSite` / `updateLocalDiveSite` (`name` + `catalogId`)
- Produces: Main-name button + expand aliases chips

- [ ] **Step 1: UI**  
  State `expandedAliasSiteId: string | null`. Each catalog suggestion: primary button saves `site.name`; secondary chevron toggles chips for `site.aliases`. Chip click saves that alias string with same `catalogId` / coords / source `"catalog"`. Only one site expanded.

- [ ] **Step 2: Contract assert** for alias expand class or handler name + commit

```bash
git commit -m "Allow choosing a catalog alias as the displayed site name."
```

---

### Task 6: Collapsible date/computer filters + Reset + search haystack

**Files:**
- Modify: `app/DiveFrameApp.tsx`
- Modify: `app/globals.css`
- Modify: `lib/app-i18n.ts`
- Modify: `tests/app-contract.test.mjs`
- Modify: `tests/dive-list-model.test.mjs` if filter wiring needs extra cases

**Interfaces:**
- Consumes: `diveMatchesListFilters` / `buildDiveListRows` from Task 1

- [ ] **Step 1:** State `dateFrom`, `dateTo`, `computerFilter`, `filtersOpen`. Distinct computers from `dives.map(d => d.computerModel).filter(Boolean)` sorted.

- [ ] **Step 2:** Collapsible panel with date inputs + computer `<select>`. Pipeline: filter with `diveMatchesListFilters` (include search + chips + new fields) → `buildDiveListRows`.

- [ ] **Step 3:** **Reset filters** clears `dateFrom`/`dateTo`/`computerFilter` + named/gps/appSite chips. Does **not** clear search text. Disable/hide emphasis when nothing active (extend existing `filter-clear` or add `resetFilters` control).

- [ ] **Step 4:** Ensure search needle includes `computerModel` (in model helper).

- [ ] **Step 5: Commit**

```bash
git commit -m "Add collapsible date and computer dive list filters."
```

---

### Task 7: Docs + full test suite

**Files:**
- Modify: `docs/USER-GUIDE.md`
- Modify: `docs/PRODUCT-SPEC.md`
- Modify: `docs/2026-07-30-indexeddb-v8-planning.md`
- Modify: `docs/2026-08-01-ble-product-import-session.md` (resume checklist: editors in progress/done)
- Modify: `package.json` if any test files missing from script

- [ ] **Step 1:** Document trips (list blocks, select mode, details), user GPS + EXIF, alias chips, filters + reset.

- [ ] **Step 2:** Run `npm test` — Expected: PASS (build + all listed tests).

- [ ] **Step 3: Commit**

```bash
git commit -m "Document trip, user GPS, alias, and list filter behavior."
```

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Trip CRUD + detail assign | 2, 3 |
| Bulk select New/Add/Remove | 3 |
| List blocks, indent, expand session-only | 3 |
| Anchor + in-trip sort by current option | 1, 3 |
| Partial match A | 1, 6 |
| User GPS manual + clear | 2, 4 |
| Photo EXIF | 4 |
| Map computer → user → geocode | 4 |
| Alias expand picker | 5 |
| Date/computer filters + Reset | 6 |
| Search includes computer | 1, 6 |
| i18n + docs | 3–7 |
| No exportGpsPreference UI / no schema bump / no consecutive limit | honored throughout |

## Placeholder / consistency review

- Types use `DiveSortOption` and `buildDiveListRows` consistently across tasks.
- `updateLocalDiveUserGps` / `setLocalDiveTripIds` names match Tasks 2–4.
- No TBD sections remain.
