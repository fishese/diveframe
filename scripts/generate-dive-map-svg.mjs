import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_VERSION = "Natural Earth 5.1.0";
const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.0/geojson/ne_110m_admin_0_countries.geojson";
const LICENSE_URL = "https://www.naturalearthdata.com/about/terms-of-use/";
const WIDTH = 1200;
const HEIGHT = 600;

const labels = [
  { text: "Galápagos", latitude: -0.6, longitude: -90.6, kind: "region", dx: -8, dy: -9 },
  { text: "Egypt", latitude: 26.8, longitude: 30.8, kind: "country", dx: -12, dy: -10 },
  { text: "Red Sea", latitude: 22.2, longitude: 38.2, kind: "region", dx: 7, dy: 9 },
  { text: "Maldives", latitude: 3.2, longitude: 73.2, kind: "region", dx: -14, dy: 12 },
  { text: "Similan Islands", latitude: 8.6, longitude: 97.6, kind: "region", dx: -44, dy: -12 },
  { text: "Indonesia", latitude: -2.4, longitude: 117.5, kind: "country", dx: -20, dy: 6 },
  { text: "Bali", latitude: -8.4, longitude: 115.2, kind: "region", dx: -22, dy: 11 },
  { text: "Komodo", latitude: -8.6, longitude: 119.5, kind: "region", dx: 10, dy: 17 },
  { text: "Philippines", latitude: 12.8, longitude: 122.7, kind: "country", dx: -30, dy: 23 },
  { text: "Puerto Galera", latitude: 13.5, longitude: 120.95, kind: "region", dx: -52, dy: 3 },
  { text: "Palau", latitude: 7.5, longitude: 134.6, kind: "region", dx: 10, dy: 13 },
  { text: "Taiwan", latitude: 23.7, longitude: 121, kind: "country", dx: -34, dy: -5 },
  { text: "Hong Kong", latitude: 22.3, longitude: 114.2, kind: "region", dx: -51, dy: -18 },
  { text: "Japan", latitude: 36.2, longitude: 138.2, kind: "country", dx: 8, dy: -8 },
  { text: "Okinawa", latitude: 26.3, longitude: 127.8, kind: "region", dx: 12, dy: -4 },
  { text: "Australia", latitude: -25.5, longitude: 134.5, kind: "country", dx: -31, dy: 3 },
  { text: "Great Barrier Reef", latitude: -18.2, longitude: 147.5, kind: "region", dx: 8, dy: -2 },
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "public", "maps", "world-dive-map.svg");

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Natural Earth download failed (${response.status}).`);
}
const collection = await response.json();
if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
  throw new Error("Natural Earth response was not a GeoJSON FeatureCollection.");
}

const paths = collection.features
  .flatMap((feature) => geometryPaths(feature.geometry))
  .map((path) => `    <path d="${path}" />`)
  .join("\n");

const grid = [
  ...[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((longitude) => {
    const { x } = project(0, longitude);
    return `    <path d="M ${format(x)} 0 V ${HEIGHT}" />`;
  }),
  ...[-60, -30, 0, 30, 60].map((latitude) => {
    const { y } = project(latitude, 0);
    return `    <path d="M 0 ${format(y)} H ${WIDTH}" />`;
  }),
].join("\n");

const labelMarkup = labels.map(renderLabel).join("\n");
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title description">
  <title id="title">DiveFrame offline world map</title>
  <description id="description">An equirectangular world map with broad geographic labels for orienting dive markers.</description>
  <metadata>
    Source: ${SOURCE_VERSION}, ne_110m_admin_0_countries.geojson (${SOURCE_URL}).
    Natural Earth data is public domain (${LICENSE_URL}).
    Transformation: GeoJSON country polygons projected from WGS84 longitude and latitude to a ${WIDTH} by ${HEIGHT} equirectangular viewBox; coordinates rounded to two decimals. English orientation labels added by DiveFrame.
  </metadata>
  <style>
    .ocean { fill: #082832; }
    .grid { fill: none; stroke: #31515a; stroke-width: .65; opacity: .34; }
    .land { fill: #315b5f; fill-rule: evenodd; stroke: #789294; stroke-linejoin: round; stroke-width: .55; }
    .equator { stroke: #6a888a; stroke-width: .8; opacity: .52; }
    .label { paint-order: stroke; stroke: #082832; stroke-linejoin: round; stroke-width: 2.8px; text-anchor: middle; }
    .country { fill: #e4efec; font: 600 10px Arial, Helvetica, sans-serif; letter-spacing: .05em; }
    .region { fill: #b5ddd4; font: 500 8px Arial, Helvetica, sans-serif; }
    .leader { fill: none; stroke: #9fc9c2; stroke-width: .7; opacity: .78; }
    .anchor { fill: #9fc9c2; opacity: .86; }
  </style>
  <rect class="ocean" width="${WIDTH}" height="${HEIGHT}" />
  <g class="grid" aria-hidden="true">
${grid}
  </g>
  <path class="grid equator" d="M 0 ${HEIGHT / 2} H ${WIDTH}" aria-hidden="true" />
  <g class="land" aria-label="Country and coastline geometry">
${paths}
  </g>
  <g aria-label="Geographic orientation labels">
${labelMarkup}
  </g>
</svg>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");
console.log(`Wrote ${outputPath} (${Buffer.byteLength(svg)} bytes)`);

function geometryPaths(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [polygonPath(geometry.coordinates)];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map(polygonPath);
  }
  return [];
}

function polygonPath(rings) {
  return rings
    .map((ring) =>
      ring
        .map(([longitude, latitude], index) => {
          const { x, y } = project(latitude, longitude);
          return `${index === 0 ? "M" : "L"}${format(x)} ${format(y)}`;
        })
        .join(" ") + " Z",
    )
    .join(" ");
}

function renderLabel(label) {
  const anchor = project(label.latitude, label.longitude);
  const x = anchor.x + (label.dx ?? 0);
  const y = anchor.y + (label.dy ?? 0);
  const leader =
    label.dx || label.dy
      ? `    <path class="leader" d="M ${format(anchor.x)} ${format(anchor.y)} L ${format(x)} ${format(y - 2)}" />\n`
      : "";
  return `${leader}    <circle class="anchor" cx="${format(anchor.x)}" cy="${format(anchor.y)}" r="1.25" />\n    <text class="label ${label.kind}" x="${format(x)}" y="${format(y)}">${escapeXml(label.text)}</text>`;
}

function project(latitude, longitude) {
  return {
    x: ((longitude + 180) / 360) * WIDTH,
    y: ((90 - latitude) / 180) * HEIGHT,
  };
}

function format(value) {
  return Number(value.toFixed(2));
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
