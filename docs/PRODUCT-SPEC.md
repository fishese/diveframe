# DiveFrame product specification

Status: pre-release review

Last updated: 2026-07-29

## Review brief

DiveFrame is a device-local dive log companion. It imports compatible exports
from dive-computer and logbook applications, conservatively combines records
for the same dive, enriches them with locations and photos, and creates
shareable images. It does not currently download directly from a dive computer
or replace the source application's cloud backup.

This document is intended to support product, diving-domain, privacy,
accessibility, and engineering review before two larger projects are started:

1. packaging DiveFrame in a native mobile wrapper; and
2. downloading dives directly over Bluetooth.

Reviewers should focus on whether the current local logbook is trustworthy and
complete enough to become the data layer for those larger capabilities.

## Product goals

- Combine useful data from several exports without silently discarding richer
  information from another source.
- Make GPS, dive-site context, profiles, gas telemetry, photos, and
  source-specific dive numbers easier to inspect.
- Keep imported logs and photos private to the user's browser unless the user
  explicitly exports them.
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
- Select a nearby site from the bundled, session-loaded, or OpenStreetMap
  suggestions.
- Attach dive-specific photos.

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
computer model and serial, normalized gas mixes, sample arrays, imported and
user-selected site fields, buddy, notes, category, local photo count, and
composer state. Conversion to imperial units happens only at display/export.

## Dive-site data

The app bundles `data/dive-sites.json`. Active entries within 30 km are ranked
by Haversine distance. OpenStreetMap is the fallback when no bundled entry is
nearby.

A user can load a compatible regional `dive-sites.json` in Settings. That
catalog is stored in `sessionStorage` and combined additively with the bundled
catalog. The combined entries participate in nearby suggestions throughout the
current tab and form the base of the merged catalog download. Duplicate IDs or
identical name/coordinate records retain the bundled entry. Removing the
additional catalog does not change IndexedDB or backups. A downloadable prompt
helps users ask an AI assistant to research a regional catalog, but generated
data must be reviewed by a person.

Manual GPS-backed sites create contribution records. Settings can review,
rename, add aliases, exclude, export, or merge those candidates into a catalog
download. The deployed app cannot commit catalog changes to GitHub.

## Local persistence, backup, and privacy

IndexedDB stores canonical dives, source mappings, attachments, manual site
contributions, per-dive composer settings, named presets, reusable backgrounds,
the overlay logo, and app preferences.

The complete app backup is a versioned JSON file with embedded image data.
Current backups include a SHA-256 integrity checksum. Import validates the
structure, record keys, important dive references, encoded image data, and
checksum before showing a non-destructive preview. The user then explicitly
chooses **merge** (matching keys update, destination-only records remain) or
**replace** (all local stores are atomically replaced). The file is not
encrypted.

Deterministic dive IDs prevent duplicate dives when two devices imported the
same source logs. A collapsed manual review tool also identifies conservative
time/depth/duration matches and lets the user merge either record into the
other or keep them separate.

Three destructive controls exist:

- **Erase all dive photos** clears per-dive attachments while retaining dives,
  reusable backgrounds, branding, and settings.
- **Erase dive data only** clears dives, source mappings, and site
  contributions while retaining images and settings that can reconnect after
  deterministic re-import.
- **Erase all data** clears every DiveFrame IndexedDB store.

The logbook calculates an estimated JSON backup size from normalized records
plus Base64-expanded media. It adds a warning summary card at 150 MiB for
mobile/tablet user agents and 500 MiB for desktop user agents. Settings reports
estimated backup and raw media sizes and offers an explicit lossy optimizer:
eligible dive photos and reusable backgrounds are converted to JPEG quality
0.88 and capped at 2560 px on the longest edge, but are only replaced when the
new file is smaller. Logos and SVG files are excluded.

The app requests persistent browser storage when available, but browser data is
not a durable backup. The service worker caches the app shell and selected
static assets; map and geocoding lookups still require a network connection.

## Exports

- High-resolution PNG and JPEG share images.
- Complete DiveFrame app-data backup.
- Manual dive-site contribution JSON.
- Merged replacement `dive-sites.json`.
- A fresh Subsurface copy updated with matched site, buddy, and notes.

The Subsurface tool edits the supplied XML in place at the DOM level and
serializes a new download. It does not rebuild the log from DiveFrame's lossy
normalized model. Profiles, pressure samples, cylinders, events, extensions,
and unknown fields remain in the supplied document. DiveFrame does not
currently write modified Shearwater, UDDF, or FIT files.

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
- DiveFrame can be installed as a PWA. It is not yet an APK, native iOS app, or
  store-distributed application.

Formal screen-reader, keyboard-only, contrast, and iOS/Android device matrices
have not yet been completed.

## Explicit current non-goals

- Server-hosted logbook accounts or automatic cloud sync.
- Direct Bluetooth transfer.
- Editing the original Shearwater, UDDF, or FIT file.
- Automatic acceptance of AI-generated dive-site data.
- Decompression or interpretation of undocumented proprietary sample blobs.
- Dive-planning, decompression advice, or safety-critical calculations.
- Social network, public profiles, or shared community logbooks.

## Recommended readiness gate before a native wrapper

These items have higher leverage if completed while the app still has one
browser-based implementation:

### Completed trust and recoverability work

1. Backup import preview with explicit **merge** and **replace** choices.
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

1. Show whether persistent storage was granted and the browser's quota.
2. Optional per-photo captions and deletion.
3. Deduplicate backup photos by content hash.

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

The wrapper can start before every Priority C item is complete, but Priority A
should be treated as the data-safety gate.

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
- Manual split/merge for dives that automated matching cannot resolve.

For each candidate, ask whether it belongs in DiveFrame or remains better in
Subsurface/source apps.

## Native wrapper decision points

Before choosing Capacitor, a Trusted Web Activity, or another wrapper:

- Confirm whether native file pickers, share sheets, photo-library access,
  storage quotas, and offline behavior justify native APIs.
- Decide whether the wrapper must share the production web origin's data or
  perform a one-time browser-to-wrapper migration.
- Define update and signing strategy, APK distribution, store policy, and crash
  reporting/privacy expectations.
- Test high-resolution canvas export and large IndexedDB photo libraries in the
  chosen WebView.
- Keep the normalized model and import pipeline platform-independent.

A Trusted Web Activity is simpler but remains dependent on the hosted origin.
Capacitor offers native plugins and is the stronger candidate if Bluetooth and
native storage are planned.

## Bluetooth discovery phase

Bluetooth support should begin as a separate research/specification phase:

1. Define the first supported platform and device model.
2. Confirm protocol documentation, licensing, and lawful interoperability
   constraints.
3. Capture pairing, service discovery, transfer framing, retry, resume, and
   cancellation behavior.
4. Decide whether transfer is native BLE or Web Bluetooth. iPhone support
   strongly favors a native wrapper because Safari does not provide general Web
   Bluetooth access.
5. Keep raw downloaded records until parsing succeeds, then pass normalized
   dives through the same identity/merge pipeline as file imports.
6. Design interruption handling for phone backgrounding, screen lock, low
   battery, and large log histories.
7. Build a device/firmware compatibility matrix and test with real hardware.
8. Avoid presenting DiveFrame as a safety-critical device-management tool.

The initial milestone should be read-only transfer from one explicitly
supported computer, with no settings or firmware writes.

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
- Is `sessionStorage` the right lifetime for user-supplied regional catalogs?
- Which wrapper architecture best supports BLE, local files, and future iOS?
- What telemetry, if any, can help diagnose failures without collecting dive
  or location data?

## Release criteria for the current pre-wrapper phase

- Supported imports fail safely and never overwrite the selected source file.
- Re-importing the same source records does not duplicate dives.
- A backup can restore canonical records, source mappings, edits, settings, and
  image blobs on a clean device.
- Missing data remains visibly unavailable.
- Subsurface pass-through changes only documented fields.
- Core workflows work on mobile and desktop.
- Documentation matches the implemented privacy and persistence boundaries.
- Automated lint, type checking, production build, and regression tests pass.
