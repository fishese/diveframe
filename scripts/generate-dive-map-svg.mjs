import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const SOURCE_REPOSITORY_URL =
  "https://github.com/topojson/world-atlas/tree/v2.0.2";
const LICENSE_URL = "https://www.naturalearthdata.com/about/terms-of-use/";
const WIDTH = 1200;
const HEIGHT = 600;
const MAPS = [
  {
    scale: "110m",
    labels: true,
    sourceFile: "countries-110m.json",
    outputs: {
      dark: "world-dive-map.svg",
      light: "world-dive-map-light.svg",
    },
  },
  {
    scale: "50m",
    labels: false,
    sourceFile: "countries-50m.json",
    outputs: {
      dark: "world-dive-map-detail.svg",
      light: "world-dive-map-detail-light.svg",
    },
  },
];
const THEMES = {
  dark: {
    ocean: "#082832",
    grid: "#31515a",
    equator: "#6a888a",
    land: "#315b5f",
    coast: "#789294",
    labelHalo: "#082832",
    country: "#e4efec",
    region: "#b5ddd4",
    leader: "#9fc9c2",
  },
  light: {
    ocean: "#cfe8ec",
    grid: "#527d82",
    equator: "#315f65",
    land: "#f5f1dc",
    coast: "#526d70",
    labelHalo: "#f5f1dc",
    country: "#163a3f",
    region: "#0a6f64",
    leader: "#39756d",
  },
};

const labels = [
  { text: "Hawaiʻi", latitude: 20.8, longitude: -156.3, kind: "region", dx: 12, dy: -8 },
  { text: "Mexico", latitude: 23.5, longitude: -102, kind: "country", placement: "inline" },
  { text: "Cozumel", latitude: 20.4, longitude: -86.9, kind: "region", dx: 14, dy: 12 },
  { text: "Galápagos", latitude: -0.6, longitude: -90.6, kind: "region", dx: -8, dy: -9 },
  { text: "Egypt", latitude: 26.8, longitude: 30.8, kind: "country", placement: "inline" },
  { text: "Red Sea", latitude: 22.2, longitude: 38.2, kind: "region", dx: 7, dy: 9 },
  { text: "South Africa", latitude: -29, longitude: 24, kind: "country", placement: "inline" },
  { text: "Zanzibar", latitude: -6.1, longitude: 39.2, kind: "region", dx: 18, dy: 10 },
  { text: "Maldives", latitude: 3.2, longitude: 73.2, kind: "region", dx: -14, dy: 12 },
  { text: "Thailand", latitude: 16.5, longitude: 101.2, kind: "country", placement: "inline" },
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
  { text: "Australia", latitude: -25.5, longitude: 134.5, kind: "country", placement: "inline" },
  { text: "Great Barrier Reef", latitude: -18.2, longitude: 147.5, kind: "region", dx: 8, dy: -2 },
  { text: "New Zealand", latitude: -41.2, longitude: 173.2, kind: "country", dx: -32, dy: 8 },
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projection = geoEquirectangular()
  .scale(WIDTH / (2 * Math.PI))
  .translate([WIDTH / 2, HEIGHT / 2]);
const path = geoPath(projection);

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

for (const map of MAPS) {
  const sourcePath = resolve(root, "scripts", "map-data", map.sourceFile);
  const topology = JSON.parse(await readFile(sourcePath, "utf8"));
  if (
    topology?.type !== "Topology" ||
    topology.objects?.countries?.type !== "GeometryCollection"
  ) {
    throw new Error(`${map.sourceFile} is not a countries TopoJSON topology.`);
  }
  const countries = feature(topology, topology.objects.countries);
  const paths = countries.features
    .map((country) => `    <path d="${roundPath(path(country))}" />`)
    .join("\n");

  for (const [themeName, palette] of Object.entries(THEMES)) {
    const outputPath = resolve(root, "public", "maps", map.outputs[themeName]);
    const svg = renderSvg({ map, palette, paths, themeName });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, svg, "utf8");
    console.log(`Wrote ${outputPath} (${Buffer.byteLength(svg)} bytes)`);
  }
}

function renderSvg({ map, palette, paths, themeName }) {
  const labelMarkup = map.labels
    ? `\n  <g aria-label="Geographic orientation labels">\n${labels.map(renderLabel).join("\n")}\n  </g>`
    : "";
  const detail = map.scale === "50m";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title description">
  <title id="title">DiveFrame offline ${map.scale} world map (${themeName} theme)</title>
  <description id="description">An equirectangular world map${map.labels ? " with broad geographic labels for orienting dive markers" : " with detailed country and coastline geometry"}.</description>
  <metadata>
    Source: world-atlas 2.0.2 (Natural Earth 4.1.0) (https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/${map.sourceFile}; repository ${SOURCE_REPOSITORY_URL}).
    The country data is derived from Natural Earth's 1:${map.scale} Admin 0 boundaries.
    Natural Earth data is public domain (${LICENSE_URL}); the world-atlas redistribution license is tracked in scripts/map-data/world-atlas-LICENSE.
    Transformation: pinned TopoJSON countries converted with d3-geo to a ${WIDTH} by ${HEIGHT} equirectangular viewBox; projected coordinates rounded to two decimals. ${map.labels ? "English orientation labels added by DiveFrame." : "High-zoom geometry omits orientation labels."}
  </metadata>
  <style>
    .ocean { fill: ${palette.ocean}; }
    .grid { fill: none; stroke: ${palette.grid}; stroke-width: ${detail ? ".35" : ".65"}; opacity: ${themeName === "light" ? ".42" : ".34"}; }
    .land { fill: ${palette.land}; fill-rule: evenodd; stroke: ${palette.coast}; stroke-linejoin: round; stroke-width: ${detail ? ".25" : ".55"}; }
    .equator { stroke: ${palette.equator}; stroke-width: ${detail ? ".45" : ".8"}; opacity: .52; }
    .label { paint-order: stroke; stroke: ${palette.labelHalo}; stroke-linejoin: round; stroke-width: 2.8px; text-anchor: middle; }
    .country { fill: ${palette.country}; font: 600 10px Arial, Helvetica, sans-serif; letter-spacing: .05em; }
    .region { fill: ${palette.region}; font: 500 8px Arial, Helvetica, sans-serif; }
    .leader { fill: none; stroke: ${palette.leader}; stroke-width: .7; opacity: .78; }
    .anchor { fill: ${palette.leader}; opacity: .86; }
  </style>
  <rect class="ocean" width="${WIDTH}" height="${HEIGHT}" />
  <g class="grid" aria-hidden="true">
${grid}
  </g>
  <path class="grid equator" d="M 0 ${HEIGHT / 2} H ${WIDTH}" aria-hidden="true" />
  <g class="land" aria-label="Country and coastline geometry">
${paths}
  </g>${labelMarkup}
</svg>
`;
}

function roundPath(value) {
  return value.replace(/-?\d+(?:\.\d+)?/g, (number) => format(Number(number)));
}

function renderLabel(label) {
  const anchor = project(label.latitude, label.longitude);
  if (label.placement === "inline") {
    return `    <text class="label ${label.kind} inline" x="${format(anchor.x)}" y="${format(anchor.y)}">${escapeXml(label.text)}</text>`;
  }
  const x = anchor.x + (label.dx ?? 0);
  const y = anchor.y + (label.dy ?? 0);
  const leader =
    label.dx || label.dy
      ? `    <path class="leader" d="M ${format(anchor.x)} ${format(anchor.y)} L ${format(x)} ${format(y - 2)}" />\n`
      : "";
  return `${leader}    <circle class="anchor" cx="${format(anchor.x)}" cy="${format(anchor.y)}" r="1.25" />\n    <text class="label ${label.kind}" x="${format(x)}" y="${format(y)}">${escapeXml(label.text)}</text>`;
}

function project(latitude, longitude) {
  const [x, y] = projection([longitude, latitude]);
  return { x, y };
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
