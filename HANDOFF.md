# DiveFrame handoff

## Product summary

DiveFrame is a private, mobile-friendly dive log viewer for Shearwater,
Subsurface, UDDF, and FIT exports. It merges matching records from those
sources, displays
maps and nearby dive-site suggestions, stores dive photos and reusable
backgrounds, and creates customizable high-resolution share images.

The current product is deliberately device-local:

- Dive records and import-source mappings are stored in IndexedDB.
- Original dive-photo and reusable-background blobs are stored in IndexedDB.
- Nothing in an imported database or SSRF file is persisted on the server.
- Map search and nearby-site endpoints are stateless network helpers.
- There is no cross-device synchronization yet.

Deployment is managed by the repository's Cloudflare Worker integration.

## Repository map

- `app/DiveFrameApp.tsx` — main logbook UI, imports, maps, gallery, and entry
  point to the composer.
- `app/compose/ComposerApp.tsx` — live preview and composer controls.
- `app/settings/SettingsApp.tsx` — device-local settings and catalog maintenance
  tools, including the reusable background library.
- `app/about/AboutApp.tsx` — bilingual user-facing explanation of imports,
  exports, local persistence, source-log reconciliation, and licensing.
- `lib/parsers/` — separate Shearwater, Subsurface, UDDF, and FIT importers.
- `lib/dive-model.ts` and `lib/normalize-dive.ts` — normalized internal model.
- `lib/dive-matching.ts` — cross-source record matching.
- `lib/chart-renderer.ts` — profile downsampling and vector-like canvas paths.
- `lib/image-composer.ts`, `lib/templates.ts`, and `lib/exporter.ts` — data-driven
  layouts, rendering, and PNG/JPEG export.
- `lib/app-i18n.ts`, `lib/i18n.ts`, and `lib/unit-conversion.ts` — application
  translations, overlay translations, and units.
- `lib/composer-fonts.ts` — curated bilingual overlay fonts and export-time
  font loading.
- `lib/indexed-db.ts` — device-local persistence and merge orchestration.
- `app/api/geocode/route.ts` — stateless OpenStreetMap/Nominatim lookup proxy.
- `app/api/nearby-sites/route.ts` — local catalog and OpenStreetMap fallback.
- `data/dive-sites.json` — curated source-controlled dive-site catalog.
- `app/globals.css` — responsive application styling.
- `public/manifest.webmanifest` and `public/sw.js` — installable-web-app shell.
- `tests/` — product contract and optional real Shearwater fixture test.
- `docs/USER-GUIDE.md` — supported-format and device-local workflow guide.
- `LICENSE` — project notice for `GPL-3.0-or-later`.
- `.openai/hosting.json` — current private Sites project reference; D1 and R2
  are intentionally disabled.

The old D1/R2 persistence routes and migrations were removed in commit
`67ecfec`. Earlier commits retain that implementation if it is ever needed.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

Run:

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server.

Validation:

```bash
npm run lint
npm test
```

To run the real Shearwater database test:

```powershell
$env:SHEARWATER_DB_FIXTURE="D:\path\to\Shearwater export.db"
node --test tests/import-shearwater.test.mjs
```

Personal `.db`, `.sqlite`, and `.ssrf` exports are ignored by Git. Do not add
real dive exports, photos, or generated share cards to the repository.

## IndexedDB design

Database: `diveframe-local`

Version: `6`

Object stores:

| Store | Key | Purpose |
| --- | --- | --- |
| `dives` | `id` | Canonical merged dive records and user-selected site names |
| `sourceRecords` | `key` | Maps a source record to its canonical dive ID |
| `attachments` | `id` | Photo metadata and the original image `Blob` |
| `siteContributions` | `id` | Sites manually typed for a dive and available for JSON export |
| `composerSettings` | `id` | Per-dive composer state and selected image |
| `backgrounds` | `id` | Reusable generic diving background image blobs |
| `brandingAssets` | `id` | Device-local transparent PNG/SVG overlay logo |
| `appPreferences` | `id` | Device-local interface language and future global preferences |

`attachments` and `sourceRecords` each have a `diveId` index.

The app requests persistent browser storage when available. This reduces
eviction risk but does not replace a backup.

Settings can export a versioned `diveframe-local-backup` JSON document covering
all seven stores, including base64-encoded photo, reusable-background, and logo
blobs. Import is additive by primary key: backup records replace matching local
records while destination-only records remain. The file is not encrypted and
the UI warns the user to keep it private.

### Import matching

Source identity is stored separately from the canonical dive ID:

- Shearwater source ID: Shearwater `DiveId`
- Subsurface source ID: `deviceid:diveid`
- UDDF source ID: the dive element ID, with a stable profile fallback
- FIT source ID: manufacturer/device/file-or-dive identity

Matching order:

1. Reuse an existing source mapping.
2. Reuse the canonical Shearwater ID when present.
3. Match records by start time, normalized computer serial, and maximum depth.
4. For FIT/UDDF timezone mismatches only, try an unambiguous same-day
   depth-and-duration fingerprint.
5. Create a new canonical record when no safe match exists.

The start-time window is five minutes. Same-serial matches tolerate up to
three metres of maximum-depth variance. Matches without a shared serial use a
stricter 90-second and one-metre threshold.

The timezone fallback requires maximum depth within 0.75 m and duration within
90 seconds. It refuses the match when the two best candidates are too close,
preferring a visible duplicate over silently combining different dives.

Merge rules:

- Non-empty Shearwater computer fields take precedence.
- Shearwater `StoredDiveComputer.JsonData` supplies `DeviceName`; its decimal
  stored serial is normalized to the eight-character hexadecimal serial used
  by `dive_details`. The original serial remains on the canonical dive record.
- Existing location, site, buddy, notes, and GPS values are never erased by an
  empty re-import.
- Subsurface, UDDF, and FIT can fill GPS and other fields missing from another
  source. The richest available sample stream is retained instead of whichever
  file happened to be imported last.
- Imported samples normalize depth to metres, temperature to Celsius, pressure
  to bar, and elapsed time to seconds.
- User-selected site names and photos survive empty re-import fields.
- A non-empty site from a later source import clears the app-level site
  override, so the “Set in DiveFrame” filter tracks records still needing
  correction in the source log.
- Each canonical dive stores separate source-specific dive numbers captured
  during import. Existing browser data needs one re-import to
  populate numbers that were not retained by the version-1 schema.

### Subsurface pass-through export

The normalized model is deliberately not treated as a lossless Subsurface
round-trip schema. Settings asks the user for a fresh `.ssrf`/XML source file,
matches its dives through stored `deviceid:diveid` source records, and mutates
only:

- dive-site definitions and the matching dive's `divesiteid`
- direct `buddy` elements
- direct `notes` elements

The updated file is downloaded under a new name; the selected original is not
overwritten. All unrecognized XML remains in the supplied document. A
DiveFrame site override takes priority over the matched Shearwater site name.

Buddy and notes can be edited on the dive detail page. They use the existing
nullable fields on the `dives` store, so this feature requires no IndexedDB
version or schema migration.

Named dives without GPS use one rate-limited broader Nominatim retry by
dropping the first comma-separated site component; maps from this path remain
labelled approximate.

## Dive-site catalog and contribution log

`data/dive-sites.json` is the primary nearby-site source. Active entries within
30 km are returned nearest-first; OpenStreetMap is queried only when the local
catalog has no nearby match.

Catalog entries deliberately do not contain or display curator/reliability
notes.

Selecting a catalog or map suggestion stores the assignment on the local dive.
Typing a new name additionally creates or updates a `siteContributions` record
using the dive's GPS position. The settings page can export these records as
`diveframe-added-sites.json`, or merge them into the built-in (or a user-chosen
newer) catalog and download a replacement `dive-sites.json`. Same-name sites
within 250 metres are treated as duplicates. The deployed browser cannot
directly commit changes to the repository.

The supplied full test data produced 168 cross-source matches and 19
Subsurface-only records. Perdix dives 17, 18, and 19 received their Subsurface
GPS coordinates without becoming duplicates.

## Browser-storage boundaries

IndexedDB is scoped to the exact web origin and browser profile:

- Production and `localhost` have separate data.
- Different browsers on one device have separate data.
- A future GitHub or custom-domain URL starts with an empty database.
- Clearing site data removes the log and photos.
- Private/incognito storage may disappear when the session closes.
- Large photo collections remain subject to device storage limits.

Changing domains therefore requires an explicit export/import or sync feature;
copying the repository does not copy user data.

## Logbook overview statistics

The overview derives six statistics from canonical local dives:

- total dive count
- dives with either an imported or DiveFrame-assigned site name
- case-insensitive unique non-empty `location` strings from source logs
- summed positive dive durations, displayed in hours, days, or 30.4375-day
  months according to magnitude
- arithmetic mean of per-dive SAC values that meet the conservative calculation
  requirements
- unique comma-separated buddy names

The SAC average respects per-dive cylinder choices and otherwise uses the
device default. Dives with insufficient data are excluded rather than counted
as zero.

## Image composer

The composer route is `/compose?dive=<canonical-id>&photo=<attachment-id>`.
Each photo tile links to it. It also lists reusable backgrounds from Settings.

Five original data-driven templates are currently exposed: Bottom Profile,
Right Information Panel, Minimal, Poster, and Full-width Graph. They share one
high-resolution renderer rather than duplicating fixed component coordinates.
The preview is rendered at a smaller working size; export rerenders the same
geometry at social, 3000-pixel, or source-photo-area dimensions.

Overlay fonts are loaded from the public Google Fonts stylesheet imported by
`app/globals.css`. The renderer waits for all requested weights before preview
or export and falls back to platform Traditional Chinese fonts when offline.

Site display priority is user override, linked source name, app catalog/OSM
assignment, formatted GPS coordinates, then omission. Fields with no source
data are disabled in the controls and are never shown as zero.

The Subsurface parser retains depth samples and sparse temperature and
`pressure0`, `pressure1`, etc. telemetry. The renderer labels pressure as
“Tank pressure.” Gas consumed, SAC, and RMV are deliberately not calculated:
cylinder size/volume is not yet normalized reliably. Shearwater-only records
can render summary statistics but, for the tested export, cannot render the
true profile because its sample stream is proprietary. A one-time re-import of
the Subsurface log populates samples for browser records created before schema
version 4.

Chart depth and elapsed-time axis labels are enabled by default and can be
hidden per dive. The depth fill supports solid and upward transparent-fade
modes. One reusable transparent PNG or SVG logo is managed in Settings; the
composer only controls its visibility and preset position. Template defaults
reserve separate title, date, chart, statistics, and branding zones; the
composer migrates the earlier overlapping Minimal, Poster, and Full-width Graph
defaults when it loads them.

The dive detail page reuses `renderDiveChart` on a responsive canvas and only
draws the currently selected record. Its pressure line is opt-in and appears
only when sample telemetry exists. `lib/gas-calculations.ts` owns cylinder
presets, time-weighted sample temperature, pressure-pair validation, and the
surface-equivalent SAC calculation. SAC is withheld unless duration, average
depth, exactly one usable pressure pair, and cylinder volume are available.
The default cylinder preference is stored on the existing `appPreferences`
record; per-dive cylinder and manual pressure values use optional properties on
the existing dive record, so no IndexedDB migration is required.

## Current hosting

The project uses the bundled Vinext/Cloudflare-compatible build. It is deployed
to both the private Sites project referenced in `.openai/hosting.json` and a
user-managed Cloudflare Worker connected to GitHub.

The data layer no longer needs D1 or R2. Two stateless server routes remain for
OpenStreetMap lookups. If the project moves to Cloudflare Workers, those routes
can be deployed unchanged with the rest of the app.

For a fully static GitHub Pages deployment, move the geocoding and nearby-site
requests into the browser and configure a static Next/Vite export. Verify the
public OpenStreetMap services' browser CORS and usage-policy requirements
before doing so.

## Recommended next milestone: backup hardening

The first portable backup/import implementation is now complete. A future
iteration should add encryption, checksums, streaming ZIP output for very large
photo libraries, and an import preview/conflict UI.

The current JSON format deliberately favors a simple first transfer workflow.
For large libraries, migrate it to a streaming archive such as:

```text
diveframe-backup.zip
├── manifest.json
├── dives.json
├── source-records.json
└── photos/
    └── <attachment-id>.<extension>
```

Recommended hardening:

1. Retain coverage of all IndexedDB stores and image blobs.
2. Include a format version, creation timestamp, and checksums.
3. Encrypt the archive client-side with a user passphrase.
4. On import, merge dives using the existing source mapping and matching rules.
5. Deduplicate photos by content hash rather than filename.
6. Preview additions and conflicts before writing anything.

Once backup/restore is reliable, synchronization can use the same manifest and
merge semantics over a user-selected provider such as a local folder, WebDAV,
Google Drive, iCloud Drive, or a small private API.

## Known follow-ups

- Add streaming, encrypted backup export before photo libraries become very large.
- Add dive-photo deletion, captions, and storage-usage reporting.
- Add draggable custom block positions (preset positions are implemented).
- Add named composer presets that can be reused across dives.
- Translate template descriptions and transient status/error messages; overlay
  labels and composer controls are already available in Traditional Chinese.
- Show whether persistent browser storage was granted.
- Add an IndexedDB integration test using a browser test runner.
- Consider image downscaling or optional originals for large phone photos.
- Add a catalog-maintenance script that validates and imports reviewed entries
  from `diveframe-added-sites.json`.

## Recovery and rollback

The previous server-backed release is commit `23dff96`. The first
device-local release is commit `67ecfec`.

The former D1 database and R2 bucket were not deleted during the migration.
Rolling the application back can restore access to their existing records.
