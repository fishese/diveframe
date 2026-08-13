# Bundled map source

`countries-110m.json` and `countries-50m.json` are the pinned `world-atlas`
2.0.2 TopoJSON redistributions of Natural Earth Admin 0 country boundaries.
The 110m source is used at world and regional zoom; 50m is reserved for the
two highest zoom levels.

- 110m source: <https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json>
- 50m source: <https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json>
- Repository: <https://github.com/topojson/world-atlas/tree/v2.0.2>
- Data terms: Natural Earth public-domain terms at
  <https://www.naturalearthdata.com/about/terms-of-use/>
- Redistribution license: `world-atlas-LICENSE`

Both files are kept in the repository so
`node scripts/generate-dive-map-svg.mjs` is deterministic and does not need
network access. They are build-time source data only; the application ships
generated dark/light SVG assets under `public/maps/`.
