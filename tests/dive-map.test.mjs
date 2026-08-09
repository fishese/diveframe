import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(path) {
  const source = await readFile(path, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

const map = await loadTypeScriptModule("lib/dive-map.ts");

const emptyCatalog = { sites: [] };
const catalog = {
  sites: [
    catalogSite("site-a", "Canyons", 13.514, 120.977, "Puerto Galera"),
    catalogSite("site-b", "Hole in the Wall", 13.5145, 120.9775, "Puerto Galera"),
    catalogSite("site-c", "Blue Corner", 7.134, 134.221, "Palau"),
  ],
};

function catalogSite(id, name, latitude, longitude, locality) {
  return {
    id,
    name,
    aliases: [],
    coordinates: { latitude, longitude },
    place: { countryCode: null, country: null, region: null, locality },
    source: { kind: "test", reference: null },
    status: "active",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function dive(id, overrides = {}) {
  return {
    id,
    diveDate: `2026-04-${String(Number(id.replace(/\D/g, "")) || 1).padStart(2, "0")}T10:00:00.000Z`,
    location: null,
    resolvedLocation: null,
    site: null,
    userSite: null,
    userSiteCatalogId: null,
    gpsEntryLat: null,
    gpsEntryLng: null,
    userGpsLat: null,
    userGpsLng: null,
    sourceSiteNames: {},
    ...overrides,
  };
}

test("equirectangular conversion covers world edges, equator, and hemispheres", () => {
  assert.deepEqual(map.latLonToMapPosition(0, 0), { x: 600, y: 300 });
  assert.deepEqual(map.latLonToMapPosition(0, -180), { x: 0, y: 300 });
  assert.deepEqual(map.latLonToMapPosition(0, 180), { x: 1200, y: 300 });
  assert.deepEqual(map.latLonToMapPosition(90, 0), { x: 600, y: 0 });
  assert.deepEqual(map.latLonToMapPosition(-90, 0), { x: 600, y: 600 });

  const northEast = map.latLonToMapPosition(22.3193, 114.1694);
  const southEast = map.latLonToMapPosition(-8.4095, 115.1889);
  const west = map.latLonToMapPosition(-0.9538, -90.9656);
  assert.ok(northEast.x > 600 && northEast.y < 300);
  assert.ok(southEast.x > 600 && southEast.y > 300);
  assert.ok(west.x < 600);
});

test("representative dive regions project to expected map quadrants", () => {
  const places = {
    hongKong: [22.3193, 114.1694],
    puertoGalera: [13.5021, 120.9543],
    okinawa: [26.3344, 127.8056],
    redSea: [27.2579, 33.8116],
    galapagos: [-0.9538, -90.9656],
    bali: [-8.4095, 115.1889],
    australia: [-18.2871, 147.6992],
  };
  for (const [name, [latitude, longitude]] of Object.entries(places)) {
    const position = map.latLonToMapPosition(latitude, longitude);
    assert.ok(position, name);
    assert.ok(position.x >= 0 && position.x <= 1200, name);
    assert.ok(position.y >= 0 && position.y <= 600, name);
  }
  assert.ok(map.latLonToMapPosition(...places.okinawa).y < map.latLonToMapPosition(...places.puertoGalera).y);
  assert.ok(map.latLonToMapPosition(...places.galapagos).x < 600);
  assert.ok(map.latLonToMapPosition(...places.bali).y > 300);
  assert.ok(map.latLonToMapPosition(...places.australia).y > 300);
});

test("invalid, partial, and obviously reversed coordinates are rejected", () => {
  assert.equal(map.latLonToMapPosition(Number.NaN, 10), null);
  assert.equal(map.latLonToMapPosition(10, Number.POSITIVE_INFINITY), null);
  assert.equal(map.latLonToMapPosition(91, 10), null);
  assert.equal(map.latLonToMapPosition(-91, 10), null);
  assert.equal(map.latLonToMapPosition(10, 181), null);
  assert.equal(map.resolveDiveCoordinates(dive("1", { gpsEntryLat: 114, gpsEntryLng: 22 }), emptyCatalog), null);
  assert.equal(map.resolveDiveCoordinates(dive("1", { gpsEntryLat: 22, gpsEntryLng: null }), emptyCatalog), null);
});

test("coordinate resolution trusts computer, user, then selected catalog coordinates", () => {
  const selected = dive("1", {
    userSiteCatalogId: "site-a",
    gpsEntryLat: 22,
    gpsEntryLng: 114,
    userGpsLat: 23,
    userGpsLng: 115,
  });
  assert.equal(map.resolveDiveCoordinates(selected, catalog).source, "computer");
  selected.gpsEntryLat = null;
  selected.gpsEntryLng = null;
  assert.equal(map.resolveDiveCoordinates(selected, catalog).source, "user");
  selected.userGpsLat = null;
  selected.userGpsLng = null;
  const fromCatalog = map.resolveDiveCoordinates(selected, catalog);
  assert.equal(fromCatalog.source, "catalog");
  assert.equal(fromCatalog.latitude, 13.514);
});

test("same known site ID aggregates despite slightly different GPS coordinates", () => {
  const data = map.buildDiveMapData([
    dive("1", { userSiteCatalogId: "site-a", userSite: "Canyons", gpsEntryLat: 13.514, gpsEntryLng: 120.977 }),
    dive("2", { userSiteCatalogId: "site-a", userSite: "Canyons", gpsEntryLat: 13.515, gpsEntryLng: 120.978 }),
    dive("3", { userSiteCatalogId: "site-a", userSite: "Canyons" }),
  ], catalog);
  assert.equal(data.markers.length, 1);
  assert.equal(data.markers[0].diveCount, 3);
  assert.equal(data.markers[0].knownSiteCount, 1);
  assert.equal(data.markers[0].title, "Canyons");
  assert.deepEqual(data.markers[0].dives.map((item) => item.id), ["3", "2", "1"]);
});

test("repeated and nearby unknown coordinates cluster within 250 metres", () => {
  const data = map.buildDiveMapData([
    dive("1", { gpsEntryLat: 22.3000, gpsEntryLng: 114.3000, site: "Unknown reef" }),
    dive("2", { gpsEntryLat: 22.3000, gpsEntryLng: 114.3000, site: "Unknown reef" }),
    dive("3", { userGpsLat: 22.3010, userGpsLng: 114.3005, site: "Unknown reef" }),
  ], emptyCatalog);
  assert.equal(data.markers.length, 1);
  assert.equal(data.markers[0].diveCount, 3);
});

test("distinct known nearby sites never merge solely by proximity", () => {
  const data = map.buildDiveMapData([
    dive("1", { userSiteCatalogId: "site-a" }),
    dive("2", { userSiteCatalogId: "site-b" }),
  ], catalog);
  assert.equal(data.markers.length, 2);
  assert.deepEqual(data.markers.map((marker) => marker.title).sort(), ["Canyons", "Hole in the Wall"]);
});

test("clearly separate unknown sites remain separate", () => {
  const data = map.buildDiveMapData([
    dive("1", { gpsEntryLat: 22.3, gpsEntryLng: 114.3 }),
    dive("2", { gpsEntryLat: 22.4, gpsEntryLng: 114.4 }),
  ], emptyCatalog);
  assert.equal(data.markers.length, 2);
});

test("memo-applied site identity aggregates across dives", () => {
  const data = map.buildDiveMapData([
    dive("1", { userSiteCatalogId: "site-c", userSite: "Blue Corner" }),
    dive("2", { userSiteCatalogId: "site-c", userSite: "Blue Corner" }),
  ], catalog);
  assert.equal(data.markers.length, 1);
  assert.equal(data.markers[0].diveCount, 2);
});

test("mixed valid, missing, and invalid coordinates report mapped and unmappable counts", () => {
  const data = map.buildDiveMapData([
    dive("1", { gpsEntryLat: 22.3, gpsEntryLng: 114.3 }),
    dive("2"),
    dive("3", { userGpsLat: -95, userGpsLng: 120 }),
    dive("4", { userSiteCatalogId: "site-a" }),
  ], catalog);
  assert.equal(data.mappedDiveCount, 2);
  assert.equal(data.unmappableDiveCount, 2);
  assert.deepEqual(data.unmappableDives.map((item) => item.id), ["3", "2"]);
});

test("rebuilding reflects site, coordinate, clearing, deletion, import, and restore changes", () => {
  const original = [dive("1"), dive("2", { gpsEntryLat: 22.3, gpsEntryLng: 114.3 })];
  assert.equal(map.buildDiveMapData(original, catalog).mappedDiveCount, 1);

  const siteChanged = original.map((item) => item.id === "1" ? { ...item, userSiteCatalogId: "site-a" } : item);
  assert.equal(map.buildDiveMapData(siteChanged, catalog).mappedDiveCount, 2);

  const coordinateChanged = siteChanged.map((item) => item.id === "2" ? { ...item, gpsEntryLat: 7.134, gpsEntryLng: 134.221 } : item);
  assert.equal(map.buildDiveMapData(coordinateChanged, catalog).markers.length, 2);

  const locationCleared = coordinateChanged.map((item) => item.id === "1" ? { ...item, userSiteCatalogId: null } : item);
  assert.equal(map.buildDiveMapData(locationCleared, catalog).unmappableDiveCount, 1);

  const afterDelete = locationCleared.filter((item) => item.id !== "2");
  assert.equal(map.buildDiveMapData(afterDelete, catalog).mappedDiveCount, 0);

  const afterImport = [...afterDelete, dive("3", { userGpsLat: -8.4, userGpsLng: 115.2 })];
  assert.equal(map.buildDiveMapData(afterImport, catalog).mappedDiveCount, 1);

  const afterBackupRestore = [dive("4", { userSiteCatalogId: "site-c" }), dive("5", { userSiteCatalogId: "site-c" })];
  const restored = map.buildDiveMapData(afterBackupRestore, catalog);
  assert.equal(restored.mappedDiveCount, 2);
  assert.equal(restored.markers.length, 1);
});
