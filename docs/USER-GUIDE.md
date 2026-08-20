# DiveFrame user guide

DiveFrame is a device-local companion for dive logs. It combines compatible
exports from several sources into a richer browser-based logbook, adds maps and
dive-site choices, stores photos, and creates shareable images with dive
profiles and statistics.

It complements the original dive-computer or logbook application. It does not
replace that application's cloud backup and does not write changes back to it.

> **Beta:** Updates may change workflows while DiveFrame is in active
> development. Keep the original source exports and a recent app backup. The
> notice shown throughout the app links to **Settings**, where backups can be
> exported.
>
> **Schema note:** The one-time IndexedDB **v8** upgrade erased local DiveFrame
> data on first open of that version. Later upgrades (including **v9**, the
> v10 repair migration, **v11** dive memos, and **v12** reversible segment
> merge groups) are additive and keep existing dives, BLE raw records, trips,
> overlays, memos, and merge relations. A pre-v8 backup still does not
> auto-migrate into v8 — re-import source logs if you are coming from an older
> schema.

The full interface and exported-image controls support English, Traditional
Chinese (Hong Kong), and Japanese. Change the interface language in **Settings**
directly below the install card. Each share image can use a different overlay
language.

## Installing DiveFrame

Open **Settings → Install DiveFrame**. On Android and supported desktop
browsers, select **Install app** when offered. DiveFrame will open in its own
app window and appear on the home screen or app launcher.

On iPhone or iPad, open the site in Safari, tap **Share**, then choose **Add to
Home Screen**. Apple devices do not show the same in-page install prompt used
by Chromium browsers.

The installed PWA and the browser site share local data only when they use the
same web address and browser storage. Export an app-data backup before
uninstalling, clearing site data, changing browsers, or moving to another
deployment address. The service worker keeps the visited app shell available
for faster launches and limited offline use; map searches and other network
lookups still require a connection.

On the installed PWA and the Android app, system Back (the Android gesture or
button, or Back in the browser/PWA) goes up one screen the same way the
DiveFrame mark does. An open dialog or the import/Bluetooth panel closes
first. On the home dive list with nothing open, Back leaves the app.

## Supported imports

The **Import log** button accepts one or more of:

- Shearwater Cloud Desktop `.db`, `.sqlite`, or `.sqlite3` databases
- Subsurface `.ssrf` and XML logs
- UDDF `.uddf` or XML logs, including Oceanic+ exports
- Dive `.fit` activities exported from Garmin Dive or the current Suunto app

If the logbook is empty, choose **Load sample log** to try the app with the
included 2030-dated UDDF example. DiveFrame removes that sample automatically
when you import a different log; you can also delete it from **Edit dive
details**.

### Android: Download from computer

In the DiveFrame Android app (not the browser PWA), **Download from computer**
appears next to **Import log**. Classic Shearwater BLE computers are supported
(for example Peregrine and Perdix 2). Perdix 3 and other brands are not; import
those via a file export instead. Put the computer in transfer mode, allow
Bluetooth, scan, connect, then:

- **First sync** (no checkpoint yet): choose **Last N** (stepper or typed
  count), **Last 200**, or — under **Advanced** — **Full import**, then
  **Download history**. Typing or using the Last N steppers selects that
  option automatically.
- **Later syncs**: the primary action is **Download new dives** (only dives
  newer than the last successful sync), with the last-synced time shown beside
  the button. Below that, **Get more history** stays visible with the same
  quantity options for catch-up downloads.

If your Shearwater recorded a satellite fix, its coordinates are imported as
dive-computer GPS (from Cloud Desktop databases and from Android BLE download).
Shearwater only stores a fix from log version 17 onwards and
only when the computer actually locked on, so older dives having no coordinates
is normal rather than a fault. When reverse geocoding cannot reach the DiveFrame
API (for example if a production deployment temporarily omits APK CORS), the dive still
keeps its pin and shows that a place name is unavailable instead of spinning.

BLE downloads also store the sequential dive number shown on the computer (the
same integer Shearwater Cloud lists as DiveNumber). The logbook row and
**Imported from** use that number, including a factory test dive numbered 0 if
the computer logged one. Cloud `DiveId` is still Cloud-only. Dives saved from
an older BLE import keep a blank number until you download them again or
restore a backup that already has the field filled.

Dives are identified by per-dive fingerprints, so a later fuller download that
re-sends recent dives merges them instead of duplicating logbook entries. Each
dive is saved as it arrives, so Cancel (or an interrupted transfer) keeps
dives already received; the sync checkpoint advances only after a successful
completion. Reset sync checkpoint (under **Get more history**) clears only the
“new since last sync” marker; it does not erase dives already saved. Full
import can take a very long time; keep the app open in the foreground (the
screen stays awake during the transfer). Cancel is available during a
transfer.

When two source records can be matched safely, DiveFrame combines them into one
canonical dive. It retains source-specific dive numbers and fills missing
fields without allowing an empty field from a later import to erase useful
existing data. Ambiguous records remain separate rather than being merged
silently.

DiveFrame now creates the same canonical IDs on every device from immutable
source identifiers. Shearwater `DiveId` is preferred, followed by Subsurface
`deviceid:diveid`, UDDF, and FIT identity. UDDF uses the export’s dive element
ID when available, while Garmin/Suunto FIT uses device and activity/file
creation identity. When those fields are absent, DiveFrame derives a
deterministic fingerprint from start time, computer serial, depth, duration,
and representative profile samples. A renamed file or reordered UDDF log
therefore does not create a new identity. If a dive initially has only a
Subsurface record and its matching Shearwater record is imported later,
DiveFrame promotes the canonical ID and moves that dive’s photos, site
contribution, source mappings, and composer settings with it. Date/time,
computer serial, maximum depth, and duration are matching evidence; editable
fields such as site, buddy, notes, and dive number are not part of the ID.

Older import-order-dependent IDs are not migrated. For the first transfer after
this update, use **Settings → Erase all local logbook data** on each device, re-import the
source logs, reapply any edits you need, and create a fresh app-data backup.

The logbook overview counts total dives, dives at named sites, unique non-empty
location names from imported logs, accumulated underwater time, average
calculable SAC, and unique buddies. Locations are compared as written after
case and whitespace normalization; DiveFrame does not attempt to decide whether
they represent countries, regions, or towns.

Use the logbook sort menu to order dives by date, dive duration, or maximum
depth in either direction. Each compact summary shows maximum depth and dive
duration so the current order can be checked without opening a dive. Dives
missing the selected value appear last.

The normal search box also accepts two advanced source-matching operators:

- `source:shearwater-only` shows dives with Shearwater data but no matched
  Subsurface record.
- `source:subsurface-only` shows dives with Subsurface data but no matched
  Shearwater record.

An operator can be followed by normal search words, such as
`source:subsurface-only Maldives`.

The search box also matches the dive computer model name when present.

### Trips

Use **Select** on the logbook list to work on several visible dives at once.
While select mode is on, checkboxes appear on each dive row; tap a row to
toggle its checkbox instead of opening the dive. The action bar is grouped:

- **Selection:** **Select shown** replaces the current selection with every
  dive the active filters display. **Clear selection** unchecks them. Neither
  action changes stored data.
- **Trip:** **New trip…**, **Add to trip…**, and **Remove from trip**.
- **Selected dives:** **Merge segments** (reversible; see below) and
  **Delete selected**. Deletion asks for confirmation with the exact count,
  then removes those dives and the same dependent records as single-dive
  deletion (photos, added site entries, composer settings, raw records, source
  links, and any merge-group membership) in one transaction. It cannot be
  undone. Hidden or filtered-out checked rows are not deleted.

Leaving select mode clears the selection. Actions apply only to dives that are
currently visible after any active filters or search.

Assigned dives appear under a trip header in the list. Members are indented
beneath the header. Tap the header to expand or collapse the block for this
session only; collapse state is not saved between reloads. Each trip header
has a **Rename trip** action; the older rename control inside a dive’s
**Edit dive details** form is still there. Trip blocks and unassigned dives
are ordered together using the current sort option.

Open **Edit dive details** on a dive to assign or change its trip, create a
new trip, or delete a trip. Deleting a trip that still has dives requires
confirmation and clears those assignments first.

### List filters

The logbook chips and the collapsible **Filters** panel cover:

- **GPS**, plus inside **Filters:** **Has site**, **No site named**, **Gas
  data**, **Edited here**, and **Short dives**
- **Maximum duration (minutes)** for the short-dive chip, defaulting to 3.
  Only dives with a finite duration greater than zero and at or below that
  threshold match. Unknown or invalid durations are excluded.
- **From** and **To** date bounds (inclusive on dive date; leave a bound empty
  for no limit)
- **Dive computer**, listing distinct computer models in the logbook

**Clear** sits beside **Select**. It resets the chips, date range, computer
choice, short-dive chip, and the duration threshold back to 3 minutes. It does
not clear the search box; use the search clear control for typed queries.

When search or filters are active, a trip header appears only if at least one
member matches. Non-matching members in that trip are hidden until filters and
search clear.

### Merged dive segments

Some outings are stored as two or more adjacent computer records (a bounce,
tank switch, or a restart after a short surface interval). **Merge segments**
in select mode presents those originals as one logbook row without deleting
them.

- Choose at least two visible dives from the same computer. They must not
  overlap in time, and the surface gap between them cannot exceed one hour.
  A gap longer than about 15 minutes is allowed but shown as a warning.
  Overlapping or near-identical starts belong in Settings **Review possible
  duplicates** instead; that tool is destructive and is not this flow.
- Confirmation shows ordered segments, gaps, combined clock time, and
  underwater time. Original dives, photos, source links, and raw records stay
  stored. Normal Subsurface export still emits the separate original dives.
- The merged row is labelled with a segment count. **Show original segments**
  on the dive page lists the members. **Unmerge** restores the previous
  logbook presentation. Adding or removing photos on the merged view is
  blocked; open an original segment for those edits. Assigning a trip on the
  merged row writes through to every member.
- If a later import changes a member so the group no longer matches, the row
  keeps a **Needs review** badge until you unmerge or merge again.
- Overview SAC and longest-dive statistics continue to use the stored
  original dives (including the 20-minute SAC floor). The Places Dived map
  plots originals, not a synthetic merged pin.

## Dive memos

Open **Dive memos** from the import guide, the notepad icon in the top bar, or
`/memos` to jot date, time, location, GPS, buddies, and notes for a dive before
the computer log is imported. Headings default to **Dive 1**, **Dive 2**, and so
on; tap a heading to rename it. Photo location only reads GPS from the selected
image and does not keep the photo on the memo.

Memos are stored in IndexedDB, included in app-data backups (backup format
**v5**), and cleared only by **Erase all local DiveFrame data** — not by erase
dives only. Merge groups from reversible segment merge are also in that
backup.

When a dive is open and still lacks a place name, DiveFrame may show
**Possible Memo Match** hints for memos near that dive’s start time. On the
memos page, nearby dives are offered under the collapsed **DIVES WITH SIMILAR
START TIMES** heading. Expand it to apply empty fields, copy individual fields,
then Keep or Delete the memo.

## Dive profiles and gas use

When a source log contains samples, each dive page shows a compact depth
profile with axis labels. Tank-pressure telemetry can be switched on for dives
that contain it. Rendering happens only for the open dive and does not require
a server request.

Average water temperature is calculated from available temperature samples.
DiveFrame shows a SAC estimate only when it has dive duration, average depth,
one valid starting/ending pressure pair, and a cylinder volume. Missing inputs
remain unavailable rather than being replaced with invented values.
Shearwater Cloud's unitless air-integration fields may contain PSI; DiveFrame
detects those values and converts the pressure pair to bar before calculating
SAC. The logbook overview excludes dives shorter than 20 minutes from its
average SAC figure; the individual dive page can still show their estimates.

Use **Settings → Default tank size** to choose the device default. A new
installation uses Aluminium 80 (11.1 L). Open **Edit dive details** to choose a
different standard cylinder or enter starting and ending pressure for that
dive.

## Local data and privacy

Imported records, edits, photos, reusable backgrounds, the overlay logo,
per-dive settings, named composer presets, and reversible segment-merge groups
are stored in IndexedDB for the current browser profile and web address. The
source files are read in the browser and never modified.

DiveFrame does not store the logbook on its server. Map-name and nearby-site
lookups use network services. Composer overlay fonts are bundled with the app
for offline use (SIL OFL families listed in `ASSET-LICENSES.md`).

For a named dive without GPS, DiveFrame first searches the complete location
text. If that fails and the name contains comma-separated place levels, it
tries once more without the most specific first part. The resulting map is
labelled approximate because it may represent a city or region rather than the
exact entry point.

Browser data is not a durable cloud backup. It can be lost when site data is
cleared, a private-browsing session ends, the browser profile is removed, or
the app moves to a different web address. Use **Settings → Export app data**
before changing devices, browsers, or addresses. The backup contains private
log and photo data and should be kept securely. When exporting,
**Password-protect this backup** can optionally encrypt the download. Enter and
confirm any non-empty password. DiveFrame does not store or recover it.
To replace an encrypted backup with an unencrypted one, import it and export a
new backup without selecting password protection.

In the Android app there is no browser download, so DiveFrame writes exports
into the phone's public **Downloads** folder and the status line reports the
file name. **Send a copy** then opens the Android share sheet to move the
backup off the phone. **Import app data** uses the normal Android file picker,
so a backup saved in Downloads can be re-imported directly. Composer images,
share cards, app-data backups, and updated or generated Subsurface files are saved the same
way.

When importing an encrypted backup, DiveFrame asks for its password before
showing the normal preview. Unencrypted and older backups remain supported.
DiveFrame validates the file and verifies the SHA-256 checksum
on current-format backups before showing a preview. Older backups without a
checksum are identified as legacy backups. Nothing is written until you choose:

- **Merge backup** adds new records and keeps records that exist only on the
  current device. When an ID matches, the complete backup record replaces the
  local record rather than merging individual fields. Photos with different
  IDs are both kept; an exact matching photo ID is replaced by the backup copy.
- **Replace dives with backup** replaces the dive-domain records (dives, source
  mappings, site contributions, BLE raw/checkpoint records, trips, and
  segment-merge groups) while keeping dive photos, composer settings and
  presets, reusable backgrounds, logo, app preferences, and supplementary
  catalogs.
- **Replace all data with backup** atomically clears DiveFrame's current local
  stores and restores exactly what is in the backup. Review the preview and
  confirmation carefully because device-only records are removed.

After import, the status message reports new, matching, retained, or removed
record counts. Settings also contains a collapsed **Review possible
duplicates** tool. It compares likely pairs and lets you choose which record
keeps its ID and preferred values, or leave the pair separate. If matching
imports use different clock times—for example, UTC and local time—use
**Merge two dives manually** to select the two records directly. That
duplicate merge cannot be undone and is not the same as logbook **Merge
segments**, which keeps both original dives.

The Settings danger zone has three reset choices:

- **Erase all dive photos** removes only images attached to dives. It keeps the
  dives, reusable backgrounds, logo, and settings, and is useful when a backup
  has grown too large.
- **Erase dive data only** removes imported dives, source mappings,
  app-added site records, BLE raw/checkpoint records, trips, and reversible
  segment-merge groups. It keeps dive photos, reusable backgrounds, the
  global logo, per-dive composer settings, named composer presets, and app
  preferences. Re-import the same source logs so their deterministic IDs
  reconnect the retained per-dive photos and composer settings.
- **Erase all local logbook data** removes every DiveFrame record and image
  from the current browser, including any supplementary dive-site catalog saved
  on the device. Offline application files remain cached because they contain
  no logbook information.

Settings also shows estimated stored-media and exported-backup sizes.
On the web, the **Install DiveFrame** card reports whether browser storage is
**persistent** or **best effort**. Best-effort browser data can be evicted under
storage pressure, so keep a recent exported backup. The Android APK omits this
browser install/storage card; its logbook lives in private app data, and
uninstalling the app, using Android’s Clear storage / Clear data, or a factory
reset will wipe it.
**Optimize stored photos** converts eligible dive photos and reusable
backgrounds to JPEG at 88% quality, with a maximum longest edge of 2560 pixels.
An image is only replaced when the result is smaller. This is a lossy,
irreversible operation; the global logo is excluded, and transparency in other
PNG files is flattened onto a dark background.

The logbook summary shows a storage warning when its estimated backup reaches
about 150 MB on a phone or tablet, or 500 MB on a desktop. The estimate includes
dive profile JSON and the roughly one-third size increase caused by embedding
images as Base64 in the backup.

For a device-transfer acceptance test, export from one browser and import into
a clean profile in a different browser, then compare counts, edits, photos,
backgrounds, presets, logo, and language. A fuller checklist is in
`docs/CROSS-BROWSER-TESTING.md`.

## Changes made in DiveFrame

Site choices, manually entered site names, buddy, notes, photos, categories,
and image settings made in DiveFrame stay in DiveFrame. They are not
automatically synchronized back to Shearwater, Subsurface, Garmin, Suunto,
Oceanic+, or their cloud services.

To update the original log:

1. Turn on the **Edited here** filter.
2. Open a dive and note its source-specific dive number.
3. Find that dive in the source application and enter the correction manually.
4. Export and import the source log again.

When a later source import supplies a non-empty site name, DiveFrame replaces
the temporary app-level site assignment and the dive leaves the **Edited here**
filter when that was the only in-app edit. Other in-app edits (GPS, trip,
cylinder, buddy, notes, location, category) also match this filter.

Open **Edit dive details** to enter or change both the specific dive-site name
and the broader location. The fields suggest site and location names already
present in the local logbook. For a dive with GPS, the separate site picker
offers sites from the bundled catalog, a loaded supplement, device additions,
and the OpenStreetMap fallback. A manually entered location is used by the
existing approximate map lookup when the dive has no GPS.

### User GPS and maps

Computer GPS from an import (`gpsEntry*` or `gpsExit*` fields) is never replaced
by a user pin. The dive-detail map and the offline Places Dived map prefer a
valid computer entry coordinate, then a valid computer exit coordinate, then
user GPS. When none is present, the dive-detail map can still use its
approximate name-based lookup.

On the dive's map card, tap **Edit location** to enter latitude and longitude,
then **Save location**, or choose **Clear location** to remove the pin. **Use
location from photo** scans attached JPEG photos for EXIF coordinates and,
when found, saves them with a photo-exif source. Photos without GPS or
unsupported formats are skipped with a status message.

After a valid user coordinate is stored, **Use this location for site
suggestions and export** can be checked. That preference is off by default and
is per dive. When it is on, nearby-site suggestions and both Subsurface export
paths use the saved user coordinate; the map display stays computer-first, and
imported `gpsEntry*` / `gpsExit*` values are not changed. Clearing the user
coordinate also turns the preference off so a stale checked state cannot
remain without a pin. Older backups and dives that lack the field stay
computer-first.

### Places Dived map

Open **Dive Map** from the top navigation to see every dive with structured
coordinates. This map is bundled with DiveFrame and remains offline: it does
not send dive names or coordinates to a tile or geocoding service. It uses
computer entry GPS, computer exit GPS, a saved user pin, or the coordinates of
a selected DiveFrame catalog site.

The header reports both the number of mapped dives and the number of visible
map places. Dives within 250 metres share a marker, as do dives linked to the
same catalog site. Open a marker to see its dives grouped by site and sorted by
date. Markers whose selectable areas overlap at the current zoom are combined,
so none can hide behind another; zoom in to separate them again. Drag to pan,
and pinch, scroll, or use the **− / +** controls to zoom. The **Mapped places**
list beside or below the map provides another way to open each visible marker.

At the bottom of the page, **Check named dives without coordinates** runs an
on-demand comparison against exact active catalog names and aliases. Nothing is
scanned until the button is pressed. Review the dive-log site and location next
to the catalog version before choosing **Use these coordinates**. The catalog
coordinate is stored as user data without replacing the displayed site or
location text. After coordinates are applied, the results stay expanded and
refresh for the current map visit so the next match can be reviewed. Names not
found are listed separately so they can be entered manually or added to a
supplementary `dive-sites.json`. The text below the audit button and the
expanded results both include **Open catalog settings**, which goes directly
to the **Dive-site catalog** card rather than the top of Settings.

### Catalog alias names

In the nearby site picker, each catalog suggestion shows its main name. Tap the
main control to save that name. Use the aliases control on that row to expand
alias chips for the same catalog entry; choosing a chip saves the alias as the
displayed site name while keeping the catalog link. Only one site's aliases are
expanded at a time. Manual typing in **Edit dive details** remains unchanged.

## Available exports

- High-resolution PNG or JPEG share images, with selectable photo, profile,
  statistics, units, English/Traditional Chinese/Japanese overlay language,
  styling, and optional logo
- A complete DiveFrame app-data backup for transfer or recovery
- An updated copy of a freshly supplied Subsurface `.ssrf`/XML export, with
  matched site names, buddy, and notes added
- A portable Subsurface logbook generated from the local DiveFrame data when
  every dive has a date, duration, and usable depth/time profile

## Using a regional dive-site catalog

In **Settings**, choose a compatible `dive-sites.json` under **Dive-site
catalog**. Its sites are added to—not substituted for—the catalog included
with DiveFrame. The supplementary file is saved on this device in IndexedDB,
survives reloads and app restarts, and is included in **Export app data**
backups. The combined list is used for nearby-site suggestions. Duplicate IDs
and identical name/coordinate entries retain the bundled entry. Remove the
additional catalog from the same card at any time.

The catalog card is a separate Settings section directly after the **Image
Composer Settings** group, whose last card is **Reusable dive backgrounds**,
and immediately before **Advanced settings**. Its three counts open separate
searchable views:

- **Catalog sites** shows only the built-in `dive-sites.json` shipped with the
  current DiveFrame version.
- **Device additions** shows distinct sites captured when a dive had
  coordinates and you entered its site name manually. These entries also
  become local site suggestions. The view starts expanded and can download a
  compatible supplementary-catalog JSON file.
- **From supplement** shows only the currently loaded supplementary catalog.
  It also starts expanded and can download a copy in the same JSON format.

The views group entries by country or region and show the place, preferred
name, ID, source, aliases, and coordinates. Search includes those fields.

If you need a catalog for another region, download the AI catalog prompt from
that card, replace the region placeholder, and give it to an AI assistant that
can research public sources. Review the generated JSON before loading it. The
Android app saves the included prompt through its native file export into the
device’s Downloads area; it does not need to fetch a separate catalog prompt
from the hosted web app.

### What's new

The global notice surfaces the latest unread update version. Open **Settings →
What's new** to expand its one-line entry and mark it as seen. When online,
DiveFrame fetches the latest feed from the hosted production site and caches it
on the device so an unread entry remains available offline. Each entry can
include structured download links, such as an **Download Android APK** button
that opens in a new browser tab. Once marked seen, the What's new card is hidden
until a newer version is available.

## Cropping a share image

In the image composer, choose **Crop photo** to switch the preview into crop
mode. Drag the photograph to reposition it. Use the mouse wheel or the
**Zoom** control to scale it; touch dragging works on mobile. **Reset crop**
returns to a centred fill. The rule-of-thirds guide is only an editing aid and
does not appear in the exported PNG or JPEG.

Reusable backgrounds can be given a friendly name in Settings. That name is
shown in the composer and travels with an app backup; individual dive photos
continue to be identified by their original filename.

Use **Composer presets** to name and save the current reusable design choices,
then apply them to another dive. A preset includes the template, visible
fields, block positions, chart, logo, typography, colour, units, and output
settings. It does not replace the destination dive's site override, category,
selected photo, zoom, crop position, or rotation. Saving the same normalized
name updates that preset. Presets are included in app-data backup and restore.
The collapsed **Personal presets** section appears immediately below the
template selector.

The composer shows attached photos, reusable backgrounds, and the included
**Bubbles** background as thumbnail choices. The first real image is selected
automatically so the image can be composed immediately; click the selected
thumbnail again to use a transparent background for an overlay-only export.
When a dive has no attached photos, its gallery offers the same reusable and
included backgrounds as quick-start tiles.
It is also shown explicitly in **Settings → Reusable diving backgrounds**.
Removing it there or from the composer saves a device-local preference, so it
stays out of the composer until **Restore included Bubbles background** is
chosen in Settings. This preference is included in app backups.

On a mobile screen, the smaller live preview remains pinned below the top bar
while the composer controls scroll. Changes to templates, fields, colours, and
positioning can therefore be checked without repeatedly returning to the top.
The control groups can be expanded and collapsed to keep the editor compact
without removing any options.

When a dive is open on mobile, Brand or the home button returns to the dive
list with that dive near the top of the screen. In the image composer, Home
goes to the front of the app; the back arrow returns to the open dive.

The four presets seed the same choices exposed in the composer:

- **Bottom Profile** keeps a compact chart and statistics band in the lower
  third.
- **Right Information Panel** places the chart and statistics in a right-side
  information panel.
- **Bottom Stats Dock** uses a frosted bottom dock with centered stat cells.
- **Solid Info Band** uses a solid information band with centered stat cells.

After choosing a preset, every seeded setting can be adjusted in the composer.

New dives start with social-media resolution and JPEG output. DiveFrame
remembers the last selected resolution, format, and JPEG quality for the next
dive without saved composer settings. Downloads use the dive date and start
time, for example `diveframe-20260517 14-03.jpg`. The time separator is a
hyphen so the file remains valid on Windows.

The overlay font menu includes Noto Sans TC, Inter, Outfit, Space Mono, Huninn,
and Device Sans (the same faces as before; all are bundled for offline use
except Device Sans, which uses system faces). The font-colour picker applies one colour consistently to the
site, category, date, statistics, chart legend, and axis labels.

When a logo is enabled, choose its preset anchor and then use the horizontal
and vertical position sliders for fine adjustment. The offsets are saved with
that dive's composer settings and are applied identically to preview and
high-resolution export. The renderer keeps the logo inside the image canvas.

### Updating a Subsurface logbook

The normalized DiveFrame import is lossy: it keeps the fields needed by the
app, but not every Subsurface setting, event, cylinder attribute, or extension.
It therefore cannot safely reconstruct a complete Subsurface log from
IndexedDB.

Use **Settings → Update a Subsurface logbook** instead:

1. Export a fresh `.ssrf` or XML file from Subsurface.
2. Select that file in DiveFrame.
3. DiveFrame matches its original Subsurface source identities and adds the
   current site name, buddy, and notes where available.
4. Download the new `-diveframe-updated.ssrf` copy.

This is a pass-through edit. Unrelated XML, including profiles, events,
cylinders, and fields DiveFrame does not parse, remains in the supplied copy.
The original selected file is never overwritten. Site names selected in
DiveFrame take priority, followed by a matched Shearwater site name.

DiveFrame does not create modified Shearwater, UDDF, or FIT logs.

To create a portable logbook from the data already in DiveFrame, use
**Settings → Export full Subsurface logbook**. After you click the button,
DiveFrame checks every local dive for a date, duration, and a usable
depth-over-time profile. If any record is incomplete, it does not create a
file. The output includes the normalized site, GPS, buddy, notes, gas, computer,
depth, temperature, and sample data, but it cannot preserve unknown Subsurface
extensions or events from an original file.

Cylinder choice, manual pressure values, category, broader location, photos,
and image-composer settings remain DiveFrame-local. They are not written by the
Subsurface pass-through tool.

## Open-source license

DiveFrame is free software under the GNU General Public License version 3 or
any later version (`GPL-3.0-or-later`). You may fork, study, modify, and
redistribute it. Distributed modified versions must remain available under the
same open-source license. See [LICENSE](../LICENSE) for the project notice and
license link.

The included Bubbles sample background is copyright DiveFrame developer and
licensed under CC BY-SA 4.0. See [ASSET-LICENSES.md](../ASSET-LICENSES.md).

## Product review and roadmap

The [product specification](PRODUCT-SPEC.md) describes the implemented
behavior, known limits, privacy model, readiness gate for store packaging /
BLE hardening, and questions for outside reviewers. It is the best single
document to share when asking divers, accessibility/localization reviewers,
privacy reviewers, or developers what should be addressed next.

The production Android APK (`cc.fishese.divelog`) and the separately
installable Preview APK already ship classic Shearwater BLE import. Future
directions include optional Google Drive backup/sync and optional accounts for
hosted record and settings recovery. Web/PWA Bluetooth and other computer
brands remain out of the current beta. Those extensions are intended to reuse
the same portable data and merge behavior, keep the web app fully supported,
and preserve anonymous local use.
