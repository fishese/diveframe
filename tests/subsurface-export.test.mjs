import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { DOMParser } from "linkedom";
import { typescriptUrl } from "./helpers/import-typescript.mjs";

globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = class {
  serializeToString(document) {
    return document.toString();
  }
};

const gpsJavascript = ts.transpileModule(
  await readFile("lib/dive-gps.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const gpsUrl = `data:text/javascript;base64,${Buffer.from(gpsJavascript).toString("base64")}`;
let source = await readFile("lib/subsurface-site-export.ts", "utf8");
source = source.replace(/from "\.\/dive-gps"/, `from "${gpsUrl}"`);
const parserUrl = await typescriptUrl("lib/parsers/subsurface.ts");
const { readSubsurfaceLog } = await import(parserUrl);
source = source.replace(/from "\.\/parsers\/subsurface"/, `from "${parserUrl}"`);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { addDiveFrameSitesToSubsurface } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("imports trip dives and preserves shared-site metadata through case-only renames", async () => {
  const xml = `<divelog><divesites>
    <site uuid="original" name="BLUE CORNER" gps="1 2" description="Original description" custom="keep"><notes>Site notes</notes><taxonomy><geo cat="0" value="Palau"/></taxonomy><extension value="keep"/></site>
    <site uuid="different" name="Blue Corner" gps="1 2" description="Other metadata"/>
    </divesites><dives>
    <dive number="1" divesiteid="original"><divecomputer deviceid="device" diveid="1"/></dive>
    <trip location="Palau"><dive number="2" divesiteid="original"><divecomputer deviceid="device" diveid="2"/></dive></trip>
    </dives></divelog>`;
  const imported = readSubsurfaceLog(xml);
  assert.deepEqual(imported.map((dive) => dive.sourceId), ["device:1", "device:2"]);
  assert.equal(imported[1].gpsEntryLat, 1);
  const edited = { ...imported[1], userSite: "Blue Corner" };
  const result = await addDiveFrameSitesToSubsurface(new File([xml], "trip.ssrf"), [edited], [{ source: "subsurface", sourceId: edited.sourceId, diveId: edited.id }]);
  const doc = new DOMParser().parseFromString(result.xml, "application/xml");
  const original = doc.querySelector('site[uuid="original"]');
  const linkedId = doc.querySelector("trip > dive").getAttribute("divesiteid");
  const linked = doc.querySelector(`site[uuid="${linkedId}"]`);
  assert.equal(doc.querySelector("dives > dive").getAttribute("divesiteid"), "original");
  assert.equal(original.getAttribute("name"), "BLUE CORNER");
  assert.equal(linked.getAttribute("name"), "Blue Corner");
  assert.equal(linked.getAttribute("gps"), "1 2");
  assert.equal(linked.getAttribute("description"), "Original description");
  assert.equal(linked.getAttribute("custom"), "keep");
  assert.equal(linked.querySelector("notes").textContent, "Site notes");
  assert.equal(linked.querySelector("geo").getAttribute("value"), "Palau");
  assert.equal(linked.querySelector("extension").getAttribute("value"), "keep");
  assert.equal(result.addedSites, 1);
  const again = await addDiveFrameSitesToSubsurface(new File([result.xml], "trip.ssrf"), [edited], [{ source: "subsurface", sourceId: edited.sourceId, diveId: edited.id }]);
  assert.equal(again.addedSites, 0);
  assert.equal(again.updatedDives, 0);
});

test("updates editable fields without rebuilding the Subsurface dive", async () => {
  const xml = `<?xml version="1.0"?>
<divelog program="subsurface" version="3">
  <divesites>
    <site uuid="original-site" name="Original Site" gps="22.300000 114.200000"/>
  </divesites>
  <dives>
    <dive number="17" date="2026-05-17" time="14:00:00" duration="42:00 min" divesiteid="original-site">
      <buddy>Old Buddy</buddy>
      <notes>Old notes</notes>
      <divecomputer model="Perdix 2" deviceid="perdix-device" diveid="17">
        <depth max="14.0 m" mean="8.0 m"/>
        <sample time="10:00 min" depth="12.0 m" pressure0="180 bar"/>
      </divecomputer>
    </dive>
  </dives>
</divelog>`;
  const file = new File([xml], "source.ssrf", { type: "application/xml" });
  const dives = [{
    id: "canonical-dive",
    userSite: "Sharp Island",
    sourceSiteNames: { shearwater: "Shearwater Site" },
    gpsEntryLat: 22.36326,
    gpsEntryLng: 114.29319,
    buddy: "Updated Buddy",
    notes: "Updated notes",
  }];
  const sourceRecords = [{
    source: "subsurface",
    sourceId: "perdix-device:17",
    diveId: "canonical-dive",
  }];

  const result = await addDiveFrameSitesToSubsurface(
    file,
    dives,
    sourceRecords,
  );
  const updated = new DOMParser().parseFromString(result.xml, "application/xml");
  const dive = updated.querySelector("dives > dive");
  const linkedSite = updated.querySelector(
    `divesites > site[uuid="${dive.getAttribute("divesiteid")}"]`,
  );

  assert.equal(result.updatedDives, 1);
  assert.equal(result.addedSites, 1);
  assert.equal(result.updatedBuddies, 1);
  assert.equal(result.updatedNotes, 1);
  assert.equal(linkedSite.getAttribute("name"), "Sharp Island");
  assert.equal(linkedSite.getAttribute("gps"), "22.300000 114.200000");
  assert.equal(dive.querySelector("buddy").textContent, "Updated Buddy");
  assert.equal(dive.querySelector("notes").textContent, "Updated notes");
  assert.equal(dive.querySelector("divecomputer").getAttribute("model"), "Perdix 2");
  assert.equal(dive.querySelector("sample").getAttribute("pressure0"), "180 bar");
});

test("preserves source GPS when a DiveFrame site name replaces the source name", async () => {
  const xml = `<divelog program="subsurface" version="3">
  <divesites><site uuid="source-site" name="Old name" gps="1.000000 2.000000"/></divesites>
  <dives><dive divesiteid="source-site"><divecomputer deviceid="device" diveid="1"/></dive></dives>
</divelog>`;
  const result = await addDiveFrameSitesToSubsurface(
    new File([xml], "source.ssrf", { type: "application/xml" }),
    [{
      id: "canonical",
      userSite: "DiveFrame name",
      sourceSiteNames: {},
      gpsEntryLat: 3,
      gpsEntryLng: 4,
      userGpsLat: 5,
      userGpsLng: 6,
      buddy: null,
      notes: null,
    }],
    [{ source: "subsurface", sourceId: "device:1", diveId: "canonical" }],
  );
  const updated = new DOMParser().parseFromString(result.xml, "application/xml");
  const dive = updated.querySelector("dives > dive");
  const linkedSite = updated.querySelector(
    `divesites > site[uuid="${dive.getAttribute("divesiteid")}"]`,
  );

  assert.equal(linkedSite.getAttribute("name"), "DiveFrame name");
  assert.equal(linkedSite.getAttribute("gps"), "1.000000 2.000000");
});

test("fills missing source GPS from DiveFrame user coordinates", async () => {
  const xml = `<divelog program="subsurface" version="3">
  <divesites><site uuid="source-site" name="DiveFrame name"/></divesites>
  <dives><dive divesiteid="source-site"><divecomputer deviceid="device" diveid="1"/></dive></dives>
</divelog>`;
  const result = await addDiveFrameSitesToSubsurface(
    new File([xml], "source.ssrf", { type: "application/xml" }),
    [{
      id: "canonical",
      userSite: "DiveFrame name",
      sourceSiteNames: {},
      gpsEntryLat: null,
      gpsEntryLng: null,
      userGpsLat: 5,
      userGpsLng: 6,
      buddy: null,
      notes: null,
    }],
    [{ source: "subsurface", sourceId: "device:1", diveId: "canonical" }],
  );
  const updated = new DOMParser().parseFromString(result.xml, "application/xml");
  const dive = updated.querySelector("dives > dive");
  const linkedSite = updated.querySelector(
    `divesites > site[uuid="${dive.getAttribute("divesiteid")}"]`,
  );

  assert.equal(linkedSite.getAttribute("name"), "DiveFrame name");
  assert.equal(linkedSite.getAttribute("gps"), "5.000000 6.000000");
});

test("preserves a Subsurface start-location coordinate when no site is linked", async () => {
  const xml = `<divelog program="subsurface" version="3">
  <dives><dive><divecomputer deviceid="device" diveid="1">
    <extradata key="Start location" value="7.100000 8.200000"/>
  </divecomputer></dive></dives>
</divelog>`;
  const result = await addDiveFrameSitesToSubsurface(
    new File([xml], "source.ssrf", { type: "application/xml" }),
    [{
      id: "canonical",
      userSite: "DiveFrame name",
      sourceSiteNames: {},
      gpsEntryLat: 9,
      gpsEntryLng: 10,
      userGpsLat: 11,
      userGpsLng: 12,
      buddy: null,
      notes: null,
    }],
    [{ source: "subsurface", sourceId: "device:1", diveId: "canonical" }],
  );
  const updated = new DOMParser().parseFromString(result.xml, "application/xml");
  const dive = updated.querySelector("dives > dive");
  const linkedSite = updated.querySelector(
    `divesites > site[uuid="${dive.getAttribute("divesiteid")}"]`,
  );

  assert.equal(linkedSite.getAttribute("gps"), "7.100000 8.200000");
});

test("user GPS preference overrides source GPS and falls back when invalid", async () => {
  const xml = `<divelog program="subsurface" version="3">
  <divesites><site uuid="source-site" name="Old name" gps="1.000000 2.000000"/></divesites>
  <dives><dive divesiteid="source-site"><divecomputer deviceid="device" diveid="1"/></dive></dives>
</divelog>`;
  const sourceRecords = [
    { source: "subsurface", sourceId: "device:1", diveId: "canonical" },
  ];
  const preferred = await addDiveFrameSitesToSubsurface(
    new File([xml], "source.ssrf", { type: "application/xml" }),
    [{
      id: "canonical",
      userSite: "DiveFrame name",
      sourceSiteNames: {},
      gpsEntryLat: 3,
      gpsEntryLng: 4,
      userGpsLat: 5,
      userGpsLng: 6,
      exportGpsPreference: "user",
      buddy: null,
      notes: null,
    }],
    sourceRecords,
  );
  const preferredDoc = new DOMParser().parseFromString(preferred.xml, "application/xml");
  const preferredDive = preferredDoc.querySelector("dives > dive");
  const preferredSite = preferredDoc.querySelector(
    `divesites > site[uuid="${preferredDive.getAttribute("divesiteid")}"]`,
  );
  assert.equal(preferredSite.getAttribute("gps"), "5.000000 6.000000");

  const invalid = await addDiveFrameSitesToSubsurface(
    new File([xml], "source.ssrf", { type: "application/xml" }),
    [{
      id: "canonical",
      userSite: "DiveFrame name",
      sourceSiteNames: {},
      gpsEntryLat: 3,
      gpsEntryLng: 4,
      userGpsLat: 91,
      userGpsLng: 6,
      exportGpsPreference: "user",
      buddy: null,
      notes: null,
    }],
    sourceRecords,
  );
  const invalidDoc = new DOMParser().parseFromString(invalid.xml, "application/xml");
  const invalidDive = invalidDoc.querySelector("dives > dive");
  const invalidSite = invalidDoc.querySelector(
    `divesites > site[uuid="${invalidDive.getAttribute("divesiteid")}"]`,
  );
  assert.equal(invalidSite.getAttribute("gps"), "1.000000 2.000000");

  const legacy = await addDiveFrameSitesToSubsurface(
    new File([xml], "source.ssrf", { type: "application/xml" }),
    [{
      id: "canonical",
      userSite: "DiveFrame name",
      sourceSiteNames: {},
      gpsEntryLat: 3,
      gpsEntryLng: 4,
      userGpsLat: 5,
      userGpsLng: 6,
      exportGpsPreference: "user-if-missing",
      buddy: null,
      notes: null,
    }],
    sourceRecords,
  );
  const legacyDoc = new DOMParser().parseFromString(legacy.xml, "application/xml");
  const legacyDive = legacyDoc.querySelector("dives > dive");
  const legacySite = legacyDoc.querySelector(
    `divesites > site[uuid="${legacyDive.getAttribute("divesiteid")}"]`,
  );
  assert.equal(legacySite.getAttribute("gps"), "1.000000 2.000000");
});
