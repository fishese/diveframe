# DiveFrame

DiveFrame is a private web companion for Shearwater Cloud exports. It leaves
Bluetooth synchronization and primary backup with Shearwater, then provides a
more visual logbook for maps, photos, and shareable image overlays.

## Current workflow

1. Export a `.db` file from Shearwater Cloud Desktop.
2. Open DiveFrame on Android, iPhone, or Windows.
3. Choose **Import extract** and select the database.
4. Re-import newer extracts at any time. Stable Shearwater `DiveId` values update
   existing dives without detaching photos.
5. Import a Subsurface `.ssrf` export as well to merge GPS or other fields that
   are missing from the Shearwater extract.

The original files are parsed in the browser and are never modified. DiveFrame
stores normalized display fields, source mappings, site choices, and selected
photo blobs in IndexedDB on the current device.

## Features

- Reads `dive_details`, calculated summaries, manual sites, buddies, and notes.
- Reads newer `GnssEntryLocation` and `GnssExitLocation` values that older
  Shearwater export views can omit.
- Responsive dive list and detail views.
- OpenStreetMap entry-location maps.
- A curated local dive-site catalog with proximity-ranked suggestions and an
  OpenStreetMap fallback.
- Separate Shearwater and Subsurface dive numbers on merged records.
- A filter for site names assigned in DiveFrame and a JSON export of manually
  typed site candidates.
- Multiple photos per dive.
- Canvas-rendered portrait share cards with site, date, depth, duration, and
  buddy.
- Installable web-app metadata for mobile and desktop browsers.

## Development

Use Node.js 22 or newer.

```sh
npm install
npm run dev
```

The deployed Worker is stateless. Dive and photo data stay in the browser;
server routes only proxy map lookups.

Run the checks with:

```sh
npm run lint
npx tsc --noEmit --incremental false
npm test
```

To exercise the parser against a private local export without checking it into
source control:

```powershell
$env:SHEARWATER_DB_FIXTURE='D:\path\to\Shearwater Cloud.db'
node --test .\tests\import-shearwater.test.mjs
```
