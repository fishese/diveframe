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

The original database is parsed in the browser and is never modified. DiveFrame
stores normalized display fields in its private database and stores selected
photos separately.

## Features

- Reads `dive_details`, calculated summaries, manual sites, buddies, and notes.
- Reads newer `GnssEntryLocation` and `GnssExitLocation` values that older
  Shearwater export views can omit.
- Responsive dive list and detail views.
- OpenStreetMap entry-location maps.
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

The app uses Cloudflare D1 for structured records and R2 for uploaded photos.
Local development uses the bindings configured by the starter runtime.

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
