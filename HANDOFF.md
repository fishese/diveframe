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

The app is explicitly marked beta in a global trilingual notice. Schema
upgrades after IndexedDB v8 are additive; backup tools remain the recovery
path if a future beta change does require a reset.

The current install surfaces are:

- the installable PWA at `https://divelog.fishese.cc`; and
- a Capacitor **Android debug APK** that ships the same web UI plus classic
  Shearwater BLE import, native file export, and private app storage.

Both surfaces share the same normalized dive model and IndexedDB stores. The
APK uses its own WebView origin (`https://localhost`), so PWA and APK data are
separate partitions — transfer with an app-data backup. iOS packaging and
store distribution are not started yet.

## Current status (2026-08-01)

Shipped on `main` (pushed):

- IndexedDB **v9** additive stores: trips, user GPS overlays, BLE raw /
  checkpoints (from v8), and persistent **supplementary** dive-site catalog
- Trip list blocks, select mode, user GPS + JPEG EXIF, catalog alias display,
  date/computer/GPS list filters
- Android product BLE import with incremental persist; Shearwater computer GPS
  via `DC_SAMPLE_LOCATION` sample callbacks
- Native Downloads export plugin; Settings **What's new** feed with HTTPS CTAs
- Official dive-site catalog remains build-bundled only (web deploy / new APK)

Open follow-ups:

- Deploy production CORS for `/api/geocode`, `/api/nearby-sites`, and
  `/api/whats-new` so Capacitor `https://localhost` can use the hosted worker
  without a LAN API override
- BLE hardening / failure matrix / LGPL release checklist
- About copy: classic Shearwater BLE only (not Perdix 3)
- Pre-wrapper Priority C quality items in `docs/PRODUCT-SPEC.md`

Session detail: `docs/2026-08-01-ble-product-import-session.md`.

Deployment is managed by the repository's Cloudflare Worker integration.

## Repository map

- `app/DiveFrameApp.tsx` — main logbook UI, imports, maps, gallery, and entry
  point to the composer.
- `app/compose/ComposerApp.tsx` — live preview and composer controls.
- `app/settings/SettingsApp.tsx` — device-local settings and catalog maintenance
  tools, including the reusable background library.
- `app/about/AboutApp.tsx` — trilingual user-facing explanation of imports,
  exports, local persistence, source-log reconciliation, and licensing.
- `lib/parsers/` — separate Shearwater, Subsurface, UDDF, and FIT importers.
- `lib/dive-model.ts` and `lib/normalize-dive.ts` — normalized internal model.
- `lib/dive-matching.ts` — cross-source record matching.
- `lib/dive-identity.ts` — deterministic canonical IDs and source precedence.
- `lib/chart-renderer.ts` — profile downsampling and vector-like canvas paths.
- `lib/image-composer.ts`, `lib/templates.ts`, and `lib/exporter.ts` — data-driven
  layouts, rendering, and PNG/JPEG export.
- `lib/app-i18n.ts`, `lib/i18n.ts`, and `lib/unit-conversion.ts` — application
  translations, overlay translations, and units.
- `lib/composer-fonts.ts` — curated multilingual overlay fonts and export-time
  font loading.
- `lib/dive-site-catalog.ts` — validation, combine bundled + supplementary
  catalogs, proximity ranking, and one-time session→IDB migration helper.
- `lib/whats-new.ts` — What's new document model, link sanitization, and body
  rendering helpers.
- `lib/indexed-db.ts` — device-local persistence and merge orchestration
  (schema v9).
- `app/api/geocode/route.ts` — stateless OpenStreetMap/Nominatim lookup proxy.
- `app/api/nearby-sites/route.ts` — local catalog and OpenStreetMap fallback.
- `app/api/whats-new/route.ts` — CORS-aware What's new feed for web and APK.
- `data/dive-sites.json` — curated source-controlled dive-site catalog.
- `public/whats-new.json` — seed What's new document served by the API.
- `android/` — Capacitor shell, JNI libdivecomputer bridge, BLE plugin, file
  export plugin.
- `scripts/archive/shearwater-gps-backfill/` — offline tooling to recover
  computer GPS from raw BLE bytes / backups if needed again.
- `app/globals.css` — responsive application styling.
- `app/PwaInstall.tsx` — global service-worker registration and the
  browser/iOS-aware install control shown in Settings.
- `app/BetaNotice.tsx` — global trilingual beta notice and Settings backup link.
- `public/manifest.webmanifest`, `public/sw.js`, and `public/icons/` —
  installable-web-app metadata, cached app shell, and header-mark app icons.
- `tests/` — product contract, deterministic identity, catalog, composer, gas,
  Subsurface pass-through, native bridge, What's new, and optional Shearwater
  fixture tests.
- `docs/USER-GUIDE.md` — supported-format and device-local workflow guide.
- `docs/PRODUCT-SPEC.md` — authoritative current-state product specification,
  readiness gate for store packaging / BLE hardening, planned extension
  guardrails, and reviewer questions.
- `LICENSE` — project notice for `GPL-3.0-or-later`.
- `ASSET-LICENSES.md` — separate copyright boundary for the non-GPL Bubbles
  sample background.
- `.openai/hosting.json` — retained project metadata; D1 and R2 are
  intentionally disabled. Production is deployed by Cloudflare Workers Builds
  from GitHub.

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
$env:BLE_CAPTURE_FIXTURE="D:\Projects\Dive log\web\fixtures\ble\perdix2-….json"
node --test tests/import-shearwater.test.mjs
```

Personal `.db`, `.sqlite`, and `.ssrf` exports are ignored by Git. Do not add
real dive exports, photos, or generated share cards to the repository.

## IndexedDB design

Database: `diveframe-local`

Version: `9` (additive from 8: creates `supplementaryCatalog` and preference
fields without deleting existing stores or records). Opening an origin still on
schema **&lt; 8** still performs the destructive v8 wipe once, then applies v9.

Object stores (see also `lib/store-manifest.ts`):

| Store | Key | Purpose |
| --- | --- | --- |
| `dives` | `id` | Canonical merged dive records, site overlays, user GPS, `tripId` |
| `sourceRecords` | `key` | Maps a source record to its canonical dive ID |
| `attachments` | `id` | Photo metadata and the original image `Blob` (optional `role`) |
| `siteContributions` | `id` | Sites manually typed for a dive and available for JSON export |
| `composerSettings` | `id` | Per-dive composer state and selected image |
| `composerPresets` | `id` | Named reusable composer layout and styling choices |
| `backgrounds` | `id` | Reusable generic diving background image blobs |
| `brandingAssets` | `id` | Device-local transparent PNG/SVG overlay logo |
| `appPreferences` | `id` | Language, What's new cache/seen markers, and other prefs |
| `rawDiveRecords` | `id` | BLE/libdivecomputer raw capture blobs + parser provenance |
| `deviceCheckpoints` | `id` | Per-computer download fingerprints (descriptor+serial) |
| `trips` | `id` | Trip labels referenced by `dives.tripId` |
| `supplementaryCatalog` | fixed | At most one user-loaded regional dive-site catalog |

The official dive-site catalog ships in `data/dive-sites.json` with each web
deploy / APK build. A user-loaded **supplementary** catalog is stored in
IndexedDB, combined additively with the bundled catalog for nearby suggestions,
included in app-data backups, and cleared by erase-all (not by dive-only erase).
A one-time helper migrates any legacy `sessionStorage` catalog into IndexedDB.
`lib/dive-site-catalog.ts` validates catalogs and ranks sites within 30 km.
The downloadable prompt at `public/examples/dive-site-catalog-ai-prompt.md`
helps users create regional catalogs for human review.

`attachments`, `sourceRecords`, and `rawDiveRecords` each have a `diveId`
index. `dives` has a `tripId` index.

The app requests persistent browser storage when available. The install card
reports persistent, best-effort, or unsupported status and shows estimated
usage/quota when available. This reduces eviction risk but does not replace a
backup.

Settings can export a versioned `diveframe-local-backup` JSON document covering
all stores (backup format v3), including named composer presets, BLE raw
records/checkpoints, trips, and base64-encoded photo, reusable-background,
logo, and raw-byte blobs. Export may optionally wrap the complete checksummed
document in a `diveframe-encrypted-backup` envelope using PBKDF2-SHA-256 and
AES-256-GCM. The password is requested during import and never stored. Older
backup versions (1–2) still import with empty BLE/trips stores.

Import validates and previews the backup before writing. **Merge** replaces
matching complete records while retaining destination-only records; separately
added photos usually have different random IDs and both survive. **Replace**
atomically clears all covered stores before restoring the backup. An exact
matching photo ID is replaced by the backup copy in either mode.

The danger zone exposes three deletion scopes. `clearLocalDivePhotos()` removes
per-dive attachments while keeping dives and reusable assets.
`clearLocalDiveData()` clears dive-domain stores from `lib/store-manifest.ts`
(`dives`, `sourceRecords`, `siteContributions`, `rawDiveRecords`,
`deviceCheckpoints`, and `trips`), retaining attachments, composer settings,
named composer presets, backgrounds, branding, and app preferences. Retained
per-dive attachments/settings reconnect after the same source logs recreate
their deterministic canonical IDs. `clearAllLocalData()` clears every store in
the manifest. The Settings action also clears the supplementary catalog;
service-worker application caches are intentionally kept.

On Android, the install card is replaced by a storage-only card that describes
private app data (not Chromium site storage). The WebView does not grant
`navigator.storage.persist()`, so the app does not ask for it there.

On mobile, an open dive shows a compact home control in the global top bar.
The composer preview pane becomes a short sticky panel below its top bar so
the same live canvas remains visible while its controls scroll.

### Import matching

Source identity is stored separately from the canonical dive ID:

- Shearwater source ID: Shearwater `DiveId`
- Subsurface source ID: `deviceid:diveid`
- UDDF source ID: the dive element ID, with a stable profile fallback
- FIT source ID: manufacturer/device/file-or-dive identity

Matching order:

1. Reuse an existing source mapping.
2. Match records by start time, normalized computer serial, and maximum depth.
3. For FIT/UDDF timezone mismatches only, try an unambiguous same-day
   depth-and-duration fingerprint.
4. Create a new canonical record when no safe match exists.

Canonical IDs use the immutable source ID with deterministic precedence:
Shearwater, Subsurface, UDDF, then FIT. When a higher-priority source is
matched later, the dive is re-keyed along with attachment `diveId` values, site
contributions, composer settings, and all source mappings. This makes final IDs
independent of source import order and consistent across devices that import
the same logs. Editable fields are deliberately excluded from identity.

UDDF prefers the dive element `id`; its fallback no longer uses the dive’s
array index. FIT prefers manufacturer/device plus activity or file-creation
time; its fallback no longer uses the uploaded filename. Both portable-format
fallbacks use start time, normalized serial, depth, duration, and five
representative profile points.

There is no migration for the older import-order-dependent IDs. During this
pre-release period, clear local data and re-import source logs before making a
new portable backup.

The start-time window is five minutes. Same-serial matches tolerate up to
three metres of maximum-depth variance. Matches without a shared serial use a
stricter 90-second and one-metre threshold.

The timezone fallback requires maximum depth within 0.75 m and duration within
90 seconds. It refuses the match when the two best candidates are too close,
preferring a visible duplicate over silently combining different dives.
Settings also provides manual selection of any two dives, allowing a user to
merge a UTC/local-time pair that the conservative fallback rejected.

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
  override, so the “Set in App” filter tracks records still needing
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
Typing a new name for a GPS-backed dive additionally creates or updates a
`siteContributions` record using the dive's GPS position. A manual site without
coordinates remains a valid local site override but is not offered for catalog
merge. The settings page can export coordinate-backed records as
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
as zero. Shearwater Cloud air-integration values above 500 are treated as
unitless PSI and the entire start/end pair is normalized to bar. Hydration also
repairs already stored pre-fix values, so users do not have to clear IndexedDB.
The overview additionally excludes dives shorter than 1,200 seconds; per-dive
SAC display remains available for those dives.

The logbook search parser recognizes `source:shearwater-only` and
`source:subsurface-only`, removes the operator from the free-text query, and
filters on the canonical record's `sources` array. The About page documents
both operators without adding more filter buttons.

Each compact dive-list row shows both maximum depth and formatted duration, so
duration sorting remains visually verifiable without opening the dive.

Dive details can persist an edited broad `location` directly on the canonical
record and a specific site through the existing `userSite` override path.
HTML datalists offer unique names already present in local dives. GPS records
retain the existing catalog/OSM nearby-site picker; manually entered non-GPS
locations feed the existing geocoder/map flow.

## Image composer

The composer route is `/compose?dive=<canonical-id>&photo=<attachment-id>`.
Each photo tile links to it. It also lists reusable backgrounds from Settings.
Reusable backgrounds have an optional `displayName` stored with their IndexedDB
record and included automatically in app backup/restore; the composer falls
back to the original filename for older records. Per-dive photos are unchanged.
The sticky composer top bar contains the return-to-dives shortcut, Settings,
and Export; the controls column begins directly with the photo selector.

Named composer presets live in the `composerPresets` store. Preset IDs are
derived from normalized names, so restoring the same named preset replaces it
instead of creating a duplicate. Presets retain reusable layout, visible-field,
chart, logo, appearance, and output choices. Applying one deliberately leaves
the current dive ID, site override, category, selected photo, crop offsets,
zoom, and rotation untouched. Presets are included in app backup/restore; older
version-1 backups without the optional array still import as an empty preset
collection.

The collapsed Personal presets section sits directly below Templates. A bundled
`public/backgrounds/bubbles-bg.jpg` choice is appended to the photo selector,
so it becomes the automatic image only when no dive photo or saved reusable
background is available. Removing it affects only the current composer session.
The image is excluded from the GPL software license; redistributors must follow
`ASSET-LICENSES.md` and remove, replace, or obtain permission for it.

Fresh dives default to social-media JPEG output. Output size, format, and JPEG
quality are also stored in `appPreferences` and reused when another dive has no
saved composer settings. Export filenames use the dive start time in
`diveframe-YYYYMMDD HH-MM.jpg` form; the hyphen keeps the filename valid on
Windows.

Five original data-driven templates are currently exposed: Bottom Profile,
Right Information Panel, Full-width Graph, Landscape Dashboard, and Cinematic
Split. The latter two default to 16:9 and use genuinely horizontal
chart/statistics arrangements. They share one high-resolution renderer rather
than duplicating fixed component coordinates.
The preview is rendered at a smaller working size; export rerenders the same
geometry at social, 3000-pixel, or source-photo-area dimensions.

Crop mode is transient UI over the existing persisted photo-fit, zoom, and
offset settings. Pointer dragging updates normalized offsets and wheel input
updates zoom; touch dragging is enabled with pointer capture. The
rule-of-thirds guide is drawn after the preview composition only, so export
never includes it. Bottom Profile uses a compact lower-third chart while
Full-width Graph begins its panel higher and uses a larger template-default
chart height.

Logo placement combines the existing data-driven anchor with normalized
`logoOffsetX` and `logoOffsetY` values. The renderer applies each offset as a
fraction of canvas size, then clamps the logo within the canvas. Defaults are
zero, so older saved composer settings retain their previous appearance.

Overlay fonts are loaded from the public Google Fonts stylesheet imported by
`app/globals.css`: Noto Sans TC, Inter, Outfit, Space Mono, and Huninn. Device
Sans remains available without a download. The renderer waits for all requested
weights before preview or export and falls back to platform Traditional Chinese
fonts when offline. A single saved font-colour setting is used for all textual
overlay content, including category, statistics, legends, and chart axes.

Site display priority is user override, linked source name, app catalog/OSM
assignment, formatted GPS coordinates, then omission. Fields with no source
data are disabled in the controls and are never shown as zero.

The Subsurface parser retains depth samples and sparse temperature and
`pressure0`, `pressure1`, etc. telemetry. The renderer labels pressure as
“Tank pressure.” DiveFrame calculates SAC only when duration, average depth,
one complete pressure pair, and cylinder volume are available. Shearwater-only
records can render summary statistics but, for the tested export, cannot
render the true profile because its sample stream is proprietary. A one-time
re-import of the Subsurface log populates samples for browser records created
before schema version 4.

Chart depth and elapsed-time axis labels are enabled by default and can be
hidden per dive. The depth fill supports solid and upward transparent-fade
modes. One reusable transparent PNG or SVG logo is managed in Settings; the
composer controls its visibility, preset anchor, and horizontal/vertical
offsets. Template defaults reserve separate title, date, chart, statistics,
and branding zones. Removed Minimal and Poster settings migrate to Bottom
Profile, while the earlier Full-width Graph overlap repair remains in place.
Composer control groups are collapsible so the full control set remains
available without requiring one continuously long sidebar.

The chart-height value is measured against the full canvas. Lower information
panels now expand upward when a taller chart is requested instead of silently
capping the chart at the old fixed panel height.

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

The project uses the bundled Vinext/Cloudflare-compatible build. Production is
the user-managed Cloudflare Worker connected to the GitHub `main` branch. The
canonical user-facing origin is `https://divelog.fishese.cc`; internal
navigation and static assets should remain relative so alternate preview and
wrapper origins continue to work.

The data layer no longer needs D1 or R2. Two stateless server routes remain for
OpenStreetMap lookups. If the project moves to Cloudflare Workers, those routes
can be deployed unchanged with the rest of the app.

For a fully static GitHub Pages deployment, move the geocoding and nearby-site
requests into the browser and configure a static Next/Vite export. Verify the
public OpenStreetMap services' browser CORS and usage-policy requirements
before doing so.

## Recommended next milestone: hardening after the debug APK

`docs/PRODUCT-SPEC.md` is the canonical review document. A Capacitor Android
debug APK already ships the shared UI and classic Shearwater BLE import.
Remaining Priority A/C items and production CORS for Capacitor API calls are
the recommended gate before store packaging or treating BLE as fully hardened.

Backup hardening remains the highest-priority part of that gate.

The portable backup/import implementation includes optional password
encryption, checksums, explicit merge/replace choices, and an import preview.
The JSON format remains appropriate while DiveFrame is used with small,
purpose-specific photo sets.

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

If real-world libraries eventually outgrow the JSON format, possible hardening
for a later archive revision includes:

1. Retain coverage of all IndexedDB stores and image blobs.
2. Include a format version, creation timestamp, and checksums.
3. Preserve the current optional client-side password encryption.
4. On import, merge dives using the existing source mapping and matching rules.
5. Deduplicate photos by content hash rather than filename.
6. Preview additions and conflicts before writing anything.

Future synchronization should reuse the same validated records and merge
semantics. Google Drive may be an optional app-only transport; optional
DiveFrame accounts may later add hosted record/settings recovery. Neither
should create a second data model or weaken anonymous local/web use. Keep
canonical IDs independent of account, device, and provider IDs, and require a
separate conflict, tombstone, authorization, privacy, quota, and cost design
before hosted sync.

## Known follow-ups

- Consider streaming backup export only if real-world photo libraries become
  too large for the current JSON workflow.
- Add field-level conflict comparison if device-to-device editing becomes common.
- Consider manual splitting for the rarer case of an incorrect automatic merge.
- Add per-photo deletion and captions.
- Add draggable custom positions for non-logo overlay blocks. Logo fine
  positioning already uses horizontal and vertical sliders.
- Add browser integration tests for IndexedDB, backup/restore, PWA updates, and
  high-resolution image export.
- Consider image downscaling or optional originals for large phone photos.
- Add a catalog-maintenance script that validates and imports reviewed entries
  from `diveframe-added-sites.json`.

## Recovery and rollback

The previous server-backed release is commit `23dff96`. The first
device-local release is commit `67ecfec`.

The former D1 database and R2 bucket were not deleted during the migration.
Rolling the application back can restore access to their existing records.
