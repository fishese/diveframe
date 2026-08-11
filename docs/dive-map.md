# Offline dive map

DiveFrame's Dive Map uses one bundled base-map asset:
`public/maps/world-dive-map.svg`. The web/PWA and Capacitor Android builds ship
the same file, so viewing the map does not require map tiles, geocoding, an
account, or a network connection.

## Geography source and license

- Source: Natural Earth 5.1.0
- Layer: `ne_110m_admin_0_countries.geojson`
- Tagged source URL:
  <https://github.com/nvkelso/natural-earth-vector/blob/v5.1.0/geojson/ne_110m_admin_0_countries.geojson>
- License: public domain
- Attribution: not required; DiveFrame nevertheless records “Made with
  Natural Earth” in the generated SVG metadata and this documentation.
- Terms: <https://www.naturalearthdata.com/about/terms-of-use/>

Run `node scripts/generate-dive-map-svg.mjs` to reproduce the asset. The script
downloads only the tagged source file during development. It converts WGS84
longitude/latitude vertices to a 1200 × 600 equirectangular viewBox, rounds the
projected coordinates to two decimals, and adds restrained styling, a
latitude/longitude grid, and broad English orientation labels. It does not add
or infer dive sites.

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

## On-demand site-name audit

The map can explicitly check named dives that still have no usable coordinate.
This check runs only when the user presses the audit button; it is not part of
normal rendering or background data refresh. The comparison uses normalized
exact matches against active catalog site names and aliases. Location names are
shown side by side for human verification but are never used to assign a site
silently.

After verification, the chosen catalog coordinate and catalog ID are stored as
user data on all dives in that matching site/location group. Names not found in
the active catalog are listed separately so they can be entered manually or
used to prepare a supplementary dive-site JSON catalog. After coordinates are
applied, the user-triggered audit is rerun and remains expanded for the current
visit so the next match can be reviewed without reopening it.
