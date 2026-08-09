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
2. valid user/photo/memo GPS stored on the dive;
3. coordinates for the dive's selected active DiveFrame catalog site.

A dive without one of those sources is reported as unmappable.

## Aggregation

Known catalog site identity wins: every dive with the same catalog site ID is
grouped even when its stored GPS readings differ slightly. Different known
site IDs are never merged merely for being close together. Dives without a
known site ID use deterministic 250-metre single-link geographic clustering,
calculated with the Haversine distance. The threshold is intentionally small
and lives in `lib/dive-map.ts` so it can be tuned after real-world testing.

The map keeps distinct known-site markers and relies on zoom for dense areas.
Marker details preserve every represented dive and sort them newest first.
