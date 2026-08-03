import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const enSource = readFileSync(
  existsSync("lib/app-i18n/en.ts") ? "lib/app-i18n/en.ts" : "lib/app-i18n.ts",
  "utf8",
);
const enBlockMatch =
  enSource.match(/export const en = \{([\s\S]*?)^\} as const;/m) ||
  enSource.match(/const en = \{([\s\S]*?)^\} as const;/m);
if (!enBlockMatch) throw new Error("en block not found");

const keys = [
  ...enBlockMatch[1].matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\s*:/gm),
].map((m) => m[1]);
const uniqueKeys = [...new Set(keys)];

const overlay = readFileSync("lib/i18n.ts", "utf8");
const overlayEn = overlay.match(/en:\s*\{([\s\S]*?)\n\s*\},\n\s*zh/);
const overlayKeys = new Set(
  overlayEn
    ? [...overlayEn[1].matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map(
        (m) => m[1],
      )
    : [],
);
const appOnlyKeys = uniqueKeys.filter((k) => !overlayKeys.has(k));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (
        [
          "node_modules",
          "dist",
          "dist-native",
          ".git",
          "native-spike",
          ".next",
          ".vinext",
        ].includes(name)
      ) {
        continue;
      }
      // Skip the Capacitor project root only, not app/android pages.
      if (name === "android" && dir === ".") continue;
      walk(path, out);
    } else if (
      /\.(tsx?|jsx?|mjs)$/.test(name) &&
      name !== "app-i18n.ts" &&
      !path.includes(`${join("lib", "app-i18n")}`)
    ) {
      out.push(path);
    }
  }
  return out;
}

const corpus = walk(".")
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const unused = [];
const used = [];
for (const key of appOnlyKeys) {
  const direct = new RegExp(`(?:t\\(\\s*|\\[)\\s*['"\`]${key}['"\`]`);
  const bare = new RegExp(`['"\`]${key}['"\`]`);
  if (direct.test(corpus) || bare.test(corpus)) used.push(key);
  else unused.push(key);
}

console.log(`app-only keys: ${appOnlyKeys.length}`);
console.log(`referenced: ${used.length}`);
console.log(`unused: ${unused.length}`);
console.log("---UNUSED---");
for (const key of unused) console.log(key);
