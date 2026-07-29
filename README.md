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
stores normalized display fields, source mappings, site choices, and photo
blobs in IndexedDB on the current device.

See the [user guide](docs/USER-GUIDE.md) for supported files, local-storage
boundaries, available exports, and the workflow for manually copying DiveFrame
site corrections back to a source log.

## Features

- Reads `dive_details`, calculated summaries, manual sites, buddies, and notes.
- Reads open UDDF dive logs and FIT dive activities, including available
  profiles, temperatures, gases, tank pressures, GPS, and computer metadata.
- Resolves Shearwater device names such as Peregrine and Perdix 2 from
  `StoredDiveComputer` while retaining the original serial number.
- Reads newer `GnssEntryLocation` and `GnssExitLocation` values that older
  Shearwater export views can omit.
- Responsive dive list and detail views.
- Dive-list sorting by date, duration, or maximum depth in either direction.
- Compact dive summaries that show both maximum depth and dive duration.
- A compact six-stat logbook overview covering total dives, dives at named
  sites, unique imported locations, accumulated underwater time, average
  calculable SAC, and unique buddies.
- OpenStreetMap entry-location maps.
- Mutually exclusive Site Named, GPS Data, and Set in App filters with an
  explicit clear action.
- Documented `source:shearwater-only` and `source:subsurface-only` search
  operators for finding records that have not matched across those two logs.
- A single broader geocoding retry for named dives without GPS, so a failed
  site-level query can still resolve its city/region (for example,
  `Mikomotojima, Shizuoka, Japan` → `Shizuoka, Japan`).
- A curated local dive-site catalog with proximity-ranked suggestions and an
  OpenStreetMap fallback.
- Editable dive-site and broader location names, with autocomplete suggestions
  from the current local logbook.
- Separate source-specific dive numbers on merged records.
- A filter for site names assigned in DiveFrame and a JSON export of manually
  typed site candidates.
- A settings page that can merge device-added sites into the bundled catalog
  and download a replacement `dive-sites.json` for repository updates. The
  pending additions can be reviewed, renamed, given aliases, or excluded first.
- A complete device-to-device backup file containing IndexedDB records, dive
  photos, reusable backgrounds, the overlay logo, per-dive composer settings,
  named composer presets, and the app-language preference.
- Separate reset actions: erase all browser data, or clear only imported dives,
  source matching, and app-added site records while retaining photos,
  backgrounds, logo, composer settings, and app preferences.
- A pass-through Subsurface export tool that adds matched site names, buddy,
  and notes to a freshly supplied SSRF/XML copy without rebuilding or dropping
  the source log's profiles, events, cylinders, or other fields.
- Full interface localisation in English, Traditional Chinese (Hong Kong), and
  Japanese, with a separately configurable overlay language for exported images.
- Multiple photos per dive plus a device-local library of reusable diving
  backgrounds. Reusable backgrounds have editable names for easier selection;
  per-dive photos continue to use their filenames.
- A bundled Bubbles background lets a dive be composed before any personal
  photo is added. It can be removed for the current composer session.
- A compatible regional `dive-sites.json` can be loaded for the current tab.
  Its sites join nearby suggestions without permanently changing app data; a
  downloadable AI prompt helps users prepare catalogs for their own regions.
- Share-image entry points at both the top of the dive and the bottom of its
  photo gallery.
- A live image composer with five original layouts, including two purpose-built
  16:9 landscape designs, high-resolution PNG/JPEG
  output, common aspect ratios, metric/imperial units, and English, Traditional
  Chinese, or Japanese overlays. Its interactive crop mode supports drag-to-reposition,
  wheel or slider zoom, touch input, and reset. On mobile, the reduced preview
  stays pinned below the top bar while controls scroll.
- Named composer presets for reusing layout, visible fields, chart, logo,
  typography, colour, and output choices across dives without copying a
  dive-specific site name, category, selected photo, or crop.
- New composers default to social-media JPEG output. The last selected output
  size, format, and JPEG quality are reused on new dives, and exported files
  use the dive date/time in a Windows-safe filename.
- A curated overlay-font menu with public Traditional Chinese/Latin webfonts:
  Noto Sans TC, Inter, Outfit, Space Mono, and Huninn, plus Device Sans.
  One font-colour control applies consistently to all text content.
- Depth-profile charts from Subsurface samples, with optional sparse tank
  pressure and temperature telemetry, plus optional elapsed-time and depth axes
  that are enabled by default. The depth-area fill can be solid or fade to
  transparent above the profile. Missing fields are omitted rather than
  replaced with fabricated values.
- Compact depth charts on dive detail pages, with an optional tank-pressure
  line when pressure telemetry is available.
- Time-weighted average water temperature and conservative SAC estimates.
  SAC is shown only when duration, average depth, one valid pressure pair, and
  a cylinder volume are available. Standard aluminium and steel cylinder
  presets are available per dive; the device default starts at Aluminium 80
  (11.1 L). Unitless Shearwater air-integration values are normalized from PSI
  to bar before the calculation.
  The overview average excludes dives shorter than 20 minutes.
- One device-local transparent PNG or SVG overlay logo configured in Settings,
  with per-dive visibility, anchor, and horizontal/vertical fine-positioning
  controls in the composer.
- Installable web-app metadata for mobile and desktop browsers.

## Install the app

DiveFrame can be installed as a Progressive Web App (PWA) from **Settings →
Install DiveFrame**. On Android and desktop Chromium browsers, use the install
button when it appears. On iPhone or iPad, open DiveFrame in Safari, tap
**Share**, then **Add to Home Screen**.

The installed app uses the same IndexedDB data as the browser for the same web
address. Removing the app or clearing site data can remove the local logbook,
so export an app-data backup first.

The PWA is also a suitable base for a future Android wrapper, such as a Trusted
Web Activity or Capacitor package. No APK wrapper or app-store signing is
included yet.

### Stable dive identity

Canonical dive IDs are deterministic across devices. DiveFrame uses immutable
source identifiers in this priority order: Shearwater `DiveId`, Subsurface
`deviceid:diveid`, UDDF identity, then FIT identity. UDDF uses its dive element
ID when present; otherwise it derives a stable profile fingerprint. Garmin and
Suunto FIT imports use the device plus activity/file creation timestamp when
present, with the same profile-fingerprint fallback. File names and positions
inside an export are never used as identity. Date/time, computer serial, depth,
and duration matching links records when a second source is imported.
If that source has a higher-priority immutable ID, the dive and its attached
photos, site contribution, source mappings, and composer settings are re-keyed
together.

This intentionally replaces the earlier import-order-dependent IDs. Existing
test data is not migrated; use **Settings → Erase all data**, then import the
source logs again before creating a new transferable backup.

## Development

Use Node.js 22 or newer.

```sh
npm install
npm run dev
```

The deployed Worker is stateless. Dive and photo data stay in the browser;
server routes only proxy map lookups. Use **Settings → Export app data** to
back up or transfer that local data.

The normalized browser import is intentionally not a lossless representation
of every Subsurface XML field. To carry DiveFrame changes back, use
**Settings → Update a Subsurface export** and choose a fresh original
Subsurface `.ssrf`/XML file. DiveFrame edits that copy narrowly and downloads a
new file; it never overwrites the selected source file.

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

## License

DiveFrame is free software licensed under the
[GNU General Public License v3.0 or later](LICENSE). Forks and modifications are
welcome; redistributed versions must remain open source under the same license.
