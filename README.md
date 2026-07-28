# DiveFrame

DiveFrame is a device-local dive log companion. Your dive-computer apps remain
the source and backup; DiveFrame brings those records together with Subsurface
data, then adds maps, photos, site details, and shareable image overlays.

## Current workflow

1. Export a supported log: Shearwater Cloud Desktop `.db`, Subsurface
   `.ssrf`/XML, Oceanic+ UDDF, or a dive `.fit` from Garmin Dive or the current
   Suunto app.
2. Open DiveFrame on Android, iPhone, or Windows.
3. Choose **Import log** and select one or more files.
4. Re-import newer exports at any time. Stable source identities update
   existing dives without detaching photos.
5. Import other supported sources as well. DiveFrame conservatively matches
   the same dive across sources, then retains the richer profile, GPS, site,
   notes, and source-specific dive numbers.

The original files are parsed in the browser and are never modified. DiveFrame
stores normalized display fields, source mappings, site choices, and selected
photo blobs in IndexedDB on the current device.

## Features

- Reads `dive_details`, calculated summaries, manual sites, buddies, and notes.
- Reads open UDDF dive logs and FIT dive activities, including available
  profiles, temperatures, gases, tank pressures, GPS, and computer metadata.
- Resolves Shearwater device names such as Peregrine and Perdix 2 from
  `StoredDiveComputer` while retaining the original serial number.
- Reads newer `GnssEntryLocation` and `GnssExitLocation` values that older
  Shearwater export views can omit.
- Responsive dive list and detail views.
- OpenStreetMap entry-location maps.
- A curated local dive-site catalog with proximity-ranked suggestions and an
  OpenStreetMap fallback.
- Separate source-specific dive numbers on merged records.
- A filter for site names assigned in DiveFrame and a JSON export of manually
  typed site candidates.
- A settings page that can merge device-added sites into the bundled catalog
  and download a replacement `dive-sites.json` for repository updates. The
  pending additions can be reviewed, renamed, given aliases, or excluded first.
- A complete device-to-device backup file containing IndexedDB records, dive
  photos, reusable backgrounds, the overlay logo, composer settings, and the
  app-language preference.
- Full interface localisation in English and Traditional Chinese (Hong Kong),
  with a separately configurable overlay language for exported images.
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

For full depth-profile charts, import Subsurface, UDDF, or FIT data when
available. Shearwater Cloud exports provide summaries and tank start/end
values, but the sample stream in the tested export is stored in a proprietary
blob that DiveFrame does not currently decode.

### Import format policy

DiveFrame implements formats whose structure is public rather than guessing at
proprietary files:

- Oceanic+ documents its downloadable dives as
  [UDDF](https://www.oceanicworldwide.com/blog/faq/what-format-will-my-dives-be-downloaded-to/);
  DiveFrame follows the open [UDDF 3.2.3 specification](https://www.streit.cc/resources/UDDF/v3.2.3/en/).
- Garmin documents FIT export from
  [Garmin Dive](https://support.garmin.com/et-EE/?faq=NxZWyZYGqL17VNBMKDUjb5),
  and Suunto documents FIT export for
  [dives from the Suunto app](https://www.suunto.com/en-im/Support/faq-articles/suunto-app/what-type-of-files-can-i-export-from-the-suunto-app/).
  DiveFrame uses the public [Garmin FIT protocol](https://developer.garmin.com/fit/protocol/)
  through the MIT-licensed `fit-file-parser` package.
- Older Suunto DM5 SDE/SML files and SCUBAPRO TravelTRAK `.asd` files are not
  parsed because their current official documentation does not publish enough
  of their structure to implement a reliable importer.

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
