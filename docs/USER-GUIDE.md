# DiveFrame user guide

DiveFrame is a device-local companion for dive logs. It combines compatible
exports from several sources into a richer browser-based logbook, adds maps and
dive-site choices, stores photos, and creates shareable images with dive
profiles and statistics.

It complements the original dive-computer or logbook application. It does not
replace that application's cloud backup and does not write changes back to it.

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

## Supported imports

The **Import log** button accepts one or more of:

- Shearwater Cloud Desktop `.db`, `.sqlite`, or `.sqlite3` databases
- Subsurface `.ssrf` and XML logs
- UDDF `.uddf` or XML logs, including Oceanic+ exports
- Dive `.fit` activities exported from Garmin Dive or the current Suunto app

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
this update, use **Settings → Erase all data** on each device, re-import the
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
per-dive settings, and named composer presets are stored in IndexedDB for the
current browser profile and web address. The source files are read in the
browser and never modified.

DiveFrame does not store the logbook on its server. Map-name and nearby-site
lookups use network services. Public webfonts may also be downloaded by the
browser.

For a named dive without GPS, DiveFrame first searches the complete location
text. If that fails and the name contains comma-separated place levels, it
tries once more without the most specific first part. The resulting map is
labelled approximate because it may represent a city or region rather than the
exact entry point.

Browser data is not a durable cloud backup. It can be lost when site data is
cleared, a private-browsing session ends, the browser profile is removed, or
the app moves to a different web address. Use **Settings → Export app data**
before changing devices, browsers, or addresses. The backup contains private
log and photo data and should be kept securely.

When importing, DiveFrame validates the file and verifies the SHA-256 checksum
on current-format backups before showing a preview. Older backups without a
checksum are identified as legacy backups. Nothing is written until you choose:

- **Merge backup** adds new records, updates records with matching IDs, and
  keeps records that exist only on the current device.
- **Replace with backup** atomically clears DiveFrame's current local stores
  and restores exactly what is in the backup. Review the preview and
  confirmation carefully because device-only records are removed.

After import, the status message reports new, matching, retained, or removed
record counts. Settings also contains a collapsed **Review possible
duplicates** tool. It compares likely pairs and lets you choose which record
keeps its ID and preferred values, or leave the pair separate.

The Settings danger zone has three reset choices:

- **Erase all dive photos** removes only images attached to dives. It keeps the
  dives, reusable backgrounds, logo, and settings, and is useful when a backup
  has grown too large.
- **Erase dive data only** removes imported dives, source mappings, and
  app-added site records. It keeps dive photos, reusable backgrounds, the
  global logo, per-dive composer settings, named composer presets, and app
  preferences. Re-import the same source logs so their deterministic IDs
  reconnect the retained per-dive photos and composer settings.
- **Erase all data** removes every DiveFrame record and image from the current
  browser.

Settings also shows estimated stored-media and exported-backup sizes.
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

1. Turn on the **Set in App** filter.
2. Open a dive and note its source-specific dive number.
3. Find that dive in the source application and enter the correction manually.
4. Export and import the source log again.

When a later source import supplies a non-empty site name, DiveFrame replaces
the temporary app-level site assignment and the dive leaves the **Set in App**
filter.

Open **Edit dive details** to enter or change both the specific dive-site name
and the broader location. The fields suggest site and location names already
present in the local logbook. For a dive with GPS, the separate site picker
continues to offer the bundled catalog and OpenStreetMap results. A manually
entered location is used by the existing approximate map lookup when the dive
has no GPS.

## Available exports

- High-resolution PNG or JPEG share images, with selectable photo, profile,
  statistics, units, English/Traditional Chinese/Japanese overlay language,
  styling, and optional logo
- A complete DiveFrame app-data backup for transfer or recovery
- A JSON log of manually added dive sites that have coordinates
- A merged `dive-sites.json` catalog for review and updating the app repository
- An updated copy of a freshly supplied Subsurface `.ssrf`/XML export, with
  matched site names, buddy, and notes added

## Using a regional dive-site catalog

In **Settings**, choose a compatible `dive-sites.json` under **Dive-site
catalog**. Its sites are added to—not substituted for—the catalog included
with DiveFrame. The combined list is used for nearby-site suggestions
throughout the current browser tab and for the existing merge/download tools.
Duplicate IDs and identical name/coordinate entries retain the bundled entry.
The additional file is not added to backups or permanent app storage, and can
be removed from the same card at any time.

If you need a catalog for another region, download the AI catalog prompt from
that card, replace the region placeholder, and give it to an AI assistant that
can research public sources. Review the generated JSON before loading it.

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

If a dive has no attached or reusable photo, the included **Bubbles**
background is selected automatically so the image can be composed immediately.
It is also shown explicitly in **Settings → Reusable diving backgrounds**.
Removing it there or from the composer saves a device-local preference, so it
stays out of the composer until **Restore included Bubbles background** is
chosen in Settings. This preference is included in app backups.

On a mobile screen, the smaller live preview remains pinned below the top bar
while the composer controls scroll. Changes to templates, fields, colours, and
positioning can therefore be checked without repeatedly returning to the top.
The control groups can be expanded and collapsed to keep the editor compact
without removing any options.

When a dive is open on mobile, use the small home button in the top bar to
return to the dive list.

**Bottom Profile** keeps a compact chart and statistics band in the lower
third. **Full-width Graph** starts its information band higher and gives the
profile substantially more height, so the two presets remain visually
distinct regardless of the selected photograph. **Landscape Dashboard** and
**Cinematic Split** automatically switch the canvas to 16:9 and provide
horizontal lower-band and sidecar arrangements respectively.

New dives start with social-media resolution and JPEG output. DiveFrame
remembers the last selected resolution, format, and JPEG quality for the next
dive without saved composer settings. Downloads use the dive date and start
time, for example `diveframe-20260517 14-03.jpg`. The time separator is a
hyphen so the file remains valid on Windows.

The overlay font menu includes Noto Sans TC, Inter, Outfit, Space Mono, Huninn,
and Device Sans. The font-colour picker applies one colour consistently to the
site, category, date, statistics, chart legend, and axis labels.

When a logo is enabled, choose its preset anchor and then use the horizontal
and vertical position sliders for fine adjustment. The offsets are saved with
that dive's composer settings and are applied identically to preview and
high-resolution export. The renderer keeps the logo inside the image canvas.

### Updating a Subsurface copy

The normalized DiveFrame import is lossy: it keeps the fields needed by the
app, but not every Subsurface setting, event, cylinder attribute, or extension.
It therefore cannot safely reconstruct a complete Subsurface log from
IndexedDB.

Use **Settings → Update a Subsurface export** instead:

1. Export a fresh `.ssrf` or XML file from Subsurface.
2. Select that file in DiveFrame.
3. DiveFrame matches its original Subsurface source identities and adds the
   current site name, buddy, and notes where available.
4. Download the new `-diveframe-updated.ssrf` copy.

This is a pass-through edit. Unrelated XML, including profiles, events,
cylinders, and fields DiveFrame does not parse, remains in the supplied copy.
The original selected file is never overwritten. Site names selected in
DiveFrame take priority, followed by a matched Shearwater site name.

DiveFrame does not currently create modified Shearwater, UDDF, or FIT logs.

Cylinder choice, manual pressure values, category, broader location, photos,
and image-composer settings remain DiveFrame-local. They are not written by the
Subsurface pass-through tool.

## Open-source license

DiveFrame is free software under the GNU General Public License version 3 or
any later version (`GPL-3.0-or-later`). You may fork, study, modify, and
redistribute it. Distributed modified versions must remain available under the
same open-source license. See [LICENSE](../LICENSE) for the project notice and
license link.

The included Bubbles sample background is a separate copyrighted asset and is
not covered by the GPL. Anyone redistributing a fork must remove or replace it
unless they have permission from the copyright holder. See
[ASSET-LICENSES.md](../ASSET-LICENSES.md).

## Product review and roadmap

The [product specification](PRODUCT-SPEC.md) describes the implemented
behavior, known limits, privacy model, pre-wrapper readiness gate, Bluetooth
discovery scope, and questions for outside reviewers. It is the best single
document to share when asking divers, accessibility/localization reviewers,
privacy reviewers, or developers what should be addressed before native
packaging and direct computer transfer.
