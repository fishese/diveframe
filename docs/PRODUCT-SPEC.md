# DiveFrame product specification

Status: beta / pre-release review

Last updated: 2026-08-01

## Review brief

DiveFrame is a device-local dive log companion. It imports compatible exports
from dive-computer and logbook applications, conservatively combines records
for the same dive, enriches them with locations and photos, and creates
shareable images. On the Android debug APK it can also download classic
Shearwater dives over Bluetooth. It does not replace the source application's
cloud backup. The current beta is deliberately local-first; schema upgrades
after IndexedDB v8 are additive, but keep a recent backup while workflows are
still being tested.

This document is intended to support product, diving-domain, privacy,
accessibility, and engineering review before larger platform projects continue:

1. hardening and distributing the Capacitor Android APK (BLE already present in
   the debug build);
2. optional user-controlled backup/sync through Google Drive; and
3. optional accounts with hosted record and settings recovery.

Reviewers should focus on whether the current local logbook is trustworthy and
complete enough to become the shared data layer for those capabilities without
weakening the web app or requiring a second logbook implementation.

## Product goals

- Combine useful data from several exports without silently discarding richer
  information from another source.
- Make GPS, dive-site context, profiles, gas telemetry, photos, and
  source-specific dive numbers easier to inspect.
- Keep imported logs and photos private to the user's browser unless the user
  explicitly exports them or opts into a future synchronization service.
- Let users correct local records while preserving clear boundaries between
  DiveFrame and the original logbook applications.
- Produce polished, high-resolution dive-summary images from real data while
  omitting unavailable fields rather than inventing values.
- Remain useful as an installable web app on Android, iPhone, and desktop.

## Product principles

- **Source applications remain authoritative.** DiveFrame is a companion and
  local enhancement layer.
- **No silent destructive merge.** Ambiguous dives remain separate.
- **Missing means missing.** The UI does not substitute zero or fabricated
  values.
- **User edits are explicit.** Locally entered values are identifiable and can
  be filtered for later reconciliation.
- **Local first.** Server routes are stateless lookup helpers, not log storage.
- **Portable before synchronized.** Reliable export/import must precede any
  automatic cross-device sync.
- **One model across surfaces.** Web, the Android Capacitor shell, Drive
  transport, and optional account sync must share record formats, validation,
  identity, migrations, and merge behavior.
- **Accounts remain optional.** Future sign-in may add recovery and sync, but
  anonymous local use must remain a complete supported workflow.

## Current users and primary workflows

### Import and merge a logbook

1. Export one or more supported files.
2. Import them into DiveFrame.
3. DiveFrame derives deterministic source identities and matches records only
   when the evidence is sufficiently strong.
4. Re-import newer exports to update existing canonical dives.
5. Import another source, such as Subsurface, to fill profile or GPS gaps.

### Review and enrich a dive

- View summary metrics, source-specific dive numbers, computer model, map,
  profile, temperature, and optional tank-pressure telemetry.
- View logbook aggregates in this order: dive count, named-site count, unique
  location count, buddy count, total underwater time, longest dive in minutes,
  deepest dive, average maximum depth, and average SAC. Total underwater time
  uses minutes through 300 minutes, hours through 72 hours, and days above
  that.
- Edit site, broader location, buddy, notes, category, cylinder choice, and
  manual start/end pressure.
- Assign dives to trips from **Edit dive details** or bulk **Select dives** on
  the logbook list (grouped trip blocks, session-only expand/collapse).
- Set user GPS from one comma-separated decimal coordinate pair or from a
  selected JPEG photo's EXIF without overwriting computer GPS; keeping that
  photo on the dive is optional. The Android APK uses a MediaStore picker and
  `ACCESS_MEDIA_LOCATION`; browser pickers remain subject to browser metadata
  privacy behavior. Map display resolves computer → user → name geocode.
- Select a nearby site from the bundled catalog, a user-loaded supplementary
  catalog, or OpenStreetMap suggestions, including choosing a catalog alias as
  the displayed site name.
- Attach dive-specific photos.
- Filter the logbook by date range, computer model, and existing chips; reset
  clears filter controls but not the search box.

### Create a share image

- Select a dive and a dive photo, reusable background, or included starter
  background.
- Choose a data-driven layout and visible fields.
- Adjust photo crop, chart, typography, logo, units, language, and output.
- Save reusable personal presets.
- Export PNG or JPEG at social, high-resolution, or source-photo scale.

### Transfer or reconcile data

- Export and import a complete local app backup.
- Filter dives whose site was set in DiveFrame and manually update the source
  application.
- Apply site, buddy, and notes to a fresh Subsurface SSRF/XML copy using the
  non-destructive pass-through export.

## Supported imports

| Source | Accepted files | Typical data retained |
| --- | --- | --- |
| Classic Shearwater BLE (Android APK) | direct Bluetooth download | depth/temperature profile, independent tank-pressure series when present, gases, exact dive mode, environment/decompression metadata, computer identity, and computer GPS when recorded |
| Shearwater Cloud Desktop | `.db`, `.sqlite`, `.sqlite3` | summaries, computer identity, start/end pressure, manual site, buddy, notes, and GNSS fields where present |
| Subsurface | `.ssrf`, XML | profile samples, temperature, tank pressure, gases, GPS, sites, buddy, notes, and computer metadata |
| UDDF, including Oceanic+ exports | `.uddf`, XML | open-format dive metadata and available profile/gas/GPS fields |
| Garmin Dive and current Suunto app | dive `.fit` | available activity identity, profile, temperature, pressure, GPS, and device metadata |

Unsupported proprietary formats are not guessed. Older Suunto DM5 SDE/SML and
SCUBAPRO TravelTRAK `.asd` remain out of scope without reliable public format
documentation or user-supplied samples that can be handled lawfully.

## Canonical dive identity and matching

Canonical IDs are deterministic across devices. Immutable source identity
precedence is:

1. Shearwater `DiveId`;
2. Subsurface `deviceid:diveid`;
3. UDDF dive identity or stable profile fingerprint; and
4. FIT device/activity identity or stable profile fingerprint.

File names, export ordering, editable site names, buddy, notes, and dive number
are not identity inputs.

When a second source is imported, DiveFrame first reuses existing source
mappings, then considers start time, computer serial, depth, and duration.
Portable-format timezone fallback is deliberately stricter and rejects
ambiguous candidates. When a higher-priority identity arrives later, related
photos, settings, site contributions, presets, and source mappings move with
the canonical dive.

## Normalized data model

Internal values use:

- time in seconds;
- depth in metres;
- temperature in Celsius;
- pressure in bar; and
- coordinates as decimal latitude and longitude.

The canonical dive retains source provenance, source-specific dive numbers,
computer model and serial, normalized gas mixes, sample arrays, exact dive
mode, environment/decompression metadata, imported and user-selected site
fields, buddy, notes, category, local photo count, and composer state. Sample
pressure arrays are tank-indexed and match structured tank metadata by the same
stable index. Physical tanks stay separate in storage; later twin/sidemount
grouping is additive display configuration. Conversion to imperial units
happens only at display/export.

When matching sources contribute the same dive, profile and tank arrays are
selected as complete alternatives rather than concatenated. Re-importing one
physical tank through BLE and Subsurface/UDDF therefore cannot create two
identical tanks inside the matched dive. An identity-matching failure can still
produce two separate dive records and is handled by duplicate review.

## Dive-site data

The app bundles `data/dive-sites.json`. Active entries within 6 km are ranked
by Haversine distance. The same 6 km cutoff applies to the supplementary
catalog and OpenStreetMap fallback; OpenStreetMap is queried only when no
bundled or supplementary entry is nearby.

A user can load a compatible regional `dive-sites.json` in Settings. That
supplementary catalog is stored in IndexedDB (`supplementaryCatalog`, at most
one record) and combined additively with the bundled catalog. The entries
participate in nearby suggestions; duplicate IDs or identical name/coordinate
records retain the bundled entry. The supplementary catalog is included in
app-data backups and removed with **Erase all local logbook data**. A one-time
migration copies any legacy session-only catalog into IndexedDB on first load
after upgrade. A downloadable prompt helps users ask an AI assistant to
research a regional catalog, but generated data must be reviewed by a person.

Manual GPS-backed sites create contribution records. Settings can review,
rename, add aliases, or exclude those candidates. The deferred review/export
controls are archived in `scripts/archive/catalog-review-export/`; the deployed
app cannot commit catalog changes to GitHub.

## Local persistence, backup, and privacy

IndexedDB stores canonical dives, source mappings, attachments, manual site
contributions, per-dive composer settings, named presets, reusable backgrounds,
the overlay logo, and app preferences.

The complete app backup is a versioned JSON file with embedded image data.
Current backups include a SHA-256 integrity checksum. Export can optionally
wrap that document in password-based PBKDF2/AES-GCM encryption. The password is
required to decrypt and validate the file during import; it is not stored and
does not lock normal use of the local app.

Import validates the structure, record keys, important dive references,
encoded image data, and checksum before showing a non-destructive preview. The
user then explicitly chooses **merge**, **replace dives**, or **replace all
data**. During merge, the incoming complete record replaces the local record
when their primary keys match, while destination-only records remain. Photos
added separately on two devices normally have different IDs and are both kept;
an exact matching photo ID is replaced by the backup copy. Replace dives
atomically clears only dive-domain stores while retaining photos, composer
settings/presets, backgrounds, branding, preferences, and supplementary
catalogs. Replace all data clears all local stores before writing the backup.

Deterministic dive IDs prevent duplicate dives when two devices imported the
same source logs. A collapsed manual review tool also identifies conservative
time/depth/duration matches and lets the user merge either record into the
other or keep them separate. The same tool lets a user select any two dives for
manual merging when an otherwise-identical record uses a different timezone or
clock time.

Three destructive controls exist:

- **Erase all dive photos** clears per-dive attachments while retaining dives,
  reusable backgrounds, branding, and settings.
- **Erase dive data only** clears dives, source mappings, and site
  contributions while retaining images and settings that can reconnect after
  deterministic re-import.
- **Erase all local logbook data** clears every DiveFrame IndexedDB store,
  including the supplementary dive-site catalog. Service-worker application
  caches contain no logbook records and are deliberately retained.

The logbook calculates an estimated JSON backup size from normalized records
plus Base64-expanded media. It adds a warning summary card at 150 MiB for
mobile/tablet user agents and 500 MiB for desktop user agents. Settings reports
estimated backup and raw media sizes and offers an explicit lossy optimizer:
eligible dive photos and reusable backgrounds are converted to JPEG quality
0.88 and capped at 2560 px on the longest edge, but are only replaced when the
new file is smaller. Logos and SVG files are excluded.

The app requests persistent browser storage when available and Settings reports
whether the browser granted persistent storage, is using best-effort storage,
or cannot report its status. Where supported it also shows estimated usage and
quota. Browser data is still not a durable backup. The service worker caches
the app shell and selected static assets; map and geocoding lookups still
require a network connection.

## Exports

- High-resolution PNG and JPEG share images.
- Complete DiveFrame app-data backup.
- A fresh Subsurface copy updated with matched site, buddy, and notes.
- A newly generated portable Subsurface logbook from the local DiveFrame data,
  only when every included dive has a date, duration, and usable depth/time
  profile.

The Subsurface tool edits the supplied XML in place at the DOM level and
serializes a new download. It does not rebuild the log from DiveFrame's lossy
normalized model. Profiles, pressure samples, cylinders, events, extensions,
and unknown fields remain in the supplied document. DiveFrame does not
currently write modified Shearwater, UDDF, or FIT files. The generated
Subsurface logbook is a portable reconstruction, not a lossless replacement
for an original Subsurface export; unknown extensions and events are not
represented.

IndexedDB v10 keeps per-dive raw capture bytes and user overlays from the v8
schema (`docs/2026-07-30-indexeddb-v8-planning.md`), adds a persistent
`supplementaryCatalog` store, and repairs any missing stores without wiping
existing data. Trip assignment,
user GPS editing, and catalog alias display are productized in the shared
web/Android UI. `exportGpsPreference` remains at default `"computer"` with no
settings UI yet.

Android BLE imports map Shearwater GNSS from libdivecomputer
`DC_SAMPLE_LOCATION` samples into `gpsEntry*` / `gpsExit*` on the dive record
when the computer recorded a satellite lock (log version 17+).

**Deferred:** A UDDF ZIP exporter could be added later. It would be a separate
portable reconstruction and must not mutate stored raw records.

## Licensing boundary

The DiveFrame software source is licensed under `GPL-3.0-or-later`. The
included Bubbles sample background is separately copyrighted, explicitly
excluded from the GPL grant, and documented in `ASSET-LICENSES.md`.

This makes the repository and official build a mixed-license distribution:
the software remains open-source GPL software, but not every bundled asset is
open licensed. Redistributors must remove, replace, or obtain permission for
the Bubbles image. A freely redistributable image license would reduce friction
for package repositories and forks while still allowing the copyright holder
to retain copyright.

## Image composer

The included Bubbles starter image appears as an explicit item in the Settings
background library. Removing it stores an app preference, excludes it from
future composer sessions, and is covered by backup/restore. Settings provides a
restore action; the bundled asset itself is not copied into IndexedDB.
The composer presents dive photos, reusable backgrounds, and the bundled starter
image as thumbnail choices, with a transparent background option for overlay-only
exports.
When a dive has no attached photos, the gallery offers reusable and bundled
backgrounds as quick-start tiles into the composer.

The composer provides five original templates, including two horizontal 16:9
layouts. Templates are data-driven. Available controls include:

- canvas ratio and output resolution;
- PNG/JPEG and JPEG quality;
- crop, fill/fit, zoom, offsets, rotation, dimming, blur, and gradient;
- visible content fields and block-position presets;
- depth, pressure, and temperature chart modes;
- axis labels, chart height, line colours/thickness, and depth fill;
- metric/imperial display;
- date, time, decimal, text alignment, size, colour, contrast, and font;
- English, Traditional Chinese (Hong Kong), and Japanese overlays; and
- optional saved transparent logo with anchor and fine positioning.

The renderer omits unavailable values. SAC/RMV is not presented as calculable
without the necessary pressure and cylinder inputs.

## Interface, accessibility, and installation

- The full interface and composer are available in English, Traditional
  Chinese (Hong Kong), and Japanese.
- The layout supports mobile and desktop use.
- Mobile dive pages expose a compact home control.
- The composer keeps a reduced live preview visible while controls scroll.
- Native controls, labels, status regions, keyboard-accessible buttons, and
  reduced-motion CSS are used where available.
- A compact global beta notice remains as a fallback when there is no unread
  release update. Schema upgrades after IndexedDB v8 keep existing data.
- DiveFrame can be installed as a PWA. An Android debug Capacitor APK ships the
  same web UI with optional classic Shearwater BLE import. It is not yet an
  iOS app or store-distributed application.
- The web headers link to an Android APK information page. It documents the
  APK's classic Shearwater Bluetooth scope, Android media-location and
  Bluetooth permissions, native Downloads behavior, and the current decision
  to use Subsurface PC exports instead of a separate PC wrapper.
- iPhone users can use the PWA in Safari. The location picker reads GPS
  metadata from a selected file when the browser provides it, but browser
  pickers can redact metadata; Android web uploads tested with the picker and
  external EXIF viewers did not retain usable location data. The web picker
  therefore keeps broad file selection and shows a concise explanation linking
  to the Android app when no location is found. The APK's native
  `ACCESS_MEDIA_LOCATION` path remains the reliable Android option. A broader
  iPhone compatibility pass remains planned. Native iOS packaging is still
  out of scope.
- Web and APK runtime parity, intentional platform differences, and the
  maintainer release process are specified in `docs/WEB-APK-SYNC.md`. Every
  push to `main` must be checked for APK impact; shared client or native changes
  require a new APK built and published from that same commit. A Cloudflare web
  deployment does not update the GitHub APK or installed copies.
- The Android WebView ignores `<a download>` blob URLs, so every export
  (backup, updated or generated Subsurface logbook, composer image, and share
  card) is streamed through a native plugin into the phone's public Downloads
  folder, with an optional share-sheet handoff. Settings omits the browser
  install/storage card inside the APK.
- The global notice surfaces the latest unread **What's new** version; Settings
  shows the compact unread entry and hides it after it is marked seen.
  Settings fetches a versioned JSON feed from
  `https://divelog.fishese.cc/api/whats-new`. The shared API response helpers
  attach CORS for approved Capacitor origins; production deployment still
  needs an APK smoke test after hosting changes. The app caches the feed in
  app preferences and renders entries with optional structured links such as
  APK downloads. Offline use shows the last cached feed.

Formal screen-reader, keyboard-only, contrast, and iOS/Android device matrices
have not yet been completed.

## Explicit current-release non-goals

- Server-hosted logbook accounts or automatic cloud sync in the beta.
- Google Drive synchronization in the beta.
- Direct Bluetooth transfer in the web/PWA beta.
- Editing the original Shearwater, UDDF, or FIT file.
- Automatic acceptance of AI-generated dive-site data.
- Decompression or interpretation of undocumented proprietary sample blobs.
- Dive-planning, decompression advice, or safety-critical calculations.
- Social network, public profiles, or shared community logbooks.

## Recommended readiness gate for store packaging / BLE hardening

A Capacitor Android debug APK already ships the shared web UI and classic
Shearwater BLE import. These items still have higher leverage before treating
that build as store-ready or fully hardened:

### Completed trust and recoverability work

1. Backup import preview with explicit **merge**, **replace dives**, and
   **replace all data** choices.
2. SHA-256 checksums, structural validation, and clear validation failures.
3. Import reporting for added, matching, retained, and removed records.
4. Manual duplicate comparison with user-directed merge or keep-separate
   resolution.

Import reporting is currently record-level rather than parser-level: ambiguous
or rejected source dives are still reported by the original log-import flow,
not by app-backup restore.

### Storage and media control

Completed:

1. Estimated backup/media size and size-dependent logbook warning.
2. Bulk dive-photo deletion.
3. Explicit bulk JPEG optimization/downscaling for dive photos and reusable
   backgrounds.

Remaining candidates:

1. Optional per-photo captions and deletion.
2. Deduplicate backup photos by content hash.

### Priority C: quality and portability

1. Add browser integration tests for IndexedDB backup/restore, imports, catalog
   sessions, composer export, and service-worker update behavior.
2. Test the PWA on current Android Chrome, iOS Safari/Home Screen, Windows
   Chrome/Edge, and a low-memory phone.
3. Add an in-app version/build indicator and update/reload prompt.
4. Complete keyboard, screen-reader, contrast, large-text, and touch-target
   review.
5. Decide whether a small portable CSV/JSON dive-summary export is valuable
   independently of the private full backup.

The existing Android wrapper can continue hardening before every Priority C
item is complete, but the data-safety work above remains the store-readiness
gate.

## Features worth validating with divers before expanding scope

These may be useful, but should be driven by interviews rather than assumed:

- Manual creation of a dive that has no import source.
- Trip/grouping and tags.
- Equipment and weight configuration history.
- Buddy directory rather than free-text buddy names.
- More aggregate statistics and map-based logbook exploration.
- Printable/PDF logbook output.
- General CSV export.
- Photo captions, favourites, and per-dive ordering.
- Manual splitting for dives that automated matching combined incorrectly.
- A map picker for manually entering or adjusting a GPS coordinate.
- Image uploads as ZIP files for batch/original-file workflows, if that proves
  useful without complicating the local media model.

For each candidate, ask whether it belongs in DiveFrame or remains better in
Subsurface/source apps.

## Native wrapper status and remaining decision points

Capacitor is the current Android wrapper. Before store packaging or a future
wrapper change:

- Confirm whether native file pickers, share sheets, photo-library access,
  storage quotas, and offline behavior justify native APIs.
- Decide whether the wrapper must share the production web origin's data or
  perform a one-time browser-to-wrapper migration.
- Define update and signing strategy, APK distribution, store policy, and crash
  reporting/privacy expectations.
- Test high-resolution canvas export and large IndexedDB photo libraries in the
  chosen WebView.
- Keep the normalized model and import pipeline platform-independent.

A Trusted Web Activity would be simpler but remains dependent on the hosted
origin and would not replace the current native Bluetooth/file plugins.

## Planned extension guardrails

These are planned directions, not commitments for the current beta:

- **BLE:** Keep the web/PWA as the onboarding and general-use surface. The
  Android app adds read-only classic Shearwater BLE import; downloaded dives
  enter the same normalized identity/merge pipeline and remain fully portable
  via backup. Perdix 3 and other brands stay out of scope for direct BLE.
  PC/Web Bluetooth remains deferred.
- **Google Drive:** Treat Drive as an optional transport for the versioned
  backup/snapshot model, not as a second database or a native-only record
  format.
- **Accounts:** Preserve room for optional sign-in, hosted record/settings
  recovery, and multi-device sync. IndexedDB remains the local working
  database; canonical IDs must not depend on account, device, or provider IDs.
  Hosted sync will require explicit revisions, deletion tombstones, conflict
  behavior, tenant isolation, export/deletion, privacy, quota, and cost review
  before implementation.

All three directions must preserve anonymous local use and provider-independent
backup export. IndexedDB changes after v8 remain additive unless a destructive
change is explicitly reviewed and documented; supported migrations are
mandatory before other users are invited or hosted accounts are offered.

## Questions for reviewers

### Divers and logbook users

- Which missing task would stop you using DiveFrame as a companion logbook?
- Are source provenance and locally edited fields understandable?
- Would you trust the current backup workflow when changing phones?
- Which aggregate statistics, trip organization, equipment, or export formats
  are genuinely important?
- Is the site/location distinction clear in your region?

### Privacy and security reviewers

- Are the local-storage and network-lookup boundaries described clearly?
- Should backup encryption be required before broader release?
- What security, account-recovery, data-retention, and storage-cost controls are
  required before optional hosted accounts or sync can be offered?
- Are there risks in importing untrusted XML, JSON, FIT, SQLite, SVG, or image
  files that need additional limits or sanitization?
- Is the regional AI-catalog workflow sufficiently explicit about human review?

### Accessibility and localization reviewers

- Are English, Hong Kong Traditional Chinese, and Japanese terms natural and
  consistent?
- Can every core workflow be completed with keyboard, screen reader, large
  text, and touch?
- Are charts and map information understandable when visuals are unavailable?

### Engineering reviewers

- Are identity promotion and merge tolerances conservative enough?
- Does the backup format need redesign before more users accumulate photos?
- Is the single-record IndexedDB supplementary catalog the right persistence
  model for user-supplied regional catalogs?
- Which wrapper architecture best supports BLE, local files, and future iOS?
- Do current IDs, serializers, and store boundaries leave a clean seam for
  Drive transport and optional account sync without coupling records to a
  provider?
- What telemetry, if any, can help diagnose failures without collecting dive
  or location data?

## Release criteria for the current beta

- Supported imports fail safely and never overwrite the selected source file.
- Re-importing the same source records does not duplicate dives.
- A backup can restore canonical records, source mappings, edits, settings, and
  image blobs on a clean device.
- Missing data remains visibly unavailable.
- Subsurface pass-through changes only documented fields.
- Core workflows work on mobile and desktop (and on the Android debug APK for
  BLE and native export paths).
- Documentation matches the implemented privacy and persistence boundaries.
- Automated lint, type checking, production build, and regression tests pass.
