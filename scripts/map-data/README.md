# Bundled map source

`countries-110m.json` is the pinned `world-atlas` 2.0.2 TopoJSON
redistribution of Natural Earth 1:110m Admin 0 country boundaries.

- Source file: <https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json>
- Repository: <https://github.com/topojson/world-atlas/tree/v2.0.2>
- Data terms: Natural Earth public-domain terms at
  <https://www.naturalearthdata.com/about/terms-of-use/>
- Redistribution license: `world-atlas-LICENSE`

The file is kept in the repository so `node scripts/generate-dive-map-svg.mjs`
is deterministic and does not need network access. It is build-time source
data only; the application ships the generated
`public/maps/world-dive-map.svg`.
