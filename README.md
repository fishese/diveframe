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
- Resolves Shearwater device names such as Peregrine and Perdix 2 from
  `StoredDiveComputer` while retaining the original serial number.
- Reads newer `GnssEntryLocation` and `GnssExitLocation` values that older
  Shearwater export views can omit.
- Responsive dive list and detail views.
- OpenStreetMap entry-location maps.
- A curated local dive-site catalog with proximity-ranked suggestions and an
  OpenStreetMap fallback.
- Separate Shearwater and Subsurface dive numbers on merged records.
- A filter for site names assigned in DiveFrame and a JSON export of manually
  typed site candidates.
- A settings page that can merge device-added sites into the bundled catalog
  and download a replacement `dive-sites.json` for repository updates. The
  pending additions can be reviewed, renamed, given aliases, or excluded first.
- A complete device-to-device backup file containing IndexedDB records, dive
  photos, reusable backgrounds, the overlay logo, and composer settings.
- Multiple photos per dive plus a device-local library of reusable diving
  backgrounds.
- A live image composer with five original layouts, high-resolution PNG/JPEG
  output, common aspect ratios, metric/imperial units, and English/Traditional
  Chinese overlays.
- A curated overlay-font menu with public Traditional Chinese/Latin webfonts:
  Noto Sans HK, Noto Sans TC, Noto Serif TC, and LXGW WenKai TC.
- Depth-profile charts from Subsurface samples, with optional sparse tank
  pressure and temperature telemetry, plus optional elapsed-time and depth axes
  that are enabled by default. The depth-area fill can be solid or fade to
  transparent above the profile. Missing fields are omitted rather than
  replaced with fabricated values.
- One device-local transparent PNG or SVG overlay logo configured in Settings,
  with per-dive visibility and placement controls in the composer.
- Installable web-app metadata for mobile and desktop browsers.

## Development

Use Node.js 22 or newer.

```sh
npm install
npm run dev
```

The deployed Worker is stateless. Dive and photo data stay in the browser;
server routes only proxy map lookups. Use **Settings â†’ Export app data** to
back up or transfer that local data.

For full depth-profile charts, re-import a Subsurface `.ssrf` after upgrading.
Shearwater Cloud exports provide summaries and tank start/end values, but the
sample stream in the tested export is stored in a proprietary blob that
DiveFrame does not currently decode.

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
