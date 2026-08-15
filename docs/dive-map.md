# Offline dive map

DiveFrame's Dive Map uses bundled, generated SVG base maps under
`public/maps/`. Dark and light variants use the same geometry. The 110m maps
cover world through 8x zoom; the 50m maps are used only for the new 12.8x and
20.5x button levels (and equivalent gesture zoom above 8x). The web/PWA and
Capacitor Android builds ship the same files, so viewing the map does not
require map tiles, geocoding, an account, or a network connection.

## Geography source and license

- Source: `world-atlas` 2.0.2 `countries-110m.json` and `countries-50m.json`
- Upstream repository: <https://github.com/topojson/world-atlas/tree/v2.0.2>
- Pinned sources: `scripts/map-data/countries-110m.json` and
  `scripts/map-data/countries-50m.json`
- Source URLs:
  <https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json> and
  <https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json>
- Underlying data: Natural Earth 1:110m and 1:50m Admin 0 country boundaries
- Data terms: public domain; see <https://www.naturalearthdata.com/about/terms-of-use/>
- Redistribution license: `scripts/map-data/world-atlas-LICENSE`
Run `npm run generate:map` (or `node scripts/generate-dive-map-svg.mjs`) to
reproduce the committed asset. The generator uses the pinned local TopoJSON
file, so it does not need network access. It converts WGS84 geometry with
d3-geo's equirectangular projection into a 1200 by 600 viewBox, rounds
projected coordinates to two decimals, and adds restrained theme-specific
styling and a latitude/longitude grid. The 110m maps include broad English
orientation labels; the high-zoom 50m maps omit them so enlarged labels do not
obscure detailed coastlines. Country labels with sufficient mainland space are
placed inline without an anchor, while island nations, archipelagos, and compact
dive regions use manually positioned dot-and-leader callouts. It does not add
or infer dive sites.

## Zoom and performance

The normal 110m SVG is about 150 KB uncompressed; each 50m SVG is about
1.345 MB uncompressed (approximately 477 KB with gzip or 296 KB with Brotli).
Keeping 110m below 8x avoids parsing and rendering roughly nine times as much
geometry where the extra vertices would collapse into the same screen pixels.

The current theme's 50m asset begins preloading at 6x. The 110m image remains
rendered underneath until the exact requested detail asset has loaded, then the
detail layer fades in above 8x. A cancelled or stale load from a previous theme
cannot activate the wrong asset. The service worker pre-caches all four maps
for complete PWA offline use; caching does not parse or render the detailed SVG.

## Projection

The base map and runtime marker helper share an equirectangular projection:

```text
x = (longitude + 180) / 360 × 1200
y = (90 - latitude) / 180 × 600
```

Both inputs are WGS84 decimal degrees. Latitude must be within -90…90 and
longitude within -180…180. Invalid or partial coordinate pairs are rejected.

## Coordinate trust order

The map never guesses coordinates from free text. It uses:

1. valid dive-computer entry GPS;
2. valid dive-computer exit GPS;
3. valid user/photo/memo/catalog GPS stored on the dive;
4. coordinates for the dive's selected active DiveFrame catalog site.

A dive without one of those sources is reported as unmappable.

## Aggregation

Every dive with the same catalog site ID remains grouped even when its stored
GPS readings differ. All resolved dives also use deterministic 250-metre
single-link geographic clustering, calculated with the Haversine distance.
This prevents catalog and coordinate-only markers at the same place from
overlapping and hiding one another. Nearby sites can therefore share one place
marker; its detail panel groups the dive list by site and sorts dives newest
first within each group. The threshold is intentionally small and lives in
`lib/dive-map.ts` so it can be tuned after real-world testing.

At the current zoom level, marker hit targets that would visually overlap are
also merged into a display-only cluster. Opening that cluster shows every dive
from every included place, still grouped by site. Pinching or otherwise zooming
in separates the markers again. This interaction uses standard browser pointer
events and adds no map, gesture, or network dependency.

For display labels only, an exact catalog site-name or alias match may supply
locality, region, or country context when its catalog coordinate is within 25
km of the stored dive coordinate. Cluster labels use the deepest place shared
by every included marker. This lookup is local and read-only: it never changes
the dive's coordinates, site identity, or saved fields. Nearby markers remain
grouped in the Mapped places list until the current zoom provides enough room
for their accessible hit targets to separate. On desktop, the list remains
visible with the selected marker first; otherwise it is ordered by distance to
the current map center. Panning and zooming therefore bring the most relevant
marker groups to the top without changing the underlying place aggregation.
A marker click selects its details, brings the marker into the central 20% of
the map, and zooms in by a gentle 1.35x step or the smallest amount needed to
keep an edge marker in that band. Automatic focus is capped at the 8x
detailed-map level. Drag suppression is
scoped to the pointer gesture that performed the drag, so a later marker or
list click is never consumed by stale pan state. A single pointer is captured
only after it crosses the drag threshold; this keeps an ordinary SVG marker
click targeted at the marker while still capturing active pans and pinches.

## On-demand site-name audit

The map can explicitly check named dives that still have no usable coordinate.
This check runs only when the user presses the audit button; it is not part of
normal rendering or background data refresh. The comparison uses normalized
exact matches against names and aliases in the active bundled, supplementary,
and device-added catalog. Location names are shown side by side for human
verification but are never used to assign a site silently.

After verification, the chosen catalog coordinate and catalog ID are stored as
user data on all dives in that matching site/location group. Names not found in
the active catalog are listed separately so they can be entered manually or
used to prepare a supplementary dive-site JSON catalog. The audit introduction
and expanded results both link directly to the **Dive-site catalog** card in
Settings. That card has a dedicated scroll target with top clearance, so the
heading is not hidden beneath the sticky application bar. After coordinates
are applied, the user-triggered audit is rerun and remains expanded for the
current visit so the next match can be reviewed without reopening it.
