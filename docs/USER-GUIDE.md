# DiveFrame user guide

DiveFrame is a device-local companion for dive logs. It combines compatible
exports from several sources into a richer browser-based logbook, adds maps and
dive-site choices, stores photos, and creates shareable images with dive
profiles and statistics.

It complements the original dive-computer or logbook application. It does not
replace that application's cloud backup and does not write changes back to it.

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

The logbook overview counts total dives, dives at named sites, unique non-empty
location names from imported logs, accumulated underwater time, average
calculable SAC, and unique buddies. Locations are compared as written after
case and whitespace normalization; DiveFrame does not attempt to decide whether
they represent countries, regions, or towns.

Use the logbook sort menu to order dives by date, dive duration, or maximum
depth in either direction. Dives missing the selected value appear last.

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
SAC.

Use **Settings → Default tank size** to choose the device default. A new
installation uses Aluminium 80 (11.1 L). Open a dive's **People & memory**
editor to choose a different standard cylinder or enter starting and ending
pressure for that dive.

## Local data and privacy

Imported records, edits, photos, reusable backgrounds, the overlay logo, and
settings are stored in IndexedDB for the current browser profile and web
address. The source files are read in the browser and never modified.

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

## Available exports

- High-resolution PNG or JPEG share images, with selectable photo, profile,
  statistics, units, language, styling, and optional logo
- A complete DiveFrame app-data backup for transfer or recovery
- A JSON log of manually added dive sites
- A merged `dive-sites.json` catalog for review and updating the app repository
- An updated copy of a freshly supplied Subsurface `.ssrf`/XML export, with
  matched site names, buddy, and notes added

## Cropping a share image

In the image composer, choose **Crop photo** to switch the preview into crop
mode. Drag the photograph to reposition it. Use the mouse wheel or the
**Zoom** control to scale it; touch dragging works on mobile. **Reset crop**
returns to a centred fill. The rule-of-thirds guide is only an editing aid and
does not appear in the exported PNG or JPEG.

**Bottom Profile** keeps a compact chart and statistics band in the lower
third. **Full-width Graph** starts its information band higher and gives the
profile substantially more height, so the two presets remain visually
distinct regardless of the selected photograph.

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

## Open-source license

DiveFrame is free software under the GNU General Public License version 3 or
any later version (`GPL-3.0-or-later`). You may fork, study, modify, and
redistribute it. Distributed modified versions must remain available under the
same open-source license. See [LICENSE](../LICENSE) for the project notice and
license link.
